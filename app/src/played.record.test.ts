import { beforeEach, describe, expect, it, vi } from 'vitest';

const addPlayed = vi.fn();
const idToken = vi.fn();
vi.mock('./server', () => ({ addPlayed: (...a: unknown[]) => addPlayed(...a) }));
vi.mock('./cloud', () => ({ idToken: () => idToken() }));

import { recordPlanPlayed } from './played';

beforeEach(() => {
  addPlayed.mockReset();
  idToken.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('recordPlanPlayed — 실패해도 일정 저장에 영향이 없다', () => {
  it('토큰이 없으면(로그아웃) 아무것도 보내지 않는다', async () => {
    idToken.mockResolvedValue(null);
    await recordPlanPlayed([{ name: 'A방' }], '2026-10-18');
    expect(addPlayed).not.toHaveBeenCalled();
  });
  it('토큰을 못 받아 던져도 삼킨다', async () => {
    idToken.mockRejectedValue(new Error('x'));
    await expect(recordPlanPlayed([{ name: 'A방' }], '2026-10-18')).resolves.toBeUndefined();
    expect(addPlayed).not.toHaveBeenCalled();
  });
  it('한 줄이 실패해도 나머지는 계속 보낸다', async () => {
    idToken.mockResolvedValue('tok');
    addPlayed.mockRejectedValueOnce(new Error('400')).mockResolvedValue({});
    await expect(recordPlanPlayed([{ name: 'A방' }, { name: 'B방' }], '2026-10-18')).resolves.toBeUndefined();
    expect(addPlayed).toHaveBeenCalledTimes(2);
    expect(addPlayed.mock.calls[1][0]).toMatchObject({ themeName: 'B방', source: 'PLAN', branchName: null, playedOn: '2026-10-18' });
  });
  it('기록할 이름이 없으면 토큰도 안 받는다', async () => {
    await recordPlanPlayed([{ name: '!!!' }], '2026-10-18');
    expect(idToken).not.toHaveBeenCalled();
  });
});
