import { useCallback, useEffect, useState } from 'react';
import type { Me, Plan } from './cloud';

/* "내 일정" 목록 — index.html의 loadPlans/renderPlans의 flip/del 부분 이식. */
let cloudMod: typeof import('./cloud') | null = null;
const cloud = async () => (cloudMod ??= await import('./cloud'));

export function usePlans(me: Me | null) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    if (!me) { setPlans([]); return; }
    try {
      const C = await cloud();
      setPlans(await C.listPlans());
    } catch (e) {
      setPlans([]);
      console.warn('일정 불러오기 실패:', e);
    }
  }, [me]);

  useEffect(() => { reload(); }, [reload]);

  const flip = useCallback(async (id: string) => {
    const p = plans.find(x => x.id === id);
    if (!p) return;
    const next = p.status === 'wish' ? 'done' : 'wish';
    setBusyIds(s => new Set(s).add(id));
    try {
      const C = await cloud();
      await C.patchPlan(id, { status: next });
      setPlans(ps => ps.map(x => (x.id === id ? { ...x, status: next } : x)));
    } catch (e) {
      console.warn(e);
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [plans]);

  const remove = useCallback(async (id: string) => {
    setBusyIds(s => new Set(s).add(id));
    try {
      const C = await cloud();
      await C.removePlan(id);
      setPlans(ps => ps.filter(x => x.id !== id));
    } catch (e) {
      console.warn(e);
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }, []);

  return { plans, busyIds, reload, flip, remove };
}

export type UsePlansReturn = ReturnType<typeof usePlans>;
