import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import type { PasskeySummary, PrivateItem, Provider, UserSummary } from '../../shared/contracts.js';
import { AppError, denied, invalidCeremony, unauthorized } from '../auth/errors.js';
import { hashToken, randomToken } from '../auth/tokens.js';

type Row = Record<string, unknown>;
export interface Account extends UserSummary { handle: string }
export interface Credential {
  id: string; userId: string; publicKey: Uint8Array<ArrayBuffer>; counter: number;
  transports: AuthenticatorTransport[]; name: string; provider: Provider;
  createdAt: number; deviceType: string; backedUp: boolean;
}
export interface Session { hash: string; user: Account; credentialId: string; expiresAt: number }
export interface Enrollment { hash: string; userId: string; displayName: string; handle: string; expiresAt: number }
export interface Challenge {
  id: string; value: string; purpose: 'registration' | 'authentication'; flowHash: string;
  actorHash: string | null; userId: string | null; expiresAt: number;
}

export class Store {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, display_name TEXT NOT NULL, handle TEXT UNIQUE NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL,
        name TEXT NOT NULL, provider TEXT NOT NULL, created_at INTEGER NOT NULL,
        device_type TEXT NOT NULL, backed_up INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS credentials_user ON credentials(user_id);
      CREATE TABLE IF NOT EXISTS sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS bootstrap_tokens (
        hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
        handle TEXT NOT NULL, expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS enrollments (
        hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
        handle TEXT NOT NULL, expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY, value TEXT UNIQUE NOT NULL, purpose TEXT NOT NULL,
        flow_hash TEXT NOT NULL, actor_hash TEXT, user_id TEXT, expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS private_items (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS items_owner ON private_items(owner_id);
      PRAGMA user_version = 1;
    `);
  }

  close() { this.db.close(); }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  prune(now = Date.now()) {
    for (const table of ['sessions', 'bootstrap_tokens', 'enrollments', 'challenges']) {
      this.db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now);
    }
  }

  getAccount(id: string): Account | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    return row ? { id: String(row.id), displayName: String(row.display_name), handle: String(row.handle) } : null;
  }

  issueBootstrap(userId: string, displayName: string, ttl = 15 * 60 * 1000): string {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(userId) || !displayName.trim() || displayName.length > 40) {
      throw new AppError(400, 'INVALID_ACCOUNT', '가상 계정 ID와 이름 형식을 확인하세요.');
    }
    return this.transaction(() => {
      if (this.getAccount(userId)) throw new AppError(409, 'ALREADY_ENROLLED', '이미 등록된 계정입니다. 기존 패스키로 로그인해 추가하세요.');
      const token = randomToken();
      this.db.prepare('DELETE FROM bootstrap_tokens WHERE user_id = ?').run(userId);
      this.db.prepare('DELETE FROM enrollments WHERE user_id = ?').run(userId);
      this.db.prepare('INSERT INTO bootstrap_tokens VALUES (?, ?, ?, ?, ?)')
        .run(hashToken(token), userId, displayName.trim(), randomToken(), Date.now() + ttl);
      return token;
    });
  }

  exchangeBootstrap(token: string, ttl: number): { token: string; enrollment: Enrollment } {
    return this.transaction(() => {
      const row = this.db.prepare('DELETE FROM bootstrap_tokens WHERE hash = ? RETURNING *').get(hashToken(token)) as Row | undefined;
      if (!row || Number(row.expires_at) <= Date.now() || this.getAccount(String(row.user_id))) {
        throw new AppError(400, 'INVALID_SETUP', '초기 등록 링크가 만료되었거나 이미 사용되었습니다. 관리자 도구에서 새 링크를 발급하세요.');
      }
      const enrollmentToken = randomToken();
      const enrollment: Enrollment = {
        hash: hashToken(enrollmentToken), userId: String(row.user_id), displayName: String(row.display_name),
        handle: String(row.handle), expiresAt: Date.now() + ttl,
      };
      this.db.prepare('INSERT INTO enrollments VALUES (?, ?, ?, ?, ?)')
        .run(enrollment.hash, enrollment.userId, enrollment.displayName, enrollment.handle, enrollment.expiresAt);
      return { token: enrollmentToken, enrollment };
    });
  }

  getEnrollment(hash: string | undefined): Enrollment | null {
    if (!hash) return null;
    const row = this.db.prepare('SELECT * FROM enrollments WHERE hash = ? AND expires_at > ?').get(hash, Date.now()) as Row | undefined;
    return row ? { hash, userId: String(row.user_id), displayName: String(row.display_name), handle: String(row.handle), expiresAt: Number(row.expires_at) } : null;
  }

  getSession(hash: string | undefined): Session | null {
    if (!hash) return null;
    const row = this.db.prepare('SELECT * FROM sessions WHERE hash = ? AND expires_at > ?').get(hash, Date.now()) as Row | undefined;
    const user = row ? this.getAccount(String(row.user_id)) : null;
    return row && user ? { hash, user, credentialId: String(row.credential_id), expiresAt: Number(row.expires_at) } : null;
  }

  revokeSession(hash: string | undefined) {
    if (!hash) return;
    this.db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash);
    this.db.prepare('DELETE FROM challenges WHERE actor_hash = ?').run(hash);
  }

  createChallenge(input: Omit<Challenge, 'id'>): Challenge {
    this.prune();
    // One outstanding ceremony per browser flow; a retry always replaces it.
    this.db.prepare('DELETE FROM challenges WHERE flow_hash = ?').run(input.flowHash);
    const result = { ...input, id: randomUUID() };
    this.db.prepare('INSERT INTO challenges VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(result.id, result.value, result.purpose, result.flowHash, result.actorHash, result.userId, result.expiresAt);
    return result;
  }

  consumeChallenge(id: string, flowHash: string, purpose: Challenge['purpose']): Challenge {
    // DELETE RETURNING makes consumption atomic, before asynchronous crypto verification.
    const row = this.db.prepare('DELETE FROM challenges WHERE id = ? AND flow_hash = ? AND purpose = ? RETURNING *')
      .get(id, flowHash, purpose) as Row | undefined;
    if (!row || Number(row.expires_at) <= Date.now()) throw invalidCeremony();
    return { id: String(row.id), value: String(row.value), purpose, flowHash,
      actorHash: row.actor_hash === null ? null : String(row.actor_hash),
      userId: row.user_id === null ? null : String(row.user_id), expiresAt: Number(row.expires_at) };
  }

  cancelChallenge(id: string, flowHash: string) {
    this.db.prepare('DELETE FROM challenges WHERE id = ? AND flow_hash = ?').run(id, flowHash);
  }

  getCredential(id: string): Credential | null {
    const row = this.db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as Row | undefined;
    return row ? {
      id: String(row.id), userId: String(row.user_id), publicKey: new Uint8Array(row.public_key as Uint8Array),
      counter: Number(row.counter), transports: JSON.parse(String(row.transports)), name: String(row.name),
      provider: row.provider as Provider, createdAt: Number(row.created_at), deviceType: String(row.device_type), backedUp: Boolean(row.backed_up),
    } : null;
  }

  credentials(userId: string): Credential[] {
    return (this.db.prepare('SELECT id FROM credentials WHERE user_id = ? ORDER BY created_at, id').all(userId) as Row[])
      .map(row => this.getCredential(String(row.id))!);
  }

  passkeys(session: Session): PasskeySummary[] {
    return this.credentials(session.user.id).map(({ id, name, provider, createdAt, deviceType, backedUp }) => ({
      id, name, provider, createdAt, deviceType, backedUp, current: id === session.credentialId,
    }));
  }

  registerCredential(credential: Credential, actor: { sessionHash?: string; enrollmentHash?: string }, ttl: number) {
    return this.transaction(() => {
      const session = this.getSession(actor.sessionHash);
      const enrollment = this.getEnrollment(actor.enrollmentHash);
      if (session) {
        if (session.user.id !== credential.userId) throw denied();
      } else if (enrollment && enrollment.userId === credential.userId && !this.getAccount(enrollment.userId)) {
        this.db.prepare('INSERT INTO users VALUES (?, ?, ?)').run(enrollment.userId, enrollment.displayName, enrollment.handle);
        const categories = ['프로젝트 메모', '지원 계획', '학습 회고'];
        categories.forEach((category, index) => {
          this.db.prepare('INSERT INTO private_items VALUES (?, ?, ?, ?, ?)').run(
            `${enrollment.userId}-item-${index + 1}`, enrollment.userId, category,
            `${enrollment.displayName}의 가상 ${category}입니다. 실제 개인정보 없이 만든 연습용 자료 ${index + 1}입니다.`, category,
          );
        });
        this.db.prepare('DELETE FROM enrollments WHERE hash = ?').run(enrollment.hash);
        this.db.prepare('DELETE FROM bootstrap_tokens WHERE user_id = ?').run(enrollment.userId);
      } else { throw unauthorized(); }
      if (this.getCredential(credential.id)) throw new AppError(409, 'DUPLICATE_PASSKEY', '이미 등록된 패스키입니다. 다른 저장 위치나 보안 키를 선택하세요.');
      this.db.prepare('INSERT INTO credentials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        credential.id, credential.userId, credential.publicKey, credential.counter, JSON.stringify(credential.transports),
        credential.name, credential.provider, credential.createdAt, credential.deviceType, Number(credential.backedUp),
      );
      return session ? null : this.insertSession(credential.userId, credential.id, ttl);
    });
  }

  private insertSession(userId: string, credentialId: string, ttl: number) {
    const token = randomToken();
    const expiresAt = Date.now() + ttl;
    this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hashToken(token), userId, credentialId, expiresAt);
    return { token, expiresAt };
  }

  completeLogin(id: string, previousCounter: number, newCounter: number, ttl: number) {
    return this.transaction(() => {
      const credential = this.getCredential(id);
      if (!credential || credential.counter !== previousCounter) throw invalidCeremony();
      this.db.prepare('UPDATE credentials SET counter = ? WHERE id = ?').run(newCounter, id);
      return this.insertSession(credential.userId, id, ttl);
    });
  }

  deleteCredential(userId: string, id: string): void {
    this.transaction(() => {
      const credential = this.getCredential(id);
      if (!credential || credential.userId !== userId) throw denied();
      if (this.credentials(userId).length <= 1) throw new AppError(409, 'LAST_PASSKEY', '마지막 패스키는 삭제할 수 없습니다. 새 패스키를 먼저 등록해 주세요.');
      // FK cascade also revokes every session authenticated with this credential.
      this.db.prepare('DELETE FROM challenges WHERE actor_hash IN (SELECT hash FROM sessions WHERE credential_id = ?)').run(id);
      this.db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
    });
  }

  items(userId: string): PrivateItem[] {
    return (this.db.prepare('SELECT id, title, body, category FROM private_items WHERE owner_id = ? ORDER BY id').all(userId) as Row[])
      .map(row => ({ id: String(row.id), title: String(row.title), body: String(row.body), category: String(row.category) }));
  }

  item(userId: string, id: string): PrivateItem {
    const row = this.db.prepare('SELECT * FROM private_items WHERE id = ?').get(id) as Row | undefined;
    if (!row || row.owner_id !== userId) throw denied();
    return { id: String(row.id), title: String(row.title), body: String(row.body), category: String(row.category) };
  }
}
