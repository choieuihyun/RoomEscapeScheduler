/**
 * F-16 벨 판정(buildWatchControl.toggle) — "왜 안 눌리는지" 를 말로 알려주는 자리.
 * 예전에는 로그인 전·한도 초과일 때 버튼을 disabled 로 막고 이유를 title 툴팁에만
 * 적었는데, 폰에는 hover 가 없어 이유를 볼 방법이 없었다(그리고 opacity .35 라
 * 아이콘 자체가 거의 안 보였다). 이 테스트가 그 회귀를 잡는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWatchControl, type UseWatchesReturn } from './useWatches';

function fake(over: Partial<UseWatchesReturn> = {}): UseWatchesReturn {
  return {
    watches: [], limit: 3, busyIds: new Set(), err: '', pushNote: '',
    reload: vi.fn(), add: vi.fn(), remove: vi.fn(), removeBySlot: vi.fn(),
    watchIdForSlot: () => undefined, open: false, openModal: vi.fn(), close: vi.fn(),
    ...over,
  } as unknown as UseWatchesReturn;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('buildWatchControl().toggle — 막지 않고 말한다', () => {
  it('로그인 전에는 알림 대신 이유를 띄운다', () => {
    const alert = vi.fn(); vi.stubGlobal('alert', alert);
    const w = fake();
    buildWatchControl(w, false).toggle(172);
    expect(w.add).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toContain('로그인');
  });

  it('3개를 다 걸어 두면 "최대 3개" 를 말하고 등록하지 않는다', () => {
    const alert = vi.fn(); vi.stubGlobal('alert', alert);
    const w = fake({ watches: [{ id: 1 }, { id: 2 }, { id: 3 }] as UseWatchesReturn['watches'] });
    buildWatchControl(w, true).toggle(172);
    expect(w.add).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toContain('최대 3개');
  });

  it('한도 안이면 조용히 등록한다', () => {
    const alert = vi.fn(); vi.stubGlobal('alert', alert);
    const w = fake({ watches: [{ id: 1 }] as UseWatchesReturn['watches'] });
    buildWatchControl(w, true).toggle(172);
    expect(w.add).toHaveBeenCalledWith(172);
    expect(alert).not.toHaveBeenCalled();
  });

  it('이미 감시 중인 자리는 한도와 무관하게 해제된다', () => {
    const alert = vi.fn(); vi.stubGlobal('alert', alert);
    const w = fake({
      watches: [{ id: 1 }, { id: 2 }, { id: 3 }] as UseWatchesReturn['watches'],
      watchIdForSlot: (slotId: number) => (slotId === 172 ? 9 : undefined),
    });
    buildWatchControl(w, true).toggle(172);
    expect(w.remove).toHaveBeenCalledWith(9);
    expect(alert).not.toHaveBeenCalled();
  });
});
