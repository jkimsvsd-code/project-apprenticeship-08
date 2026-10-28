import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Fingerprint, LockKeyhole, LogOut } from 'lucide-react';
import { SessionProvider, useSession } from './shared/session.js';
import { ProfilePage } from './public-profile/ProfilePage.js';
import { VaultPage } from './private-space/VaultPage.js';
import { LoginPage } from './passkeys/LoginPage.js';
import { SetupPage } from './passkeys/SetupPage.js';
import { PasskeysPage } from './passkeys/PasskeysPage.js';
import { Status } from './shared/components.js';

function Layout() {
  const { session, logout, logoutError } = useSession();
  const location = useLocation();
  const publicPage = location.pathname === '/';
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'J — 질문에서 시작하는 배움', '/vault': '나만의 공간 — J', '/passkeys': '내 패스키 — J', '/login': '패스키 로그인 — J', '/setup': '첫 패스키 등록 — J' };
    document.title = titles[location.pathname] ?? '페이지를 찾을 수 없어요 — J';
    const timer = requestAnimationFrame(() => {
      if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
      else { window.scrollTo(0, 0); const heading = document.querySelector<HTMLElement>('main h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); }
    });
    return () => cancelAnimationFrame(timer);
  }, [location.pathname, location.hash]);
  const signOut = async () => { if (loggingOut) return; setLoggingOut(true); await logout(); setLoggingOut(false); navigate('/vault'); };
  return <>
    <a className="skip-link" href="#main">본문으로 이동</a>
    <header className="site-header wrap app-header"><Link className="wordmark" to="/" aria-label="J 공개 소개로 이동">J<span className="mark-dot" aria-hidden="true">.</span></Link>
      <nav aria-label="주요 메뉴"><NavLink end to="/">공개 소개</NavLink>{!publicPage && <><NavLink to="/vault"><LockKeyhole size={13} aria-hidden="true" /> 나만의 공간</NavLink><NavLink to="/passkeys">패스키 관리</NavLink></>}</nav>
      {!publicPage && <div className="header-end">{session.user ? <button className="logout-button" aria-label="로그아웃" onClick={() => void signOut()} disabled={loggingOut}><LogOut size={14} aria-hidden="true" /><span>{loggingOut ? '잠그는 중…' : '로그아웃'}</span></button> : <Link className="header-login" aria-label="패스키 로그인" to="/login"><Fingerprint size={15} aria-hidden="true" /><span>로그인</span><ArrowUpRight size={13} aria-hidden="true" /></Link>}</div>}
    </header>
    {logoutError && <div className="wrap"><Status message={logoutError} kind="error" /><button className="button secondary" onClick={() => void signOut()}>로그아웃 재시도</button></div>}
    <main id="main" className="wrap app-main" tabIndex={-1}><Routes>
      <Route path="/" element={<ProfilePage />} /><Route path="/vault" element={<VaultPage />} /><Route path="/passkeys" element={<PasskeysPage />} /><Route path="/login" element={<LoginPage />} /><Route path="/setup" element={<SetupPage />} />
      <Route path="*" element={<section className="not-found"><p className="eyebrow">404 · A DIFFERENT PATH</p><h1>이곳에는 아직 기록이 없어요.</h1><p>주소를 확인하거나 공개 소개로 돌아가 주세요.</p><Link className="button primary" to="/">공개 소개로</Link></section>} />
    </Routes></main>
    <footer className="site-footer wrap"><Link className="wordmark" to="/" aria-label="J 공개 소개">J<span className="mark-dot" aria-hidden="true">.</span></Link><p>질문하고, 만들고, 돌아보는 기록.</p>{!publicPage && <span className="footer-security"><LockKeyhole size={12} aria-hidden="true" /> 공개된 소개, 지켜지는 기록</span>}</footer>
  </>;
}
export function App() { return <BrowserRouter><SessionProvider><Layout /></SessionProvider></BrowserRouter>; }
