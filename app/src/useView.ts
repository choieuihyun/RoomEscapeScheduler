import { useCallback, useEffect, useState } from 'react';

/* 화면 전환 — 왼쪽 메뉴(§4.49)의 "조합 계산 / 캘린더 / 멤버 관리". 주소의 ?view= 에 싣는다.
   해시(#s=·#z= 공유 링크)는 이미 쓰고 있어서 건드리지 않고, 주소를 바꿀 때마다
   pathname + search + hash 를 그대로 다시 붙여 공유 링크가 날아가지 않게 한다.
   pushState 라 브라우저 뒤로 가기로 계산 화면에 돌아오고, 새로고침해도 그 화면이다. */
export type View = 'calc' | 'calendar' | 'members';

const rawView = (search: string): View => {
  const v = new URLSearchParams(search).get('view');
  return v === 'calendar' || v === 'members' ? v : 'calc';
};

/* 주소에 적힌 화면을 지금 쓸 수 있는 화면으로 바꾼다. 계정 기능이 꺼진 배포엔 캘린더도
   멤버 관리도 없고, 멤버 관리는 운영진만 연다 — 아니면 계산 화면으로 떨어진다. */
export function readView(search: string, calendarOn: boolean, isAdmin: boolean): View {
  const v = rawView(search);
  if (!calendarOn) return 'calc';
  if (v === 'members' && !isAdmin) return 'calc';
  return v;
}

export function useView(calendarOn: boolean, isAdmin: boolean) {
  const [raw, setRaw] = useState<View>(() => rawView(location.search));

  useEffect(() => {
    const onPop = () => setRaw(rawView(location.search));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: View) => {
    if (next === rawView(location.search)) return;
    const q = new URLSearchParams(location.search);
    if (next === 'calc') q.delete('view');
    else q.set('view', next);
    const search = q.toString();
    history.pushState(null, '', location.pathname + (search ? '?' + search : '') + location.hash);
    setRaw(next);
  }, []);

  /* 운영진 여부는 로그인 뒤 서버에서 늦게 온다 — raw 는 그대로 두고 보이는 화면만 걸러서,
     ?view=members 로 열었을 때 확인되는 순간 그 화면이 뜬다. */
  const view = readView(`?view=${raw}`, calendarOn, isAdmin);
  return { view, go };
}

export type UseViewReturn = ReturnType<typeof useView>;
