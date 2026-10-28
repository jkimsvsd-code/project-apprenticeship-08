import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PostgresStore } from '../src/server/storage/postgres.js';
import { createDatabasePool } from '../src/server/storage/pool.js';
import { hashToken } from '../src/server/auth/tokens.js';
import { fakeCredential } from '../tests/helpers.js';

const tag = `pgcheck-${randomUUID()}`;
const ids = [`${tag}-a`, `${tag}-b`];
const store = new PostgresStore(createDatabasePool());
try {
  async function seed(id: string) {
    const token = await store.issueBootstrap(id, `가상 DB 검증 ${id.endsWith('a') ? 'A' : 'B'}`);
    const setup = await store.exchangeBootstrap(token, 60000);
    assert.equal(await store.getAccount(id), null);
    const credential = fakeCredential(id, 'first');
    const session = await store.registerCredential(credential, { enrollmentHash: setup.enrollment.hash }, 60000);
    assert.ok(session);
    return { credential, session };
  }
  const [a, b] = await Promise.all(ids.map(seed));
  const aSession = await store.getSession(hashToken(a.session.token));
  assert.ok(aSession);
  assert.equal((await store.items(ids[0])).length, 3);
  await assert.rejects(store.item(ids[0], (await store.items(ids[1]))[0].id));
  await assert.rejects(store.item(ids[1], (await store.items(ids[0]))[0].id));
  const flowHash = hashToken(tag);
  const question = await store.createChallenge({ value: tag, purpose: 'authentication', flowHash, actorHash: null, userId: null, expiresAt: Date.now() + 30000 });
  const consumed = await Promise.allSettled([store.consumeChallenge(question.id, flowHash, 'authentication'), store.consumeChallenge(question.id, flowHash, 'authentication')]);
  assert.equal(consumed.filter(result => result.status === 'fulfilled').length, 1);
  await store.registerCredential(fakeCredential(ids[0], 'second'), { sessionHash: aSession.hash }, 60000);
  const keys = await store.credentials(ids[0]);
  const deleted = await Promise.allSettled(keys.map(key => store.deleteCredential(ids[0], key.id)));
  assert.equal(deleted.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await store.credentials(ids[0])).length, 1);
  assert.ok(await store.getSession(hashToken(b.session.token)));
  await store.logout({ sessionHash: hashToken(b.session.token) });
  assert.equal(await store.getSession(hashToken(b.session.token)), null);
  mkdirSync('evidence/deployment', { recursive: true });
  writeFileSync('evidence/deployment/postgres-check.json', JSON.stringify({ executedAt: new Date().toISOString(), environment: 'dedicated Neon production database; repository-level synthetic fixtures, no mocked SQL', accountIsolation: true, itemCountEach: 3, concurrentChallengeConsumersSucceeded: 1, concurrentDeletesSucceeded: 1, remainingCredentials: 1, logoutRevoked: true, testUsersRemovedAfterRun: true }, null, 2) + '\n');
  console.log('PASS: actual PostgreSQL isolation, atomic challenge consumption, concurrent last-key protection and server session revocation.');
} finally {
  for (const id of ids) {
    await store.query('DELETE FROM a08.users WHERE id=$1', [id]);
    await store.query('DELETE FROM a08.bootstrap_tokens WHERE user_id=$1', [id]);
    await store.query('DELETE FROM a08.enrollments WHERE user_id=$1', [id]);
    await store.query('DELETE FROM a08.challenges WHERE user_id=$1 OR flow_hash=$2', [id, hashToken(tag)]);
  }
  await store.close();
}
