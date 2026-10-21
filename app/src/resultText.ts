import { fmt, type PathStep, type SearchResultRow } from './core';

/* 결과 카드의 글(2026-10-21 개편, 결과 청크) — 화면과 복사 글이 같은 말을 쓴다. 비는 시간은 "대기"(공백이라 하지 않는다) */

/* 분 → "4시간 30분" · "4시간" · "50분" */
export const hm = (m: number): string => (m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ` ${m % 60}분` : '') : m + '분');

/* 두 테마 사이 — 이동이 있으면 "이동 15분 · 대기 10분", 없으면 "대기 30분", 딱 붙으면 "바로 이어서" */
export function gapText(prev: PathStep, next: PathStep): string {
  const g = next.start - prev.end, mv = next.move || 0;
  return mv ? `이동 ${mv}분 · 대기 ${g - mv}분` : g > 0 ? `대기 ${g}분` : '바로 이어서';
}

/* 대기 합 — 이동이 있으면 이동을 뺀 것 */
export const waitOf = (r: SearchResultRow): number => r.total - (r.moveTotal || 0);

/* 복사 글(단톡방에 붙여 넣는 글) */
export function resultToText(r: SearchResultRow): string {
  const head = `${r.count}연방 · ${fmt(r.start)} → ${fmt(r.end)} (${hm(r.end - r.start)}, `
    + (r.moveTotal ? `이동 ${r.moveTotal}분 · 대기 ${waitOf(r)}분)` : `대기 ${r.total}분)`);
  const body = r.steps.map((s, i) => {
    const line = `${fmt(s.start)}–${fmt(s.end)}  ${s.name}${s.place ? ` @${s.place}` : ''} (${s.dur}분)`;
    const nx = r.steps[i + 1];
    if (!nx) return line;
    const g = nx.start - s.end, mv = nx.move || 0;
    return line + (mv ? `\n     ↓ 이동 ${mv}분  대기 ${g - mv}분` : `\n     ↓ 대기 ${g}분`);
  }).join('\n');
  return head + '\n\n' + body;
}
