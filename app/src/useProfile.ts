import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addPlayed, deletePlayed, errorCode, isMissingApi, listPlayed, listThemes, myPastEvents, sayClub,
  type EventDto, type PlayedDto, type PlayedInput, type ThemeRef,
} from './server';
import { addDays } from './clubEvents';
import { showToast } from './toast';

/* "내 정보" 화면의 데이터 — 해 본 테마·지난 동호회 일정(작업명세서 §4.9).
   해 본 테마 목록은 켜지자마자 한 번 받는다 — 서버가 이 API 를 모르면(본문 없는 404) 메뉴를 숨겨야 해서다.
   지난 일정은 화면에 처음 들어올 때, 테마 목록(공개 API)은 검색 칸에 처음 들어갈 때 받는다. */

export type ProfileApi = 'unknown' | 'on' | 'missing';

export const PAST_PAGE = 10;

/* 다음 쪽 요청. 서버는 `date < before` 라서 마지막 날짜를 before 로 주면 쪽 경계에 걸친 같은 날 일정이 빠진다.
   그래서 마지막 날짜의 다음 날을 주고, 이미 받은 그날 일정 수만큼 더 받아 id 로 걸러 낸다.
   한 개 더(+1) 받아 다음 쪽이 있는지 안다. 서버 상한은 50. */
export function nextPastQuery(loaded: EventDto[], today: string): { before: string; limit: number } {
  const last = loaded[loaded.length - 1]?.date;
  if (!last) return { before: today, limit: PAST_PAGE + 1 };
  const same = loaded.filter((e) => e.date === last).length;
  return { before: addDays(last, 1), limit: Math.min(50, same + PAST_PAGE + 1) };
}

/* 받은 쪽을 붙인다 — 이미 있는 id 는 빼고 새것은 한 쪽(10개)까지. 넘친 것은 다음 쪽 요청이 다시 받는다.
   새것이 하나도 없는데 응답이 꽉 찼으면(한 날짜에 50개 넘게) 더 나아갈 수 없으니 끝으로 친다. */
export function mergePast(loaded: EventDto[], fresh: EventDto[], limit: number): { list: EventDto[]; hasMore: boolean } {
  const ids = new Set(loaded.map((e) => e.id));
  const add = fresh.filter((e) => !ids.has(e.id));
  return {
    list: [...loaded, ...add.slice(0, PAST_PAGE)],
    hasMore: add.length > PAST_PAGE || (fresh.length >= limit && add.length > 0),
  };
}

/* 되돌리기로 다시 보낼 내용. 자동 기록(EVENT)은 화면이 그 출처로 보낼 수 없어(§4.9 source 는 MANUAL·PLAN 만)
   직접 기록으로 돌아온다. 테마 키·지점·날짜는 그대로. */
export function restoreInput(p: PlayedDto): PlayedInput {
  return {
    themeKey: p.themeKey, themeName: p.themeName, branchName: p.branchName, playedOn: p.playedOn,
    ...(p.source === 'PLAN' ? { source: 'PLAN' as const } : {}),
  };
}

async function token(): Promise<string | null> {
  return (await import('./cloud')).idToken();
}

export function useProfile(enabled: boolean, active: boolean, today: string) {
  const [api, setApi] = useState<ProfileApi>('unknown');
  const [played, setPlayed] = useState<PlayedDto[] | null>(null);
  const [error, setError] = useState('');
  const [past, setPast] = useState<EventDto[] | null>(null);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [pastBusy, setPastBusy] = useState(false);
  const [pastError, setPastError] = useState('');
  const [themes, setThemes] = useState<ThemeRef[] | null>(null);
  const [themesError, setThemesError] = useState('');
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  /* 켜짐 세대 — 꺼질 때(로그아웃·다른 사람) 올린다. 그 전에 떠난 요청·되돌리기가 새 사람 화면을 건드리지 못하게. */
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

  const reloadPlayed = useCallback(async () => {
    if (!enabled) return;
    const ep = epoch.current;
    const my = ++playedSeq.current;
    try {
      const t = await token();
      if (!t || ep !== epoch.current || my !== playedSeq.current) return;
      const list = await listPlayed(t);
      if (ep !== epoch.current || my !== playedSeq.current) return;
      setPlayed(list);
      setApi('on');
      setError('');
    } catch (e) {
      if (ep !== epoch.current || my !== playedSeq.current) return;
      if (isMissingApi(e)) missing();
      else setError(sayClub(e));
    }
  }, [enabled, missing]);

  /* 지난 일정 한 쪽. first 면 처음부터 다시 받는다. */
  const loadPast = useCallback(async (first: boolean) => {
    if (!enabled) return;
    const ep = epoch.current;
    const loaded = first ? [] : (pastRef.current ?? []);
    const q = nextPastQuery(loaded, today);
    setPastBusy(true);
    try {
      const t = await token();
      if (!t || ep !== epoch.current) return;
      const fresh = await myPastEvents(q.before, q.limit, t);
      if (ep !== epoch.current) return;
      const m = mergePast(loaded, fresh, q.limit);
      setPast(m.list);
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

  /* 꺼지면 전부 비우고 세대를 올린다 */
  useEffect(() => {
    if (!enabled) return;
    const ep = epoch;
    return () => {
      ep.current++;
      setApi('unknown');
      setPlayed(null);
      setError('');
      setPast(null);
      setHasMorePast(false);
      setPastBusy(false);
      setPastError('');
      setBusyIds(new Set());
    };
  }, [enabled]);

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

  /* 기록 하나 더하기. 같은 테마가 이미 있으면 서버가 있던 행을 그대로 준다(멱등) — 보내기 전 목록에 그 id 가 있었으면 existed.
     실패하면 서버 문구를 던진다(부르는 쪽이 칸 아래나 토스트로 보인다). */
  const add = useCallback(async (input: PlayedInput): Promise<{ existed: boolean }> => {
    const ep = epoch.current;
    const t = enabled ? await token() : null;
    if (!t || ep !== epoch.current) throw new Error('로그인해 주세요.');
    const before = new Set((playedRef.current ?? []).map((p) => p.id));
    let row: PlayedDto;
    try {
      row = await addPlayed(input, t);
    } catch (e) {
      throw new Error(sayClub(e));
    }
    if (ep === epoch.current) await reloadPlayed(); // 기록 날짜가 없는 행이 어디에 끼는지는 서버 순서를 따른다
    return { existed: before.has(row.id) };
  }, [enabled, reloadPlayed]);

  const setBusy = (id: number, on: boolean) => setBusyIds((cur) => {
    const next = new Set(cur);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  /* 지우기 — 묻지 않고 지운 뒤 "되돌리기"를 준다. 되돌리기는 같은 내용으로 다시 기록한다(새 id). */
  const remove = useCallback(async (p: PlayedDto) => {
    const ep = epoch.current;
    setBusy(p.id, true);
    try {
      const t = await token();
      if (!t || ep !== epoch.current) return;
      await deletePlayed(p.id, t);
      if (ep !== epoch.current) return;
      setPlayed((cur) => cur?.filter((x) => x.id !== p.id) ?? cur);
      showToast('지웠어요.', {
        label: '되돌리기',
        run: () => {
          if (ep !== epoch.current) return;
          add(restoreInput(p)).then(
            () => showToast('되돌렸어요.'),
            (e: Error) => showToast(e.message),
          );
        },
      });
    } catch (e) {
      if (ep !== epoch.current) return;
      showToast(sayClub(e));
      if (errorCode(e) === 'NO_SUCH_PLAYED') void reloadPlayed(); // 이미 없는 기록 — 목록을 맞춘다
    } finally {
      if (ep === epoch.current) setBusy(p.id, false);
    }
  }, [add, reloadPlayed]);

  return {
    api, played, error, reloadPlayed,
    past, hasMorePast, pastBusy, pastError, morePast: () => loadPast(false), retryPast: () => loadPast(true),
    themes, themesError, loadThemes,
    add, remove, busyIds,
  };
}

export type UseProfileReturn = ReturnType<typeof useProfile>;
