/* 일정 → 시간표 계산 → 그 일정에 넣기 흐름의 작은 순수 함수들(진입 청크에 들어간다 — 짧게).
   넣기 본문은 eventInsert.ts(누를 때 받는다). */
import { sessionsToText, type PathStep, type SearchTheme } from './core';
import { blankTheme, type Theme } from './scheduler/types';
import type { AddedTheme } from './scheduler/types';

/* 계산 화면이 기억하는 "어느 일정에서 왔나". 상태로만 들고 새로 고치면 사라진다.
   date: 도우미가 보던 날짜(정해진 일정이면 그 날짜) — 손으로 넣은 카드뿐이라 결과 날짜를 모를 때 쓴다 */
export interface EventCtx {
  id: number; title: string; date: string | null;
  /* 문맥을 세울 때 보이던 결과(계산 결과 배열 그대로) — 지금 결과가 이것과 같으면 아직 다시 계산하지 않은 옛 결과라
     "이 일정에 넣기"를 붙이지 않는다(옛 결과의 고르지 않은 테마가 일정에 들어가지 않게) */
  seen?: unknown;
}

/* 결과 카드의 넣기 상태 — none: 문맥 없음(일정 등록), stale: 문맥을 세운 뒤 아직 계산 안 함(일정 등록만, 띠가 안내),
   blocked: 못 고치는 일정(목록 위 안내 한 번 + 새 일정으로 등록), insert: 이 일정에 넣기 */
export type InsertMode = 'none' | 'stale' | 'blocked' | 'insert';
export function insertMode(ctx: EventCtx | null, found: unknown, canManage: boolean | undefined): InsertMode {
  if (!ctx) return 'none';
  if (found === ctx.seen) return 'stale';
  return canManage === false ? 'blocked' : 'insert';
}

/* 문맥을 들고 있을까 — 로그아웃·일정 API 꺼짐, 그 일정을 지웠으면(gone) 놓는다. 범위를 옮겨 목록에서 빠진 것만으로는 놓지 않는다 */
export const ctxAlive = (ctx: EventCtx | null, on: boolean, gone: readonly number[]): boolean => !!ctx && on && !gone.includes(ctx.id);

/* 다른 일정 문맥에서 넣은 카드 — 손으로 넣은 카드·문맥 없이 넣은 카드(ctx 없음)는 남긴다 */
const otherCtx = (t: Theme, id: number) => t.ctx !== undefined && t.ctx !== id;
export const dropOtherCtx = (ts: Theme[], id: number): Theme[] => ts.filter((t) => !otherCtx(t, id));
export const countOtherCtx = (ts: Theme[], id: number): number => ts.filter((t) => otherCtx(t, id)).length;

/* 같은 테마 판정 — 회차 날짜 + 서버 테마 키(지점이 들어 있다). 키 없는(손으로 넣은·사진) 카드는 null */
const ident = (t: { themeKey?: string; date?: string }): string | null => (t.themeKey ? `${t.date ?? ''}|${t.themeKey}` : null);

/* 서버 테마 카드 넣기(ctx: 일정 문맥에서 넣을 때 그 일정 id — 카드에 단다) — 같은 키 카드가 있으면 그 자리에서 값만 바꾸고(id·이어 붙이기 설정은 그대로, 팀 확정이 id 를 가리킨다),
   없으면 뒤에 더한다. 손으로 넣은 카드는 건드리지 않는다. 한 번에 같은 키가 둘 와도 하나만 남는다. */
export function mergeServerThemes(ts: Theme[], items: AddedTheme[], newId: () => number, ctx?: number): Theme[] {
  const out = [...ts];
  for (const it of items) {
    const card = {
      name: it.name, place: it.place, dur: it.dur || 70, sessions: it.sessions, raw: sessionsToText(it.sessions),
      source: 'server', fresh: it.fresh, date: it.date, themeKey: it.themeKey, posterUrl: it.posterUrl, err: '', busy: '',
      /* 같은 키 카드를 바꿀 때 문맥도 새 값으로 — 문맥 없이 다시 넣으면 앞 문맥 표시를 지운다(undefined 로 덮는다) */
      ctx,
    };
    const k = ident(it);
    const i = k ? out.findIndex((t) => ident(t) === k) : -1;
    if (i < 0) out.push({ ...blankTheme(newId(), it.name), ...card });
    else out[i] = { ...out[i], ...card };
  }
  return out;
}

/* 넣을 항목 중 이미 카드가 있는(바뀔) 것의 수 — 토스트 "(n개는 이미 있어서 바꿨어요)" */
export const countSame = (ts: Theme[], items: AddedTheme[]): number =>
  items.filter((it) => { const k = ident(it); return k !== null && ts.some((t) => ident(t) === k); }).length;

/* 결과 단계마다 그 카드 — 일정 구간의 테마 키와 결과 날짜(첫 단계 카드의 회차 날짜)를 읽는다 */
export function stepCards(steps: PathStep[], ready: SearchTheme[], themes: Theme[]): { date?: string; keys: (string | null)[] } {
  const cards = steps.map((st) => themes.find((t) => t.id === ready[st.i]?.id));
  return { date: cards[0]?.date, keys: cards.map((c) => c?.themeKey ?? null) };
}
