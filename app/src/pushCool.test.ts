import { describe, expect, it } from 'vitest';
import { coolLeft, testLabel } from './pushCool';

describe('테스트 알림 쉬는 시간', () => {
  it('남은 초는 올림, 지나면 0', () => {
    expect(coolLeft(60_000, 0)).toBe(60);
    expect(coolLeft(60_000, 59_001)).toBe(1);
    expect(coolLeft(60_000, 60_000)).toBe(0);
    expect(coolLeft(0, 5)).toBe(0);
  });
  it('문구', () => {
    expect(testLabel(true, 30)).toBe('보내는 중…');
    expect(testLabel(false, 42)).toBe('42초 뒤 다시 보낼 수 있어요');
    expect(testLabel(false, 0)).toBe('테스트 알림 보내기');
  });
});
