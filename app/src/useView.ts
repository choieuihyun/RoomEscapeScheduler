import { useCallback, useEffect, useState } from 'react';

/* 화면 전환 — 왼쪽 메뉴(§4.49)의 "홈 / 조합 계산 / 캘린더 / 멤버 관리". 주소의 ?view= 에 싣는다.
   해시(#s=·#z= 공유 링크)는 이미 쓰고 있어서 건드리지 않고, 주소를 바꿀 때마다
   pathname + search + hash 를 그대로 다시 붙여 공유 링크가 날아가지 않게 한다.
   pushState 라 브라우저 뒤로 가기로 계산 화면에 돌아오고, 새로고침해도 그 화면이다. */
export type View = 'home' | 'calc' | 'calendar' | 'members';

/* decided: 기본 화면을 정할 정보(로그인 복원·승인 여부·일정 API 유무)가 다 왔는지. 안 왔으면 기본 경우는 null(아직 모름). */
type Opts = { calendarOn: boolean; isAdmin: boolean; homeOn: boolean; decided: boolean };

const paramView = (search: string): View | null => {
  const v = new URLSearchParams(search).get('view');
  return v === 'home' || v === 'calc' || v === 'calendar' || v === 'members' ? v : null;
};

/* 주소에 적힌 화면을 지금 쓸 수 있는 화면으로 바꾼다. 계정 기능이 꺼진 배포엔 캘린더도
   멤버 관리도 없고, 멤버 관리는 운영진만 연다 — 아니면 계산 화면으로 떨어진다.
   ?view= 가 없으면 공유 링크(#s=·#z=)는 계산, 일정 링크(#e=)는 캘린더, 그 밖엔 홈을 쓸 수 있으면 홈이다.
   ?view=calc 는 계산 화면을 명시한다(기본이 홈이라 지우면 홈으로 간다). */
export function readView(search: string, hash: string, o: Opts): View | null {
  const v = paramView(search)
    ?? (/^#[sz]=/.test(hash) ? 'calc' : hash.startsWith('#e=') ? 'calendar' : o.decided ? 'home' : null);
  if (v === null) return null;
  if (v === 'home') return o.homeOn ? 'home' : 'calc';
  if (!o.calendarOn) return 'calc';
  if (v === 'members' && !o.isAdmin) return 'calc';
  return v;
}

export function useView(o: Opts) {
  /* v 가 null 이면 주소에 ?view= 가 없는 것 — 그때만 hash 로 첫 화면을 고른다.
     go() 로 직접 옮긴 뒤엔 hash 를 무시한다(공유 링크 주소에서 홈 메뉴를 눌러도 홈으로 간다). */
  const [raw, setRaw] = useState<{ v: View | null; hash: string }>(
    () => ({ v: paramView(location.search), hash: location.hash }));

  useEffect(() => {
    const onPop = () => setRaw({ v: paramView(location.search), hash: location.hash });
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: View) => {
    const q = new URLSearchParams(location.search);
    if (next === 'home') q.delete('view');
    else q.set('view', next);
    const search = q.toString();
    const url = location.pathname + (search ? '?' + search : '') + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
    setRaw({ v: next, hash: '' });
  }, []);

  /* 운영진 여부·승인 여부는 로그인 뒤 서버에서 늦게 온다 — raw 는 그대로 두고 보이는 화면만 걸러서,
     ?view=members 로 열었을 때 확인되는 순간 그 화면이 뜬다. */
  const view = readView(raw.v ? `?view=${raw.v}` : '', raw.hash, o);
  return { view, go };
}

export type UseViewReturn = ReturnType<typeof useView>;
