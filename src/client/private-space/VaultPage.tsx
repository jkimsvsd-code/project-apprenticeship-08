import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText, Fingerprint, Lightbulb, LockKeyhole, Sprout } from 'lucide-react';
import type { PrivateItem, UserSummary } from '../../shared/contracts.js';
import { api, ApiError } from '../shared/api.js';
import { Loading, LockedSpace, Status } from '../shared/components.js';
import { useSession } from '../shared/session.js';

export function VaultPage() {
  const { session, loading } = useSession();
  if (loading) return <Loading />;
  if (!session.user) return <LockedSpace />;
  return <VaultContent key={session.user.id} user={session.user} />;
}
function VaultContent({ user }: { user: UserSummary }) {
  const [items, setItems] = useState<PrivateItem[] | null>(null);
  const [error, setError] = useState('');
  const { refresh } = useSession();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ items: PrivateItem[] }>('/api/private/items', { signal: controller.signal }).then(result => setItems(result.items)).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : '기록을 불러오지 못했습니다.');
      if (reason instanceof ApiError && reason.status === 401) void refresh();
    });
    return () => controller.abort();
  }, [refresh, attempt]);
  const icons = [Lightbulb, FileText, Sprout];
  return <section className="vault-page">
    <div className="page-heading heading-with-action"><div><p className="eyebrow">PRIVATE SPACE</p><h1>반가워요, {user.displayName}님.</h1><p>조용히 생각을 모으고, 다음 걸음을 준비하는 곳.</p></div><span className="pill private-pill"><LockKeyhole size={13} aria-hidden="true" /> 나만의 공간</span></div>
    <div className="vault-strip"><span><span className="status-dot" aria-hidden="true" /> 패스키로 안전하게 열었어요</span><Link to="/passkeys">내 패스키 관리 <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    <Status message={error} kind="error" />
    {error && <button className="button secondary" onClick={() => { setError(''); setAttempt(value => value + 1); }}>다시 불러오기</button>}
    {!items && !error ? <Loading label="나의 기록을 가져오고 있어요" /> : <div className="private-grid">
      {items?.map((item, index) => { const Icon = icons[index % icons.length]; return <article className="private-card" key={item.id}>
        <div className={`note-icon tone-${index % 3}`}><Icon size={23} strokeWidth={1.5} aria-hidden="true" /></div><p className="eyebrow">NOTE {String(index + 1).padStart(2, '0')}</p><h2>{item.title}</h2><p>{item.body}</p><div className="note-footer"><span>{item.category}</span><LockKeyhole size={13} aria-label="비공개" /></div>
      </article>; })}
    </div>}
    <div className="vault-bottom"><div><Fingerprint size={23} aria-hidden="true" /><div><h2>예비 열쇠도 챙겨 두세요.</h2><p>기기를 잃어버려도 남은 패스키로 돌아올 수 있도록.</p></div></div><Link to="/passkeys" className="button secondary">패스키 확인 <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    <p className="data-notice">이 공간의 기록은 연습을 위해 만든 가상 자료입니다. 실제 연락처나 민감한 개인정보를 넣지 않아요.</p>
  </section>;
}
