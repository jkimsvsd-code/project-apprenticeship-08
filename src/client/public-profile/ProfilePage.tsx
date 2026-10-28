import { Link } from 'react-router-dom';
import content from './content.html?raw';
import { useSession } from '../shared/session.js';

export function ProfilePage() {
  const { session } = useSession();
  return <>
    <div className="public-label"><span className="status-dot" aria-hidden="true" /> 공개 소개 <span>누구나 편하게 둘러볼 수 있어요</span></div>
    <div className="original-profile" dangerouslySetInnerHTML={{ __html: content }} />
    <div className="admin-review-entry"><Link to={session.user ? '/vault' : '/login?next=%2Fvault'} className="button secondary">내용 검토 - 관리자 전용</Link></div>
  </>;
}
