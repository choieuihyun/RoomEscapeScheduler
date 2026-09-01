import { useCallback, useState } from 'react';
import { toISO } from './core';

/* 캘린더 모달의 UI 상태만 — 데이터(plans/watches)는 이미 usePlans/useWatches가
   들고 있어 새로 불러올 게 없다. 다른 use*Modal 훅과 같은 모양. */
export function useCalendarModal() {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);

  const openModal = useCallback(() => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(toISO(d));
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const prevMonth = useCallback(() => setCursor(c => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })), []);
  const nextMonth = useCallback(() => setCursor(c => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })), []);
  const goToday = useCallback(() => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(toISO(d));
  }, []);
  const select = useCallback((iso: string) => setSelected(iso), []);

  return { open, cursor, selected, openModal, close, prevMonth, nextMonth, goToday, select };
}

export type UseCalendarModalReturn = ReturnType<typeof useCalendarModal>;
