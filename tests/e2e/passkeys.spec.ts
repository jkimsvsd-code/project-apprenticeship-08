import { test, expect, type BrowserContext, type CDPSession, type Page, type Response as BrowserResponse } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Store } from '../../src/server/storage/store.js';
import type { PrivateItem } from '../../src/shared/contracts.js';

const origin = 'http://localhost:4318';
const dbPath = path.resolve('runtime/e2e/app.sqlite');
type VirtualCredential = { credentialId: string; isResidentCredential: boolean; rpId: string; privateKey: string; userHandle?: string; signCount: number };
type Evidence = { method: string; path: string; request: unknown; status: number; response: unknown };
function withStore<T>(action: (store: Store) => T): T { const store = new Store(dbPath); try { return action(store); } finally { store.close(); } }
async function authenticator(context: BrowserContext, page: Page, auto = true) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: auto,
  } });
  return { cdp, id: authenticatorId as string };
}
async function replaceAuthenticator(cdp: CDPSession, previous: string, credential?: VirtualCredential, transport: 'internal' | 'usb' = 'internal') {
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: previous });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport, hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  if (credential) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
  return authenticatorId as string;
}
async function savedCredential(cdp: CDPSession, id: string): Promise<VirtualCredential> {
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId: id });
  expect(credentials).toHaveLength(1);
  // Private material remains exclusively in the test/browser process; never write it to evidence.
  return credentials[0] as VirtualCredential;
}
async function setup(page: Page, account: string, displayName: string) {
  const token = withStore(store => store.issueBootstrap(account, displayName));
  await page.goto(`${origin}/setup#token=${token}`);
  await expect(page.getByRole('button', { name: '첫 패스키 등록', exact: true })).toBeVisible();
  expect(page.url()).toBe(`${origin}/setup`);
}
async function capture(response: BrowserResponse): Promise<Evidence> {
  const request = response.request();
  return { method: request.method(), path: new URL(request.url()).pathname,
    request: request.postDataJSON(), status: response.status(), response: await response.json() };
}
async function register(page: Page, name: string, initial: boolean) {
  await page.getByLabel('패스키 이름', { exact: true }).fill(name);
  const optionsResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/registration/options'));
  const verifyResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/registration/verify'));
  await page.getByRole('button', { name: initial ? '첫 패스키 등록' : '예비 패스키 등록', exact: true }).click();
  const options = await capture(await optionsResponse), verify = await capture(await verifyResponse);
  expect(verify.status).toBe(201);
  return { options, verify };
}
async function login(page: Page, next = '/vault', expected = 200) {
  await page.goto(`${origin}/login?next=${encodeURIComponent(next)}`);
  const optionsResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/authentication/options'));
  const verifyResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/authentication/verify'));
  await page.getByRole('button', { name: '패스키로 계속하기', exact: true }).click();
  const options = await capture(await optionsResponse), verify = await capture(await verifyResponse);
  expect(verify.status).toBe(expected);
  if (expected === 200) await expect(page).toHaveURL(`${origin}${next === '/passkeys' ? '/passkeys' : '/vault'}`);
  return { options, verify };
}
async function logout(page: Page) {
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('link', { name: '패스키로 로그인', exact: true })).toBeVisible();
}
function sourceDigest() {
  const hash = createHash('sha256');
  const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file); else if (entry.name !== '.gitkeep') hash.update(file).update(readFileSync(file));
  } };
  walk('src'); walk('tests'); hash.update(readFileSync('package-lock.json'));
  return hash.digest('hex');
}
function evidenceFile(file: string, data: unknown) {
  const value = JSON.stringify(data, null, 2);
  expect(value).not.toMatch(/"(?:privateKey|token|sessionHash|Cookie|Set-Cookie|Authorization)"\s*:/i);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value + '\n');
}

test('공개 소개 보존·잠금·모바일·접근성·환경 안내 (U1, U6)', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('질문으로 이해하고');
  await expect(page.locator('.original-profile details')).toHaveCount(3);
  await page.locator('summary').first().click();
  await expect(page.getByText('내가 주도한 변화', { exact: true })).toBeVisible();
  await page.locator('summary').first().click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  mkdirSync('evidence/ux', { recursive: true });
  await page.screenshot({ path: 'evidence/ux/public-desktop.png', fullPage: true });
  const anonymous = await context.request.get('/api/private/items');
  expect(anonymous.status()).toBe(401);
  for (const internal of ['/runtime/e2e/app.sqlite', '/tests/fixtures/private-items.json', '/src/server/storage/store.ts']) {
    expect((await context.request.get(internal)).status()).toBe(403);
  }
  await page.goto('/vault');
  await expect(page.getByRole('heading', { name: '열쇠는, 나에게만.' })).toBeVisible();
  expect(await page.locator('input[type="password"]').count()).toBe(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    for (const route of ['/', '/vault', '/login', '/passkeys']) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await page.goto('/');
  await page.screenshot({ path: 'evidence/ux/public-mobile.png', fullPage: true });
  await page.goto('/login');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: '패스키로 계속하기', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: '공개 소개로', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '패스키로 계속하기', exact: true })).toBeFocused();
  await page.addInitScript(() => Object.defineProperty(window, 'PublicKeyCredential', { value: undefined }));
  await page.reload();
  await expect(page.getByText(/이 브라우저는 패스키를 지원하지 않아요/)).toBeVisible();
  await page.getByRole('button', { name: '패스키로 계속하기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('현재 환경에서는 패스키를 사용할 수 없어요');
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }));
  await page.reload();
  await expect(page.getByText(/패스키는 HTTPS 또는 localhost에서 사용할 수 있어요/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('등록 취소·중복 요청 방지·시간 초과 후 재시도 (U2)', async ({ page, context }) => {
  const auth = await authenticator(context, page, false);
  await setup(page, 'e2e-cancel', '가상 취소 사용자');
  const questions: string[] = [];
  page.on('response', async response => { if (response.url().endsWith('/api/auth/registration/options') && response.ok()) questions.push((await response.json()).options.challenge); });
  await page.getByRole('button', { name: '첫 패스키 등록', exact: true }).click();
  await expect(page.getByRole('button', { name: '등록 취소', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '패스키 확인 중…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '등록 취소', exact: true }).click();
  await expect(page.getByText('인증이 취소되었어요. 준비되면 다시 시도해 주세요.')).toBeVisible();
  expect(withStore(store => store.getAccount('e2e-cancel'))).toBeNull();
  expect(withStore(store => store.credentials('e2e-cancel').length)).toBe(0);
  await page.clock.install();
  await page.getByRole('button', { name: '첫 패스키 등록', exact: true }).click();
  await expect(page.getByRole('button', { name: '등록 취소', exact: true })).toBeVisible();
  await page.clock.fastForward(60_001);
  await expect(page.getByRole('alert')).toContainText('응답 시간이 지났어요');
  expect(withStore(store => store.getAccount('e2e-cancel'))).toBeNull();
  await expect.poll(() => questions.length).toBe(2);
  expect(questions[0]).not.toBe(questions[1]);
  await auth.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: auth.id });
  evidenceFile('evidence/registration/cancellation.json', { executedAt: new Date().toISOString(), timezone: 'Asia/Seoul', sourceDigest: sourceDigest(), environment: 'Chromium virtual authenticator; no real provider', questions, cancelledAccountExists: false, cancelledCredentialCount: 0, duplicateRequestDisabled: true, timedOutAccountExists: false });
});

test('실제 WebAuthn 등록·로그인·격리·재사용 거절·패스키 폐기 (U3–U6)', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const contextB = await browser.newContext({ baseURL: origin, locale: 'ko-KR' });
  try {
    const a = await contextA.newPage(), b = await contextB.newPage();
    const authA = await authenticator(contextA, a), authB = await authenticator(contextB, b);
    let authAId = authA.id;
    await setup(a, 'test-account-a', '가상 사용자 A');
    const first = await register(a, 'A 첫 패스키', true);
    await expect(a).toHaveURL(`${origin}/vault`);
    await expect(a.locator('.private-card')).toHaveCount(3);
    let firstCredential = await savedCredential(authA.cdp, authAId);
    await a.getByRole('link', { name: '패스키 관리', exact: true }).click();
    await expect(a.getByText('예비 열쇠 하나, 더 든든하게.')).toBeVisible();
    await a.getByRole('button', { name: '예비 패스키 추가', exact: false }).click();
    await expect(a.getByRole('heading', { name: '두 번째 패스키 등록 방법' })).toBeVisible();
    await expect(a.getByLabel('패스키 등록 방식')).toHaveValue('device');
    await expect(a.getByLabel('기록할 저장소 메모')).toBeHidden();
    await a.getByText('저장소 메모 남기기 (선택)', { exact: true }).click();
    const duplicateAttempts: unknown[] = [];
    // Changing a user memo must not masquerade as choosing a real authenticator.
    // Keep the original real CDP authenticator: excludeCredentials must reject it.
    for (const memo of ['Google 비밀번호 관리자', 'iCloud 키체인']) {
      await a.getByLabel('기록할 저장소 메모').selectOption(memo);
      const optionsResponse = a.waitForResponse(response => response.url().endsWith('/api/auth/registration/options'));
      await a.getByRole('button', { name: '예비 패스키 등록', exact: true }).click();
      const response = await optionsResponse;
      const options = (await response.json()).options;
      await expect(a.getByRole('alert')).toContainText('선택한 인증기에 이미 등록된 패스키가 있어요');
      await expect(a.getByRole('alert')).toContainText('저장소 메모를 바꿔도 실제 저장소는 바뀌지 않아요');
      expect(response.request().postDataJSON()).toEqual({ method: 'device' });
      expect(options.authenticatorSelection).toEqual((first.options.response as any).options.authenticatorSelection);
      expect(withStore(store => store.credentials('test-account-a').length)).toBe(1);
      await expect(a.locator('.passkey-list li')).toHaveCount(1);
      duplicateAttempts.push({ userMemo: memo, authenticatorSelection: options.authenticatorSelection, duplicateRejected: true, storedKeyCount: 1 });
    }
    await a.getByText('QR 코드나 중복 등록 안내가 나오나요?', { exact: true }).click();
    await expect(a.getByText('QR 코드는 다른 기기를 연결하는 경로예요.', { exact: false })).toBeVisible();
    await a.screenshot({ path: 'evidence/ux/storage-memo-desktop.png', fullPage: true });
    await a.getByLabel('기록할 저장소 메모').selectOption('기타 / 확인하지 못함');
    await a.getByText('저장소 메모 남기기 (선택)', { exact: true }).click();
    authAId = await replaceAuthenticator(authA.cdp, authAId, undefined, 'usb');
    await a.getByLabel('패스키 등록 방식').selectOption('security-key');
    const second = await register(a, 'A 예비 패스키', false);
    expect((second.options.response as any).options.hints).toEqual(['security-key']);
    expect((second.options.response as any).options.authenticatorSelection.authenticatorAttachment).toBe('cross-platform');
    const secondCredential = await savedCredential(authA.cdp, authAId);
    await expect(a.locator('.passkey-list li')).toHaveCount(2);
    await expect(a.getByText('저장소 메모 없음 / 확인하지 못함', { exact: true })).toHaveCount(2);
    await expect(a.getByText('예비 열쇠 하나, 더 든든하게.')).toHaveCount(0);
    expect((first.options.response as any).options.challenge).not.toBe((second.options.response as any).options.challenge);
    expect(JSON.stringify(first.verify.request)).not.toContain('privateKey');
    const stored = withStore(store => store.credentials('test-account-a').map(key => ({ id: key.id, name: key.name, publicKeyBase64: Buffer.from(key.publicKey).toString('base64'), counter: key.counter, deviceType: key.deviceType })));
    await a.screenshot({ path: 'evidence/passkey-lifecycle/two-passkeys.png', fullPage: true });
    expect((await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

    await setup(b, 'test-account-b', '가상 사용자 B');
    await register(b, 'B 패스키', true);
    await expect(b).toHaveURL(`${origin}/vault`);
    const ownA = await contextA.request.get('/api/private/items'), ownB = await contextB.request.get('/api/private/items');
    const itemsA: PrivateItem[] = (await ownA.json()).items, itemsB: PrivateItem[] = (await ownB.json()).items;
    expect(itemsA).toHaveLength(3); expect(itemsB).toHaveLength(3); expect(itemsA[0].body).not.toBe(itemsB[0].body);
    const before = [itemsA.length, itemsB.length];
    const aToB = await contextA.request.get(`/api/private/items/${itemsB[0].id}`);
    const bToA = await contextB.request.get(`/api/private/items/${itemsA[0].id}`);
    expect(aToB.status()).toBe(403); expect(bToA.status()).toBe(403);
    const spoof = await contextA.request.get('/api/private/items?userId=test-account-b');
    expect((await spoof.json()).items).toEqual(itemsA);
    const after = [withStore(store => store.items('test-account-a').length), withStore(store => store.items('test-account-b').length)];
    expect(after).toEqual(before);
    const registrationWhileSignedOut = await browser.newContext({ baseURL: origin });
    const unauthorizedRegistration = await registrationWhileSignedOut.request.post('/api/auth/registration/options', { data: {}, headers: { Origin: origin } });
    expect(unauthorizedRegistration.status()).toBe(401);
    await registrationWhileSignedOut.close();

    // Keep the first authenticator available for subsequent logins; private keys remain in memory only.
    authAId = await replaceAuthenticator(authA.cdp, authAId, firstCredential);
    await logout(a);
    await a.goto('/passkeys');
    await a.getByRole('link', { name: '패스키로 로그인', exact: true }).click();
    expect(new URL(a.url()).searchParams.get('next')).toBe('/passkeys');
    const restoredLogin = await login(a, '/passkeys');
    const replay = await contextA.request.post('/api/auth/authentication/verify', { data: restoredLogin.verify.request, headers: { Origin: origin } });
    expect(replay.status()).toBe(400);
    await logout(a);
    await a.route('**/api/auth/authentication/verify', async route => {
      const body = route.request().postDataJSON();
      const signature = Buffer.from(body.response.response.signature, 'base64url');
      signature[signature.length - 1] ^= 1;
      body.response.response.signature = signature.toString('base64url');
      await route.continue({ postData: JSON.stringify(body) });
    }, { times: 1 });
    const wrongSignature = await login(a, '/vault', 400);
    await expect(a.getByRole('alert')).toContainText('인증을 확인할 수 없습니다');
    const validLogin = await login(a, 'https://evil.invalid');
    const oldSessionCookie = (await contextA.cookies()).filter(cookie => cookie.name.endsWith('_session')).map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    const csrf = await contextA.request.post('/api/auth/logout', { data: {}, headers: { Origin: 'https://evil.invalid' } });
    expect(csrf.status()).toBe(403);
    await logout(a);
    const oldSessionResponse = await fetch(`${origin}/api/private/items`, { headers: { Cookie: oldSessionCookie } });
    expect(oldSessionResponse.status).toBe(401);
    const signedOutHtml = await (await contextA.request.get('/vault')).text();
    for (const item of itemsA) expect(signedOutHtml).not.toContain(item.body);
    const anonymousResponse = await contextA.request.get('/api/private/items');
    expect(anonymousResponse.status()).toBe(401);
    await expect(a.locator('.private-card')).toHaveCount(0);
    await login(a, '/passkeys');

    const deleteButton = a.getByRole('button', { name: 'A 예비 패스키 삭제', exact: true });
    await deleteButton.click();
    const dialog = a.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('1개');
    await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
    await a.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(deleteButton).toBeFocused();
    await deleteButton.click();
    expect((await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    const deleteResponse = a.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/api/passkeys/'));
    await dialog.getByRole('button', { name: '패스키 삭제', exact: true }).click();
    expect((await deleteResponse).status()).toBe(200);
    await expect(a.locator('.passkey-list li')).toHaveCount(1);
    await expect(a.getByRole('button', { name: 'A 첫 패스키 삭제', exact: true })).toBeDisabled();
    await logout(a);
    // Preserve the latest signature counter; restoring a stale clone should be rejected.
    firstCredential = await savedCredential(authA.cdp, authAId);
    authAId = await replaceAuthenticator(authA.cdp, authAId, secondCredential);
    const deletedLogin = await login(a, '/vault', 400);
    authAId = await replaceAuthenticator(authA.cdp, authAId, firstCredential);
    const remainingLogin = await login(a, '/vault');
    await expect(a.locator('.private-card')).toHaveCount(3);
    await a.screenshot({ path: 'evidence/ux/private-desktop.png', fullPage: true });
    expect((await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await a.setViewportSize({ width: 375, height: 812 });
    await a.goto('/passkeys');
    await expect(a.locator('.passkey-list li')).toHaveCount(1);
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.screenshot({ path: 'evidence/ux/passkeys-mobile.png', fullPage: true });
    await a.getByRole('button', { name: '패스키 추가', exact: true }).click();
    await a.getByText('저장소 메모 남기기 (선택)', { exact: true }).click();
    await a.getByText('QR 코드나 중복 등록 안내가 나오나요?', { exact: true }).click();
    await a.getByText('iPhone에서 Google·iCloud에 각각 등록하려면', { exact: true }).click();
    for (const width of [320, 375]) {
      await a.setViewportSize({ width, height: 812 });
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect((await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await a.screenshot({ path: 'evidence/ux/storage-memo-mobile.png', fullPage: true });

    const common = { executedAt: new Date().toISOString(), timezone: 'Asia/Seoul', environment: 'Chromium CDP software virtual authenticator; no mocked verifier; no physical passkey provider', sourceDigest: sourceDigest() };
    evidenceFile('evidence/ux/verified-storage-memo.json', { ...common, memoControlInitiallyCollapsed: true, memoDoesNotChooseAuthenticator: true, duplicateAttempts, distinctAuthenticatorRegistrationSucceeded: true, unknownProviderShownAsUnconfirmed: true, expandedGuidanceWidths: [320, 375], axeViolations: 0 });
    evidenceFile('evidence/registration/verified-registration.json', { ...common, first, second, storedPublicKeys: stored, privateKeyTransmitted: false });
    evidenceFile('evidence/authentication/verified-authentication.json', { ...common, success: validLogin, wrongSignature, reusedChallenge: { request: restoredLogin.verify.request, status: replay.status(), response: await replay.json() }, logoutReuse: { method: 'GET', path: '/api/private/items', authenticationHeader: '[REDACTED]', status: oldSessionResponse.status, response: await oldSessionResponse.json() }, csrfStatus: csrf.status() });
    evidenceFile('evidence/authorization/verified-isolation.json', { ...common, ownA: { method: 'GET', path: '/api/private/items', status: ownA.status(), response: { items: itemsA } }, ownB: { method: 'GET', path: '/api/private/items', status: ownB.status(), response: { items: itemsB } }, anonymous: { method: 'GET', path: '/api/private/items', status: anonymousResponse.status(), response: await anonymousResponse.json() }, aToB: { method: 'GET', path: `/api/private/items/${itemsB[0].id}`, status: aToB.status(), response: await aToB.json() }, bToA: { method: 'GET', path: `/api/private/items/${itemsA[0].id}`, status: bToA.status(), response: await bToA.json() }, counts: { before, after }, tamperedAccount: { method: 'GET', path: '/api/private/items?userId=test-account-b', status: spoof.status(), returned: itemsA.map(item => item.id) }, unsignedHtmlContainsPrivateContent: false });
    writeFileSync('evidence/authorization/anonymous-page.html', signedOutHtml);
    evidenceFile('evidence/passkey-lifecycle/verified-revocation.json', { ...common, registeredCount: 2, deleted: { name: 'A 예비 패스키', status: 200 }, deletedLogin, remainingLogin, remainingCount: 1, lastKeyDeleteDisabled: true });
    evidenceFile('evidence/ux/verified-ux.json', { ...common, U1: 'environment support and unsupported-browser guidance', U2: 'pending button disabled, cancellation, controlled 60s timeout, fresh challenge retry', U3: 'passkeys destination restored, external next forced to vault', U4: 'backup callout for one key; disappears after second registration', U5: 'remaining count, cancel focus/Escape/restore, deleted-key rejection', U6: '320/375 px overflow checks; keyboard dialog; axe WCAG A/AA, public/login/locked/private/passkeys/dialog' });
  } finally { await contextA.close(); await contextB.close(); }
});
