/* 시간표 결과 막대의 폭과 첫 테마 자리 — 순수 함수(진입 청크라 짧게). 그리기는 ResultCard 가 한다.
   막대는 시간 비율 그대로 넓히고(이름 길이로 칸 하나만 늘리면 시간축이 거짓말이 된다) 카드 안에서 옆으로 넘긴다. */

/* 이름 한 줄 폭이 이보다 길면 두 줄로 접는다(40자 이름이 막대를 수천 px 로 늘리지 않게) */
const TWO = 180;

/* 테마 칸 하나가 가져야 할 폭(px) — 이름(두 줄이면 반에 줄바꿈 여유를 더해)과 시각 중 넓은 쪽 + 안쪽 여백·테두리(pad) */
export function blockNeed(nameW: number, rngW: number, pad: number): { need: number; two: boolean } {
  const two = nameW > TWO;
  return { need: Math.ceil(Math.max(two ? nameW / 2 + 20 : nameW, rngW) + pad), two };
}

/* 막대 폭(px) — 분당 픽셀을 모든 테마 칸이 제 폭을 갖는 만큼 키운다(가장 빡빡한 칸: 폭 ÷ 분이 가장 큰 칸이 정한다).
   이동·공백 칸도 같은 비율이라 비율은 그대로, 카드 폭보다 좁아지지는 않는다 */
export function barWidth(blocks: { dur: number; need: number }[], span: number, cardW: number): number {
  const ppm = Math.max(cardW / span, ...blocks.map((b) => b.need / Math.max(b.dur, 1)));
  return Math.max(cardW, Math.ceil(ppm * span));
}

/* 처음 보일 때 스크롤 자리 — 앞쪽 빈 시간대를 넘겨 첫 테마 시작이 왼쪽(8px 여유)에 오게, 끝을 넘지 않게 */
export function firstScroll(start: number, lo: number, span: number, width: number, cardW: number): number {
  return Math.round(Math.max(0, Math.min(((start - lo) / span) * width - 8, width - cardW)));
}
