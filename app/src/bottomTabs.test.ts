import { describe, expect, it } from 'vitest';
import { bottomTabs } from './bottomTabs';

const member = {
  homeOn: true, cloudOn: true, isAdmin: false, gated: false,
  pendingCount: 0, watchCount: 2, view: 'home' as const,
};
const ids = (t: ReturnType<typeof bottomTabs>) => t.map(x => x.id);
const onId = (t: ReturnType<typeof bottomTabs>) => t.filter(x => x.on).map(x => x.id);

describe('bottomTabs', () => {
  it('승인 멤버는 다섯 칸 — 홈·시간표·캘린더·빈자리·더보기, 지금 화면만 강조', () => {
    const t = bottomTabs(member);
    expect(ids(t)).toEqual(['home', 'calc', 'calendar', 'watches', 'more']);
    expect(t.map(x => x.label)).toEqual(['홈', '시간표', '캘린더', '빈자리', '더보기']);
    expect(onId(t)).toEqual(['home']);
    expect(t.find(x => x.id === 'watches')?.count).toBe(2);
    expect(t.at(-1)?.pending).toBeUndefined();
  });

  it('운영진이고 승인 대기 2명이면 더보기 칸에 점', () => {
    const t = bottomTabs({ ...member, isAdmin: true, pendingCount: 2 });
    expect(ids(t)).toEqual(['home', 'calc', 'calendar', 'watches', 'more']);
    expect(t.find(x => x.id === 'more')?.pending).toBe(2);
  });

  it('승인 대기는 운영진에게만 — 멤버는 숫자가 와도 점이 없다', () => {
    const t = bottomTabs({ ...member, pendingCount: 3 });
    expect(t.find(x => x.id === 'more')?.pending).toBeUndefined();
  });

  it('더보기·내 정보·멤버 관리·멤버 목록·랭킹 화면에선 더보기 칸이 강조된다', () => {
    for (const view of ['more', 'profile', 'members', 'people', 'ranking'] as const) {
      expect(onId(bottomTabs({ ...member, isAdmin: true, view }))).toEqual(['more']);
    }
  });

  it('로그아웃은 계산·캘린더·빈자리·더보기 네 칸 — 더보기는 늘 있다', () => {
    const t = bottomTabs({ ...member, homeOn: false, watchCount: 0, view: 'calc' });
    expect(ids(t)).toEqual(['calc', 'calendar', 'watches', 'more']);
    expect(onId(t)).toEqual(['calc']);
  });

  it('계정 기능이 꺼진 배포도 계산·더보기 두 칸(다크 모드·사용법이 더보기에 있다)', () => {
    const t = bottomTabs({ ...member, homeOn: false, cloudOn: false, view: 'calc' });
    expect(ids(t)).toEqual(['calc', 'more']);
  });

  it('승인 전이면 캘린더·빈자리 칸이 gated', () => {
    const t = bottomTabs({ ...member, homeOn: false, gated: true, view: 'calc' });
    expect(t.filter(x => x.gated).map(x => x.id)).toEqual(['calendar', 'watches']);
  });
});
