import { useCallback, useState } from 'react';
import { toISO } from './core';

/* 캘린더 화면의 UI 상태만 — 데이터(plans/watches)는 이미 usePlans/useWatches가
   들고 있어 새로 불러올 게 없다. §4.49 에서 모달(useCalendarModal)을 화면으로
   바꾸며 열고 닫는 상태는 useView 로 넘겼다.

   §4.50 — 월/주/일 보기, 종류별 보이기(필터), 왼쪽 미니 달력의 달 이동을 더했다.
   기준은 늘 `selected`(고른 날) 하나다. 주·일 보기는 그날이 든 주·그날을 보여주고,
   이전/다음은 보기 단위(달·주·일)만큼 움직인다. */
export type CalMode = 'month' | 'week' | 'day';
/* club = 동호회 일정(계획 Task E6) — 승인 멤버이고 일정 API 가 있을 때만 필터 줄이 보인다. */
export type CalKind = 'wish' | 'done' | 'watch' | 'club';
export type CalFilter = Record<CalKind, boolean>;

const FILTER_KEY = 'flod.cal.filter';
const MODE_KEY = 'flod.cal.mode';
const BRANCH_KEY = 'flod.cal.branches';

/* 보기 방식·필터는 이 기기에서만 기억하는 편의 설정이다. 저장소가 막힌 환경(시크릿
   창 등)에서도 기본값으로 그대로 동작한다. */
function load<T>(key: string, fallback: T, ok: (v: unknown) => v is T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return ok(v) ? v : fallback;
  } catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ }
}
const isMode = (v: unknown): v is CalMode => v === 'month' || v === 'week' || v === 'day';
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
/* 저장된 필터를 읽는다. 동호회 일정 전에 저장한 값엔 club 키가 없다 — 그때는 켠 채로 채운다. */
export function toFilter(v: unknown): CalFilter {
  const ok = !!v && typeof v === 'object'
    && ['wish', 'done', 'watch'].every(k => typeof (v as Record<string, unknown>)[k] === 'boolean');
  if (!ok) return { wish: true, done: true, watch: true, club: true };
  const f = v as Record<string, unknown>;
  return { wish: f.wish as boolean, done: f.done as boolean, watch: f.watch as boolean,
    club: typeof f.club === 'boolean' ? f.club : true };
}
function loadFilter(): CalFilter {
  try { return toFilter(JSON.parse(localStorage.getItem(FILTER_KEY) || 'null')); } catch { return toFilter(null); }
}

const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const ym = (d: Date) => ({ y: d.getFullYear(), m: d.getMonth() });
const addMonth = (c: { y: number; m: number }, n: number) => {
  const d = new Date(c.y, c.m + n, 1);
  return ym(d);
};

export function useCalendar() {
  const [cursor, setCursor] = useState(() => ym(new Date()));
  const [mini, setMini] = useState(() => ym(new Date()));
  const [selected, setSelected] = useState<string>(() => toISO(new Date()));
  const [mode, setModeRaw] = useState<CalMode>(() => load(MODE_KEY, 'month', isMode));
  const [filter, setFilterRaw] = useState<CalFilter>(() => loadFilter());
  /* "그날 열려 있는 회차" 에서 볼 지점(§4.51) — 날짜를 바꿔도, 다시 열어도 그대로. */
  const [branches, setBranches] = useState<string[]>(() => load(BRANCH_KEY, [], isIds));
  /* 오른쪽 패널에 연 동호회 일정 id — null 이면 고른 날의 상세를 보인다 */
  const [openEvent, setOpenEvent] = useState<number | null>(null);

  /* 날짜 하나를 고르면 큰 달력과 미니 달력이 둘 다 그 달로 따라간다. */
  const select = useCallback((iso: string) => {
    setSelected(iso);
    const d = parseISO(iso);
    setCursor(ym(d));
    setMini(ym(d));
  }, []);

  const step = useCallback((dir: 1 | -1) => {
    if (mode === 'month') {
      const n = addMonth(cursor, dir);
      setCursor(n);
      setMini(n);
      return;
    }
    const d = parseISO(selected);
    d.setDate(d.getDate() + (mode === 'week' ? 7 : 1) * dir);
    select(toISO(d));
  }, [mode, cursor, selected, select]);

  const prev = useCallback(() => step(-1), [step]);
  const next = useCallback(() => step(1), [step]);
  const goToday = useCallback(() => select(toISO(new Date())), [select]);

  const setMode = useCallback((m: CalMode) => { setModeRaw(m); save(MODE_KEY, m); }, []);
  const toggleKind = useCallback((k: CalKind) => {
    setFilterRaw(f => { const n = { ...f, [k]: !f[k] }; save(FILTER_KEY, n); return n; });
  }, []);
  const toggleBranch = useCallback((id: string) => {
    setBranches(bs => {
      const n = bs.includes(id) ? bs.filter(x => x !== id) : [...bs, id];
      save(BRANCH_KEY, n);
      return n;
    });
  }, []);
  const clearBranches = useCallback(() => { setBranches([]); save(BRANCH_KEY, []); }, []);
  const miniPrev = useCallback(() => setMini(c => addMonth(c, -1)), []);
  const miniNext = useCallback(() => setMini(c => addMonth(c, 1)), []);

  return {
    cursor, selected, mode, filter, mini, branches, openEvent, setOpenEvent,
    prev, next, goToday, select, setMode, toggleKind, miniPrev, miniNext, toggleBranch, clearBranches,
  };
}

export type UseCalendarReturn = ReturnType<typeof useCalendar>;
