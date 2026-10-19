import { describe, expect, it } from 'vitest';
import { readView } from './useView';

describe('readView', () => {
  it('?view 가 없으면 calc', () => {
    expect(readView('', true, true)).toBe('calc');
  });
  it('운영진이 아니면 ?view=members 는 calc 로', () => {
    expect(readView('?view=members', true, false)).toBe('calc');
  });
  it('운영진이면 members', () => {
    expect(readView('?view=members', true, true)).toBe('members');
  });
  it('계정 기능(캘린더)이 꺼져 있으면 members·calendar 모두 calc 로', () => {
    expect(readView('?view=members', false, true)).toBe('calc');
    expect(readView('?view=calendar', false, true)).toBe('calc');
  });
  it('calendar 는 계정 기능만 켜져 있으면 운영진 여부와 상관없이 그대로', () => {
    expect(readView('?view=calendar', true, false)).toBe('calendar');
  });
});
