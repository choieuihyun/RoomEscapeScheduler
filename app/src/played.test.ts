import { describe, expect, it } from 'vitest';
import {
  freshMessage, freshCatalog, helperDates, isPlayableName, noRecordNames, noRecordText, playedCount, playedNames, playedPerPerson, searchThemes, sourceLabel, stepsToPlayed, freshStale, FRESH_STALE_MS,
} from './played';
import type { EventDto, FreshDto, PlayedDto, ThemeRef } from './server';

const seg = (playedBy: string[]) => ({ playedBy });
const ref = (n: string, store = '키이스케이프', branch = '강남', key = `${store}-${branch}-${n}`): ThemeRef =>
  ({ themeKey: key, themeName: n, branchName: branch, storeName: store });
const played = (o: Partial<PlayedDto>): PlayedDto => ({
  id: 1, themeKey: null, themeName: 'x', branchName: null, storeName: null, playedOn: null, source: 'MANUAL', eventId: null,
  createdAt: '2026-10-19T00:00:00Z', ...o,
});

describe('해 본 테마 집계', () => {
  it('playedCount 는 같은 사람을 한 번만', () => {
    expect(playedCount({ segments: [seg(['a', 'b']), seg(['b', 'c']), seg([])] } as never)).toBe(3);
    expect(playedCount({ segments: [] })).toBe(0);
  });
  it('playedNames 는 참여자 닉네임으로', () => {
    const ev = { participants: [{ uid: 'a', nickname: '곰' }, { uid: 'b', nickname: '토끼' }] } as never;
    expect(playedNames(seg(['b', 'a', 'zz']), ev)).toEqual(['토끼', '곰']);
  });
  it('searchThemes 공백·대소문자 무시, 20개 제한, recorded 표시', () => {
    const all = [ref('Room 2'), ref('비밀의 화원', '넥스트', '홍대', 'k2'), ...Array.from({ length: 30 }, (_, i) => ref(`테마${i}`))];
    expect(searchThemes(all, 'room2', []).map((r) => r.ref.themeName)).toEqual(['Room 2']);
    expect(searchThemes(all, '비밀 의화원', [])).toHaveLength(1);
    expect(searchThemes(all, '넥스트', []).map((r) => r.ref.themeName)).toEqual(['비밀의 화원']);
    expect(searchThemes(all, '', [])).toHaveLength(20);
    const r = searchThemes(all, '화원', [played({ themeKey: 'k2' })]);
    expect(r[0].recorded).toBe(true);
    expect(searchThemes(all, 'room', [played({ themeName: 'ROOM 2' })])[0].recorded).toBe(true);
    expect(searchThemes(all, 'room', [played({ themeKey: 'other', themeName: 'room 2' })])[0].recorded).toBe(false);
  });
  it('sourceLabel 세 가지', () => {
    expect(sourceLabel(played({ source: 'EVENT' }))).toBe('모임 일정에서');
    expect(sourceLabel(played({ source: 'PLAN' }))).toBe('개인 일정에서');
    expect(sourceLabel(played({ source: 'MANUAL' }))).toBe('직접');
  });
  it('isPlayableName', () => {
    expect(isPlayableName('!!!')).toBe(false);
    expect(isPlayableName('🎃🎃')).toBe(false);
    expect(isPlayableName('')).toBe(false);
    expect(isPlayableName('비밀의 화원')).toBe(true);
    expect(isPlayableName('Room 2')).toBe(true);
  });
});

describe('협의 도우미(§4.9 fresh-themes)', () => {
  const dto = (o: Partial<FreshDto>): FreshDto =>
    ({ date: '2026-10-31', collected: true, checkedAt: null, missing: [], noRecord: [], themes: [], ...o });
  const theme = { id: 't1', name: '사라진 왕관', sessions: [], themeKey: 'k', storeName: '제로월드', branchName: '강남', playedBy: [] };
  it('freshMessage — 안 모은 날과 열린 테마 없는 날은 다른 문구, 테마가 있으면 null', () => {
    expect(freshMessage(dto({ collected: false }))).toBe('이 날은 아직 시간표를 모으지 않았어요. 가까워지면 다시 볼 수 있어요.');
    /* 안 모은 날은 themes 가 비어도 "열린 테마 없음"이 아니다(Review Focus 4) */
    expect(freshMessage(dto({ collected: false, themes: [] }))).not.toContain('열린 테마가 없어요');
    expect(freshMessage(dto({ collected: true, themes: [] }))).toBe('이 날 열린 테마가 없어요.');
    expect(freshMessage(dto({ themes: [theme] }))).toBeNull();
    /* 안 모은 날에 서버가 카탈로그(회차 없는 테마 전체)를 실어 주면(§4.9 추가, 2026-10-27) 문구 없이 목록을 보인다 */
    expect(freshMessage(dto({ collected: false, themes: [{ ...theme, sessions: [] }] }))).toBeNull();
  });
  it('freshCatalog — 안 모은 날 + 테마가 있으면 회차 없는 카탈로그(보기만)', () => {
    expect(freshCatalog(dto({ collected: false, themes: [{ ...theme, sessions: [] }] }))).toBe(true);
    expect(freshCatalog(dto({ collected: false, themes: [] }))).toBe(false);
    expect(freshCatalog(dto({ collected: true, themes: [theme] }))).toBe(false);
  });
  it('noRecordNames — 참여자 닉네임으로, 목록에 없는 uid 는 뺀다', () => {
    const ev = { participants: [{ uid: 'a', nickname: '곰' }, { uid: 'b', nickname: '탈출왕' }] } as Pick<EventDto, 'participants'>;
    expect(noRecordNames(dto({ noRecord: ['b', 'zz', 'a'] }), ev)).toEqual(['탈출왕', '곰']);
    expect(noRecordNames(dto({}), ev)).toEqual([]);
    expect(noRecordText(['탈출왕'])).toBe('탈출왕 님은 해 본 테마 기록이 없어서 "안 해 봄"으로 보여도 틀릴 수 있어요.');
    expect(noRecordText(['탈출왕', '곰'])).toBe('탈출왕, 곰 님은 해 본 테마 기록이 없어서 "안 해 봄"으로 보여도 틀릴 수 있어요.');
  });
  it('playedPerPerson — 사람마다 이 일정 테마 중 몇 개를 해 봤나', () => {
    const m = playedPerPerson({ segments: [seg(['a', 'b']), seg(['a']), seg([])] } as never);
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(1);
    expect(m.has('c')).toBe(false);
  });
  it('helperDates — 정해진 날은 그 날짜 하나, 미정이면 다가오는 후보(날짜 순)와 맨 위 줄 날짜, 지난 날은 없음', () => {
    const P = (uid: string) => ({ uid, nickname: uid, addedBy: null, joinedAt: '' });
    const R = (uid: string, available: boolean) => ({ uid, available, startMin: null, endMin: null });
    const today = '2026-10-20';
    expect(helperDates({ date: '2026-10-24', candidates: [], participants: [] }, today)).toEqual({ dates: ['2026-10-24'], first: '2026-10-24' });
    expect(helperDates({ date: '2026-10-19', candidates: [], participants: [] }, today)).toBeNull();
    const ev = {
      date: null, participants: [P('a'), P('b')],
      candidates: [
        { date: '2026-10-18', responses: [R('a', true), R('b', true)] }, // 지났다 — 모두 되지만 빼야 한다
        { date: '2026-10-31', responses: [R('a', true)] },
        { date: '2026-11-01', responses: [R('a', true), R('b', true)] },
        { date: '2026-10-25', responses: [] },
      ],
    } as Pick<EventDto, 'date' | 'candidates' | 'participants'>;
    expect(helperDates(ev, today)).toEqual({ dates: ['2026-10-25', '2026-10-31', '2026-11-01'], first: '2026-11-01' });
    expect(helperDates({ ...ev, candidates: [ev.candidates[0]] }, today)).toBeNull();
  });
});

describe('stepsToPlayed', () => {
  it('빈 이름·글자 없는 이름은 뺀다', () => {
    expect(stepsToPlayed([{ name: '' }, { name: '  ' }, { name: '!!!' }, { name: '시간의 방' }], '2026-10-18'))
      .toEqual([{ themeName: '시간의 방', branchName: null, playedOn: '2026-10-18' }]);
  });
  it('같은 테마는 한 번만(공백·대소문자 무시)', () => {
    expect(stepsToPlayed([{ name: 'Time Room' }, { name: ' time room ' }, { name: '다른 방' }], '2026-10-18').map((x) => x.themeName))
      .toEqual(['Time Room', '다른 방']);
  });
  it('매장이 있으면 branchName, 날짜가 없으면 playedOn null', () => {
    expect(stepsToPlayed([{ name: 'A방' }], '')).toEqual([{ themeName: 'A방', branchName: null, playedOn: null }]);
  });
});

describe('도우미 결과 낡음', () => {
  it('5분을 넘기면 낡았다고 본다(딱 5분은 아직)', () => {
    expect(freshStale(1000, 1000 + FRESH_STALE_MS)).toBe(false);
    expect(freshStale(1000, 1000 + FRESH_STALE_MS + 1)).toBe(true);
  });
});
