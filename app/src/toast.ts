import { useCallback, useEffect, useRef, useState } from 'react';

/* 화면 아래 잠깐 떴다 사라지는 알림(§4.50). 어느 훅·컴포넌트에서든 showToast() 만
   부르면 되도록 window 이벤트로 흘린다 — 상태를 위로 끌어올리거나 prop 으로 내려보낼
   필요가 없다. 받는 쪽은 SchedulerPage 의 <Toaster/> 하나다.
   action 을 주면 문구 옆에 단추가 붙는다("지웠어요. 되돌리기"). 누를 시간을 주려고 조금 더 오래 두고,
   마우스를 올리거나 포커스가 있는 동안은 시간을 멈춘다.
   onClose 는 알림이 어떻게 닫혔든 꼭 한 번 불린다 — 시간이 다 됨·밀려남(넷째가 들어옴)·지움(clearToasts)·단추. */
const EVT = 'flod:toast';
const CLEAR = 'flod:toast-clear';
const SHOW_MS = 2600;
const ACTION_MS = 6000;
export const MAX_TOASTS = 3;

/* run 은 없어도 된다 — 단추를 누른 결과를 onClose('action') 에서 다루는 쪽도 있다 */
export type ToastAction = { label: string; run?: () => void };
export type CloseReason = 'expired' | 'dismissed' | 'action' | 'evicted';
export type ToastOpts = { action?: ToastAction; onClose?: (reason: CloseReason) => void };
type Detail = { msg: string } & ToastOpts;
export type ToastItem = Detail & { id: number };

export function showToast(msg: string, opts?: ToastOpts) {
  dispatchEvent(new CustomEvent<Detail>(EVT, { detail: { msg, ...opts } }));
}

/* 단추가 붙은 알림을 모두 닫는다(onClose 'dismissed') — 로그아웃할 때 앞 사람의 "되돌리기"를 남기지 않는다 */
export function clearToasts() {
  dispatchEvent(new Event(CLEAR));
}

/* 새 알림을 쌓는다 — 셋을 넘으면 오래된 것부터 밀려난다(밀려난 것은 onClose 'evicted'). */
export function pushToast<T>(items: T[], item: T, max = MAX_TOASTS): { items: T[]; evicted: T[] } {
  const all = [...items, item];
  const cut = Math.max(0, all.length - max);
  return { items: all.slice(cut), evicted: all.slice(0, cut) };
}

type Timer = { t: number | undefined; left: number; start: number; holds: Set<string> };

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const itemsRef = useRef<ToastItem[]>([]);
  const timers = useRef(new Map<number, Timer>());

  const put = useCallback((next: ToastItem[]) => { itemsRef.current = next; setItems(next); }, []);

  /* 닫기 — 목록·타이머를 정리하고 onClose 를 부른다. 이미 닫힌 것이면 아무것도 안 한다(한 번만) */
  const close = useCallback((id: number, reason: CloseReason) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it) return;
    put(itemsRef.current.filter((x) => x.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm.t); timers.current.delete(id); }
    it.onClose?.(reason);
  }, [put]);

  const arm = useCallback((id: number, ms: number) => {
    const tm: Timer = { t: undefined, left: ms, start: Date.now(), holds: new Set() };
    tm.t = window.setTimeout(() => close(id, 'expired'), ms);
    timers.current.set(id, tm);
  }, [close]);

  /* 마우스·포커스가 머무는 동안 멈춘다. 둘 다 떠나야 남은 시간으로 다시 간다(너무 짧으면 1.5초는 준다) */
  const hold = useCallback((id: number, key: string) => {
    const tm = timers.current.get(id);
    if (!tm || tm.holds.has(key)) return;
    if (tm.holds.size === 0) { clearTimeout(tm.t); tm.left -= Date.now() - tm.start; }
    tm.holds.add(key);
  }, []);
  const release = useCallback((id: number, key: string) => {
    const tm = timers.current.get(id);
    if (!tm || !tm.holds.delete(key) || tm.holds.size > 0) return;
    tm.start = Date.now();
    tm.t = window.setTimeout(() => close(id, 'expired'), Math.max(1500, tm.left));
  }, [close]);

  useEffect(() => {
    let seq = 0;
    const live = timers.current;
    const on = (e: Event) => {
      const id = ++seq;
      const d = (e as CustomEvent<Detail>).detail;
      const r = pushToast(itemsRef.current, { id, ...d });
      put(r.items);
      for (const x of r.evicted) {
        const tm = live.get(x.id);
        if (tm) { clearTimeout(tm.t); live.delete(x.id); }
        x.onClose?.('evicted');
      }
      arm(id, d.action ? ACTION_MS : SHOW_MS);
    };
    const onClear = () => { for (const x of itemsRef.current) if (x.action) close(x.id, 'dismissed'); };
    addEventListener(EVT, on);
    addEventListener(CLEAR, onClear);
    return () => {
      removeEventListener(EVT, on);
      removeEventListener(CLEAR, onClear);
      for (const tm of live.values()) clearTimeout(tm.t);
      live.clear();
    };
  }, [put, arm, close]);

  return { items, close, hold, release };
}
