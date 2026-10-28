import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Fingerprint, KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { PasskeySummary } from '../../shared/contracts.js';
import { api, ApiError } from '../shared/api.js';
import { ConfirmDialog, Loading, LockedSpace, Status } from '../shared/components.js';
import { useSession } from '../shared/session.js';
import { RegistrationForm } from './RegistrationForm.js';

export function PasskeysPage() {
  const { session, loading } = useSession();
  if (loading) return <Loading />;
  if (!session.user) return <LockedSpace next="/passkeys" title="내 패스키 관리" description="나의 열쇠를 확인하고, 예비 패스키를 챙겨 두는 곳." />;
  return <PasskeysContent key={session.user.id} />;
}
function PasskeysContent() {
  const [keys, setKeys] = useState<PasskeySummary[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<PasskeySummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { refresh } = useSession();
  const navigate = useNavigate();
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result = await api<{ passkeys: PasskeySummary[] }>('/api/passkeys', { signal }); setKeys(result.passkeys); }
    catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof Error ? reason.message : '패스키 목록을 불러오지 못했습니다.');
      if (reason instanceof ApiError && reason.status === 401) void refresh();
    }
  }, [refresh]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const remove = async () => {
    if (!selected || deleting) return;
    setDeleting(true); setError('');
    try {
      const result = await api<{ sessionRevoked: boolean }>(`/api/passkeys/${encodeURIComponent(selected.id)}`, { method: 'DELETE', body: '{}' });
      setSelected(null); setNotice('선택한 패스키를 서비스에서 삭제했어요. 기기의 저장 항목은 직접 확인해 주세요.');
      if (result.sessionRevoked) { await refresh(); navigate('/login?next=%2Fpasskeys', { replace: true }); }
      else await load();
    } catch (reason) { setSelected(null); setError(reason instanceof Error ? reason.message : '삭제하지 못했습니다.'); }
    finally { setDeleting(false); }
  };
  return <section className="passkeys-page">
    <Link to="/vault" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> 나만의 공간으로</Link>
    <div className="page-heading heading-with-action"><div><p className="eyebrow">YOUR KEYS</p><h1>나의 열쇠를 관리해요.</h1><p>익숙한 이름을 붙이고, 예비 패스키도 준비해 두세요.</p></div><span className="key-count">{keys?.length ?? '–'}<span>개의 패스키</span></span></div>
    <Status message={error} kind="error" /><Status message={notice} kind="success" />
    {error && <button className="button secondary" onClick={() => { setError(''); void load(); }}>목록 다시 불러오기</button>}
    {keys?.length === 1 && <div className="backup-callout"><div className="callout-icon"><KeyRound size={23} aria-hidden="true" /></div><div><h2>예비 열쇠 하나, 더 든든하게.</h2><p>기기를 잃어버릴 때를 대비해 다른 저장 위치나 보안 키에 하나 더 등록해 주세요.</p></div><button className="button secondary" onClick={() => setShowForm(true)}>예비 패스키 추가 <Plus size={15} aria-hidden="true" /></button></div>}
    <div className="keys-layout"><div><div className="list-heading"><h2>등록한 패스키</h2><span>이름 · 사용자 메모 · 등록일</span></div>
      {!keys ? <Loading label="등록한 패스키를 확인하고 있어요" /> : <ul className="passkey-list">
        {keys.map(key => <li key={key.id}><div className="key-icon"><Fingerprint size={23} strokeWidth={1.5} aria-hidden="true" /></div><div className="key-info"><div><h3>{key.name}</h3>{key.current && <span className="current-key">현재 로그인</span>}</div><p>{key.provider === '기타 / 확인하지 못함' ? '저장소 메모 없음 / 확인하지 못함' : `저장소 메모: ${key.provider} (사용자 기록)`}</p><p>등록일 {new Date(key.createdAt).toLocaleDateString('ko-KR')}</p></div>
          <button className="icon-button delete-key" aria-label={`${key.name} 삭제`} disabled={keys.length <= 1 || deleting} aria-describedby={keys.length <= 1 ? 'last-key-help' : undefined} onClick={() => { setError(''); setSelected(key); }}><Trash2 size={18} aria-hidden="true" /></button></li>)}
      </ul>}
      <p className="field-help">저장소 메모는 사용자가 기록한 정보예요. 실제 저장처는 기기나 비밀번호 관리자의 패스키 목록에서 이 사이트 주소로 확인해 주세요.</p>
      <p className="field-help" id="last-key-help">마지막 패스키는 삭제할 수 없어요. 새 패스키를 먼저 등록해 주세요.</p>
      <div className="quiet-info"><span>모든 패스키를 사용할 수 없다면</span><p>기기·패스키 제공자·예비 보안 키를 확인해 주세요. 패스키가 하나도 없으면 로그인할 수 없으며, 별도의 자동 계정 복구는 제공하지 않아요.</p></div>
    </div><aside className="add-key-card"><div className="auth-icon"><ShieldCheck size={24} aria-hidden="true" /></div><h2>두 번째 패스키 등록 방법</h2>
      <ol className="backup-steps">
        <li>현재 패스키를 유지한 채 ‘패스키 추가’를 누르고 새 이름을 입력해요.</li>
        <li>‘예비 패스키 등록’을 누른 뒤, 브라우저·기기 창의 ‘다른 옵션’ 또는 ‘다른 방법’에서 기존과 다른 저장소나 패스키 지원 보안 키를 선택해요. 항목 이름은 환경마다 달라요.</li>
        <li>목록에 2개가 보이면 등록 완료예요. 로그아웃 후 새 패스키를 선택해 로그인도 확인해 주세요.</li>
      </ol>
      <details className="backup-help"><summary>QR 코드나 중복 등록 안내가 나오나요?</summary>
        <p>QR 코드는 다른 기기를 연결하는 경로예요. 이 사이트의 저장소 메모로 경로가 바뀌지는 않아요.</p>
        <p>다른 기기여도 같은 Google·iCloud 계정으로 동기화된 기존 패스키가 있으면 중복으로 인식될 수 있어요. 별도 저장소나 보안 키를 선택해 주세요.</p>
        <p>원하는 저장소가 인증 창에 없다면 그 저장소를 지원하는 브라우저나 기기에서 기존 패스키로 로그인한 뒤 추가해 주세요. 새로 등록한 키의 실제 저장처는 해당 기기나 비밀번호 관리자에서 확인할 수 있어요.</p>
      </details>
      {showForm ? <RegistrationForm onSuccess={async () => { await load(); setShowForm(false); setNotice('새 패스키를 등록했어요. 목록에서 이름과 등록일을 확인해 주세요.'); }} /> : <button className="button primary full-width" onClick={() => setShowForm(true)}><Plus size={17} aria-hidden="true" /> 패스키 추가</button>}
    </aside></div>
    <ConfirmDialog open={!!selected} title="이 패스키를 삭제할까요?" busy={deleting} onCancel={() => setSelected(null)} onConfirm={() => void remove()}>
      <p><strong>{selected?.name}</strong> 패스키를 서비스에서 삭제해요. 삭제하면 <strong>{Math.max(0, (keys?.length ?? 0) - 1)}개</strong>가 남아요.</p>
      <p>기기나 패스키 제공자의 저장 항목은 남아 있을 수 있어요. 필요하면 해당 앱에서도 직접 정리해 주세요.</p>
      {selected?.current && <p className="dialog-warning">현재 로그인에 사용한 패스키예요. 삭제하면 이 세션도 종료되며 남은 패스키로 다시 로그인해야 해요.</p>}
    </ConfirmDialog>
  </section>;
}
