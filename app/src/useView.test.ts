import { describe, expect, it } from 'vitest';
import { readView } from './useView';

const on = { calendarOn: true, isAdmin: false, homeOn: true };

describe('readView', () => {
  it('승인 멤버는 기본이 홈', () => {
    expect(readView('', '', on)).toBe('home');
  });
  it('승인 전·로그아웃은 기본이 계산', () => {
    expect(readView('', '', { ...on, homeOn: false })).toBe('calc');
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
    expect(readView('?view=home', '', { ...on, homeOn: false })).toBe('calc');
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
    const off = { calendarOn: false, isAdmin: true, homeOn: false };
    expect(readView('?view=members', '', off)).toBe('calc');
    expect(readView('?view=calendar', '', off)).toBe('calc');
    expect(readView('', '#e=3', off)).toBe('calc');
  });
  it('calendar 는 계정 기능만 켜져 있으면 승인·운영진 여부와 상관없이 그대로', () => {
    expect(readView('?view=calendar', '', { calendarOn: true, isAdmin: false, homeOn: false })).toBe('calendar');
  });
});
