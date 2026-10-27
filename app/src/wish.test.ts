import { describe, expect, it } from 'vitest';
import { toInput } from './eventForm';
import type { EventDto, WishGroupDto } from './server';
import { eventHas, filterGroups, inPick, partyWantCount, partyWishes, withPlayed, placeLabel, sameTheme, upcomingWith, wanterChips, wishForm, wishKey } from './wish';

const G = (o: Partial<WishGroupDto> & { n?: string[] }): WishGroupDto => ({
  themeKey: null, themeName: '테마', branchName: null, storeName: null, playedBy: [],
  wanters: (o.n ?? ['u2']).map((uid, i) => ({ uid, nickname: uid === 'me' ? '방탈출러버' : `닉${uid}`, since: `2026-10-0${i + 1}T00:00:00Z` })),
  ...o,
});

const ev = (o: Partial<EventDto>): EventDto => ({
  id: 1, title: '', date: '2026-10-24', candidates: [], startMin: null, endMin: null, location: null, capacity: null, booked: false,
  memo: null, segments: [], version: 1, createdBy: { uid: 'u2', nickname: 'x' }, createdAt: '', updatedAt: '', participants: [],
  count: 0, joined: false, mine: false, canManage: false, settlementTotal: null, ...o,
});
const seg = (themeName: string, themeKey: string | null = null) => ({ themeName, themeKey, branchName: null, startMin: 600, endMin: 670, playedBy: [] });

describe('같은 테마 판정(§4.12 = §4.9)', () => {
  it('둘 다 키가 있으면 키만 본다', () => {
    expect(sameTheme({ themeKey: 'a', themeName: '고백' }, { themeKey: 'a', themeName: '다른 이름' })).toBe(true);
    expect(sameTheme({ themeKey: 'a', themeName: '고백' }, { themeKey: 'b', themeName: '고백' })).toBe(false);
  });
  it('한쪽이라도 키가 없으면 정리한 이름(공백·기호·대소문자 무시)', () => {
    expect(sameTheme({ themeKey: null, themeName: '월야 애담!' }, { themeKey: 'k', themeName: '월야애담' })).toBe(true);
    expect(sameTheme({ themeKey: null, themeName: 'SHERLOCK' }, { themeKey: null, themeName: 'sherlock' })).toBe(true);
    expect(sameTheme({ themeKey: null, themeName: '고백' }, { themeKey: null, themeName: '폐교' })).toBe(false);
  });
  it('단추 열쇠 — 키, 없으면 정리한 이름', () => {
    expect(wishKey({ themeKey: 'k', themeName: 'x' })).toBe('k');
    expect(wishKey({ themeKey: null, themeName: '월야 애담' })).toBe(wishKey({ themeKey: null, themeName: '월야애담!' }));
  });
});

describe('매장·지점 한 줄', () => {
  it('매장 + 지점, 지점에 매장이 이미 들어 있으면 그대로', () => {
    expect(placeLabel({ storeName: '비트포비아', branchName: '홍대던전점' })).toBe('비트포비아 홍대던전점');
    expect(placeLabel({ storeName: '키이스케이프', branchName: '키이스케이프 강남점' })).toBe('키이스케이프 강남점');
    expect(placeLabel({ storeName: null, branchName: '제로월드 강남점' })).toBe('제로월드 강남점');
    expect(placeLabel({ storeName: '키이스케이프', branchName: null })).toBe('키이스케이프');
    expect(placeLabel({ storeName: null, branchName: null })).toBe('');
  });
});

describe('카드 거르기', () => {
  const list = [
    G({ themeName: '월야애담', storeName: '비트포비아', branchName: '홍대던전점', themeKey: 'b1', n: ['u2', 'me', 'u3'] }),
    G({ themeName: '메모리컴퍼니', storeName: '키이스케이프', branchName: '강남점', themeKey: 'k1', n: ['u3', 'u4'] }),
    G({ themeName: '고백', n: ['me'] }),
    G({ themeName: '폐교', storeName: '제로월드', branchName: '부산서면점', themeKey: 'z1', n: ['u5'] }),
  ];
  const base = { pick: 'all' as const, q: '', region: '전체' as const, meUid: 'me' };
  it('전체 · 2명 이상 · 내가 원하는 것 — 서버 순서 그대로', () => {
    expect(filterGroups(list, base).map((g) => g.themeName)).toEqual(['월야애담', '메모리컴퍼니', '고백', '폐교']);
    expect(filterGroups(list, { ...base, pick: 'two' }).map((g) => g.themeName)).toEqual(['월야애담', '메모리컴퍼니']);
    expect(filterGroups(list, { ...base, pick: 'mine' }).map((g) => g.themeName)).toEqual(['월야애담', '고백']);
    expect(list.filter((g) => inPick(g, 'mine', 'me')).length).toBe(2);
  });
  it('찾기 — 테마·매장·지점·원하는 사람 별명(공백·대소문자 무시)', () => {
    expect(filterGroups(list, { ...base, q: '키이 스케이프' }).map((g) => g.themeName)).toEqual(['메모리컴퍼니']);
    expect(filterGroups(list, { ...base, q: '닉u5' }).map((g) => g.themeName)).toEqual(['폐교']);
  });
  it('지역 — regions.ts 규칙(지점 이름으로)', () => {
    expect(filterGroups(list, { ...base, region: '홍대' }).map((g) => g.themeName)).toEqual(['월야애담']);
    expect(filterGroups(list, { ...base, region: '부산' }).map((g) => g.themeName)).toEqual(['폐교']);
    expect(filterGroups(list, { ...base, region: '기타' }).map((g) => g.themeName)).toEqual(['고백']);
  });
  it('원하는 사람 칩 — 나는 맨 앞에 "나"', () => {
    expect(wanterChips(list[0], 'me').map((w) => `${w.name}${w.me ? '*' : ''}`)).toEqual(['나*', '닉u2', '닉u3']);
    expect(wanterChips(list[1], 'me').some((w) => w.me)).toBe(false);
  });
});

describe('그 테마가 든 다가오는 일정', () => {
  const g = { themeKey: 'b1', themeName: '월야애담' };
  it('키가 같거나(한쪽 키 없으면) 이름이 같은 구간, 오늘 이후 가장 이른 것', () => {
    const evs = [
      ev({ id: 1, date: '2026-10-10', segments: [seg('월야애담', 'b1')] }),    // 지남
      ev({ id: 2, date: '2026-10-28', segments: [seg('월야 애담')] }),         // 키 없음 — 이름
      ev({ id: 3, date: '2026-10-24', segments: [seg('다른 이름', 'b1')] }),   // 키 같음
      ev({ id: 4, date: '2026-10-22', segments: [seg('월야애담', 'b9')] }),    // 키 다름
    ];
    expect(upcomingWith(g, evs, '2026-10-20')).toMatchObject({ date: '2026-10-24', ev: { id: 3 } });
  });
  it('날짜 미정 일정은 오늘 이후 가장 이른 후보 날짜로', () => {
    const evs = [ev({ id: 5, date: null, candidates: [{ date: '2026-10-19', responses: [] }, { date: '2026-10-23', responses: [] }], segments: [seg('월야애담', 'b1')] })];
    expect(upcomingWith(g, evs, '2026-10-20')).toMatchObject({ date: '2026-10-23', ev: { id: 5 } });
    expect(upcomingWith(g, evs, '2026-10-24')).toBeNull();
  });
  it('구간 없는 협의 중 일정은 같이 가요가 채운 그대로일 때만 — 제목 "{이름} 같이 가요" 또는 메모 "같이 가요: {이름} · {지점}"', () => {
    const gp = { themeKey: 'b1', themeName: '월야애담', branchName: '홍대던전점', storeName: '비트포비아' };
    const evs = [ev({ id: 6, date: '2026-10-26', title: '월야 애담 같이 가요!', segments: [] }), ev({ id: 7, date: '2026-10-21', title: '이번 주 번개', segments: [] })];
    expect(upcomingWith(gp, evs, '2026-10-20')).toMatchObject({ ev: { id: 6 } });
    expect(eventHas(ev({ title: '토요 정모', memo: '같이 가요: 월야애담 · 비트포비아 홍대던전점', segments: [] }), gp)).toBe(true);
    expect(eventHas(ev({ title: '토요 정모', memo: '같이 가요: 월야애담 · 다른 지점', segments: [] }), gp)).toBe(false);
    expect(eventHas(ev({ title: '월야애담 정모', segments: [] }), gp)).toBe(false); // 부분 포함은 아니다
    expect(eventHas(ev({ title: '몽환 정모', segments: [] }), { themeKey: null, themeName: '몽' })).toBe(false);
    expect(eventHas(ev({ title: '몽 같이 가요', segments: [] }), { themeKey: null, themeName: '몽' })).toBe(true);
    expect(eventHas(ev({ title: '월야애담 같이 가요', segments: [seg('셜록')] }), gp)).toBe(false); // 구간이 있으면 구간으로만
  });
  it('없으면 null', () => {
    expect(upcomingWith(g, [ev({ segments: [seg('고백')] })], '2026-10-20')).toBeNull();
  });
});

describe('"이 사람들과 일정 만들기" 폼', () => {
  it('협의 중 일정(구간 없음) — 제목 "{테마} 같이 가요", 메모 "같이 가요: {테마} · {매장 지점}", 후보 날짜 모드, 참여자·후보 없음', () => {
    const f = wishForm({ themeKey: 'b1', themeName: '월야애담', branchName: '홍대던전점', storeName: '비트포비아' }, '2026-10-20');
    expect(f.title).toBe('월야애담 같이 가요');
    expect(f.memo).toBe('같이 가요: 월야애담 · 비트포비아 홍대던전점');
    expect(f.segs).toEqual([]);
    expect(f.dateMode).toBe('candidates');
    expect(f.candidates).toEqual([]);
    expect(wishForm({ themeKey: null, themeName: '고백', branchName: null }, '2026-10-20').memo).toBe('같이 가요: 고백');
  });
  it('긴 이름은 제목 60자로 자른다', () => {
    const f = wishForm({ themeKey: null, themeName: '가'.repeat(70), branchName: null, storeName: null }, '2026-10-20');
    expect([...f.title].length).toBe(60);
  });
  it('후보 날짜만 고르면 그대로 저장된다 — 협의 중(날짜 null·구간 없음·하루 종일)', () => {
    const f = wishForm({ themeKey: 'b1', themeName: '월야애담', branchName: null }, '2026-10-20');
    expect(toInput(f)).toEqual({ error: '후보 날짜를 하나 이상 골라 주세요.' });
    const ok = toInput({ ...f, candidates: ['2026-10-24', '2026-10-25'] });
    expect('input' in ok && ok.input).toEqual({
      title: '월야애담 같이 가요', date: null, candidates: ['2026-10-24', '2026-10-25'], startMin: null, endMin: null,
      location: null, capacity: null, booked: false, memo: '같이 가요: 월야애담', segments: [],
    });
  });
});

describe('일정 참여자가 하고 싶은 테마(2026-10-27 사용자 요청)', () => {
  const P = (uid: string, nickname = uid) => ({ uid, nickname, addedBy: null, joinedAt: '' });
  const party = [P('a', '열쇠'), P('b', '방린'), P('c', '탈출')];
  const groups = [
    G({ themeName: '혼자 원함', themeKey: 'k1', n: ['a'] }),
    G({ themeName: '둘이 원함', themeKey: 'k2', n: ['a', 'b', 'z'], playedBy: ['c'] }),
    G({ themeName: '밖사람만', themeKey: 'k3', n: ['z'] }),
    G({ themeName: '둘이 원함 해본 사람 없음', themeKey: 'k4', n: ['b', 'c'] }),
  ];
  it('참여자가 원하는 테마만 — 원하는 참여자 많은 순, 같으면 해 본 참여자 적은 순, 그다음 이름', () => {
    const r = partyWishes(groups, party);
    expect(r.map((x) => x.group.themeName)).toEqual(['둘이 원함 해본 사람 없음', '둘이 원함', '혼자 원함']);
    expect(r[1].want.map((w) => w.nickname)).toEqual(['닉a', '닉b']);
    expect(r[1].played).toEqual(['c']);
  });
  it('참여자가 없거나 아무도 원하지 않으면 빈 목록', () => {
    expect(partyWishes(groups, [])).toEqual([]);
    expect(partyWishes(groups, [P('q')])).toEqual([]);
  });
  it('도우미 줄에 붙일 "하고 싶어요 n명" — 같은 테마 판정(키·이름)으로', () => {
    const r = partyWishes(groups, party);
    expect(partyWantCount(r, { themeKey: 'k2', themeName: '아무 이름' })).toBe(2);
    expect(partyWantCount(r, { themeKey: null, themeName: '혼자 원함' })).toBe(1);
    expect(partyWantCount(r, { themeKey: 'zz', themeName: '없음' })).toBe(0);
  });
});

describe('"해 봤어요"로 묶음 고치기(2026-10-27 사용자 요청)', () => {
  const gs = [G({ themeName: '가', themeKey: 'k1', n: ['a'], playedBy: ['b'] }), G({ themeName: '나', themeKey: 'k2', n: ['a'] })];
  it('같은 테마 묶음의 playedBy 에 나를 넣는다(겹치지 않게), 다른 묶음은 그대로', () => {
    const r = withPlayed(gs, { themeKey: 'k1', themeName: '아무' }, 'me', true);
    expect(r[0].playedBy).toEqual(['b', 'me']);
    expect(r[1]).toBe(gs[1]);
    expect(withPlayed(r, { themeKey: 'k1', themeName: '아무' }, 'me', true)[0].playedBy).toEqual(['b', 'me']);
  });
  it('뺄 때는 나만 뺀다', () => {
    const r = withPlayed([G({ themeName: '가', themeKey: 'k1', n: ['a'], playedBy: ['b', 'me'] })], { themeKey: null, themeName: '가' }, 'me', false);
    expect(r[0].playedBy).toEqual(['b']);
  });
});
