import { describe, expect, it } from 'vitest';
import { nameState } from './clubStore';
import { cardLine, playedDate, togetherWith, wishesOf } from './memberCard';
import type { ClubMemberDto, EventDto, ProfileDto, WishGroupDto } from './server';
import { myProfileView } from './useView';

const TODAY = '2026-10-21';
const P = (uid: string) => ({ uid, nickname: `닉${uid}`, addedBy: null, joinedAt: '' });
const ev = (o: Partial<EventDto> & { ppl?: string[] }): EventDto => ({
  id: 1, title: '', date: '2026-10-24', candidates: [], startMin: null, endMin: null, location: null, capacity: null, booked: false,
  memo: null, segments: [], version: 1, createdBy: { uid: 'u2', nickname: 'x' }, createdAt: '', updatedAt: '',
  participants: (o.ppl ?? ['me', 'u2']).map(P), count: 0, joined: true, mine: false, canManage: false, settlementTotal: null, ...o,
});
const G = (themeName: string, uids: string[], o: Partial<WishGroupDto> = {}): WishGroupDto => ({
  themeKey: null, themeName, branchName: null, storeName: null, playedBy: [],
  wanters: uids.map((uid) => ({ uid, nickname: `닉${uid}`, since: '2026-10-01T00:00:00Z' })), ...o,
});
const PROF: ProfileDto = {
  realName: '김열쇠', birthDate: '1997-06-28', mbti: 'ENFP', roomCount: 1312, genres: ['공포'],
  lifeTheme: { themeName: '메모리컴퍼니', branchName: '키이스케이프 강남점', themeKey: null }, residence: '서울 마포구',
};

describe('함께한 일정 세기', () => {
  it('나와 그 사람이 둘 다 참여한 일정만 — 한쪽만 있으면 빼고, 두 목록에 겹치면 한 번', () => {
    const a = ev({ id: 1, date: '2026-10-24' });
    const onlyMe = ev({ id: 2, ppl: ['me', 'u3'] });
    const onlyHim = ev({ id: 3, ppl: ['u2', 'u3'] });
    const pastA = ev({ id: 4, date: '2026-10-01' });
    const r = togetherWith([[a, onlyMe, onlyHim, pastA], [pastA, a]], 'me', 'u2', TODAY);
    expect(r).toMatchObject({ upcoming: 1, past: 1 });
    expect(r.recent.map((e) => e.id)).toEqual([1, 4]);
  });
  it('지난/다가오는 구분 — 오늘은 다가오는 쪽, 날짜 미정(협의 중)도 다가오는 쪽', () => {
    const today = ev({ id: 1, date: TODAY });
    const yesterday = ev({ id: 2, date: '2026-10-20' });
    const undecided = ev({ id: 3, date: null, candidates: [{ date: '2026-10-30', responses: [] }] });
    const r = togetherWith([[today, yesterday, undecided]], 'me', 'u2', TODAY);
    expect(r).toMatchObject({ upcoming: 2, past: 1 });
  });
  it('가장 최근 2개 — 다가오는 것 가까운 순, 그다음 지난 것 최근 순', () => {
    const far = ev({ id: 1, date: '2026-11-20' });
    const near = ev({ id: 2, date: '2026-10-22' });
    const old = ev({ id: 3, date: '2026-09-01' });
    const recent = ev({ id: 4, date: '2026-10-10' });
    expect(togetherWith([[far, near, old, recent]], 'me', 'u2', TODAY).recent.map((e) => e.id)).toEqual([2, 1]);
    expect(togetherWith([[old, recent]], 'me', 'u2', TODAY).recent.map((e) => e.id)).toEqual([4, 3]);
    expect(togetherWith([[near, old, recent]], 'me', 'u2', TODAY, 3).recent.map((e) => e.id)).toEqual([2, 4, 3]);
  });
  it('받아 둔 일정이 없으면(내 지난 일정 아직 안 받음 = null) 0', () => {
    expect(togetherWith([[], null], 'me', 'u2', TODAY)).toEqual({ upcoming: 0, past: 0, recent: [] });
  });
});

describe('하고 싶은 테마 고르기', () => {
  it('wanters 에 그 uid 가 있는 묶음만, 서버 순서 그대로', () => {
    const r = wishesOf([G('월야애담', ['u2', 'me']), G('셜록', ['u3']), G('고백', ['u4', 'u2'], { storeName: '제로월드', branchName: '강남점' })], 'u2', 'me');
    expect(r.chips.map((c) => c.name)).toEqual(['월야애담', '고백']);
    expect(r.chips[1].place).toBe('제로월드 강남점');
    expect(r.more).toBe(0);
  });
  it('내가 같은 테마를 원하면 "나도"', () => {
    const r = wishesOf([G('월야애담', ['u2', 'me']), G('고백', ['u2'])], 'u2', 'me');
    expect(r.chips.map((c) => c.also)).toEqual([true, false]);
  });
  it('칩은 6개까지 + 외 n', () => {
    const gs = Array.from({ length: 9 }, (_, i) => G(`테마${i}`, ['u2']));
    const r = wishesOf(gs, 'u2', 'me');
    expect(r.chips).toHaveLength(6);
    expect(r.chips.at(-1)?.name).toBe('테마5');
    expect(r.more).toBe(3);
  });
});

describe('카드 프로필 줄', () => {
  it('97년생 · MBTI · 방 수(천 단위 쉼표) · 거주지역', () => {
    expect(cardLine(PROF)).toBe('97년생 · ENFP · 방 1,312개 · 서울 마포구');
  });
  it('생일 전후와 상관없이 태어난 해, 거주지역이 없으면 그 칸 없이', () => {
    expect(cardLine({ ...PROF, birthDate: '1997-12-01', residence: null })).toBe('97년생 · ENFP · 방 1,312개');
  });
  it('MBTI 를 모르면 "MBTI 잘 몰라요"', () => {
    expect(cardLine({ ...PROF, mbti: 'UNKNOWN' })).toBe('97년생 · MBTI 잘 몰라요 · 방 1,312개 · 서울 마포구');
  });
  it('해 본 날 — 올해는 월.일, 다른 해는 연도까지, 없으면 빈칸', () => {
    expect(playedDate('2026-10-03', TODAY)).toBe('10.03');
    expect(playedDate('2025-12-31', TODAY)).toBe('2025.12.31');
    expect(playedDate(null, TODAY)).toBe('');
  });
});

describe('이름을 누르면', () => {
  const M = (uid: string): [string, ClubMemberDto] => [uid, { uid, nickname: uid, role: 'MEMBER', approvedAt: null, profile: null }];
  const on = { uid: 'me', people: 'on' as const, members: new Map([M('me'), M('u2')]) };
  it('내 uid 면 내 프로필로, 남이면 카드', () => {
    expect(nameState(on, 'me')).toBe('me');
    expect(nameState(on, 'u2')).toBe('card');
  });
  it('승인 멤버 목록에 없으면(내보낸 사람 등) 그냥 글자', () => {
    expect(nameState(on, 'gone')).toBe('text');
  });
  it('6단계를 모르거나(unknown) 멤버 목록이 404(missing)면 모두 글자', () => {
    expect(nameState({ ...on, people: 'unknown' }, 'u2')).toBe('text');
    expect(nameState({ ...on, people: 'missing' }, 'me')).toBe('text');
  });
  it('목록을 못 받았으면(null) 누를 수 있게 두고 카드가 다시 받는다', () => {
    expect(nameState({ ...on, members: null }, 'gone')).toBe('card');
  });
  it('내 프로필 화면 — 넓은 화면은 내 정보, 좁은 화면은 더보기(내 정보가 없으면 더보기)', () => {
    expect(myProfileView(true, true)).toBe('profile');
    expect(myProfileView(false, true)).toBe('more');
    expect(myProfileView(true, false)).toBe('more');
  });
});
