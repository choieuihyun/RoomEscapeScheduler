import { useCallback, useEffect, useState } from 'react';
import { branches as branchesApi, say, schedule as scheduleApi, type Branch, type ServerTheme } from './server';

export interface DayBranchSchedule { branch: Branch; themes: ServerTheme[] }

/* 캘린더 날짜 클릭 시 "그날 열려있는 회차" — F-15 API(branches/schedule)를
   여러 지점에 걸쳐 훑는다는 점만 새롭다(기존 useLoadModal.ts는 지점 하나만
   다룸). 날짜별로 한 번 받아오면 캐시에 남겨 같은 날짜를 다시 눌러도
   재요청하지 않는다 — "이미 있으면(로딩 중이든 완료든) 다시 안 부른다"로
   경합도 자연히 막힌다(별도 generation 카운터·AbortController 불필요). */
export function useDaySchedule(open: boolean) {
  /* null = 지점 목록을 아직 못 받음 — load()가 이 상태에서 부르면 조용히
     자기 자신을 미룬다. branchList가 도착하면 load 참조가 바뀌므로(useCallback
     deps), 그걸 부른 쪽의 useEffect가 자동으로 다시 부른다(CalendarModal 참고) —
     "지점 목록이 아직 안 왔는데 빈 결과로 캐시해 버리는" 경합을 막는다. */
  const [branchList, setBranchList] = useState<Branch[] | null>(null);
  const [listErr, setListErr] = useState('');
  const [cache, setCache] = useState<Map<string, 'loading' | DayBranchSchedule[]>>(new Map());

  useEffect(() => {
    if (!open) return;
    setCache(new Map());
    setListErr('');
    setBranchList(null);
    branchesApi().then(setBranchList).catch(e => { setListErr(say(e)); setBranchList([]); });
  }, [open]);

  const load = useCallback((iso: string) => {
    if (branchList == null) return; // 아직 목록이 안 왔다 — branchList 도착 시 재호출됨
    if (cache.has(iso)) return; // 이미 로딩 중이거나 받아온 날짜 — 재요청 안 함
    setCache(m => new Map(m).set(iso, 'loading'));
    const matched = branchList.filter(b => b.dates.includes(iso));
    if (!matched.length) {
      setCache(m => new Map(m).set(iso, []));
      return;
    }
    Promise.allSettled(matched.map(b => scheduleApi(b.id, iso).then(r => ({ branch: b, themes: r.themes }))))
      .then(results => {
        const ok = results
          .filter((r): r is PromiseFulfilledResult<DayBranchSchedule> => r.status === 'fulfilled')
          .map(r => r.value);
        setCache(m => new Map(m).set(iso, ok));
      });
  }, [branchList, cache]);

  return { branchList, listErr, cache, load };
}

export type UseDayScheduleReturn = ReturnType<typeof useDaySchedule>;
