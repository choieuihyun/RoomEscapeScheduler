import { describe, expect, it, vi } from 'vitest';
import { retryImport } from './lazyRetry';
import { LazyBoundary } from './components/LazyBoundary';

describe('retryImport', () => {
  it('첫 시도가 되면 한 번만 부른다', async () => {
    const f = vi.fn().mockResolvedValue(1);
    expect(await retryImport(f, 0)).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('실패하면 한 번 더 해서 되면 받는다', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(2);
    expect(await retryImport(f, 0)).toBe(2);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('두 번 다 실패하면 던진다', async () => {
    const f = vi.fn().mockRejectedValue(new Error('x'));
    await expect(retryImport(f, 0)).rejects.toThrow('x');
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('LazyBoundary', () => {
  it('오류를 받으면 실패 상태로 바뀐다', () => {
    expect(LazyBoundary.getDerivedStateFromError()).toEqual({ failed: true });
  });
});
