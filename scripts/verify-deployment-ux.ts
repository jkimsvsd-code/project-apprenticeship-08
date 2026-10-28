import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PostgresStore } from '../src/server/storage/postgres.js';
import { createDatabasePool } from '../src/server/storage/pool.js';

const origin = process.env.APP_ORIGIN;
if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw Error('고정 HTTPS APP_ORIGIN이 필요합니다.');
const store = new PostgresStore(createDatabasePool());
const userId = `uxaudit-${randomUUID()}`;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium' });
const contexts: BrowserContext[] = [];
const checks: Record<string, unknown> = {};
let stage = 'public UX', passed = false, cleaned = false;
let failureSummary: string | undefined;
let auditPage: Page | undefined;
async function context() {
  const result = await browser.newContext({ baseURL: origin, locale: 'ko-KR', viewport: { width: 1440, height: 1000 } });
  contexts.push(result); return result;
}
async function axe(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
}
try {
  const options = { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: false } as const;
  if (process.argv.includes('--continue-verified')) {
    const previous = JSON.parse(readFileSync('evidence/deployment/ux-environment-checks.json', 'utf8'));
    expect(previous.passed).toBe(true); expect(previous.origin).toBe(origin);
    expect(previous.deployedSourceCommit).toBe(process.env.DEPLOYED_COMMIT);
    checks.U1 = previous.checks.U1; checks.U2 = previous.checks.U2;
    checks.environmentComponentExecutedAt = previous.executedAt;
  } else {
  const anon = await context(), page = await anon.newPage();
  for (const route of ['/', '/login', '/vault', '/passkeys']) {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
    expect(await page.locator('input[type="password"]').count()).toBe(0);
    await axe(page);
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.goto('/');
  await expect(page.getByRole('link', { name: '내용 검토 - 관리자 전용', exact: true })).toHaveAttribute('href', '/login?next=%2Fvault');
  expect(await page.locator('header a[href="/login"],header a[href="/vault"],header a[href="/passkeys"]').count()).toBe(0);
  await page.goto('/login');
  await expect(page.getByText('패스키를 지원하는 환경이에요.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '패스키로 계속하기', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: '공개 소개로', exact: true })).toBeFocused();
  const unsupported = await context();
  await unsupported.addInitScript(() => Object.defineProperty(window, 'PublicKeyCredential', { value: undefined }));
  const unsupportedPage = await unsupported.newPage(); await unsupportedPage.goto('/login');
  await expect(unsupportedPage.getByText('이 브라우저는 패스키를 지원하지 않아요.', { exact: false })).toBeVisible();
  const insecure = await context();
  await insecure.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }));
  const insecurePage = await insecure.newPage(); await insecurePage.goto('/login');
  await expect(insecurePage.getByText('패스키는 HTTPS 또는 localhost에서 사용할 수 있어요.', { exact: false })).toBeVisible();
  checks.U1 = { realHttpsSupportGuidance: true, simulatedUnsupportedAndInsecureBranches: true };

  stage = 'cancellation and controlled timeout';
  const signed = await context();
  let a = await signed.newPage(), cdp = await signed.newCDPSession(a);
  auditPage = a;
  a.on('response', response => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')) checks.lastRejectedRequest = { path: new URL(response.url()).pathname, status: response.status() }; });
  await cdp.send('WebAuthn.enable');
  let { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options });
  const token = await store.issueBootstrap(userId, '가상 UX 최종 점검');
  await a.goto(`${origin}/setup#token=${token}`);
  await expect(a.getByRole('button', { name: '첫 패스키 등록', exact: true })).toBeVisible();
  expect(a.url()).toBe(origin + '/setup');
  const questions: string[] = [];
  async function pending() {
    const response = a.waitForResponse(r => r.url().endsWith('/api/auth/registration/options'));
    await a.getByRole('button', { name: '첫 패스키 등록', exact: true }).click();
    const result = await response; expect(result.status()).toBe(200);
    questions.push((await result.json()).options.challenge);
    await expect(a.getByRole('button', { name: '등록 취소', exact: true })).toBeVisible();
    await expect(a.getByRole('button', { name: '패스키 확인 중…', exact: true })).toBeDisabled();
  }
  await pending(); await a.getByRole('button', { name: '등록 취소', exact: true }).click();
  await expect(a.getByText('인증이 취소되었어요. 준비되면 다시 시도해 주세요.')).toBeVisible();
  expect(await store.getAccount(userId)).toBeNull(); expect(await store.credentials(userId)).toHaveLength(0);
  await a.clock.install(); await pending(); await a.clock.fastForward(60_001);
  await expect(a.getByRole('alert')).toContainText('응답 시간이 지났어요');
  expect(await store.getAccount(userId)).toBeNull(); expect(await store.credentials(userId)).toHaveLength(0);
  expect(questions[0]).not.toBe(questions[1]); await a.clock.resume();
  checks.U2 = { cancelledAccountAndKeys: 0, timedOutAccountAndKeys: 0, pendingButtonDisabled: true, differentRetryChallenges: true, controlledBrowserClockFor60SecondTimeout: true };
  // Fake timers are confined to cancellation checks. Real device ceremonies and
  // accessibility tooling run in a new context with the unmodified browser clock.
  await signed.close();
  }
  const interactive = await context();
  const a = await interactive.newPage(), cdp = await interactive.newCDPSession(a); auditPage = a;
  a.on('response', response => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')) checks.lastRejectedRequest = { path: new URL(response.url()).pathname, status: response.status() }; });
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { ...options, automaticPresenceSimulation: true } });
  const interactiveToken = await store.issueBootstrap(userId, '가상 UX 최종 점검');
  await a.goto(`${origin}/setup#token=${interactiveToken}`);
  await expect(a.getByRole('button', { name: '첫 패스키 등록', exact: true })).toBeVisible();
  async function register(name: string, initial: boolean) {
    await a.getByLabel('패스키 이름', { exact: true }).fill(name);
    const verified = a.waitForResponse(r => r.url().endsWith('/api/auth/registration/verify'));
    await a.getByRole('button', { name: initial ? '첫 패스키 등록' : '예비 패스키 등록', exact: true }).click();
    expect((await verified).status()).toBe(201);
  }
  stage = 'backup guidance and keyboard dialogue';
  await register('UX 첫 패스키', true); await expect(a).toHaveURL(origin + '/vault');
  await expect(a.locator('.private-card')).toHaveCount(3);
  await a.goto('/passkeys');
  await expect(a.getByText('예비 열쇠 하나, 더 든든하게.')).toBeVisible();
  await a.getByRole('button', { name: '예비 패스키 추가', exact: false }).click();
  await expect(a.getByLabel('기록할 저장소 메모')).toBeHidden();
  // Finish genuine device ceremonies before accessibility tooling and viewport changes.
  // The cryptographic lifecycle is also independently covered by verify-deployment.ts.
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { ...options, automaticPresenceSimulation: true } });
  stage = 'independent backup registration';
  await register('UX 예비 패스키', false); await expect(a.locator('.passkey-list li')).toHaveCount(2);
  await expect(a.getByText('예비 열쇠 하나, 더 든든하게.')).toHaveCount(0);
  stage = 'delete dialogue keyboard';
  const remove = a.getByRole('button', { name: 'UX 예비 패스키 삭제', exact: true }); await remove.click();
  const dialog = a.getByRole('dialog'); await expect(dialog).toContainText('1개');
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await a.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(remove).toBeFocused();
  await remove.click(); await axe(a); await dialog.getByRole('button', { name: '취소', exact: true }).click();
  expect(await store.credentials(userId)).toHaveLength(2);
  await a.getByRole('button', { name: '패스키 추가', exact: true }).click();
  await a.getByText('저장소 메모 남기기 (선택)', { exact: true }).click();
  await a.getByText('QR 코드나 중복 등록 안내가 나오나요?', { exact: true }).click();
  await axe(a);
  for (const width of [320, 375]) {
    await a.setViewportSize({ width, height: 812 });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await a.screenshot({ path: 'evidence/deployment/ux-mobile-https.png', fullPage: true });
  await a.goto('/login?next=https%3A%2F%2Fexample.invalid'); await expect(a).toHaveURL(origin + '/vault');
  await axe(a);
  checks.U3 = { externalNextConstrainedToVault: true, administratorEntryAndLoginReturn: 'see https-verification.json adminEntry' };
  checks.U4 = { oneKeyReminder: true, twoKeysRegistered: true, reminderRemovedAfterBackup: true, storageMemoAndQrHelp: true };
  checks.U5 = { remainingCount: 1, cancelInitiallyFocused: true, escapeCloses: true, focusRestored: true, cancelPreservesBothKeys: true, actualDeleteAndLogin: 'see https-verification.json records' };
  checks.U6 = { widths: [320, 375], publicLoginLockedAndPasskeyOverflow: false, axeViolations: 0, loginAndDialogKeyboard: true, expandedMemoAndHelpChecked: true };
  passed = true;
} catch (error) {
  failureSummary = error instanceof Error ? error.message.split('\n')[0].replace(/#token=[A-Za-z0-9_-]+/g, '#token=[REDACTED]').slice(0, 220) : 'UnknownError';
  if (auditPage) checks.failureUi = { path: new URL(auditPage.url()).pathname, alerts: await auditPage.getByRole('alert').allTextContents() };
  console.error('HTTPS UX audit failed at:', stage, failureSummary); process.exitCode = 1;
}
finally {
  for (const c of contexts) await c.close(); await browser.close();
  try {
    await store.query('DELETE FROM a08.users WHERE id=$1', [userId]);
    for (const table of ['bootstrap_tokens', 'enrollments', 'challenges']) await store.query(`DELETE FROM a08.${table} WHERE user_id=$1`, [userId]);
    cleaned = true;
  } catch { process.exitCode = 1; }
  await store.close();
}
const proof = { executedAt: new Date().toISOString(), origin, deployedSourceCommit: process.env.DEPLOYED_COMMIT ?? null, deploymentId: process.env.DEPLOYMENT_ID ?? null,
  verificationScriptSha256: createHash('sha256').update(readFileSync('scripts/verify-deployment-ux.ts')).digest('hex'), passed, syntheticAccountRemoved: cleaned,
  physicalDeviceVerified: false, failureSummary, environment: 'actual HTTPS and Neon; real CDP WebAuthn; unsupported flags and timeout clock intentionally simulated', checks };
writeFileSync(passed && cleaned ? 'evidence/deployment/ux-verification.json' : 'evidence/deployment/ux-verification-failed.json', JSON.stringify(proof, null, 2) + '\n');
if (passed && cleaned) console.log('PASS: deployed U1–U6 UX audit; temporary account removed; redacted proof saved.');
