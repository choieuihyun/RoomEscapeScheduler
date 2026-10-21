import { moveCost, parseSessions } from './core';
import { restore } from './serialize';

/* 저장한 일정의 "대기"(2026-10-21 검토) — 결과 카드·복사 글과 같은 정의: 비는 시간(total) − 이동.
   - 새로 저장한 일정은 이동 합(moveTotal)을 같이 저장한다(useSaveModal).
   - 그 칸이 없는 옛 저장값은 snapshot(계산할 때의 입력)에서 각 단계의 매장을 찾아 이동을 다시 센다 —
     이름·소요 시간·시작 회차가 맞는 테마가 단계마다 있고, 맞는 테마들의 매장이 하나로 정해질 때만.
   - 그래도 모르면 null → 화면은 "비는 시간 n분"(이동이 섞였을 수 있는 값을 대기라고 부르지 않는다). */
export interface PlanLike {
  total: number;
  moveTotal?: number;
  steps?: { name: string; dur: number; start: number; end: number }[];
  snapshot?: string;
}

const memo = new WeakMap<object, number | null>();

/* snapshot 에서 다시 센 이동 합 — 못 정하면 null */
function moveFromSnapshot(p: PlanLike): number | null {
  const steps = p.steps ?? [];
  if (!p.snapshot || !steps.length) return null;
  let st;
  try { st = restore(p.snapshot); } catch { return null; }
  const moveMin = parseInt(st.options.oMove) || 0;
  /* 계산이 이름 없는 테마를 "테마 n"(계산에 들어간 순번)으로 부르므로 이름 없는 테마는 아무 "테마 n" 과도 맞는다고 본다 */
  const places: string[] = [];
  for (const s of steps) {
    const hit = st.themes.filter(t => (t.name ? t.name === s.name : /^테마 \d+$/.test(s.name))
      && t.dur === s.dur && parseSessions(t.raw).some(x => x.t === s.start));
    const ps = [...new Set(hit.map(t => (t.place || '').trim()))];
    if (ps.length !== 1) return null;
    places.push(ps[0]);
  }
  let sum = 0;
  for (let i = 1; i < steps.length; i++) {
    const mv = moveCost(places[i - 1], places[i], moveMin, st.moveMap);
    /* 계산은 이동을 비는 시간 안에 넣는다 — 이동이 비는 시간보다 길면 snapshot 이 이 일정과 안 맞는 것 */
    if (mv > steps[i].start - steps[i - 1].end) return null;
    sum += mv;
  }
  return sum;
}

/* 이동 합 — 저장한 값, 없으면 snapshot 에서. 모르면 null */
export function planMove(p: PlanLike): number | null {
  if (typeof p.moveTotal === 'number') return p.moveTotal;
  if (memo.has(p)) return memo.get(p)!;
  const v = moveFromSnapshot(p);
  memo.set(p, v);
  return v;
}

/* "대기 45분" — 이동을 모르면 "비는 시간 60분" */
export function planWaitText(p: PlanLike): string {
  const mv = planMove(p);
  return mv == null ? `비는 시간 ${p.total}분` : `대기 ${p.total - mv}분`;
}
