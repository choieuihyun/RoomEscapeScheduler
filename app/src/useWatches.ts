import { useCallback, useEffect, useState } from 'react';
import type { Me } from './cloud';
import { addWatch, listWatches, removeWatch, sayWatch, type WatchDto } from './server';
import { requestPushPermission, silentlyRefreshPush } from './notify';

/* F-16 "빈자리 알림" 목록 — usePlans.ts와 같은 모양(reload on me 변경,
   busyIds로 행별 처리중 표시). cloud.ts는 토큰을 얻을 때만 지연 로드한다. */
let cloudMod: typeof import('./cloud') | null = null;
const cloud = async () => (cloudMod ??= await import('./cloud'));

const DEFAULT_LIMIT = 3;

export function useWatches(me: Me | null) {
  const [watches, setWatches] = useState<WatchDto[]>([]);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [err, setErr] = useState('');
  /* 감시(add)는 성공했는데 푸시 등록이 안 됐을 때 쓰는 별도 안내 — err와
     합치면 "감시가 실패했다"로 오해할 수 있어 분리했다. */
  const [pushNote, setPushNote] = useState('');
  const [open, setOpen] = useState(false);
  /* GET /api/watches는 원래 slotId를 안 돌려준다(실측 확인) — 그래서 "이 칩이
     지금 감시 중인지"는 서버 목록과 대조할 수 없다. 이번 세션에서 add()로
     직접 건 것만 slotId→watchId로 기억해 칩/블록 토글 상태에 쓴다. 새로고침
     하거나 다른 기기에서 건 감시는 이 매핑엔 없지만, "빈자리 알림" 목록
     모달(watches 배열)에는 정확히 뜬다 — 그쪽이 진짜 소스다. */
  const [slotToWatchId, setSlotToWatchId] = useState<Map<number, number>>(new Map());

  const reload = useCallback(async () => {
    if (!me) { setWatches([]); return; }
    try {
      const C = await cloud();
      const token = await C.idToken();
      if (!token) { setWatches([]); return; }
      const res = await listWatches(token);
      setWatches(res.watches);
      setLimit(res.limit);
    } catch (e) {
      setWatches([]);
      console.warn('감시 목록 불러오기 실패:', e);
    }
  }, [me]);

  useEffect(() => { reload(); }, [reload]);

  /* 이미 알림을 허용해 둔 사람은 앱을 열 때마다 조용히 토큰을 다시 올린다
     (권한을 새로 묻지는 않는다 — notify.ts의 silentlyRefreshPush 참고). */
  useEffect(() => {
    if (!me) return;
    (async () => {
      const C = await cloud();
      const token = await C.idToken();
      if (token) silentlyRefreshPush(token);
    })();
  }, [me]);

  const add = useCallback(async (slotId: number) => {
    setErr('');
    setBusyIds(s => new Set(s).add(slotId));
    try {
      const C = await cloud();
      const token = await C.idToken();
      if (!token) { setErr('로그인하면 감시할 수 있어요.'); return; }
      const w = await addWatch(slotId, token);
      setWatches(ws => (ws.some(x => x.id === w.id) ? ws : [w, ...ws]));
      setSlotToWatchId(m => new Map(m).set(slotId, w.id));
      /* 벨을 누른 이 순간(버튼 클릭 콜백 안)에만 권한을 묻는다 — notify.ts 참고.
         감시 자체는 이미 성공했으니 err가 아니라 별도 안내로 보여준다. */
      const push = await requestPushPermission(token);
      setPushNote(push.ok ? '' : push.reason);
    } catch (e) {
      setErr(sayWatch(e));
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(slotId); return n; });
    }
  }, []);

  const remove = useCallback(async (watchId: number) => {
    setErr('');
    setBusyIds(s => new Set(s).add(watchId));
    try {
      const C = await cloud();
      const token = await C.idToken();
      if (!token) return;
      await removeWatch(watchId, token);
      setWatches(ws => ws.filter(x => x.id !== watchId));
      setSlotToWatchId(m => {
        const n = new Map(m);
        for (const [slot, wid] of n) if (wid === watchId) n.delete(slot);
        return n;
      });
    } catch (e) {
      setErr(sayWatch(e));
      setBusyIds(s => { const n = new Set(s); n.delete(watchId); return n; });
    }
  }, []);

  /* 칩/블록 토글용 — 이 세션에서 건 감시만 안다(위 주석 참고). */
  const removeBySlot = useCallback((slotId: number) => {
    const watchId = slotToWatchId.get(slotId);
    if (watchId != null) remove(watchId);
  }, [slotToWatchId, remove]);

  const watchIdForSlot = useCallback((slotId: number) => slotToWatchId.get(slotId), [slotToWatchId]);

  const openModal = useCallback(() => { setOpen(true); reload(); }, [reload]);
  const close = useCallback(() => setOpen(false), []);

  return { watches, limit, busyIds, err, pushNote, reload, add, remove, removeBySlot, watchIdForSlot, open, openModal, close };
}

export type UseWatchesReturn = ReturnType<typeof useWatches>;

/* ThemeCard/ResultCard의 매진 칩·블록에 꽂는 토글 하나로 뭉친 것 —
   props를 4~5개 대신 이거 하나만 내려보내면 된다. */
export interface WatchControl {
  loggedIn: boolean;
  atLimit: boolean;
  isWatching: (slotId: number) => boolean;
  busy: (slotId: number) => boolean;
  toggle: (slotId: number) => void;
}

export function buildWatchControl(w: UseWatchesReturn, loggedIn: boolean): WatchControl {
  return {
    loggedIn,
    atLimit: w.watches.length >= w.limit,
    isWatching: slotId => w.watchIdForSlot(slotId) != null,
    busy: slotId => {
      const watchId = w.watchIdForSlot(slotId);
      return w.busyIds.has(slotId) || (watchId != null && w.busyIds.has(watchId));
    },
    toggle: slotId => {
      const watchId = w.watchIdForSlot(slotId);
      if (watchId != null) w.remove(watchId);
      else w.add(slotId);
    },
  };
}
