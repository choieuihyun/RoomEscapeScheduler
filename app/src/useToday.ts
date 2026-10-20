import { useEffect, useState } from 'react';
import { msUntilKstMidnight, todayKst } from './clubEvents';

/* 한국 날짜 '오늘' — 자정(KST)이 지나면 한 번 다시 센다. 켜 둔 탭이 다음 날까지 낡은 날짜로 남지 않게
   다음 자정까지 타이머를 걸고, 잠자던 탭이 돌아왔을 때(visibilitychange)도 확인한다. */
export function useTodayKst(): string {
  const [today, setToday] = useState(todayKst);
  useEffect(() => {
    let t: number | undefined;
    const arm = () => {
      clearTimeout(t);
      t = window.setTimeout(() => { setToday(todayKst()); arm(); }, Math.min(msUntilKstMidnight(), 2 ** 31 - 1));
    };
    const check = () => { if (document.visibilityState === 'visible') { setToday(todayKst()); arm(); } };
    arm();
    document.addEventListener('visibilitychange', check);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', check); };
  }, []);
  return today;
}
