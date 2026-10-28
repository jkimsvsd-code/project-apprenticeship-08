import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, cookieNames } from '../../src/server/app.js';
import { Store } from '../../src/server/storage/store.js';
import { hashToken } from '../../src/server/auth/tokens.js';
import { seedAccount, testConfig } from '../helpers.js';

test('HTTP 경계: 미인증·양방향 타 계정·변조·로그아웃·CSRF·취소', async () => {
  const config = testConfig();
  const store = new Store(':memory:');
  const a = seedAccount(store, 'a'), b = seedAccount(store, 'b');
  const server = http.createServer(createApp(config, store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cookieA = `${cookieNames(config).session}=${a.session.token}`;
  const cookieB = `${cookieNames(config).session}=${b.session.token}`;
  const send = (path: string, cookie = '', method = 'GET', body?: unknown, origin = config.origin) => fetch(base + path, {
    method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    const anonymousSession = await send('/api/session');
    assert.deepEqual(await anonymousSession.json(), { user: null });
    assert.equal(anonymousSession.headers.getSetCookie().length, 0);
    assert.equal((await send('/api/private/items')).status, 401);
    assert.equal((await send('/api/passkeys')).status, 401);
    const own = await send('/api/private/items', cookieA);
    assert.equal(own.status, 200); assert.match(own.headers.get('cache-control')!, /no-store/);
    const itemsA = (await own.json()).items;
    const itemsB = (await (await send('/api/private/items', cookieB)).json()).items;
    assert.equal((await send(`/api/private/items/${itemsB[0].id}`, cookieA)).status, 403);
    assert.equal((await send(`/api/private/items/${itemsA[0].id}`, cookieB)).status, 403);
    assert.deepEqual((await (await send('/api/private/items?userId=b', cookieA)).json()).items, itemsA);
    assert.equal(store.items('a').length, 3); assert.equal(store.items('b').length, 3);
    assert.equal((await send(`/api/passkeys/${a.credential.id}`, cookieB, 'DELETE', {})).status, 403);
    assert.equal((await send(`/api/passkeys/${a.credential.id}`, cookieA, 'DELETE', {})).status, 409);
    assert.equal((await send('/api/auth/logout', cookieA, 'POST', {}, 'https://evil.invalid')).status, 403);
    assert.ok(store.getSession(hashToken(a.session.token)));
    const optionsA = await (await send('/api/auth/authentication/options', '', 'POST', {})).json();
    const optionsB = await (await send('/api/auth/authentication/options', '', 'POST', {})).json();
    assert.notEqual(optionsA.options.challenge, optionsB.options.challenge);
    assert.equal((await send('/api/auth/registration/options', '', 'POST', {})).status, 401);
    const setup = store.issueBootstrap('cancelled', '가상 취소');
    const exchanged = await send('/api/setup/exchange', '', 'POST', { token: setup });
    const enrollmentCookie = exchanged.headers.getSetCookie()[0].split(';')[0];
    assert.ok(exchanged.headers.getSetCookie()[0].includes('HttpOnly'));
    assert.ok(exchanged.headers.getSetCookie()[0].includes('SameSite=Strict'));
    const reg = await send('/api/auth/registration/options', enrollmentCookie, 'POST', {});
    const flowCookie = reg.headers.getSetCookie()[0].split(';')[0];
    const registration = await reg.json();
    assert.equal((await send('/api/auth/cancel', `${enrollmentCookie}; ${flowCookie}`, 'POST', { challengeId: registration.challengeId })).status, 204);
    assert.equal(store.getAccount('cancelled'), null); assert.equal(store.credentials('cancelled').length, 0);
    const missing = await send('/api/auth/authentication/verify', '', 'POST', { challengeId: 'bad', response: {} });
    assert.equal(missing.status, 400);
    assert.ok(!(await missing.text()).includes('stack'));
    assert.equal((await send('/api/auth/logout', cookieA, 'POST', {})).status, 204);
    assert.equal((await send('/api/private/items', cookieA)).status, 401);
    assert.equal((await send('/api/private/items', cookieB)).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
