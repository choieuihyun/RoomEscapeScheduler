import { useCallback, useEffect, useRef, useState } from 'react';

/* 화면 아래 잠깐 떴다 사라지는 알림(§4.50). 어느 훅·컴포넌트에서든 showToast() 만
   부르면 되도록 window 이벤트로 흘린다 — 상태를 위로 끌어올리거나 prop 으로 내려보낼
   필요가 없다. 받는 쪽은 SchedulerPage 의 <Toaster/> 하나다.
   action 을 주면 문구 옆에 단추가 붙는다("지웠어요. 되돌리기"). 누를 시간을 주려고 조금 더 오래 둔다. */
const EVT = 'flod:toast';
const SHOW_MS = 2600;
const ACTION_MS = 6000;

export type ToastAction = { label: string; run: () => void };
type Detail = { msg: string; action?: ToastAction };
export type ToastItem = Detail & { id: number };

export function showToast(msg: string, action?: ToastAction) {
  dispatchEvent(new CustomEvent<Detail>(EVT, { detail: { msg, action } }));
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const dismiss = useCallback((id: number) => {
    setItems(xs => xs.filter(x => x.id !== id));
    const t = timers.current.get(id);
    if (t !== undefined) { clearTimeout(t); timers.current.delete(id); }
  }, []);
  useEffect(() => {
    let seq = 0;
    const live = timers.current;
    const on = (e: Event) => {
      const id = ++seq;
      const { msg, action } = (e as CustomEvent<Detail>).detail;
      setItems(xs => [...xs.slice(-2), { id, msg, action }]);   // 한 번에 셋까지만 쌓는다
      const t = window.setTimeout(() => {
        setItems(xs => xs.filter(x => x.id !== id));
        live.delete(id);
      }, action ? ACTION_MS : SHOW_MS);
      live.set(id, t);
    };
    addEventListener(EVT, on);
    return () => {
      removeEventListener(EVT, on);
      for (const t of live.values()) clearTimeout(t);
      live.clear();
    };
  }, []);
  return { items, dismiss };
}
