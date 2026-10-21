import type { ReactNode } from 'react';

/* 일정 상세의 접힌 줄(2026-10-21 개편) — "이름 · 요약 ›". 펼치면 지금 화면 그대로.
   <details> 라 접혀 있어도 안의 것은 그대로 살아 있다(정산은 열 때 받고, 협의 칸의 적던 시간도 남는다).
   open 은 부르는 쪽이 들고(처음부터 펼칠지 정하려고) 사람이 누르면 onOpen 으로 알린다. */
export function Fold({ name, sum, open, onOpen, className = '', children }: {
  name: ReactNode; sum?: ReactNode; open: boolean; onOpen: (open: boolean) => void; className?: string; children: ReactNode;
}) {
  return (
    <details className={'evp-fold' + (className ? ' ' + className : '')} open={open} onToggle={(e) => { if (e.currentTarget.open !== open) onOpen(e.currentTarget.open); }}>
      <summary>
        <span className="evp-fold-n">{name}</span>
        {sum && <span className="evp-fold-s">{sum}</span>}
        <svg className="evp-fold-c" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </summary>
      <div className="evp-fold-b">{children}</div>
    </details>
  );
}
