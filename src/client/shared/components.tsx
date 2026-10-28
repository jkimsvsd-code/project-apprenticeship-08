import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CircleAlert, Fingerprint, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';

export function Status({ message, kind = 'info' }: { message: string; kind?: 'info' | 'error' | 'success' }) {
  return <div className={`status-message ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    {message && <>{kind === 'success' ? <Check size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}<span>{message}</span></>}
  </div>;
}
export function Loading({ label = '확인하고 있어요' }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={21} aria-hidden="true" /><span>{label}</span></div>;
}
export function EnvironmentNotice() {
  const [support, setSupport] = useState<'checking' | 'supported' | 'insecure' | 'unsupported'>('checking');
  useEffect(() => {
    setSupport(!window.isSecureContext ? 'insecure' : typeof window.PublicKeyCredential !== 'function' || !navigator.credentials ? 'unsupported' : 'supported');
  }, []);
  const supported = support === 'supported';
  return <div className={`environment-notice ${supported ? '' : 'environment-warning'}`} role="status">
    <ShieldCheck size={17} aria-hidden="true" />
    <span>{support === 'checking' ? '패스키 사용 환경을 확인하고 있어요.' : supported
      ? '패스키를 지원하는 환경이에요. 사용 가능한 기기나 보안 키가 필요해요.'
      : support === 'insecure' ? '패스키는 HTTPS 또는 localhost에서 사용할 수 있어요. 안전한 주소로 다시 열어 주세요.'
      : '이 브라우저는 패스키를 지원하지 않아요. 최신 Chrome·Safari·Edge 또는 다른 기기를 사용해 주세요.'}</span>
  </div>;
}
export function LockedSpace({ next = '/vault', title = '나만의 공간', description = '아직 다듬는 생각과 다음 시도의 기록. 패스키로 문을 열면 나에게만 보여요.' }: { next?: string; title?: string; description?: string }) {
  return <section className="locked-page">
    <div className="page-heading"><p className="eyebrow">PRIVATE SPACE</p><h1>{title}</h1><p>{description}</p></div>
    <div className="locked-panel">
      <div className="lock-orbit" aria-hidden="true"><LockKeyhole size={35} strokeWidth={1.4} /></div>
      <span className="pill"><LockKeyhole size={12} aria-hidden="true" /> 나만 볼 수 있어요</span>
      <h2>열쇠는, 나에게만.</h2>
      <p>비밀번호 대신 지문·얼굴·기기 잠금 해제로 확인해요.<br />등록한 패스키가 있어야 이 공간을 열 수 있어요.</p>
      <Link className="button primary" to={`/login?next=${encodeURIComponent(next)}`}><Fingerprint size={18} aria-hidden="true" /> 패스키로 로그인 <ArrowRight size={16} aria-hidden="true" /></Link>
      <div className="privacy-line"><ShieldCheck size={15} aria-hidden="true" /> 지문이나 얼굴 정보는 이 서비스에 전달되지 않아요.</div>
    </div>
    <div className="quiet-info"><span>모든 패스키를 사용할 수 없나요?</span><p>등록한 기기·패스키 제공자·예비 보안 키를 확인해 주세요. 이 서비스는 비밀번호나 자동 계정 복구를 제공하지 않아요.</p></div>
  </section>;
}

export function ConfirmDialog({ open, title, children, busy, onCancel, onConfirm }: {
  open: boolean; title: string; children: ReactNode; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (open && node && !node.open) { node.showModal(); cancel.current?.focus(); }
    if (!open && node?.open) node.close();
  }, [open]);
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby="delete-title"
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="dialog-icon"><LockKeyhole size={24} aria-hidden="true" /></div>
    <h2 id="delete-title">{title}</h2>{children}
    <div className="dialog-actions"><button ref={cancel} className="button secondary" disabled={busy} onClick={onCancel}>취소</button>
      <button className="button danger" disabled={busy} onClick={onConfirm}>{busy ? '삭제 중…' : '패스키 삭제'}</button></div>
  </dialog>;
}
