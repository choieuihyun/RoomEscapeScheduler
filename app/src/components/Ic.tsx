/* 시간표 계산 화면의 선 아이콘(2026-10-21 개편) — 모양은 CSS 마스크(floduler.css 시간표 구역의 .ic-이름)라
   진입 JS 가 늘지 않는다. 색은 글자색(currentColor)을 따른다. 뜻은 옆 글자나 단추의 aria-label 이 말한다 */
export const Ic = ({ n }: { n: string }) => <span className={'ic ic-' + n} aria-hidden="true" />;
