import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SessionSummary } from '../../shared/contracts.js';
import { api, post } from './api.js';

interface SessionContextValue {
  session: SessionSummary; loading: boolean; logoutError: string;
  refresh: () => Promise<SessionSummary>; logout: () => Promise<boolean>;
}
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionSummary>({ user: null });
  const [loading, setLoading] = useState(true);
  const [logoutError, setLogoutError] = useState('');
  const channel = useRef<BroadcastChannel | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const next = await api<SessionSummary>('/api/session');
      if (sequence.current === current) setSession(next);
      return next;
    } catch {
      if (sequence.current === current) setSession({ user: null });
      return { user: null };
    } finally { if (sequence.current === current) setLoading(false); }
  }, []);
  const logout = useCallback(async () => {
    ++sequence.current;
    setSession({ user: null });
    setLoading(false);
    setLogoutError('');
    let success = false;
    try { await post('/api/auth/logout'); success = true; }
    catch { setLogoutError('화면은 잠갔지만 서버의 로그아웃을 확인하지 못했습니다. 연결 후 다시 시도해 주세요.'); }
    channel.current?.postMessage('changed');
    return success;
  }, []);
  useEffect(() => {
    void refresh();
    const refreshVisible = () => {
      ++sequence.current;
      setSession({ user: null });
      if (document.visibilityState === 'visible') void refresh();
    };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) refreshVisible(); };
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('pageshow', restore);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('a08-session');
      channel.current.onmessage = () => { setSession({ user: null }); void refresh(); };
    }
    return () => {
      ++sequence.current;
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('pageshow', restore);
      channel.current?.close();
    };
  }, [refresh]);
  useEffect(() => {
    if (!session.expiresAt) return;
    const timeout = window.setTimeout(() => { ++sequence.current; setSession({ user: null }); }, Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [session.expiresAt]);
  return <SessionContext.Provider value={{ session, loading, refresh, logout, logoutError }}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider is required');
  return context;
}
