/* 멤버 카드 공유 상태(clubStore) — 로그아웃·사람 바뀜 때 버리기, 진행 중 요청 합치기(사람별), 위시가 바뀌면 묶음 낡음 표시 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Resolve = (v: unknown) => void;
const pending: Record<string, Resolve[]> = { members: [], groups: [] };
const calls = { members: 0, groups: 0 };
const later = (k: 'members' | 'groups') => () => { calls[k]++; return new Promise((r) => { pending[k].push(r); }); };

vi.mock('./cloud', () => ({ idToken: async () => 'T' }));
vi.mock('./server', () => ({
  listClubMembers: later('members'),
  listClubWishes: later('groups'),
  listMyWishes: async () => [],
  getPayInfo: async () => ({ bankText: null, kakaopayUrl: null }),
  addWish: async (b: { themeName: string }) => ({ id: 9, themeKey: null, themeName: b.themeName, branchName: null, storeName: null, createdAt: '' }),
  deleteWish: async () => undefined,
  isMissingApi: () => false,
  sayClub: () => '',
  getSettlement: async () => null, myPastEvents: async () => ({ events: [] }), putPayInfo: async () => null,
}));
vi.mock('./components/WishToggle', () => ({ WishToggle: () => null }));
vi.mock('./components/MemberLink', () => ({ MemberLink: () => null }));
vi.mock('./components/PayInfo', () => ({ PayCard: () => null, PayForm: () => null }));

const M = (uid: string) => ({ uid, nickname: '닉' + uid, profile: null });
/* startClub 직후 한 틱 쉰다 — vitest 에서 같은 틱에 './cloud' 를 여러 번 동적으로 가져오면 흉내 대신 진짜 모듈이 섞여 왔다(시험 환경 문제) */
const tick = () => new Promise((r) => setTimeout(r, 0));

let S: typeof import('./clubStore');
beforeEach(async () => {
  vi.resetModules();
  pending.members = []; pending.groups = []; calls.members = 0; calls.groups = 0;
  S = await import('./clubStore');
});
afterEach(() => { S.stopClub(); });

describe('멤버 목록 — 진행 중 요청은 사람별', () => {
  it('같은 사람이 두 번 부르면 요청 하나를 같이 기다린다', async () => {
    S.startClub('u1', () => {}, false);
    await tick();
    const a = S.reloadMembers(true), b = S.reloadMembers(true);
    await vi.waitFor(() => expect(calls.members).toBe(1));
    await tick();
    expect(calls.members).toBe(1);
    pending.members[0]([M('u1'), M('u2')]);
    await Promise.all([a, b]);
    expect(S.clubState().members?.has('u2')).toBe(true);
  });
  it('받는 중에 사람이 바뀌면 새 사람은 새로 받고, 옛 요청의 답은 버린다', async () => {
    S.startClub('u1', () => {}, false);
    await tick();
    void S.reloadMembers(true);
    await vi.waitFor(() => expect(calls.members).toBe(1));
    S.stopClub();
    S.startClub('u9', () => {}, false);
    await tick();
    void S.reloadMembers(true);
    await vi.waitFor(() => expect(calls.members).toBe(2));
    pending.members[0]([M('old')]); // 옛 사람 것 — 버린다
    await tick();
    expect(S.clubState().members).toBeNull();
    pending.members[1]([M('u9')]);
    await vi.waitFor(() => expect([...(S.clubState().members?.keys() ?? [])]).toEqual(['u9']));
  });
});

describe('로그아웃(stopClub) — 받아 둔 것을 버린다', () => {
  it('멤버 목록·위시 묶음·남의 해 본 테마 캐시·내 uid 가 비고, 이름은 글자로', async () => {
    S.startClub('u1', () => {}, false);
    S.keepMembers([M('u1'), M('u2')] as never);
    S.keepGroups([]);
    S.playedCache.set('u1|u2', { at: Date.now(), v: 'missing' });
    expect(S.nameState(S.clubState(), 'u1')).toBe('me');
    S.stopClub();
    const s = S.clubState();
    expect(s.uid).toBe('');
    expect(s.members).toBeNull();
    expect(s.groups).toBeNull();
    expect(S.playedCache.size).toBe(0);
    expect(S.nameState(s, 'u1')).toBe('text'); // 옛 사람 이름이 "내 프로필"로 뜨지 않는다
  });
  it('다른 사람으로 바로 시작해도(startClub) 옛 캐시를 버린다', () => {
    S.startClub('u1', () => {}, false);
    S.playedCache.set('u1|u2', { at: Date.now(), v: [] });
    S.startClub('u2', () => {}, false);
    expect(S.playedCache.size).toBe(0);
  });
});

describe('위시 묶음', () => {
  it('받는 중에 또 부르면 요청 하나를 같이 기다린다', async () => {
    S.startClub('u1', () => {}, false);
    await tick();
    const a = S.loadGroups(), b = S.loadGroups();
    await vi.waitFor(() => expect(calls.groups).toBe(1));
    await tick();
    expect(calls.groups).toBe(1);
    pending.groups[0]([]);
    await Promise.all([a, b]);
    expect(S.clubState().groups?.list).toEqual([]);
  });
  it('내 위시를 바꾸면 받아 둔 묶음은 값은 두고 낡음 표시 — 다음에 새로 받는다', async () => {
    S.startClub('u1', () => {}, false);
    await tick();
    S.keepGroups([{ themeKey: null, themeName: '셜록', branchName: null, storeName: null, wanters: [], playedBy: [] }]);
    await S.loadGroups();
    expect(calls.groups).toBe(0); // 5분 안 — 그대로
    expect(await S.addWishFor({ themeKey: null, themeName: '월야애담', branchName: null })).toBe(true);
    expect(S.clubState().groups?.list).toHaveLength(1);
    expect(S.clubState().groups?.at).toBe(0);
    void S.loadGroups();
    await vi.waitFor(() => expect(calls.groups).toBe(1));
  });
});
