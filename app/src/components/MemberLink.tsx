import type { ReactNode } from 'react';
import { nameState, openMember, useClubStore } from '../clubStore';

/* 케이크 선 아이콘(오늘 생일) — 앱의 선 아이콘 관용(24 상자, 1.8 선, 18px). 색은 자리 CSS(.bday-ic)가 차분하게.
   뜻은 옆의 화면 읽기용 글("오늘 생일")이 전한다 */
export const Cake = ({ className = 'bday-ic' }: { className?: string }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 21h17M5 21v-7.5A1.5 1.5 0 0 1 6.5 12h11a1.5 1.5 0 0 1 1.5 1.5V21" />
    <path d="M5 16.2c1.4 0 2-1 3.5-1s2.1 1 3.5 1 2-1 3.5-1 2.1 1 3.5 1M12 12V9" />
    <path d="M12 6.8c.8 0 1.3-.6 1.3-1.3 0-.9-1.3-2.5-1.3-2.5s-1.3 1.6-1.3 2.5c0 .7.5 1.3 1.3 1.3z" />
  </svg>
);

/* 이름 단추 — 누르면 그 사람의 멤버 카드(내 이름이면 내 프로필 화면). 보이는 모양은 글자 그대로, 마우스를 올리면 밑줄.
   6단계 서버가 아니거나 승인 멤버가 아니면(목록에 없음) 그냥 글자. children 이 있으면 이름 자리에 그것을 그린다("(나)" 붙이기 등) */
export function MemberLink({ uid, name, className, children }: { uid: string; name: string; className?: string; children?: ReactNode }) {
  const s = useClubStore();
  const k = nameState(s, uid);
  const body = children ?? name;
  if (k === 'text') return className ? <span className={className}>{body}</span> : <>{body}</>;
  return (
    <button
      type="button" className={'mlink' + (className ? ' ' + className : '')}
      aria-label={k === 'me' ? '내 프로필 보기' : `${name} 프로필 보기`}
      onClick={(e) => { e.stopPropagation(); openMember({ uid, name, from: e.currentTarget }); }}
    >{body}</button>
  );
}
