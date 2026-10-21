import { useState } from 'react';
import { firstChar } from '../calcView';

/* 테마 사진(포스터) 작은 칸(2026-10-22) — 테마 고르기 창 줄·시간표 테마 카드 머리 줄.
   크기는 CSS(.pst 와 쓰는 곳의 덧붙인 이름)가 정한다: 그림이 늦게 와도 자리가 회색으로 먼저 있어 줄이 흔들리지 않는다.
   그림이 없거나 못 받으면(깨진 주소) 같은 자리에 이름 첫 글자. 이름이 바로 옆에 있으니 그림은 alt="" 로 읽지 않는다 */
export function Poster({ url, name, className }: { url?: string; name: string; className?: string }) {
  /* 못 받은 주소 — 주소가 바뀌면(같은 카드에 다른 테마를 다시 넣으면) 다시 받아 본다 */
  const [bad, setBad] = useState<string | null>(null);
  const ok = !!url && bad !== url;
  return (
    <span className={'pst' + (className ? ' ' + className : '')} aria-hidden="true">
      {ok
        ? <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBad(url)} />
        : <span className="pst-ph">{firstChar(name)}</span>}
    </span>
  );
}
