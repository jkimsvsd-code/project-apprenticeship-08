import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeReturnTo } from '../../src/shared/contracts.js';
import { loadConfig } from '../../src/server/config/env.js';
import { hashToken, randomToken } from '../../src/server/auth/tokens.js';

test('복귀 경로는 허용된 내부 경로로만 제한한다', () => {
  for (const value of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '%2F%2Fevil.invalid', '/setup', '', null, '/passkeys?next=https://evil.invalid']) {
    assert.equal(safeReturnTo(value), '/vault');
  }
  assert.equal(safeReturnTo('/passkeys'), '/passkeys');
});
test('운영 HTTPS, Origin/RP ID와 시간 범위를 검증한다', () => {
  assert.throws(() => loadConfig({ APP_ORIGIN: 'http://example.com' }));
  assert.throws(() => loadConfig({ APP_ORIGIN: 'https://example.com/' }));
  assert.throws(() => loadConfig({ APP_ORIGIN: 'https://example.com', WEBAUTHN_RP_ID: 'evil.invalid' }));
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }));
  assert.throws(() => loadConfig({ CHALLENGE_TTL_SECONDS: '99999' }));
  assert.throws(() => loadConfig({ SESSION_TTL_SECONDS: 'NaN' }));
  const config = loadConfig({ APP_ORIGIN: 'https://example.com', NODE_ENV: 'production' });
  assert.equal(config.secureCookies, true);
  assert.equal(config.rpId, 'example.com');
});
test('서버에 저장할 인증값은 원본이 아닌 해시다', () => {
  const a = randomToken(), b = randomToken();
  assert.equal(a.length, 43); assert.notEqual(a, b);
  assert.equal(hashToken(a).length, 64); assert.notEqual(hashToken(a), a);
});
test('과제1의 모든 공개 본문을 원문 그대로 보존한다', () => {
  const baseline = readFileSync('docs/baseline/assignment01/index.html', 'utf8');
  const expected = baseline.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)![1].trim();
  const actual = readFileSync('src/client/public-profile/content.html', 'utf8').trim();
  assert.equal(actual, expected);
  assert.equal((actual.match(/<details>/g) ?? []).length, 3);
});
