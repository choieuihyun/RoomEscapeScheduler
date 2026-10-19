import { describe, expect, it } from 'vitest';
import { readView, settleDefault } from './useView';

const on = { calendarOn: true, isAdmin: false, homeOn: true, decided: true };

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
  it('운영진이면 members', () => {
    expect(readView('?view=members', '', { ...on, isAdmin: true })).toBe('members');
  });
  it('계정 기능(캘린더)이 꺼져 있으면 members·calendar·일정 링크 모두 계산으로', () => {
    const off = { calendarOn: false, isAdmin: true, homeOn: false, decided: true };
    expect(readView('?view=members', '', off)).toBe('calc');
    expect(readView('?view=calendar', '', off)).toBe('calc');
    expect(readView('', '#e=3', off)).toBe('calc');
  });
  it('calendar 는 계정 기능만 켜져 있으면 승인·운영진 여부와 상관없이 그대로', () => {
    expect(readView('?view=calendar', '', { calendarOn: true, isAdmin: false, homeOn: false, decided: true })).toBe('calendar');
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
