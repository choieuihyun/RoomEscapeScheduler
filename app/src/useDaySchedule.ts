import { useCallback, useEffect, useState } from 'react';
import { branches as branchesApi, say, schedule as scheduleApi, type Branch, type ServerTheme } from './server';

export interface DayBranchSchedule { branch: Branch; themes: ServerTheme[] }

/* 캘린더 날짜 클릭 시 "그날 열려있는 회차" — F-15 API(branches/schedule).

   §4.51 — 처음엔(§4.40) 그날 데이터가 있는 지점을 **전부** 한꺼번에 불렀는데, 하루에
   30곳이 넘어(실측 34곳) 화면도 읽기 어렵고 요청도 그만큼 나갔다. 이제는 사용자가 고른
   지점만 부른다. 캐시는 (날짜, 지점) 단위다 — 지점을 하나 더 고르면 그 지점만 새로
   부르고, 이미 받은 건(로딩 중이든 완료든) 다시 안 부른다(경합도 이걸로 막힌다). */
export type BranchDay = 'loading' | 'error' | ServerTheme[];
const key = (iso: string, branchId: string) => iso + '|' + branchId;

export function useDaySchedule(open: boolean) {
  /* null = 지점 목록을 아직 못 받음 — load()가 이 상태에서 부르면 조용히
     자기 자신을 미룬다. branchList가 도착하면 load 참조가 바뀌므로(useCallback
     deps), 그걸 부른 쪽의 useEffect가 자동으로 다시 부른다(CalendarPage 참고) —
     "지점 목록이 아직 안 왔는데 빈 결과로 캐시해 버리는" 경합을 막는다. */
  const [branchList, setBranchList] = useState<Branch[] | null>(null);
  const [listErr, setListErr] = useState('');
  const [cache, setCache] = useState<Map<string, BranchDay>>(new Map());

  useEffect(() => {
    if (!open) return;
    setCache(new Map());
    setListErr('');
    setBranchList(null);
    branchesApi().then(setBranchList).catch(e => { setListErr(say(e)); setBranchList([]); });
  }, [open]);

  /* 그날 데이터가 있는 지점 — 지점 고르기 목록이 이걸 쓴다(요청 없이 목록만으로 안다). */
  const branchesOn = useCallback(
    (iso: string) => (branchList ?? []).filter(b => b.dates.includes(iso)),
    [branchList],
  );

  const load = useCallback((iso: string, ids: string[]) => {
    if (branchList == null) return; // 아직 목록이 안 왔다 — branchList 도착 시 재호출됨
    const want = ids.filter(id =>
      !cache.has(key(iso, id)) && branchList.some(b => b.id === id && b.dates.includes(iso)));
    if (!want.length) return;
    setCache(m => {
      const n = new Map(m);
      for (const id of want) n.set(key(iso, id), 'loading');
      return n;
    });
    for (const id of want) {
      scheduleApi(id, iso)
        .then(r => setCache(m => new Map(m).set(key(iso, id), r.themes)))
        .catch(() => setCache(m => new Map(m).set(key(iso, id), 'error')));
    }
  }, [branchList, cache]);

  const get = useCallback((iso: string, branchId: string) => cache.get(key(iso, branchId)), [cache]);

  return { branchList, listErr, branchesOn, load, get };
}

export type UseDayScheduleReturn = ReturnType<typeof useDaySchedule>;
