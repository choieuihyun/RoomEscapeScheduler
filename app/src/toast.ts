import { useEffect, useState } from 'react';
import type { PushBannerData } from './swLink';

/* 화면 아래 잠깐 떴다 사라지는 알림(§4.50). 어느 훅·컴포넌트에서든 showToast() 만
   부르면 되도록 window 이벤트로 흘린다 — 상태를 위로 끌어올리거나 prop 으로 내려보낼
   필요가 없다. 받는 쪽은 SchedulerPage 의 <Toaster/> 하나다. */
const EVT = 'flod:toast';
const SHOW_MS = 2600;

export function showToast(msg: string) {
  dispatchEvent(new CustomEvent<string>(EVT, { detail: msg }));
}

/* 앱 탭이 보이는 동안 온 푸시의 화면 위 띠(PushBanner)도 같은 방식으로 흘린다 */
export const PUSH_BANNER_EVT = 'flod:push-banner';
export function showPushBanner(b: PushBannerData) {
  dispatchEvent(new CustomEvent<PushBannerData>(PUSH_BANNER_EVT, { detail: b }));
}

export function useToasts() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    let seq = 0;
    const timers = new Set<number>();
    const on = (e: Event) => {
      const id = ++seq;
      const msg = (e as CustomEvent<string>).detail;
      setItems(xs => [...xs.slice(-2), { id, msg }]);   // 한 번에 셋까지만 쌓는다
      const t = window.setTimeout(() => {
        setItems(xs => xs.filter(x => x.id !== id));
        timers.delete(t);
      }, SHOW_MS);
      timers.add(t);
    };
    addEventListener(EVT, on);
    return () => {
      removeEventListener(EVT, on);
      for (const t of timers) clearTimeout(t);
    };
  }, []);
  return items;
}
