/* 1·2·3등 메달(2026-10-22 사용자 요청) — 랭킹과 멤버 목록(방 많은 순)이 같이 쓴다.
   이모지 대신 금·은·동 동그라미에 숫자(.medal, floduler.css). 4등부터는 null — 쓰는 쪽이 숫자를 그대로 둔다 */
const NAME = ['', '금메달', '은메달', '동메달'];

export function Medal({ rank, className = '' }: { rank: number; className?: string }) {
  if (rank < 1 || rank > 3) return null;
  return (
    <span className={`medal m${rank}${className ? ' ' + className : ''}`} role="img" aria-label={`${rank}등 ${NAME[rank]}`}>
      {rank}
    </span>
  );
}
