import type { View } from './useView';

/* 좁은 화면(≤900px)의 아래 탭(§4.59) — 홈 · 계산 · 캘린더 · 빈자리 · 내 정보.
   칸마다 왼쪽 메뉴와 같은 조건으로만 보이고, 멤버 관리는 내 정보 화면 안으로 들어간다.
   운영진인데 내 정보가 없으면(서버가 해 본 테마 API 를 모름) 그 자리에 '멤버' 칸을 둬
   멤버 관리로 가는 길을 남긴다. 칸이 2개 미만이면 빈 배열 — 위쪽 막대에 메뉴를 그대로 둔다. */
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
  homeOn: boolean; cloudOn: boolean; profileOn: boolean; isAdmin: boolean; gated: boolean;
  pendingCount: number; watchCount: number; view: View | null;
}): BottomTab[] {
  const tabs: BottomTab[] = [];
  const pending = o.isAdmin && o.pendingCount > 0 ? o.pendingCount : undefined;
  if (o.homeOn) tabs.push({ id: 'home', label: '홈', on: o.view === 'home' });
  tabs.push({ id: 'calc', label: '계산', on: o.view === 'calc' });
  if (o.cloudOn) {
    tabs.push({ id: 'calendar', label: '캘린더', on: o.view === 'calendar', gated: o.gated });
    tabs.push({ id: 'watches', label: '빈자리', on: false, count: o.watchCount, gated: o.gated });
  }
  if (o.profileOn) tabs.push({ id: 'profile', label: '내 정보', on: o.view === 'profile' || o.view === 'members', pending });
  else if (o.isAdmin) tabs.push({ id: 'members', label: '멤버', on: o.view === 'members', pending });
  return tabs.length < 2 ? [] : tabs;
}
