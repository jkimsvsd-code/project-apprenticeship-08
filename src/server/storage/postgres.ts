import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { DataStore } from './contracts.js';
import type { Account, Challenge, Credential, Enrollment, Session } from './store.js';
import type { PasskeySummary, PrivateItem, Provider } from '../../shared/contracts.js';
import { AppError, denied, invalidCeremony, unauthorized } from '../auth/errors.js';
import { hashToken, randomToken } from '../auth/tokens.js';

type Row = QueryResultRow;
export class PostgresStore implements DataStore {
  private context = new AsyncLocalStorage<PoolClient>();
  constructor(readonly pool: Pool) {}
  async query(sql: string, values: unknown[] = []): Promise<Row[]> {
    return (await (this.context.getStore() ?? this.pool).query(sql, values)).rows;
  }
  private async transaction<T>(lock: string, operation: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return operation();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '10s'");
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`a08:${lock}`]);
      const result = await this.context.run(client, operation);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
  async prune(now = Date.now()) {
    for (const table of ['sessions', 'bootstrap_tokens', 'enrollments', 'challenges']) {
      await this.query(`DELETE FROM a08.${table} WHERE expires_at <= $1`, [now]);
    }
  }
  async getAccount(id: string): Promise<Account | null> {
    const [row] = await this.query('SELECT * FROM a08.users WHERE id = $1', [id]);
    return row ? { id: row.id, displayName: row.display_name, handle: row.handle } : null;
  }
  async issueBootstrap(userId: string, displayName: string, ttl = 15 * 60 * 1000): Promise<string> {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(userId) || !displayName.trim() || displayName.length > 40) throw new AppError(400, 'INVALID_ACCOUNT', '가상 계정 ID와 이름 형식을 확인하세요.');
    return this.transaction(`user:${userId}`, async () => {
      if (await this.getAccount(userId)) throw new AppError(409, 'ALREADY_ENROLLED', '이미 등록된 계정입니다. 기존 패스키로 로그인해 추가하세요.');
      const token = randomToken();
      await this.query('DELETE FROM a08.bootstrap_tokens WHERE user_id = $1', [userId]);
      await this.query('DELETE FROM a08.enrollments WHERE user_id = $1', [userId]);
      await this.query('INSERT INTO a08.bootstrap_tokens VALUES ($1,$2,$3,$4,$5)', [hashToken(token), userId, displayName.trim(), randomToken(), Date.now() + ttl]);
      return token;
    });
  }
  async exchangeBootstrap(token: string, ttl: number): Promise<{ token: string; enrollment: Enrollment }> {
    return this.transaction(`bootstrap:${hashToken(token)}`, async () => {
      const [row] = await this.query('DELETE FROM a08.bootstrap_tokens WHERE hash = $1 RETURNING *', [hashToken(token)]);
      if (!row || Number(row.expires_at) <= Date.now() || await this.getAccount(row.user_id)) throw new AppError(400, 'INVALID_SETUP', '초기 등록 링크가 만료되었거나 이미 사용되었습니다. 관리자 도구에서 새 링크를 발급하세요.');
      const next = randomToken();
      const enrollment: Enrollment = { hash: hashToken(next), userId: row.user_id, displayName: row.display_name, handle: row.handle, expiresAt: Date.now() + ttl };
      await this.query('INSERT INTO a08.enrollments VALUES ($1,$2,$3,$4,$5)', [enrollment.hash, enrollment.userId, enrollment.displayName, enrollment.handle, enrollment.expiresAt]);
      return { token: next, enrollment };
    });
  }
  async getEnrollment(hash: string | undefined): Promise<Enrollment | null> {
    if (!hash) return null;
    const [row] = await this.query('SELECT * FROM a08.enrollments WHERE hash = $1 AND expires_at > $2', [hash, Date.now()]);
    return row ? { hash, userId: row.user_id, displayName: row.display_name, handle: row.handle, expiresAt: Number(row.expires_at) } : null;
  }
  async getSession(hash: string | undefined): Promise<Session | null> {
    if (!hash) return null;
    const [row] = await this.query('SELECT s.*, u.display_name, u.handle FROM a08.sessions s JOIN a08.users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>$2', [hash, Date.now()]);
    return row ? { hash, user: { id: row.user_id, displayName: row.display_name, handle: row.handle }, credentialId: row.credential_id, expiresAt: Number(row.expires_at) } : null;
  }
  async revokeSession(hash: string | undefined): Promise<void> {
    if (!hash) return;
    await this.transaction(`session:${hash}`, async () => {
      await this.query('DELETE FROM a08.sessions WHERE hash = $1', [hash]);
      await this.query('DELETE FROM a08.challenges WHERE actor_hash = $1', [hash]);
    });
  }
  async logout(actor: { sessionHash?: string; enrollmentHash?: string; flowHash?: string }): Promise<void> {
    await this.transaction(`logout:${actor.sessionHash ?? actor.flowHash ?? 'anonymous'}`, async () => {
      await this.revokeSession(actor.sessionHash);
      if (actor.enrollmentHash) await this.query('DELETE FROM a08.enrollments WHERE hash=$1', [actor.enrollmentHash]);
      if (actor.flowHash) await this.query('DELETE FROM a08.challenges WHERE flow_hash=$1', [actor.flowHash]);
    });
  }
  async createChallenge(input: Omit<Challenge, 'id'>): Promise<Challenge> {
    await this.prune();
    return this.transaction(`flow:${input.flowHash}`, async () => {
      await this.query('DELETE FROM a08.challenges WHERE flow_hash=$1', [input.flowHash]);
      const result = { ...input, id: randomUUID() };
      await this.query('INSERT INTO a08.challenges VALUES ($1,$2,$3,$4,$5,$6,$7)', [result.id, result.value, result.purpose, result.flowHash, result.actorHash, result.userId, result.expiresAt]);
      return result;
    });
  }
  async consumeChallenge(id: string, flowHash: string, purpose: Challenge['purpose']): Promise<Challenge> {
    const [row] = await this.query('DELETE FROM a08.challenges WHERE id=$1 AND flow_hash=$2 AND purpose=$3 RETURNING *', [id, flowHash, purpose]);
    if (!row || Number(row.expires_at) <= Date.now()) throw invalidCeremony();
    return { id: row.id, value: row.value, purpose, flowHash, actorHash: row.actor_hash, userId: row.user_id, expiresAt: Number(row.expires_at) };
  }
  async cancelChallenge(id: string, flowHash: string): Promise<void> { await this.query('DELETE FROM a08.challenges WHERE id=$1 AND flow_hash=$2', [id, flowHash]); }
  private credential(row: Row): Credential {
    return { id: row.id, userId: row.user_id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter), transports: row.transports,
      name: row.name, provider: row.provider as Provider, createdAt: Number(row.created_at), deviceType: row.device_type, backedUp: row.backed_up };
  }
  async getCredential(id: string): Promise<Credential | null> {
    const [row] = await this.query('SELECT * FROM a08.credentials WHERE id=$1', [id]);
    return row ? this.credential(row) : null;
  }
  async credentials(userId: string): Promise<Credential[]> {
    return (await this.query('SELECT * FROM a08.credentials WHERE user_id=$1 ORDER BY created_at,id', [userId])).map(row => this.credential(row));
  }
  async passkeys(session: Session): Promise<PasskeySummary[]> {
    return (await this.credentials(session.user.id)).map(({ id, name, provider, createdAt, deviceType, backedUp }) => ({ id, name, provider, createdAt, deviceType, backedUp, current: id === session.credentialId }));
  }
  async registerCredential(credential: Credential, actor: { sessionHash?: string; enrollmentHash?: string }, ttl: number) {
    return this.transaction(`user:${credential.userId}`, async () => {
      const session = await this.getSession(actor.sessionHash), enrollment = await this.getEnrollment(actor.enrollmentHash);
      if (session) { if (session.user.id !== credential.userId) throw denied(); }
      else if (enrollment && enrollment.userId === credential.userId && !await this.getAccount(enrollment.userId)) {
        await this.query('INSERT INTO a08.users VALUES ($1,$2,$3)', [enrollment.userId, enrollment.displayName, enrollment.handle]);
        const categories = ['프로젝트 메모', '지원 계획', '학습 회고'];
        for (const [index, category] of categories.entries()) await this.query('INSERT INTO a08.private_items VALUES ($1,$2,$3,$4,$5)', [
          `${enrollment.userId}-item-${index + 1}`, enrollment.userId, category,
          `${enrollment.displayName}의 가상 ${category}입니다. 실제 개인정보 없이 만든 연습용 자료 ${index + 1}입니다.`, category,
        ]);
        await this.query('DELETE FROM a08.enrollments WHERE hash=$1', [enrollment.hash]);
        await this.query('DELETE FROM a08.bootstrap_tokens WHERE user_id=$1', [enrollment.userId]);
      } else throw unauthorized();
      if (await this.getCredential(credential.id)) throw new AppError(409, 'DUPLICATE_PASSKEY', '이미 등록된 패스키입니다. 다른 저장 위치나 보안 키를 선택하세요.');
      await this.query('INSERT INTO a08.credentials VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [credential.id, credential.userId, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(credential.transports), credential.name, credential.provider, credential.createdAt, credential.deviceType, credential.backedUp]);
      return session ? null : this.insertSession(credential.userId, credential.id, ttl);
    });
  }
  private async insertSession(userId: string, id: string, ttl: number) {
    const token = randomToken(), expiresAt = Date.now() + ttl;
    await this.query('INSERT INTO a08.sessions VALUES ($1,$2,$3,$4)', [hashToken(token), userId, id, expiresAt]);
    return { token, expiresAt };
  }
  async completeLogin(id: string, previousCounter: number, newCounter: number, ttl: number) {
    const existing = await this.getCredential(id);
    if (!existing) throw invalidCeremony();
    return this.transaction(`user:${existing.userId}`, async () => {
      const credential = await this.getCredential(id);
      if (!credential || credential.counter !== previousCounter) throw invalidCeremony();
      await this.query('UPDATE a08.credentials SET counter=$1 WHERE id=$2', [newCounter, id]);
      return this.insertSession(credential.userId, id, ttl);
    });
  }
  async deleteCredential(userId: string, id: string): Promise<void> {
    await this.transaction(`user:${userId}`, async () => {
      const credential = await this.getCredential(id);
      if (!credential || credential.userId !== userId) throw denied();
      if ((await this.credentials(userId)).length <= 1) throw new AppError(409, 'LAST_PASSKEY', '마지막 패스키는 삭제할 수 없습니다. 새 패스키를 먼저 등록해 주세요.');
      await this.query('DELETE FROM a08.challenges WHERE actor_hash IN (SELECT hash FROM a08.sessions WHERE credential_id=$1)', [id]);
      await this.query('DELETE FROM a08.credentials WHERE id=$1', [id]);
    });
  }
  async items(userId: string): Promise<PrivateItem[]> { return (await this.query('SELECT id,title,body,category FROM a08.private_items WHERE owner_id=$1 ORDER BY id', [userId])) as PrivateItem[]; }
  async item(userId: string, id: string): Promise<PrivateItem> {
    const [row] = await this.query('SELECT id,title,body,category FROM a08.private_items WHERE owner_id=$1 AND id=$2', [userId, id]);
    if (!row) throw denied();
    return row as PrivateItem;
  }
}
