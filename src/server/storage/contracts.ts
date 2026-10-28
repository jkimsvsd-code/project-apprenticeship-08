import type { PasskeySummary, PrivateItem } from '../../shared/contracts.js';
import type { Account, Challenge, Credential, Enrollment, Session } from './store.js';

type Result<T> = T | Promise<T>;
export interface DataStore {
  getAccount(id: string): Result<Account | null>;
  issueBootstrap(userId: string, displayName: string, ttl?: number): Result<string>;
  exchangeBootstrap(token: string, ttl: number): Result<{ token: string; enrollment: Enrollment }>;
  getEnrollment(hash: string | undefined): Result<Enrollment | null>;
  getSession(hash: string | undefined): Result<Session | null>;
  revokeSession(hash: string | undefined): Result<void>;
  logout(actor: { sessionHash?: string; enrollmentHash?: string; flowHash?: string }): Result<void>;
  createChallenge(input: Omit<Challenge, 'id'>): Result<Challenge>;
  consumeChallenge(id: string, flowHash: string, purpose: Challenge['purpose']): Result<Challenge>;
  cancelChallenge(id: string, flowHash: string): Result<void>;
  getCredential(id: string): Result<Credential | null>;
  credentials(userId: string): Result<Credential[]>;
  passkeys(session: Session): Result<PasskeySummary[]>;
  registerCredential(credential: Credential, actor: { sessionHash?: string; enrollmentHash?: string }, ttl: number): Result<{ token: string; expiresAt: number } | null>;
  completeLogin(id: string, previousCounter: number, newCounter: number, ttl: number): Result<{ token: string; expiresAt: number }>;
  deleteCredential(userId: string, id: string): Result<void>;
  items(userId: string): Result<PrivateItem[]>;
  item(userId: string, id: string): Result<PrivateItem>;
}
