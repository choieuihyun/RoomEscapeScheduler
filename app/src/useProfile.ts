import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addPlayed, deletePlayed, deletePlayedNow, errorCode, isMissingApi, listPlayed, listThemes, myPastEvents, sayClub,
  type EventDto, type PastCursor, type PlayedDto, type PlayedInput, type ThemeRef,
} from './server';
import { showToast } from './toast';

/* "내 정보" 화면의 데이터 — 해 본 테마·지난 동호회 일정(작업명세서 §4.9).
   해 본 테마 목록은 켜지자마자 한 번 받는다 — 서버가 이 API 를 모르면(본문 없는 404) 메뉴를 숨겨야 해서다.
   지난 일정은 화면에 처음 들어올 때, 테마 목록(공개 API)은 검색 칸에 처음 들어갈 때 받는다. */

export type ProfileApi = 'unknown' | 'on' | 'missing';

export const PAST_PAGE = 10;
/* 지운 줄이 "지웠어요 · 되돌리기"로 남아 있는 시간. 마우스·포커스가 그 줄에 있는 동안은 멈춘다 */
export const UNDO_MS = 6000;
/* 붙잡아 둔 시간과 상관없이 지운 뒤 이만큼 지나면 확정한다 — 받아 둔 ID 토큰(1시간)이 낡기 전에, 오래 열어 둔 화면에서도 */
export const UNDO_MAX_MS = 120_000;

/* 다음 쪽 커서 — 받은 쪽 마지막 일정의 (date, id) 그대로(서버가 (date, id) < (before, beforeId) 로 거른다).
   처음은 오늘 이전. */
export function nextPastCursor(loaded: EventDto[], today: string): PastCursor {
  const last = loaded[loaded.length - 1];
  return last?.date ? { before: last.date, beforeId: last.id } : { before: today };
}

/* 받은 쪽을 붙인다. 겹치는 id 는 한 번만(그 사이 일정이 바뀌어도 두 줄이 되지 않게). 더 있는지는 서버의 total 로. */
export function mergePast(loaded: EventDto[], fresh: EventDto[], total: number): { list: EventDto[]; hasMore: boolean } {
  const ids = new Set(loaded.map((e) => e.id));
  const list = [...loaded, ...fresh.filter((e) => !ids.has(e.id))];
  return { list, hasMore: fresh.length > 0 && list.length < total };
}

/* 지우려고 미뤄 둔 기록은 센 수에서 뺀다 */
export function withoutPending(list: PlayedDto[], pending: ReadonlySet<number>): PlayedDto[] {
  return pending.size === 0 ? list : list.filter((p) => !pending.has(p.id));
}

/* 한 쪽에 보일 줄. 지운 줄(되돌리기 자리)은 쪽 넘김·수에 넣지 않고 원래 자리에 끼워 둔다 —
   앞뒤 남은 줄 사이에 있으므로, 그 사이 경계가 이 쪽 안(쪽 첫 줄 앞 ~ 마지막 줄 뒤)이면 보인다. */
export function pageRows<T extends { id: number }>(
  rows: T[], pending: ReadonlySet<number>, page: number, per: number,
): { shown: T[]; pages: number; count: number; cur: number } {
  const count = rows.filter((r) => !pending.has(r.id)).length;
  const pages = Math.max(1, Math.ceil(count / per));
  const cur = Math.min(page, pages - 1);
  const start = cur * per, end = Math.min(start + per, count);
  const shown: T[] = [];
  let k = 0; // 지금까지 지난 남은 줄 수
  for (const r of rows) {
    if (pending.has(r.id)) {
      if (k >= start && k <= end) shown.push(r);
    } else {
      if (k >= start && k < end) shown.push(r);
      k++;
    }
  }
  return { shown, pages, count, cur };
}

type Pending = {
  token: string;        // 지울 때 받아 둔 토큰 — 가려지거나 닫힐 때 기다리지 않고 보낸다
  timer: number | undefined;
  cap: number | undefined;  // UNDO_MAX_MS 상한 — 멈춤과 상관없이 간다
  left: number;
  start: number;
  holds: Set<string>;   // 'hover' · 'focus' — 하나라도 있으면 멈춤
  sending: boolean;
  onGone?: () => void;  // 보내고 줄이 사라진 뒤 화면이 포커스를 옮기는 데 쓴다
};

async function token(): Promise<string | null> {
  return (await import('./cloud')).idToken();
}

export function useProfile(enabled: boolean, active: boolean, today: string) {
  const [api, setApi] = useState<ProfileApi>('unknown');
  const [played, setPlayed] = useState<PlayedDto[] | null>(null);
  const [error, setError] = useState('');
  const [past, setPast] = useState<EventDto[] | null>(null);
  const [pastTotal, setPastTotal] = useState<number | null>(null);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [pastBusy, setPastBusy] = useState(false);
  const [pastError, setPastError] = useState('');
  const [themes, setThemes] = useState<ThemeRef[] | null>(null);
  const [themesError, setThemesError] = useState('');
  /* 지우기를 미뤄 둔 id — 그 줄은 "지웠어요 · 되돌리기"로 보인다. 실제 대기 내용은 pendingRef */
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const pendingRef = useRef(new Map<number, Pending>());
  const syncPending = useCallback(() => setPendingIds(new Set(pendingRef.current.keys())), []);

  /* 켜짐 세대 — 꺼질 때(로그아웃·다른 사람) 올린다. 그 전에 떠난 요청이 새 사람 화면을 건드리지 못하게. */
  const epoch = useRef(0);
  const playedSeq = useRef(0);
  const playedRef = useRef<PlayedDto[] | null>(null);
  useEffect(() => { playedRef.current = played; }, [played]);
  const pastRef = useRef<EventDto[] | null>(null);
  useEffect(() => { pastRef.current = past; }, [past]);
  const themesLoading = useRef(false);

  const missing = useCallback(() => {
    setApi('missing');
    setPlayed(null);
    setPast(null);
  }, []);

  /* 받은 목록을 돌려준다(못 받았거나 낡은 응답이면 null) */
  const reloadPlayed = useCallback(async (): Promise<PlayedDto[] | null> => {
    if (!enabled) return null;
    const ep = epoch.current;
    const my = ++playedSeq.current;
    try {
      const t = await token();
      if (!t || ep !== epoch.current || my !== playedSeq.current) return null;
      const list = await listPlayed(t);
      if (ep !== epoch.current || my !== playedSeq.current) return null;
      playedRef.current = list;
      setPlayed(list);
      setApi('on');
      setError('');
      return list;
    } catch (e) {
      if (ep !== epoch.current || my !== playedSeq.current) return null;
      if (isMissingApi(e)) missing();
      else setError(sayClub(e));
      return null;
    }
  }, [enabled, missing]);

  const dropRows = useCallback((ids: ReadonlySet<number>) => {
    if (ids.size > 0) setPlayed((cur) => cur?.filter((p) => !ids.has(p.id)) ?? cur);
  }, []);

  /* 미뤄 둔 지우기를 지금 다 보낸다 — 화면이 가려질 때(앱 전환 뒤 OS 가 탭을 죽일 수 있다)·창을 닫을 때·로그아웃.
     결과를 기다리지 않고(keepalive), 토큰은 지울 때 받아 둔 것. 보낸 기록은 되돌릴 수 없으니 되돌리기 자리도 없앤다. */
  const flushPending = useCallback((): Set<number> => {
    const gone = new Set<number>();
    for (const [id, p] of pendingRef.current) {
      clearTimeout(p.timer);
      clearTimeout(p.cap);
      if (!p.sending) deletePlayedNow(id, p.token);
      gone.add(id);
    }
    pendingRef.current.clear();
    return gone;
  }, []);

  /* 지난 일정 한 쪽. first 면 처음부터 다시 받는다. */
  const loadPast = useCallback(async (first: boolean) => {
    if (!enabled) return;
    const ep = epoch.current;
    const loaded = first ? [] : (pastRef.current ?? []);
    setPastBusy(true);
    try {
      const t = await token();
      if (!t || ep !== epoch.current) return;
      const r = await myPastEvents(nextPastCursor(loaded, today), PAST_PAGE, t);
      if (ep !== epoch.current) return;
      const m = mergePast(loaded, r.events, r.total);
      setPast(m.list);
      setPastTotal(r.total);
      setHasMorePast(m.hasMore);
      setPastError('');
    } catch (e) {
      if (ep !== epoch.current) return;
      if (isMissingApi(e)) missing();
      else setPastError(sayClub(e));
    } finally {
      if (ep === epoch.current) setPastBusy(false);
    }
  }, [enabled, today, missing]);

  /* 꺼지면 미뤄 둔 지우기를 보내고 전부 비운 뒤 세대를 올린다 */
  useEffect(() => {
    if (!enabled) return;
    const ep = epoch;
    return () => {
      flushPending();
      ep.current++;
      setPendingIds(new Set());
      setApi('unknown');
      setPlayed(null);
      setError('');
      setPast(null);
      setPastTotal(null);
      setHasMorePast(false);
      setPastBusy(false);
      setPastError('');
    };
  }, [enabled, flushPending]);

  /* 화면이 가려질 때(hidden)·창을 떠날 때(pagehide) 바로 보낸다. pagehide 뒤 bfcache 로 돌아와도 되돌리기 자리가 남지 않는다 */
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      const gone = flushPending();
      if (gone.size === 0) return;
      dropRows(gone);
      setPendingIds(new Set());
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pagehide', flush);
    };
  }, [enabled, flushPending, dropRows]);

  /* 켜질 때 — 해 본 테마 목록으로 이 API 가 있는지 본다 */
  useEffect(() => {
    if (enabled) void Promise.resolve().then(reloadPlayed); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */
  }, [enabled, reloadPlayed]);

  /* 화면에 들어올 때마다 해 본 테마를 새로 받고(밤사이 자동 기록), 지난 일정은 처음 한 번 */
  useEffect(() => {
    if (!enabled || !active) return;
    void Promise.resolve().then(() => {
      void reloadPlayed();
      if (pastRef.current === null) void loadPast(true);
    });
  }, [enabled, active, reloadPlayed, loadPast]);

  /* 검색 칸에 처음 들어갈 때. 실패하면 다음에 다시 들어갈 때 또 받는다. */
  const loadThemes = useCallback(async () => {
    if (themes !== null || themesLoading.current) return;
    themesLoading.current = true;
    try {
      setThemes(await listThemes());
      setThemesError('');
    } catch {
      setThemesError('테마 목록을 불러오지 못했어요. 찾는 테마는 직접 적어 주세요.');
    } finally {
      themesLoading.current = false;
    }
  }, [themes]);

  /* 되돌리기 — 요청 없이 원래 줄로. 이미 보내는 중이면 false */
  const undo = useCallback((id: number): boolean => {
    const p = pendingRef.current.get(id);
    if (!p || p.sending) return false;
    clearTimeout(p.timer);
    clearTimeout(p.cap);
    pendingRef.current.delete(id);
    syncPending();
    return true;
  }, [syncPending]);

  /* 시간이 다 됨(6초 또는 2분 상한) — 그때 DELETE. 화면에 있으니 보통 fetch(keepalive 없음)로, 토큰은 새로 받아서.
     이미 없으면(NO_SUCH_PLAYED) 목적은 이뤘다. 그 밖의 실패는 알리고 줄이 다시 보인다. */
  const expire = useCallback(async (id: number, ep: number) => {
    const p = pendingRef.current.get(id);
    if (ep !== epoch.current || !p || p.sending) return;
    p.sending = true;
    clearTimeout(p.timer);
    clearTimeout(p.cap);
    try {
      await deletePlayed(id, (await token()) ?? p.token);
      if (ep === epoch.current) dropRows(new Set([id]));
    } catch (e) {
      if (ep !== epoch.current) return;
      if (errorCode(e) === 'NO_SUCH_PLAYED') dropRows(new Set([id]));
      else showToast(sayClub(e));
    } finally {
      if (ep === epoch.current && pendingRef.current.get(id) === p) {
        pendingRef.current.delete(id);
        syncPending();
        p.onGone?.();
      }
    }
  }, [dropRows, syncPending]);

  const arm = useCallback((id: number, p: Pending, ep: number) => {
    p.start = Date.now();
    p.timer = window.setTimeout(() => void expire(id, ep), p.left);
  }, [expire]);

  /* 마우스·포커스가 그 줄에 머무는 동안 멈춘다. 둘 다 떠나야 남은 시간으로 다시 간다(너무 짧으면 1.5초는 준다) */
  const hold = useCallback((id: number, key: 'hover' | 'focus') => {
    const p = pendingRef.current.get(id);
    if (!p || p.sending || p.holds.has(key)) return;
    if (p.holds.size === 0) { clearTimeout(p.timer); p.left -= Date.now() - p.start; }
    p.holds.add(key);
  }, []);
  const release = useCallback((id: number, key: 'hover' | 'focus') => {
    const p = pendingRef.current.get(id);
    if (!p || p.sending || !p.holds.delete(key) || p.holds.size > 0) return;
    p.left = Math.max(1500, p.left);
    arm(id, p, epoch.current);
  }, [arm]);

  /* 지우기 — 묻지 않는다. 줄은 그 자리에 "지웠어요 · 되돌리기"로 남고 6초 뒤 보낸다.
     토큰은 지금 받아 둔다(가려지거나 닫힐 때 기다리지 않고 보내야 해서). */
  const remove = useCallback(async (row: PlayedDto, onGone?: () => void) => {
    const ep = epoch.current;
    const t = await token();
    if (!t || ep !== epoch.current || pendingRef.current.has(row.id)) return;
    const p: Pending = { token: t, timer: undefined, cap: undefined, left: UNDO_MS, start: 0, holds: new Set(), sending: false, onGone };
    pendingRef.current.set(row.id, p);
    arm(row.id, p, ep);
    p.cap = window.setTimeout(() => void expire(row.id, ep), UNDO_MAX_MS);
    syncPending();
  }, [arm, expire, syncPending]);

  /* 기록 하나 더하기. 같은 테마가 이미 있으면 서버가 있던 행을 그대로 준다(멱등) — 보내기 전 목록에 그 id 가 있었으면 existed.
     목록을 아직 못 받았으면 먼저 받고 나서 판정한다. 실패하면 서버 문구를 던진다(부르는 쪽이 칸 아래나 토스트로 보인다). */
  const add = useCallback(async (input: PlayedInput): Promise<{ existed: boolean }> => {
    const ep = epoch.current;
    const t = enabled ? await token() : null;
    if (!t || ep !== epoch.current) throw new Error('로그인해 주세요.');
    const known = playedRef.current ?? await reloadPlayed();
    let row: PlayedDto;
    try {
      row = await addPlayed(input, t);
    } catch (e) {
      throw new Error(sayClub(e));
    }
    if (ep !== epoch.current) return { existed: false };
    /* 지우려고 미뤄 둔 그 기록이 돌아왔으면 — 지우기를 거두고 다시 보인다(새로 기록한 것과 같다) */
    const revived = undo(row.id);
    await reloadPlayed(); // 기록 날짜가 없는 행이 어디에 끼는지는 서버 순서를 따른다
    return { existed: !revived && !!known?.some((p) => p.id === row.id) };
  }, [enabled, reloadPlayed, undo]);

  return {
    api, played, pendingIds, error, reloadPlayed,
    past, pastTotal, hasMorePast, pastBusy, pastError, morePast: () => loadPast(false), retryPast: () => loadPast(true),
    themes, themesError, loadThemes,
    add, remove, undo, hold, release,
  };
}

export type UseProfileReturn = ReturnType<typeof useProfile>;
