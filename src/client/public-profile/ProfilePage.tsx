import { ArrowUpRight, Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import content from './content.html?raw';
import { useSession } from '../shared/session.js';

export function ProfilePage() {
  const { session } = useSession();
  return <>
    <div className="public-label"><span className="status-dot" aria-hidden="true" /> 공개 소개 <span>누구나 편하게 둘러볼 수 있어요</span></div>
    <div className="original-profile" dangerouslySetInnerHTML={{ __html: content }} />
    <section className="private-entry" aria-labelledby="entry-title">
      <div className="entry-art" aria-hidden="true"><div className="art-ring"><Fingerprint strokeWidth={1} size={62} /></div><span className="art-dot" /></div>
      <div className="entry-copy"><p className="eyebrow">A LITTLE SPACE, JUST FOR ME</p><h2 id="entry-title">공개하지 않은 생각은,<br />나만의 공간에.</h2><p>다음 프로젝트의 구상부터 아직 다듬는 기록까지.<br />패스키로 안전하게 보관하는 작은 작업실입니다.</p>
        <Link to="/vault" className="button primary">{session.user ? '나의 기록 열기' : '나만의 공간 둘러보기'} <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
      <div className="entry-notes"><span><LockKeyhole size={16} aria-hidden="true" /> 나만 볼 수 있는 기록</span><span><Fingerprint size={16} aria-hidden="true" /> 비밀번호 없는 로그인</span><span><ShieldCheck size={16} aria-hidden="true" /> 기기에서 확인하는 나</span></div>
    </section>
  </>;
}
