import type { View } from './useView';

/* 좁은 화면(≤900px)의 아래 탭(§4.59·§4.60) — 홈 · 계산 · 캘린더 · 빈자리 · 더보기.
   앞 네 칸은 왼쪽 메뉴와 같은 조건으로만 보이고, 맨 오른쪽 더보기는 로그아웃이어도 늘 있다
   (로그인·다크 모드·사용법이 그 안에 있다). 내 정보·멤버 관리는 더보기 안으로 들어가서
   그 화면들에 있을 때도 더보기 칸이 강조된다. 칸이 2개 미만이면 빈 배열 — 더보기가 늘 있어 실제로는 생기지 않는다. */
export type BottomTabId = View | 'watches';
export interface BottomTab {
  id: BottomTabId;
  label: string;
  /* 지금 화면(aria-current) */
  on: boolean;
  /* 빈자리 칸의 숫자(0 이면 안 보임) */
  count?: number;
  /* 운영진의 승인 대기 수 — 작은 점 */
  pending?: number;
  /* 승인 전 — 누르면 지금처럼 같은 동작, 흐리게만 */
  gated?: boolean;
}

export function bottomTabs(o: {
  homeOn: boolean; cloudOn: boolean; isAdmin: boolean; gated: boolean;
  pendingCount: number; watchCount: number; view: View | null;
}): BottomTab[] {
  const tabs: BottomTab[] = [];
  const pending = o.isAdmin && o.pendingCount > 0 ? o.pendingCount : undefined;
  if (o.homeOn) tabs.push({ id: 'home', label: '홈', on: o.view === 'home' });
  tabs.push({ id: 'calc', label: '시간표', on: o.view === 'calc' });
  if (o.cloudOn) {
    tabs.push({ id: 'calendar', label: '캘린더', on: o.view === 'calendar', gated: o.gated });
    tabs.push({ id: 'watches', label: '빈자리', on: false, count: o.watchCount, gated: o.gated });
  }
  tabs.push({ id: 'more', label: '더보기', on: o.view === 'more' || o.view === 'profile' || o.view === 'members', pending });
  return tabs.length < 2 ? [] : tabs;
}
