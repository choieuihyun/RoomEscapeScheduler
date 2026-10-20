import { describe, expect, it } from 'vitest';
import { bottomTabs } from './bottomTabs';

const member = {
  homeOn: true, cloudOn: true, profileOn: true, isAdmin: false, gated: false,
  pendingCount: 0, watchCount: 2, view: 'home' as const,
};
const ids = (t: ReturnType<typeof bottomTabs>) => t.map(x => x.id);
const onId = (t: ReturnType<typeof bottomTabs>) => t.filter(x => x.on).map(x => x.id);

describe('bottomTabs', () => {
  it('승인 멤버는 다섯 칸 — 홈·계산·캘린더·빈자리·내 정보, 지금 화면만 강조', () => {
    const t = bottomTabs(member);
    expect(ids(t)).toEqual(['home', 'calc', 'calendar', 'watches', 'profile']);
    expect(t.map(x => x.label)).toEqual(['홈', '계산', '캘린더', '빈자리', '내 정보']);
    expect(onId(t)).toEqual(['home']);
    expect(t.find(x => x.id === 'watches')?.count).toBe(2);
    expect(t.find(x => x.id === 'profile')?.pending).toBeUndefined();
  });

  it('운영진이고 승인 대기 2명이면 내 정보 칸에 점', () => {
    const t = bottomTabs({ ...member, isAdmin: true, pendingCount: 2 });
    expect(ids(t)).toEqual(['home', 'calc', 'calendar', 'watches', 'profile']);
    expect(t.find(x => x.id === 'profile')?.pending).toBe(2);
  });

  it('승인 대기는 운영진에게만 — 멤버는 숫자가 와도 점이 없다', () => {
    const t = bottomTabs({ ...member, pendingCount: 3 });
    expect(t.find(x => x.id === 'profile')?.pending).toBeUndefined();
  });

  it('운영진인데 내 정보가 없으면(해 본 테마 API 모름) 그 자리에 멤버 칸', () => {
    const t = bottomTabs({ ...member, isAdmin: true, profileOn: false, pendingCount: 1, view: 'members' });
    expect(ids(t)).toEqual(['home', 'calc', 'calendar', 'watches', 'members']);
    expect(t.at(-1)?.label).toBe('멤버');
    expect(t.at(-1)?.pending).toBe(1);
    expect(onId(t)).toEqual(['members']);
  });

  it('멤버 관리 화면에선 내 정보 칸이 강조된다', () => {
    expect(onId(bottomTabs({ ...member, isAdmin: true, view: 'members' }))).toEqual(['profile']);
  });

  it('계정 기능이 없으면(계산만) 빈 배열 — 위쪽 막대에 메뉴를 그대로 둔다', () => {
    expect(bottomTabs({ ...member, homeOn: false, cloudOn: false, profileOn: false, view: 'calc' })).toEqual([]);
  });

  it('로그아웃은 왼쪽 메뉴와 같이 계산·캘린더·빈자리 세 칸', () => {
    const t = bottomTabs({ ...member, homeOn: false, profileOn: false, watchCount: 0, view: 'calc' });
    expect(ids(t)).toEqual(['calc', 'calendar', 'watches']);
    expect(onId(t)).toEqual(['calc']);
  });

  it('승인 전이면 캘린더·빈자리 칸이 gated', () => {
    const t = bottomTabs({ ...member, homeOn: false, profileOn: false, gated: true, view: 'calc' });
    expect(t.filter(x => x.gated).map(x => x.id)).toEqual(['calendar', 'watches']);
  });
});
