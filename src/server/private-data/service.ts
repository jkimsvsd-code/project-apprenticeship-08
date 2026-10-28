import type { Store, Session } from '../storage/store.js';
import { requireSession } from '../authorization/access.js';

export function listPrivateItems(store: Store, session: Session | null) {
  return store.items(requireSession(session).user.id);
}
export function getPrivateItem(store: Store, session: Session | null, id: string) {
  return store.item(requireSession(session).user.id, id);
}
