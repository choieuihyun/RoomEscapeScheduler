import { useCallback, useState } from 'react';
import type { SearchResultRow } from './core';
import { pad } from './core';
import type { UseAuthReturn } from './useAuth';

/* 결과 카드의 "저장" 모달 — index.html의 openSave/submitSave 이식. */
let cloudMod: typeof import('./cloud') | null = null;
const cloud = async () => (cloudMod ??= await import('./cloud'));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function useSaveModal(auth: UseAuthReturn, getSnapshot: () => string, onSaved: () => void,
  /* 다녀온 일정으로 저장했을 때 해 본 테마로 잇는다 — 동호회 API 가 켜진 승인 멤버일 때만 넘어온다 */
  onDone?: (steps: { name: string }[], date: string) => void) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<SearchResultRow | null>(null);
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<'wish' | 'done'>('wish');
  const [memo, setMemo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const openSave = useCallback((r: SearchResultRow) => {
    if (!auth.me) { auth.openAuth(); return; }
    setPending(r);
    setDate(today());
    setStatus('wish'); setMemo(''); setErr('');
    setOpen(true);
  }, [auth]);

  const close = useCallback(() => { setOpen(false); setPending(null); }, []);

  const submit = useCallback(async () => {
    if (!pending) return;
    if (!date) { setErr('날짜를 골라 주세요.'); return; }
    setBusy(true); setErr('');
    try {
      const C = await cloud();
      /* 확정된 시각을 그대로 굳혀 둔다 — snapshot은 "다시 짜기"용 입력값일 뿐이라
         나중에 계산 로직이 바뀌면 순위가 달라질 수 있다 (작업명세서 §7.1). */
      await C.savePlan({
        date, status, memo: memo.trim(),
        count: pending.count, start: pending.start, end: pending.end, total: pending.total,
        minGap: pending.minGap === Infinity ? null : pending.minGap,
        steps: pending.steps.map(x => ({ name: x.name, dur: x.dur, start: x.start, end: x.end })),
        snapshot: getSnapshot(),
      });
      setOpen(false); setPending(null);
      if (status === 'done') onDone?.(pending.steps, date);
      onSaved();
      document.getElementById('planSec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      const C = await cloud();
      setErr(C.say(e));
    } finally {
      setBusy(false);
    }
  }, [pending, date, status, memo, getSnapshot, onSaved, onDone]);

  return { open, pending, date, setDate, status, setStatus, memo, setMemo, err, busy, openSave, close, submit };
}

export type UseSaveModalReturn = ReturnType<typeof useSaveModal>;
