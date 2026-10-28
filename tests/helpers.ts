import { Store, type Credential } from '../src/server/storage/store.js';
import type { Config } from '../src/server/config/env.js';
import { loadConfig } from '../src/server/config/env.js';

export function testConfig(): Config { return { ...loadConfig({}), databasePath: ':memory:', authRateLimit: 1000 }; }
// Repository tests intentionally use non-cryptographic data. Actual signature verification
// is exercised by the Chromium virtual-authenticator end-to-end suite, without verifier mocks.
export function fakeCredential(userId: string, name: string): Credential {
  return { id: Buffer.from(`${userId}-${name}`).toString('base64url'), userId, publicKey: new Uint8Array([1, 2, 3]),
    counter: 0, transports: ['internal'], name, provider: '기타 / 확인하지 못함', createdAt: Date.now(), deviceType: 'singleDevice', backedUp: false };
}
export function seedAccount(store: Store, userId: string) {
  const bootstrap = store.issueBootstrap(userId, `가상 ${userId}`);
  const setup = store.exchangeBootstrap(bootstrap, 60_000);
  const credential = fakeCredential(userId, 'first');
  const session = store.registerCredential(credential, { enrollmentHash: setup.enrollment.hash }, 60_000)!;
  return { credential, session, enrollment: setup.enrollment };
}
