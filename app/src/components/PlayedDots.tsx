import type { WhoDot } from '../playedWho';

/* 참여자 이름 앞 작은 원 — 안 해 본 사람 초록 속 빈 원, 해 본 사람 빨강 채운 원(색은 사용자 지정, 2026-10-20).
   색만으로 가르지 않게 모양을 달리하고 읽어 주는 글과 title 도 단다. label 안에도 들어가서 span 으로만 짠다 */
export function PlayedDots({ dots }: { dots: WhoDot[] }) {
  if (dots.length === 0) return null;
  return (
    <span className="pdots">
      {dots.map((d) => (
        <span key={d.uid} className={'pdot' + (d.played ? ' on' : '')} title={`${d.name} · ${d.played ? '해 봄' : '안 해 봄'}`}>
          <i aria-hidden="true" />{d.name}<span className="sr-only"> ({d.played ? '해 봄' : '안 해 봄'})</span>
        </span>
      ))}
    </span>
  );
}
