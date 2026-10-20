import { useCallback, useEffect, useState } from 'react';

/* 화면 전환 — 왼쪽 메뉴(§4.49)의 "홈 / 조합 계산 / 캘린더 / 내 정보 / 멤버 관리". 주소의 ?view= 에 싣는다.
   해시(#s=·#z= 공유 링크)는 이미 쓰고 있어서 건드리지 않고, 주소를 바꿀 때마다
   pathname + search + hash 를 그대로 다시 붙여 공유 링크가 날아가지 않게 한다.
   pushState 라 브라우저 뒤로 가기로 계산 화면에 돌아오고, 새로고침해도 그 화면이다. */
/* more: 좁은 화면의 더보기(§4.60) — 로그아웃이어도 열린다. 넓은 화면엔 없어서 SchedulerPage 가 내 정보(또는 계산)로 바꾼다 */
export type View = 'home' | 'calc' | 'calendar' | 'profile' | 'members' | 'more';

/* decided: 기본 화면을 정할 정보(로그인 복원·승인 여부·일정 API 유무)가 다 왔는지. 안 왔으면 기본 경우는 null(아직 모름). */
/* profileOn: 승인 멤버이고 서버가 해 본 테마 API(§4.9)를 알 때만 "내 정보" */
type Opts = { calendarOn: boolean; isAdmin: boolean; homeOn: boolean; profileOn: boolean; decided: boolean };

const paramView = (search: string): View | null => {
  const v = new URLSearchParams(search).get('view');
  return v === 'home' || v === 'calc' || v === 'calendar' || v === 'profile' || v === 'members' || v === 'more' ? v : null;
};

/* 주소에 적힌 화면을 지금 쓸 수 있는 화면으로 바꾼다. 계정 기능이 꺼진 배포엔 캘린더도
   멤버 관리도 없고, 내 정보는 승인 멤버만, 멤버 관리는 운영진만 연다 — 아니면 계산 화면으로 떨어진다.
   ?view= 가 없으면 공유 링크(#s=·#z=)는 계산, 일정 링크(#e=)는 캘린더, 그 밖엔 홈을 쓸 수 있으면 홈이다.
   ?view=calc 는 계산 화면을 명시한다(기본이 홈이라 지우면 홈으로 간다). */
export function readView(search: string, hash: string, o: Opts): View | null {
  const v = paramView(search)
    ?? (/^#[sz]=/.test(hash) ? 'calc' : hash.startsWith('#e=') ? 'calendar' : o.decided ? 'home' : null);
  if (v === null) return null;
  if (v === 'home') return o.homeOn ? 'home' : 'calc';
  if (v === 'more') return 'more';
  if (!o.calendarOn) return 'calc';
  if (v === 'members' && !o.isAdmin) return 'calc';
  if (v === 'profile' && !o.profileOn) return 'calc';
  return v;
}

/* 기본 화면은 한 번 정해지면 고정한다 — 그 뒤 승인·일정 API 확인 상태가 흔들려도 쓰는 사람 손 밑에서
   화면이 바뀌지 않게. 다만 고정값이 홈인데 홈을 못 쓰게 되면(로그아웃·API 없음) 계산으로 보여 준다. */
export function settleDefault(fixed: View | null, computed: View | null, homeOn: boolean): View | null {
  if (fixed === null) return computed;
  return fixed === 'home' && !homeOn ? 'calc' : fixed;
}

/* 첫 화면을 정할 정보가 다 왔는지. 로그인 복원·멤버 확인(memberChecked)·일정 API 확인이 끝나기 전엔 false —
   그 전에 정하면 승인 멤버도 계산 화면으로 고정된다. memberLoading 은 쓰지 않는다(refreshMember 가 켜도 결정이 안 바뀌게). */
export function decideFirstScreen(o: {
  cloudOn: boolean; authLoading: boolean; loggedIn: boolean; memberChecked: boolean;
  member: { status: string } | null; clubApi: 'unknown' | 'on' | 'missing'; clubError: string;
}): boolean {
  if (!o.cloudOn) return true;
  if (o.authLoading) return false;
  if (!o.loggedIn) return true;
  if (!o.memberChecked) return false;
  if (o.member?.status !== 'APPROVED') return true;
  return o.clubApi !== 'unknown' || o.clubError !== '';
}

/* 화면을 옮길 때 기록을 어떻게 다룰지. 주소가 달라지면 쌓고, 같은 주소로 가는 이동(더보기 하위 화면에서 강조된 더보기 칸을 누름)은
   쌓지 않고 지금 기록의 상태만 비운다(replace) — 쌓으면 뒤로 가기가 하위 화면으로 되돌아온다. */
export function moveMode(replace: boolean, urlChanged: boolean): 'pushState' | 'replaceState' {
  return !replace && urlChanged ? 'pushState' : 'replaceState';
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

  /* replace: 기록을 쌓지 않고 바꾼다 — 넓어진 화면에서 더보기를 내 정보로 바꿀 때 */
  const go = useCallback((next: View, replace = false) => {
    const q = new URLSearchParams(location.search);
    if (next === 'home') q.delete('view');
    else q.set('view', next);
    const search = q.toString();
    const url = location.pathname + (search ? '?' + search : '') + location.hash;
    history[moveMode(replace, url !== location.pathname + location.search + location.hash)](null, '', url);
    setRaw({ v: next, hash: '' });
  }, []);

  /* 운영진 여부·승인 여부는 로그인 뒤 서버에서 늦게 온다 — raw 는 그대로 두고 보이는 화면만 걸러서,
     ?view=members 로 열었을 때 확인되는 순간 그 화면이 뜬다. */
  const [fixed, setFixed] = useState<View | null>(null);
  const computed = readView(raw.v ? `?view=${raw.v}` : '', raw.hash, o);
  if (raw.v === null && fixed === null && computed !== null) setFixed(computed);
  const view = raw.v === null ? settleDefault(fixed, computed, o.homeOn) : computed;
  return { view, go };
}

export type UseViewReturn = ReturnType<typeof useView>;
