import { useCallback, useEffect, useState } from 'react';

/* 화면 전환 — 왼쪽 메뉴(§4.49)의 "조합 계산 / 캘린더". 주소의 ?view= 에 싣는다.
   해시(#s=·#z= 공유 링크)는 이미 쓰고 있어서 건드리지 않고, 주소를 바꿀 때마다
   pathname + search + hash 를 그대로 다시 붙여 공유 링크가 날아가지 않게 한다.
   pushState 라 브라우저 뒤로 가기로 계산 화면에 돌아오고, 새로고침해도 그 화면이다. */
export type View = 'calc' | 'calendar';

const readView = (): View =>
  new URLSearchParams(location.search).get('view') === 'calendar' ? 'calendar' : 'calc';

export function useView(calendarOn: boolean) {
  const [raw, setRaw] = useState<View>(readView);

  useEffect(() => {
    const onPop = () => setRaw(readView());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: View) => {
    if (next === readView()) return;
    const q = new URLSearchParams(location.search);
    if (next === 'calc') q.delete('view');
    else q.set('view', next);
    const search = q.toString();
    history.pushState(null, '', location.pathname + (search ? '?' + search : '') + location.hash);
    setRaw(next);
  }, []);

  /* 계정 기능이 꺼진 배포(firebase-config 비어 있음)엔 캘린더가 없다 — 주소에
     ?view=calendar 가 남아 있어도 계산 화면으로 떨어진다. */
  const view: View = calendarOn ? raw : 'calc';
  return { view, go };
}

export type UseViewReturn = ReturnType<typeof useView>;
