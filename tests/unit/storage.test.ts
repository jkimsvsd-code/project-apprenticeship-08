import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/server/storage/store.js';
import { hashToken } from '../../src/server/auth/tokens.js';
import { fakeCredential, seedAccount } from '../helpers.js';

test('초기 링크는 한 번 교환되며 등록 취소 전에는 계정·키를 저장하지 않는다', () => {
  const store = new Store(':memory:');
  try {
    const token = store.issueBootstrap('a', '가상 A');
    assert.equal(store.getAccount('a'), null);
    const { enrollment } = store.exchangeBootstrap(token, 60_000);
    assert.throws(() => store.exchangeBootstrap(token, 60_000));
    assert.equal(store.getAccount('a'), null); assert.equal(store.credentials('a').length, 0);
    const flow = hashToken('browser');
    const challenge = store.createChallenge({ value: 'question', purpose: 'registration', flowHash: flow, actorHash: enrollment.hash, userId: 'a', expiresAt: Date.now() + 10000 });
    store.cancelChallenge(challenge.id, flow);
    assert.throws(() => store.consumeChallenge(challenge.id, flow, 'registration'));
    assert.equal(store.getAccount('a'), null); assert.equal(store.credentials('a').length, 0);
  } finally { store.close(); }
});
test('질문은 브라우저·용도·만료에 묶이고 한 번만 소비된다', () => {
  const store = new Store(':memory:');
  try {
    const challenge = store.createChallenge({ value: 'unique', purpose: 'authentication', flowHash: 'a', actorHash: null, userId: null, expiresAt: Date.now() + 10000 });
    assert.throws(() => store.consumeChallenge(challenge.id, 'b', 'authentication'));
    assert.throws(() => store.consumeChallenge(challenge.id, 'a', 'registration'));
    assert.equal(store.consumeChallenge(challenge.id, 'a', 'authentication').value, 'unique');
    assert.throws(() => store.consumeChallenge(challenge.id, 'a', 'authentication'));
    const expired = store.createChallenge({ value: 'expired', purpose: 'authentication', flowHash: 'a', actorHash: null, userId: null, expiresAt: Date.now() - 1 });
    assert.throws(() => store.consumeChallenge(expired.id, 'a', 'authentication'));
  } finally { store.close(); }
});
test('본인 자료만 반환하고 타인 자료는 양방향 거절한다', () => {
  const store = new Store(':memory:');
  try {
    seedAccount(store, 'a'); seedAccount(store, 'b');
    const a = store.items('a'), b = store.items('b');
    assert.equal(a.length, 3); assert.equal(b.length, 3);
    assert.notEqual(a[0].body, b[0].body);
    assert.throws(() => store.item('a', b[0].id)); assert.throws(() => store.item('b', a[0].id));
    assert.equal(store.items('a').length, 3); assert.equal(store.items('b').length, 3);
  } finally { store.close(); }
});
test('마지막 키·타인 키 삭제를 거절하고 삭제한 키의 세션을 폐기한다', () => {
  const store = new Store(':memory:');
  try {
    const a = seedAccount(store, 'a'); const b = seedAccount(store, 'b');
    assert.throws(() => store.deleteCredential('a', a.credential.id), /마지막/);
    assert.throws(() => store.deleteCredential('b', a.credential.id));
    const second = fakeCredential('a', 'second');
    store.registerCredential(second, { sessionHash: hashToken(a.session.token) }, 60_000);
    store.deleteCredential('a', a.credential.id);
    assert.equal(store.getSession(hashToken(a.session.token)), null);
    assert.equal(store.getCredential(a.credential.id), null);
    assert.equal(store.credentials('a').length, 1);
    assert.ok(store.getSession(hashToken(b.session.token)));
    assert.throws(() => store.completeLogin(a.credential.id, 0, 1, 60_000));
  } finally { store.close(); }
});
test('등록 도중 세션이 폐기되면 키를 추가할 수 없다', () => {
  const store = new Store(':memory:');
  try {
    const a = seedAccount(store, 'a');
    const hash = hashToken(a.session.token);
    store.revokeSession(hash);
    assert.throws(() => store.registerCredential(fakeCredential('a', 'second'), { sessionHash: hash }, 60000));
    assert.equal(store.credentials('a').length, 1);
  } finally { store.close(); }
});
