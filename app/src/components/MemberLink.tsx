import type { ReactNode } from 'react';
import { nameState, openMember, useClubStore } from '../clubStore';

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
