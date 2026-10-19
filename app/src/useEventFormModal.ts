import { useCallback, useState } from 'react';
import type { PathStep } from './core';
import { todayKst } from './clubEvents';
import { emptyForm, formFromEvent, formFromSteps, type FormState } from './eventForm';
import type { EventDto } from './server';

/* 일정 만들기·수정 창을 여닫는 훅 — SchedulerPage 가 하나만 들고, 캘린더·홈·결과 카드가
   openNew / openEdit / openFromSteps 로 연다. 창 안의 입력 상태는 EventForm 이 들고 있다. */
export function useEventFormModal() {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<FormState>(() => emptyForm(todayKst()));
  const [editing, setEditing] = useState<EventDto | null>(null);
  /* 열 때마다 올린다 — EventForm 이 key 로 받아 입력 상태를 새로 시작한다 */
  const [seq, setSeq] = useState(0);

  const show = useCallback((form: FormState, ev: EventDto | null) => {
    setInitial(form);
    setEditing(ev);
    setSeq((n) => n + 1);
    setOpen(true);
  }, []);

  /* 날짜를 안 주면 한국 날짜 오늘 */
  const openNew = useCallback((date?: string) => show(emptyForm(date ?? todayKst()), null), [show]);
  const openEdit = useCallback((ev: EventDto) => show(formFromEvent(ev), ev), [show]);
  const openFromSteps = useCallback((date: string, steps: PathStep[]) => show(formFromSteps(date, steps), null), [show]);
  const close = useCallback(() => setOpen(false), []);

  return { open, initial, editing, seq, openNew, openEdit, openFromSteps, close };
}

export type UseEventFormModal = ReturnType<typeof useEventFormModal>;
