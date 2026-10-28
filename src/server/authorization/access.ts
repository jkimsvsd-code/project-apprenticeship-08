import type { Session } from '../storage/store.js';
import { unauthorized } from '../auth/errors.js';
export function requireSession(session: Session | null): Session {
  if (!session) throw unauthorized();
  return session;
}
