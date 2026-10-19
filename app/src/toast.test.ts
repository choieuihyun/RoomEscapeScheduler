import { describe, expect, it } from 'vitest';
import { MAX_TOASTS, pushToast } from './toast';

describe('pushToast', () => {
  it('셋까지는 쌓기만', () => {
    expect(pushToast([1, 2], 3)).toEqual({ items: [1, 2, 3], evicted: [] });
  });
  it('넷째가 들어오면 가장 오래된 것이 밀려난다(onClose evicted 대상)', () => {
    expect(MAX_TOASTS).toBe(3);
    expect(pushToast([1, 2, 3], 4)).toEqual({ items: [2, 3, 4], evicted: [1] });
  });
});
