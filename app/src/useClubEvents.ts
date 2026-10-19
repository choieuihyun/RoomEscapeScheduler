import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addParticipant, createEvent, deleteEvent, errorCode, getEvent, isMissingApi, joinEvent, leaveEvent,
  listEvents, removeParticipant, sayClub, setBooked as setBookedApi, updateEvent,
  type EventDto, type EventInput,
} from './server';
import { afterActionError, dropEvent, mergeRange, upsert } from './clubEvents';
import { showToast } from './toast';

/* 동호회 일정 목록을 들고 있는 훅 — 서버 계약은 작업명세서 §4.7, 계획 Task E3.
   홈·캘린더가 같은 목록을 쓴다. 다시 불러오는 때: 켜질 때, 범위가 바뀔 때, 창이 다시 보이거나
   포커스를 받을 때, 창이 보이는 동안 60초마다. */

const POLL_MS = 60_000;

export type ClubApi = 'unknown' | 'on' | 'missing';
export type Range = { from: string; to: string };

/* 토큰이 없으면 null — 부르는 쪽이 아무것도 하지 않는다. useMembers 처럼 Firebase 덩어리는 늦게 받는다. */
async function token(): Promise<string | null> {
  return (await import('./cloud')).idToken();
}

export function useClubEvents(enabled: boolean, ranges: Range[]) {
  const [events, setEvents] = useState<EventDto[]>([]);
  const [api, setApi] = useState<ClubApi>('unknown');
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  /* 호출부가 배열 리터럴을 넘겨도 매 렌더 다시 불러오지 않도록 값으로 비교한다. */
  const rangesKey = JSON.stringify(ranges.map((r) => [r.from, r.to]));
  const rangeList = useMemo<Range[]>(
    () => (JSON.parse(rangesKey) as [string, string][]).map(([from, to]) => ({ from, to })),
    [rangesKey],
  );
  const alive = useRef(true);
  const seq = useRef(0);
  /* 켜짐 세대 — 꺼질 때 올린다. 떠 있던 동작·한 건 새로 받기 응답이 꺼진 뒤(전 사용자) 목록을 되살리지 못하게 한다. */
  const epoch = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const my = ++seq.current;
    try {
      const t = await token();
      if (!t) {
        /* 토스트는 없이 상태만 — 첫 화면 결정(SchedulerPage)이 빈 화면에 갇히지 않게 오류로 알린다 */
        if (alive.current && my === seq.current) setError('로그인해 주세요.');
        return;
      }
      const lists = await Promise.all(rangeList.map((r) => listEvents(r.from, r.to, t)));
      if (!alive.current || my !== seq.current) return;
      setEvents((cur) => rangeList.reduce((acc, r, i) => mergeRange(acc, r.from, r.to, lists[i]), cur));
      setApi('on');
      setError('');
    } catch (e) {
      if (!alive.current || my !== seq.current) return;
      if (isMissingApi(e)) {
        setApi('missing');
        setEvents([]);
        setError('');
      } else {
        setError(sayClub(e));
      }
    }
  }, [enabled, rangeList]);

  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  /* 꺼지면 목록을 비우고 진행 중이던 응답은 버린다. */
  useEffect(() => {
    if (!enabled) return;
    const s = seq;
    const ep = epoch;
    return () => {
      s.current++;
      ep.current++;
      setEvents([]);
      setApi('unknown');
      setError('');
      setBusyIds(new Set());
    };
  }, [enabled]);

  /* 켜질 때·범위가 바뀔 때 */
  useEffect(() => {
    if (enabled) void Promise.resolve().then(reload); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */
  }, [enabled, reload]);

  /* 창이 다시 보일 때·포커스, 보이는 동안 60초마다 */
  useEffect(() => {
    if (!enabled) return;
    const visible = () => document.visibilityState === 'visible';
    const onVis = () => { if (visible()) void reload(); };
    const onFocus = () => void reload();
    const timer = window.setInterval(() => { if (visible()) void reload(); }, POLL_MS);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, reload]);

  /* 동작·한 건 새로 받기가 목록을 바꾼 뒤 부른다. 그 전에 떠 있던 reload 는 낡은 참여 상태를 들고 올 수 있어
     (참여·취소는 version 을 올리지 않는다) 버리고, 목록을 다시 받는다. */
  const invalidateReload = useCallback(() => {
    void reloadRef.current(); // reload 가 seq 를 올려 먼저 떠 있던 응답을 버린다. 늘 가장 최신 범위로 부른다.
  }, []);

  /* 한 일정만 다시 받는다. 지워졌으면(404 NO_SUCH_EVENT) 목록에서 빼고 null. */
  const refreshOne = useCallback(async (id: number): Promise<EventDto | null> => {
    if (!enabled) return null;
    const ep = epoch.current;
    const live = () => alive.current && epoch.current === ep;
    try {
      const t = await token();
      if (!t) return null;
      const ev = await getEvent(id, t);
      if (!live()) return null;
      setEvents((cur) => upsert(cur, ev));
      invalidateReload();
      return ev;
    } catch (e) {
      if (errorCode(e) === 'NO_SUCH_EVENT' && live()) {
        setEvents((cur) => dropEvent(cur, id));
        invalidateReload();
      }
      return null;
    }
  }, [enabled, invalidateReload]);

  const setBusy = (id: number, on: boolean) => {
    if (!alive.current) return;
    setBusyIds((cur) => {
      const next = new Set(cur);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  /* 동작 하나. 성공하면 돌아온 일정으로 목록을 바꾼다. 실패하면 서버 문구를 토스트로 보이고
     (만들기·고치기는 입력 창이 문구를 직접 보이니 토스트 없이, 충돌도 창이 다룬다) 정원 초과·없는 일정이면 목록을 맞춘 뒤 던진다. */
  const act = useCallback(async <T,>(id: number | null, inForm: boolean, call: (t: string, put: (ev: EventDto) => EventDto, live: () => boolean) => Promise<T>): Promise<T> => {
    const ep = epoch.current;
    const live = () => alive.current && epoch.current === ep;
    if (id !== null) setBusy(id, true);
    let noToken = false;
    try {
      const t = enabled ? await token() : null;
      if (!t) { noToken = true; throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } }); } /* sayClub 이 창 안에서 그대로 읽는다 */
      const out = await call(t, (ev) => { if (live()) setEvents((cur) => upsert(cur, ev)); return ev; }, live);
      if (live()) invalidateReload();
      return out;
    } catch (e) {
      if (!inForm) showToast(noToken ? '로그인해 주세요.' : sayClub(e));
      if (id !== null) {
        const fix = afterActionError(e);
        if (fix === 'refresh') await refreshOne(id);
        else if (fix === 'drop' && live()) { setEvents((cur) => dropEvent(cur, id)); invalidateReload(); }
      }
      throw e;
    } finally {
      if (id !== null) setBusy(id, false);
    }
  }, [enabled, refreshOne, invalidateReload]);


  /* 만들기·고치기는 입력 화면이 실패를 알아야 해서(입력을 지우지 않는다) 던진 채로 둔다.
     나머지는 토스트로 이미 알렸으니 삼킨다. */
  const quiet = async (p: Promise<unknown>): Promise<void> => {
    try { await p; } catch { /* 토스트·목록 맞춤은 act 에서 끝났다 */ }
  };

  const create = useCallback((input: EventInput) => act(null, true, (t, put) => createEvent(input, t).then(put)), [act]);
  const update = useCallback(
    (id: number, input: EventInput, version: number) => act(id, true, (t, put) => updateEvent(id, input, version, t).then(put)),
    [act],
  );
  const remove = useCallback(
    (id: number) => quiet(act(id, false, async (t, _put, live) => {
      await deleteEvent(id, t); // 이미 지워졌어도(404) 성공
      if (live()) setEvents((cur) => dropEvent(cur, id));
    })),
    [act],
  );
  const join = useCallback((id: number) => quiet(act(id, false, (t, put) => joinEvent(id, t).then(put))), [act]);
  const leave = useCallback((id: number) => quiet(act(id, false, (t, put) => leaveEvent(id, t).then(put))), [act]);
  const addPerson = useCallback(
    (id: number, uid: string) => quiet(act(id, false, (t, put) => addParticipant(id, uid, t).then(put))),
    [act],
  );
  const removePerson = useCallback(
    (id: number, uid: string) => quiet(act(id, false, (t, put) => removeParticipant(id, uid, t).then(put))),
    [act],
  );
  const setBooked = useCallback(
    (id: number, booked: boolean) => quiet(act(id, false, (t, put) => setBookedApi(id, booked, t).then(put))),
    [act],
  );

  return {
    events, api, error, reload, refreshOne,
    create, update, remove, join, leave, addPerson, removePerson, setBooked, busyIds,
  };
}
