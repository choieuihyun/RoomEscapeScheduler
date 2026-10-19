import { useCallback, useEffect, useRef, useState } from 'react';
import type { Me, Plan } from './cloud';
import { showToast } from './toast';

/* "내 일정" 목록 — index.html의 loadPlans/renderPlans의 flip/del 부분 이식. */
let cloudMod: typeof import('./cloud') | null = null;
const cloud = async () => (cloudMod ??= await import('./cloud'));

export function usePlans(me: Me | null, onDone?: (steps: { name: string }[], date: string) => void) {
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

  /* 보내는 중인 id — 단추가 꺼지기 전에 빠르게 또 눌러도 같은 요청을 다시 보내지 않는다 */
  const flying = useRef(new Set<string>());
  const flip = useCallback(async (id: string) => {
    const p = plans.find(x => x.id === id);
    if (!p || flying.current.has(id)) return;
    flying.current.add(id);
    const next = p.status === 'wish' ? 'done' : 'wish';
    setBusyIds(s => new Set(s).add(id));
    try {
      const C = await cloud();
      await C.patchPlan(id, { status: next });
      setPlans(ps => ps.map(x => (x.id === id ? { ...x, status: next } : x)));
      if (next === 'done') onDone?.(p.steps, p.date);
    } catch (e) {
      console.warn(e);
    } finally {
      flying.current.delete(id);
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [plans, onDone]);

  const remove = useCallback(async (id: string) => {
    setBusyIds(s => new Set(s).add(id));
    try {
      const C = await cloud();
      await C.removePlan(id);
      setPlans(ps => ps.filter(x => x.id !== id));
      showToast('일정을 지웠어요.');
    } catch (e) {
      console.warn(e);
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }, []);

  return { plans, busyIds, reload, flip, remove };
}

export type UsePlansReturn = ReturnType<typeof usePlans>;
