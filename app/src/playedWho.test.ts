import { describe, expect, it } from 'vitest';
import { playedDots, playedWho, playedWhoLabel, playedWhoTitle } from './playedWho';

const P = (uid: string, nickname: string) => ({ uid, nickname, addedBy: null, joinedAt: '2026-10-10T10:00:00Z' });
const people = [P('u1', '철수'), P('u2', '영희'), P('u3', '민수')];
const seg = (playedBy: string[]) => ({ themeName: 't', branchName: null, themeKey: null, startMin: 600, endMin: 670, playedBy });

describe('playedDots — 참여자 이름 + 해 봄/안 해 봄', () => {
  it('참여자 전원을 참여 순서 그대로', () => {
    expect(playedDots(['u3', 'u1'], people)).toEqual([
      { uid: 'u1', name: '철수', played: true },
      { uid: 'u2', name: '영희', played: false },
      { uid: 'u3', name: '민수', played: true },
    ]);
  });

  it('아무도 안 해 봤으면 모두 안 해 봄, playedBy 가 빠져도', () => {
    expect(playedDots([], people).every((d) => !d.played)).toBe(true);
    expect(playedDots(undefined, people).map((d) => d.played)).toEqual([false, false, false]);
  });

  it('참여자 밖 uid 는 무시, 참여자가 없으면 빈 배열', () => {
    expect(playedDots(['zz'], people).some((d) => d.played)).toBe(false);
    expect(playedDots(['u1'], [])).toEqual([]);
  });
});

describe('playedWho — 홈·캘린더 칩', () => {
  it('구간이 겹쳐도 한 번, 참여 순서로', () => {
    expect(playedWho({ participants: people, segments: [seg(['u3']), seg(['u3', 'u1'])] })).toEqual(['철수', '민수']);
    expect(playedWho({ participants: people, segments: [seg([])] })).toEqual([]);
    expect(playedWho({ participants: people, segments: [] })).toEqual([]);
  });

  it('칩 글: 둘까지 이름, 셋부터 "외 n명"', () => {
    expect(playedWhoLabel([])).toBe('');
    expect(playedWhoLabel(['철수'])).toBe('철수 해 봄');
    expect(playedWhoLabel(['철수', '영희'])).toBe('철수, 영희 해 봄');
    expect(playedWhoLabel(['철수', '영희', '민수'])).toBe('철수 외 2명 해 봄');
  });

  it('title 에는 다', () => {
    expect(playedWhoTitle(['철수', '영희', '민수'])).toBe('해 본 사람: 철수, 영희, 민수');
    expect(playedWhoTitle([])).toBe('');
  });
});
