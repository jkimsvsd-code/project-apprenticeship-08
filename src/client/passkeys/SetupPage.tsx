import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { api, post } from '../shared/api.js';
import { Loading, Status } from '../shared/components.js';
import { useSession } from '../shared/session.js';
import { RegistrationForm } from './RegistrationForm.js';

export function SetupPage() {
  const [setup, setSetup] = useState<{ displayName: string; expiresAt: number } | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);
  const { refresh } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // A fragment is never sent with HTTP requests. Remove it before any navigation.
    window.history.replaceState(null, '', '/setup');
    const request = token ? post<{ displayName: string; expiresAt: number }>('/api/setup/exchange', { token })
      : api<{ displayName: string; expiresAt: number }>('/api/setup');
    void request.then(setSetup).catch(reason => setError(reason instanceof Error ? reason.message : '초기 등록을 준비하지 못했습니다.'));
  }, []);
  return <section className="auth-page">
    <div className="auth-intro"><Link to="/" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> 공개 소개로</Link><p className="eyebrow">YOUR FIRST KEY</p><h1>나의 공간에,<br />첫 열쇠를 만들어요.</h1><p>이름을 붙여 두면<br />나중에도 쉽게 알아볼 수 있어요.</p><div className="auth-principle"><ShieldCheck size={23} aria-hidden="true" /><div><strong>등록이 끝나야 공간이 만들어져요.</strong><p>중간에 취소하면 계정과 패스키를 확정하지 않아요. 등록 링크는 짧은 시간 동안 한 번만 사용할 수 있어요.</p></div></div></div>
    <div className="auth-card"><div className="auth-icon"><KeyRound size={28} aria-hidden="true" /></div><h2>소유자 첫 등록</h2>
      {error ? <><Status message={error} kind="error" /><Link className="button secondary full-width" to="/login">기존 패스키로 로그인</Link></>
        : !setup ? <Loading label="등록 링크를 확인하고 있어요" /> : <><p>{setup.displayName}님의 첫 패스키를 등록해요.</p>
          <RegistrationForm initial onSuccess={async () => { const current = await refresh(); if (current.user) navigate('/vault', { replace: true }); }} />
          <p className="field-help">등록 준비 유효시간: {new Date(setup.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지</p></>}
    </div>
  </section>;
}
