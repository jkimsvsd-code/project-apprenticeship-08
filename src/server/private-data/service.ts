import type { Session } from '../storage/store.js';
import type { DataStore } from '../storage/contracts.js';
import { requireSession } from '../authorization/access.js';

export function listPrivateItems(store: DataStore, session: Session | null) {
  return store.items(requireSession(session).user.id);
}
export function getPrivateItem(store: DataStore, session: Session | null, id: string) {
  return store.item(requireSession(session).user.id, id);
}
