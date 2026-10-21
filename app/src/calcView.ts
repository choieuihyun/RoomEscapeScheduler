import { mdWeekday } from './core';
import type { OptionsState } from './serialize';

/* 시간표 계산 화면(2026-10-21 개편)의 표시 규칙 — 화면 코드 밖에 두고 시험한다(calcView.test.ts).
   진입 청크에 들어가는 것만 둔다. 결과 쪽 글은 resultText.ts(결과 청크) */

/* 회차 칩 접기 — 두 줄까지 보이고, 넘치면 마지막 칸을 "+n개" 칩으로 바꾼다(그 칸에 들어갈 회차도 n 에 센다) */
export function foldChips(total: number, cols: number, rows = 2): { shown: number; more: number } {
  const cap = Math.max(1, cols) * rows;
  if (total <= cap) return { shown: total, more: 0 };
  return { shown: cap - 1, more: total - cap + 1 };
}

/* 맨 위 "가능한 시간" 한 줄(2026-10-21 사용자 결정 — 시간 범위만 1단계 앞으로) */
export function timeText(o: Pick<OptionsState, 'oStart' | 'oEnd'>): string {
  const s = o.oStart.trim(), e = o.oEnd.trim();
  return s && e ? `${s} ~ ${e}` : s ? `${s}부터` : e ? `${e}까지` : '시간 제한 없음';
}

/* 접힌 조건 두 줄 — "대기 10–120분 · 이동 15분" / "옵션 1개 켬"(시간 범위는 맨 위 줄이 맡는다).
   빈 칸은 계산(useScheduler.runSearch)이 읽는 대로 읽는다: 최소 대기는 숫자가 아니면 0, 최대 대기는 비우면 제한 없음 */
export function condSummary(o: OptionsState, teams = 0): [string, string] {
  const mv = parseInt(o.oMove) || 0;
  const lo = parseInt(o.oMinGap) || 0;
  const hi = o.oMaxGap.trim() === '' ? null : (parseInt(o.oMaxGap) || null);
  const wait = hi != null ? (lo ? `대기 ${lo}–${hi}분` : `대기 ${hi}분까지`) : lo ? `대기 ${lo}분 이상` : '대기 제한 없음';
  const on = [o.oFixedOrder, o.oPartial, o.oMeal, o.oTeam, o.oIncludeSoldout].filter(Boolean).length;
  return [
    `${wait} · ${mv ? `이동 ${mv}분` : '이동 없음'}`,
    [on ? `옵션 ${on}개 켬` : '추가 옵션 없음', o.oTeam && teams ? `팀 ${teams}개 확정` : ''].filter(Boolean).join(' · '),
  ];
}

/* 1단계 머리 오른쪽 작은 글 — 순서 전제(§4.46), 불러온 회차 날짜, 언제 기준인지. 날짜·기준이 카드마다 다르면 뺀다 */
export function themesInfo(ts: readonly { date?: string; fresh?: string }[], fixedOrder: boolean): string {
  const one = (xs: (string | undefined)[]) => { const u = [...new Set(xs.filter(Boolean))]; return u.length === 1 ? u[0] : ''; };
  const date = one(ts.map((t) => t.date)), fresh = one(ts.map((t) => t.fresh));
  const parts = [fixedOrder ? '넣은 순서대로' : '', date ? `${mdWeekday(date)} 회차` : '', fresh ?? ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : '순서는 알아서 찾아요';
}

/* 테마 카드 머리 줄 작은 글 — "예약 가능 5 · 매진 2"(매진이 없으면 앞만, 회차가 없으면 빈 글) */
export function sessionCounts(ss: readonly { soldout: boolean }[]): string {
  if (!ss.length) return '';
  const so = ss.filter((s) => s.soldout).length;
  return `예약 가능 ${ss.length - so}` + (so ? ` · 매진 ${so}` : '');
}

/* 자정 전에 시작해 다음날 끝나는 회차(예 23:30 시작 70분) — 끝 시각 쪽 "+1". 자정 이후 시작(t ≥ 1440)은 시작 쪽 +1 이 따로 있다 */
export const endsNextDay = (t: number, dur: number): boolean => t < 24 * 60 && t + dur > 24 * 60;

/* 테마 사진이 없을 때 자리에 쓰는 이름 첫 글자 — 앞뒤 빈칸은 건너뛰고, 이모지 같은 두 칸 글자도 한 글자로. 이름이 없으면 빈 글 */
export const firstChar = (name: string): string => Array.from(name.trim())[0] ?? '';
