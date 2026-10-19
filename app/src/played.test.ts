import { describe, expect, it } from 'vitest';
import { isPlayableName, playedCount, playedNames, searchThemes, sourceLabel } from './played';
import type { PlayedDto, ThemeRef } from './server';

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
    expect(sourceLabel(played({ source: 'EVENT' }))).toBe('일정에서 자동');
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
