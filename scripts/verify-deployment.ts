import { chromium, expect, type BrowserContext, type CDPSession, type Page, type Response } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PostgresStore } from '../src/server/storage/postgres.js';
import { createDatabasePool } from '../src/server/storage/pool.js';
import { hashToken } from '../src/server/auth/tokens.js';
import type { PrivateItem } from '../src/shared/contracts.js';

const origin = process.env.APP_ORIGIN;
if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw new Error('고정 HTTPS APP_ORIGIN이 필요합니다.');
const target = origin;
const store = new PostgresStore(createDatabasePool());
const tag = `https-${randomUUID()}`;
const users = [`${tag}-a`, `${tag}-b`];
type VirtualCredential = { credentialId: string; isResidentCredential: boolean; rpId: string; privateKey: string; userHandle?: string; signCount: number };
type RecordItem = { label: string; method: string; path: string; status: number; request?: unknown; response?: unknown };
const records: RecordItem[] = [];
let stage = 'launch';
let success = false;
let cleaned = true;
let credentialProof: unknown;
let counts: unknown;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium' });
const contexts: BrowserContext[] = [];
const sourceCommit = process.env.DEPLOYED_COMMIT ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

async function makeContext() {
  const context = await browser.newContext({ baseURL: target, viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  contexts.push(context); return context;
}
async function addAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { cdp, id: authenticatorId as string };
}
async function replace(cdp: CDPSession, id: string, credential?: VirtualCredential) {
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: id });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  if (credential) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
  return authenticatorId as string;
}
async function credential(cdp: CDPSession, id: string): Promise<VirtualCredential> {
  const result = await cdp.send('WebAuthn.getCredentials', { authenticatorId: id });
  expect(result.credentials).toHaveLength(1);
  // Test authenticator state, including its private key, stays in browser/Node memory only.
  return result.credentials[0] as VirtualCredential;
}
async function record(label: string, response: Response) {
  const item: RecordItem = { label, method: response.request().method(), path: new URL(response.url()).pathname, status: response.status(), request: response.request().postDataJSON(), response: await response.json() };
  records.push(item); return item;
}
async function setup(page: Page, id: string, name: string) {
  const token = await store.issueBootstrap(id, name);
  await page.goto(`${target}/setup#token=${token}`);
  await expect(page.getByRole('button', { name: '첫 패스키 등록', exact: true })).toBeVisible({ timeout: 20000 });
  expect(page.url()).toBe(`${target}/setup`);
}
async function register(page: Page, name: string, initial: boolean) {
  await page.getByLabel('패스키 이름', { exact: true }).fill(name);
  const options = page.waitForResponse(response => response.url().endsWith('/api/auth/registration/options'));
  const verify = page.waitForResponse(response => response.url().endsWith('/api/auth/registration/verify'));
  await page.getByRole('button', { name: initial ? '첫 패스키 등록' : '예비 패스키 등록', exact: true }).click();
  const first = await record(`${name} registration options`, await options);
  const second = await record(`${name} registration verification`, await verify);
  expect(first.status).toBe(200); expect(second.status).toBe(201);
  const body = second.request as { response: { response: { clientDataJSON: string } } };
  const client = JSON.parse(Buffer.from(body.response.response.clientDataJSON, 'base64url').toString());
  expect(client.origin).toBe(target);
  return { options: first.response as { options: { challenge: string; rp: { id: string } } }, verify: second };
}
async function signOut(page: Page, context: BrowserContext) {
  const old = (await context.cookies()).filter(cookie => cookie.name === '__Host-a08_session').map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  expect(old).not.toBe('');
  const response = page.waitForResponse(response => response.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  expect((await response).status()).toBe(204);
  await expect(page.getByRole('link', { name: '패스키로 로그인', exact: true })).toBeVisible();
  const reused = await fetch(target + '/api/private/items', { headers: { Cookie: old } });
  expect(reused.status).toBe(401);
  records.push({ label: 'logged-out session reuse', method: 'GET', path: '/api/private/items', status: reused.status, response: await reused.json() });
}
async function login(page: Page, next = '/vault', status = 200) {
  await page.goto(`${target}/login?next=${encodeURIComponent(next)}`);
  const options = page.waitForResponse(response => response.url().endsWith('/api/auth/authentication/options'));
  const verification = page.waitForResponse(response => response.url().endsWith('/api/auth/authentication/verify'));
  await page.getByRole('button', { name: '패스키로 계속하기', exact: true }).click();
  const first = await record('login options', await options), second = await record('login verification', await verification);
  expect(first.status).toBe(200); expect(second.status).toBe(status);
  if (status === 200) await expect(page).toHaveURL(`${target}${next}`, { timeout: 20000 });
  return second;
}

try {
  const anonymous = await makeContext(), aContext = await makeContext(), bContext = await makeContext();
  const a = await aContext.newPage(), b = await bContext.newPage();
  const authA = await addAuthenticator(aContext, a), authB = await addAuthenticator(bContext, b);
  let aId = authA.id;
  stage = 'public HTTPS and unauthenticated access';
  const publicResponse = await anonymous.request.get('/');
  expect(publicResponse.status()).toBe(200);
  expect(publicResponse.headers()['content-security-policy']).toContain("script-src 'self'");
  const publicHtml = await publicResponse.text();
  const denied = await anonymous.request.get('/api/private/items');
  expect(denied.status()).toBe(401);
  records.push({ label: 'anonymous private data request', method: 'GET', path: '/api/private/items', status: denied.status(), response: await denied.json() });
  const publicPage = await anonymous.newPage();
  await publicPage.goto('/');
  await expect(publicPage.getByRole('heading', { level: 1 })).toContainText('질문으로 이해하고');
  mkdirSync('evidence/deployment', { recursive: true });
  await publicPage.screenshot({ path: 'evidence/deployment/public-https.png', fullPage: true });
  console.log('PASS: public HTTPS page and unauthenticated data rejection.');

  stage = 'A registration and independent backup passkey';
  await setup(a, users[0], '가상 HTTPS 사용자 A');
  const first = await register(a, 'HTTPS A 첫 패스키', true);
  await expect(a).toHaveURL(target + '/vault', { timeout: 20000 });
  await expect(a.locator('.private-card')).toHaveCount(3);
  let key1 = await credential(authA.cdp, aId);
  await a.getByRole('link', { name: '패스키 관리', exact: true }).click();
  await expect(a.getByText('예비 열쇠 하나, 더 든든하게.')).toBeVisible();
  await a.getByRole('button', { name: '예비 패스키 추가', exact: false }).click();
  aId = await replace(authA.cdp, aId);
  const second = await register(a, 'HTTPS A 예비 패스키', false);
  const key2 = await credential(authA.cdp, aId);
  await expect(a.locator('.passkey-list li')).toHaveCount(2);
  expect(first.options.options.challenge).not.toBe(second.options.options.challenge);
  expect(first.options.options.rp.id).toBe(new URL(target).hostname);
  credentialProof = (await store.credentials(users[0])).map(key => ({ credentialId: key.id, publicKeyBase64: Buffer.from(key.publicKey).toString('base64'), deviceType: key.deviceType }));
  await a.screenshot({ path: 'evidence/deployment/two-passkeys-https.png', fullPage: true });

  stage = 'B registration and bilateral account isolation';
  await setup(b, users[1], '가상 HTTPS 사용자 B');
  await register(b, 'HTTPS B 패스키', true);
  await expect(b).toHaveURL(target + '/vault', { timeout: 20000 });
  const ownA = await aContext.request.get('/api/private/items'), ownB = await bContext.request.get('/api/private/items');
  const itemsA: PrivateItem[] = (await ownA.json()).items, itemsB: PrivateItem[] = (await ownB.json()).items;
  expect(itemsA).toHaveLength(3); expect(itemsB).toHaveLength(3);
  for (const [label, response, data] of [['A own data', ownA, itemsA], ['B own data', ownB, itemsB]] as const) records.push({ label, method: 'GET', path: '/api/private/items', status: response.status(), response: { items: data } });
  const aToB = await aContext.request.get(`/api/private/items/${itemsB[0].id}`), bToA = await bContext.request.get(`/api/private/items/${itemsA[0].id}`);
  expect(aToB.status()).toBe(403); expect(bToA.status()).toBe(403);
  records.push({ label: 'A to B', method: 'GET', path: `/api/private/items/${itemsB[0].id}`, status: aToB.status(), response: await aToB.json() }, { label: 'B to A', method: 'GET', path: `/api/private/items/${itemsA[0].id}`, status: bToA.status(), response: await bToA.json() });
  const spoof = await aContext.request.get(`/api/private/items?userId=${users[1]}`);
  expect((await spoof.json()).items).toEqual(itemsA);
  records.push({ label: 'tampered account query', method: 'GET', path: `/api/private/items?userId=${users[1]}`, status: spoof.status(), response: await spoof.json() });
  counts = { before: [3, 3], after: [(await store.items(users[0])).length, (await store.items(users[1])).length] };
  expect((counts as { after: number[] }).after).toEqual([3, 3]);
  for (const item of itemsA) expect(publicHtml).not.toContain(item.body);
  console.log('PASS: two real accounts, isolated data, tampered account scope.');

  stage = 'HTTPS login, replay, signature rejection and logout revocation';
  aId = await replace(authA.cdp, aId, key1);
  await signOut(a, aContext);
  const signedIn = await login(a, '/passkeys');
  const cookies = await aContext.cookies();
  const sessionCookie = cookies.find(cookie => cookie.name === '__Host-a08_session');
  expect(sessionCookie?.secure).toBe(true); expect(sessionCookie?.httpOnly).toBe(true); expect(sessionCookie?.sameSite).toBe('Strict');
  const replay = await aContext.request.post('/api/auth/authentication/verify', { data: signedIn.request, headers: { Origin: target } });
  expect(replay.status()).toBe(400);
  records.push({ label: 'used challenge replay', method: 'POST', path: '/api/auth/authentication/verify', request: signedIn.request, status: replay.status(), response: await replay.json() });
  const csrf = await aContext.request.post('/api/auth/logout', { data: {}, headers: { Origin: 'https://example.invalid' } });
  expect(csrf.status()).toBe(403);
  records.push({ label: 'wrong Origin', method: 'POST', path: '/api/auth/logout', status: csrf.status(), response: await csrf.json() });
  await signOut(a, aContext);
  await a.route('**/api/auth/authentication/verify', async route => {
    const body = route.request().postDataJSON();
    const signature = Buffer.from(body.response.response.signature, 'base64url'); signature[signature.length - 1] ^= 1;
    body.response.response.signature = signature.toString('base64url');
    await route.continue({ postData: JSON.stringify(body) });
  }, { times: 1 });
  await login(a, '/vault', 400);
  await login(a, '/passkeys');

  stage = 'HTTPS deletion, deleted-key rejection and remaining-key login';
  await a.getByRole('button', { name: 'HTTPS A 예비 패스키 삭제', exact: true }).click();
  const dialog = a.getByRole('dialog');
  await expect(dialog).toContainText('1개');
  const removed = a.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/api/passkeys/'));
  await dialog.getByRole('button', { name: '패스키 삭제', exact: true }).click();
  await record('delete backup passkey', await removed);
  await expect(a.locator('.passkey-list li')).toHaveCount(1);
  await expect(a.getByRole('button', { name: 'HTTPS A 첫 패스키 삭제', exact: true })).toBeDisabled();
  const remaining = (await store.credentials(users[0]))[0];
  const last = await aContext.request.delete(`/api/passkeys/${encodeURIComponent(remaining.id)}`, { data: {}, headers: { Origin: target } });
  expect(last.status()).toBe(409);
  records.push({ label: 'last passkey delete rejected', method: 'DELETE', path: `/api/passkeys/${remaining.id}`, status: last.status(), response: await last.json() });
  key1 = await credential(authA.cdp, aId);
  await signOut(a, aContext);
  aId = await replace(authA.cdp, aId, key2);
  await login(a, '/vault', 400);
  aId = await replace(authA.cdp, aId, key1);
  await login(a, '/vault');
  await expect(a.locator('.private-card')).toHaveCount(3);
  await a.screenshot({ path: 'evidence/deployment/private-https.png', fullPage: true });
  await signOut(a, aContext);
  expect((await aContext.request.get('/api/private/items')).status()).toBe(401);
  console.log('PASS: HTTPS registration/login/deletion, replay and invalid signatures rejected, deleted key denied, remaining key accepted.');
  success = true;
} catch (error) {
  // Browser call logs can contain a setup fragment; never print the full error or request headers.
  console.error('HTTPS verification failed at stage:', stage, error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  try {
    for (const id of users) {
      await store.query('DELETE FROM a08.users WHERE id=$1', [id]);
      await store.query('DELETE FROM a08.bootstrap_tokens WHERE user_id=$1', [id]);
      await store.query('DELETE FROM a08.enrollments WHERE user_id=$1', [id]);
      await store.query('DELETE FROM a08.challenges WHERE user_id=$1', [id]);
    }
  } catch { cleaned = false; process.exitCode = 1; }
  await store.close();
}
const proof = { executedAt: new Date().toISOString(), timezone: 'Asia/Seoul', origin: target, sourceCommit, deploymentId: process.env.DEPLOYMENT_ID ?? null,
  passed: success, syntheticAccountsRemoved: cleaned, environment: 'actual public HTTPS deployment and Neon PostgreSQL; Chromium CDP virtual authenticator; no mocked signature verification',
  physicalDeviceVerified: false, stage, storedPublicKeys: credentialProof, accountCounts: counts, cookiePolicy: success ? { secure: true, httpOnly: true, sameSite: 'Strict', prefix: '__Host-' } : null, records };
const json = JSON.stringify(proof, null, 2);
expect(json).not.toMatch(/"(?:privateKey|token|sessionHash|Cookie|Set-Cookie|Authorization)"\s*:/i);
expect(json).not.toMatch(/#token=[A-Za-z0-9_-]{43}/);
mkdirSync('evidence/deployment', { recursive: true });
writeFileSync(success && cleaned ? 'evidence/deployment/https-verification.json' : 'evidence/deployment/https-verification-failed.json', json + '\n');
if (success && cleaned) console.log('PASS: synthetic cloud accounts cleaned; redacted HTTPS evidence saved.');
