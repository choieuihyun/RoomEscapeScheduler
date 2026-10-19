import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addPlayed, deletePlayed, deletePlayedNow, errorCode, isMissingApi, listPlayed, listThemes, myPastEvents, sayClub,
  type EventDto, type PlayedDto, type PlayedInput, type ThemeRef,
} from './server';
import { addDays } from './clubEvents';
import { clearToasts, showToast, type CloseReason } from './toast';

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

/* 지우기는 바로 보내지 않고 미룬다 — 줄은 곧바로 감추고 "되돌리기" 알림이 닫힐 때 정한다.
   되돌리기를 눌렀으면 요청 없이 다시 보이고, 그 밖(시간이 다 됨·밀려남·지움)이면 그때 DELETE.
   그래서 자동 기록의 출처(EVENT)·일정 연결(eventId)이 되돌려도 그대로 남는다. */
export const onDeleteToastClose = (reason: CloseReason): 'restore' | 'send' => (reason === 'action' ? 'restore' : 'send');

/* 지우려고 미뤄 둔 기록은 목록에서 뺀다 — 그 사이 목록을 새로 받아도 지운 줄이 다시 나타나지 않게 */
export function withoutPending(list: PlayedDto[], pending: ReadonlySet<number>): PlayedDto[] {
  return pending.size === 0 ? list : list.filter((p) => !pending.has(p.id));
}

type Pending = { token: string; sending: boolean };

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
  /* 지우기를 미뤄 둔 id(화면에서 감춤). 실제 대기 내용(미리 받아 둔 토큰·보내는 중)은 pendingRef */
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const pendingRef = useRef(new Map<number, Pending>());
  const syncPending = useCallback(() => setPendingIds(new Set(pendingRef.current.keys())), []);

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

  /* 미뤄 둔 지우기를 지금 보낸다 — 창을 닫거나(pagehide) 로그아웃할 때. 결과를 기다릴 수 없어 keepalive 로,
     토큰은 지울 때 미리 받아 둔 것으로 보낸다. 보낸 줄은 목록에서도 뺀다. */
  const flushPending = useCallback(() => {
    const gone: number[] = [];
    for (const [id, p] of pendingRef.current) {
      if (!p.sending) deletePlayedNow(id, p.token);
      gone.push(id);
    }
    pendingRef.current.clear();
    return gone;
  }, []);

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
      flushPending();
      ep.current++;
      clearToasts(); // 앞 사람의 "되돌리기"를 남기지 않는다(닫힐 때 세대가 달라 아무것도 안 한다)
      setPendingIds(new Set());
      setApi('unknown');
      setPlayed(null);
      setError('');
      setPast(null);
      setHasMorePast(false);
      setPastBusy(false);
      setPastError('');
    };
  }, [enabled, flushPending]);

  /* 창을 닫거나 다른 페이지로 떠날 때 미뤄 둔 지우기를 보낸다 */
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      const gone = new Set(flushPending());
      if (gone.size === 0) return;
      setPlayed((cur) => cur?.filter((p) => !gone.has(p.id)) ?? cur);
      setPendingIds(new Set());
    };
    addEventListener('pagehide', onHide);
    return () => removeEventListener('pagehide', onHide);
  }, [enabled, flushPending]);

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
    const revived = pendingRef.current.get(row.id);
    if (revived && !revived.sending) { pendingRef.current.delete(row.id); syncPending(); }
    await reloadPlayed(); // 기록 날짜가 없는 행이 어디에 끼는지는 서버 순서를 따른다
    return { existed: !revived && !!known?.some((p) => p.id === row.id) };
  }, [enabled, reloadPlayed, syncPending]);

  /* 알림이 닫힐 때 미뤄 둔 지우기를 정한다(onDeleteToastClose). 세대가 바뀌었거나 이미 보냈으면(flush) 할 일이 없다. */
  const settle = useCallback(async (p: PlayedDto, reason: CloseReason, ep: number, onRestored?: (id: number) => void) => {
    const wait = pendingRef.current.get(p.id);
    if (ep !== epoch.current || !wait || wait.sending) return;
    if (onDeleteToastClose(reason) === 'restore') {
      pendingRef.current.delete(p.id);
      syncPending();
      onRestored?.(p.id);
      return;
    }
    wait.sending = true;
    try {
      await deletePlayed(p.id, (await token()) ?? wait.token);
      if (ep === epoch.current) setPlayed((cur) => cur?.filter((x) => x.id !== p.id) ?? cur);
    } catch (e) {
      if (ep !== epoch.current) return;
      if (errorCode(e) === 'NO_SUCH_PLAYED') setPlayed((cur) => cur?.filter((x) => x.id !== p.id) ?? cur); // 이미 없다 — 목적은 이뤘다
      else showToast(sayClub(e)); // 못 지웠다 — 줄이 다시 보인다
    } finally {
      if (ep === epoch.current) { pendingRef.current.delete(p.id); syncPending(); }
    }
  }, [syncPending]);

  /* 지우기 — 묻지 않는다. 줄을 바로 감추고 "지웠어요. 되돌리기" 알림이 닫힐 때 보낸다(settle).
     토큰은 지금 받아 둔다 — 창을 닫을 때(pagehide) 기다리지 않고 보내야 해서. onRestored 는 되돌렸을 때 화면이 포커스를 돌리는 데 쓴다. */
  const remove = useCallback(async (p: PlayedDto, onRestored?: (id: number) => void) => {
    const ep = epoch.current;
    const t = await token();
    if (!t || ep !== epoch.current || pendingRef.current.has(p.id)) return;
    pendingRef.current.set(p.id, { token: t, sending: false });
    syncPending();
    showToast('지웠어요.', {
      action: { label: '되돌리기' },
      onClose: (reason) => void settle(p, reason, ep, onRestored),
    });
  }, [settle, syncPending]);

  const visible = useMemo(() => (played === null ? null : withoutPending(played, pendingIds)), [played, pendingIds]);

  return {
    api, played: visible, error, reloadPlayed,
    past, hasMorePast, pastBusy, pastError, morePast: () => loadPast(false), retryPast: () => loadPast(true),
    themes, themesError, loadThemes,
    add, remove,
  };
}

export type UseProfileReturn = ReturnType<typeof useProfile>;
