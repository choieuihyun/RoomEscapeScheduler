import { describe, expect, it } from 'vitest';
import { decideFirstScreen, moveMode, readView, settleDefault } from './useView';

const on = { calendarOn: true, isAdmin: false, homeOn: true, profileOn: true, decided: true };

describe('readView', () => {
  it('승인 멤버는 기본이 홈', () => {
    expect(readView('', '', on)).toBe('home');
  });
  it('승인 전·로그아웃은 기본이 계산', () => {
    expect(readView('', '', { ...on, homeOn: false, decided: true })).toBe('calc');
  });
  it('공유 링크는 홈이어도 계산으로', () => {
    expect(readView('', '#s=AAA', on)).toBe('calc');
    expect(readView('', '#z=AAA', on)).toBe('calc');
  });
  it('일정 링크는 캘린더로', () => {
    expect(readView('', '#e=12', on)).toBe('calendar');
  });
  it('?view=calc 는 홈 멤버여도 계산', () => {
    expect(readView('?view=calc', '', on)).toBe('calc');
  });
  it('홈이 꺼졌는데 ?view=home 이면 계산', () => {
    expect(readView('?view=home', '', { ...on, homeOn: false, decided: true })).toBe('calc');
  });
  it('?view=home 은 해시가 공유 링크여도 홈', () => {
    expect(readView('?view=home', '#s=AAA', on)).toBe('home');
  });
  it('운영진이 아니면 ?view=members 는 계산으로', () => {
    expect(readView('?view=members', '', on)).toBe('calc');
  });
  it('멤버 목록·랭킹(§4.11)은 켜졌을 때만, 아니면 계산으로', () => {
    expect(readView('?view=people', '', { ...on, peopleOn: true })).toBe('people');
    expect(readView('?view=ranking', '', { ...on, peopleOn: true, rankOn: true })).toBe('ranking');
    expect(readView('?view=people', '', on)).toBe('calc');
    expect(readView('?view=ranking', '', { ...on, peopleOn: true, rankOn: false })).toBe('calc');
    expect(readView('?view=nope', '', on)).toBe('home');
  });
  it('운영진이면 members', () => {
    expect(readView('?view=members', '', { ...on, isAdmin: true })).toBe('members');
  });
  it('계정 기능(캘린더)이 꺼져 있으면 members·calendar·일정 링크 모두 계산으로', () => {
    const off = { calendarOn: false, isAdmin: true, homeOn: false, profileOn: false, decided: true };
    expect(readView('?view=members', '', off)).toBe('calc');
    expect(readView('?view=calendar', '', off)).toBe('calc');
    expect(readView('', '#e=3', off)).toBe('calc');
  });
  it('calendar 는 계정 기능만 켜져 있으면 승인·운영진 여부와 상관없이 그대로', () => {
    expect(readView('?view=calendar', '', { calendarOn: true, isAdmin: false, homeOn: false, profileOn: false, decided: true })).toBe('calendar');
  });
  it('승인 멤버인데 아직 모르면 null', () => {
    expect(readView('', '', { ...on, homeOn: false, decided: false })).toBeNull();
  });
  it('아직 몰라도 #s= 면 계산', () => {
    expect(readView('', '#s=AAA', { ...on, decided: false })).toBe('calc');
  });
  it('아직 몰라도 ?view=calendar 면 캘린더', () => {
    expect(readView('?view=calendar', '', { ...on, decided: false })).toBe('calendar');
  });
  it('decided 이고 homeOn 이 꺼졌으면 계산', () => {
    expect(readView('', '', { ...on, homeOn: false, decided: true })).toBe('calc');
  });
  it('?view=profile 은 승인 멤버(내 정보 API 있음)면 내 정보', () => {
    expect(readView('?view=profile', '', on)).toBe('profile');
  });
  it('?view=profile 은 승인 전·로그아웃·API 404(profileOn 꺼짐)면 계산', () => {
    expect(readView('?view=profile', '', { ...on, homeOn: false, profileOn: false })).toBe('calc');
    expect(readView('?view=profile', '', { ...on, profileOn: false })).toBe('calc');
  });
  it('?view=more 는 로그아웃·계정 기능 꺼짐이어도 더보기', () => {
    expect(readView('?view=more', '', { ...on, homeOn: false, profileOn: false })).toBe('more');
    expect(readView('?view=more', '', { calendarOn: false, isAdmin: false, homeOn: false, profileOn: false, decided: false })).toBe('more');
  });
  it('계정 기능이 꺼져 있으면 ?view=profile 도 계산', () => {
    expect(readView('?view=profile', '', { calendarOn: false, isAdmin: false, homeOn: false, profileOn: true, decided: true })).toBe('calc');
  });
});

describe('settleDefault', () => {
  it('처음 calc 로 정해진 뒤 homeOn 이 true 가 돼도 calc', () => {
    expect(settleDefault('calc', 'home', true)).toBe('calc');
  });
  it('고정값이 home 인데 homeOn 이 false 면 calc', () => {
    expect(settleDefault('home', 'home', false)).toBe('calc');
  });
  it('고정값이 없으면 computed 그대로', () => {
    expect(settleDefault(null, 'home', true)).toBe('home');
    expect(settleDefault(null, null, false)).toBeNull();
  });
});

describe('decideFirstScreen', () => {
  const base = { cloudOn: true, authLoading: false, loggedIn: true, memberChecked: true,
    member: { status: 'APPROVED' }, clubApi: 'on' as const, clubError: '' };
  it('로그인했는데 멤버 확인 전이면 false', () => {
    expect(decideFirstScreen({ ...base, memberChecked: false, member: null })).toBe(false);
  });
  it('승인 멤버인데 api 가 unknown 이면 false', () => {
    expect(decideFirstScreen({ ...base, clubApi: 'unknown' })).toBe(false);
  });
  it('승인 멤버이고 api 가 on 이면 true', () => {
    expect(decideFirstScreen(base)).toBe(true);
  });
  it('승인 멤버이고 error 가 있으면 true', () => {
    expect(decideFirstScreen({ ...base, clubApi: 'unknown', clubError: '로그인해 주세요.' })).toBe(true);
  });
  it('로그아웃이면 true', () => {
    expect(decideFirstScreen({ ...base, loggedIn: false, memberChecked: false, member: null })).toBe(true);
  });
  it('승인 대기면 true', () => {
    expect(decideFirstScreen({ ...base, member: { status: 'PENDING' }, clubApi: 'unknown' })).toBe(true);
  });
  it('로그인 복원 중이면 false, 계정 기능이 꺼졌으면 true', () => {
    expect(decideFirstScreen({ ...base, authLoading: true })).toBe(false);
    expect(decideFirstScreen({ ...base, cloudOn: false })).toBe(true);
  });
});

describe('moveMode', () => {
  it('주소가 달라지면 기록을 쌓는다', () => {
    expect(moveMode(false, true)).toBe('pushState');
  });
  it('같은 주소인데 하위 화면 기록이 있으면(더보기 하위 화면 → 더보기) 한 칸 뒤로 — 목록 기록이 하나만 남는다', () => {
    expect(moveMode(false, false, true)).toBe('back');
  });
  it('같은 주소에 하위 화면 기록이 없으면 쌓지 않고 바꾼다', () => {
    expect(moveMode(false, false)).toBe('replaceState');
  });
  it('replace 요청이면 늘 바꾼다', () => {
    expect(moveMode(true, true)).toBe('replaceState');
  });
});
