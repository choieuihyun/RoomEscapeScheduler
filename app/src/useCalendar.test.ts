import { describe, expect, it } from 'vitest';
import { toFilter } from './useCalendar';

describe('toFilter — 저장된 캘린더 필터 읽기', () => {
  it('동호회 일정 전에 저장한 값(club 없음)도 읽고 club 은 켠다', () => {
    expect(toFilter({ wish: false, done: true, watch: false }))
      .toEqual({ wish: false, done: true, watch: false, club: true });
  });

  it('club 을 끈 값은 그대로', () => {
    expect(toFilter({ wish: true, done: true, watch: true, club: false }).club).toBe(false);
  });

  it('모양이 다르면 전부 켠 기본값', () => {
    for (const v of [null, 'x', { wish: 1 }, { wish: true, done: true }]) {
      expect(toFilter(v)).toEqual({ wish: true, done: true, watch: true, club: true });
    }
  });
});
