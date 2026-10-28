import { useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom';
import { Fingerprint, KeyRound, LoaderCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { safeReturnTo } from '../../shared/contracts.js';
import { useSession } from '../shared/session.js';
import { EnvironmentNotice, Loading, Status } from '../shared/components.js';
import { useCeremony } from './useCeremony.js';

export function LoginPage() {
  const { session, loading, refresh } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeReturnTo(params.get('next'));
  const ceremony = useCeremony();
  if (loading) return <Loading />;
  if (session.user) return <Navigate to={next} replace />;
  const login = () => ceremony.login(async () => {
    const current = await refresh();
    if (current.user) navigate(next, { replace: true });
  });
  return <section className="auth-page">
    <div className="auth-intro"><Link to="/" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> 공개 소개로</Link><p className="eyebrow">WELCOME BACK</p><h1>비밀번호 없이,<br />나의 공간으로.</h1><p>외울 것은 줄이고,<br />나에게 중요한 기록에 집중해요.</p>
      <div className="auth-principle"><ShieldCheck size={23} aria-hidden="true" /><div><strong>열쇠는 서비스에 맡기지 않아요.</strong><p>기기가 나를 확인하고, 서버는 공개키로 인증을 검증해요. 지문·얼굴 정보는 전송되지 않아요.</p></div></div></div>
    <div className="auth-card"><div className="auth-icon"><Fingerprint size={30} aria-hidden="true" /></div><h2>패스키로 로그인</h2><p>등록한 기기나 보안 키를 준비해 주세요.</p>
      <button className="button primary full-width" disabled={ceremony.busy} onClick={() => void login()}>
        {ceremony.busy ? <LoaderCircle className="spin" size={19} aria-hidden="true" /> : <Fingerprint size={19} aria-hidden="true" />}
        {ceremony.busy ? '패스키 확인 중…' : '패스키로 계속하기'}
      </button>
      {ceremony.phase === 'device' && <button className="button text-button full-width" onClick={ceremony.cancel}>로그인 취소</button>}
      <Status message={ceremony.message} kind={ceremony.phase === 'error' || ceremony.phase === 'timeout' ? 'error' : 'info'} />
      <EnvironmentNotice />
      <div className="card-footnote"><KeyRound size={16} aria-hidden="true" /><p>처음 사용하는 소유자는 관리 도구에서 발급한 초기 등록 링크가 필요해요. 방문자는 등록하지 않아도 공개 소개를 볼 수 있어요.</p></div>
    </div>
  </section>;
}
