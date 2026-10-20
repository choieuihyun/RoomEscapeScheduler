import { describe, expect, it } from 'vitest';
import {
  GENRES, MBTI_ROWS, addMonths, ageKst, allEmpty, birthLabel, checkBirth, cleanRooms, draftFrom, draftIssues, emptyDraft, firstRange, lifeFromRef,
  lifeLabel, maskBirth, matchPerson, mergeMonths, monthLabel, monthsBetween, olderRange, personLine, searchLife, sortPeople,
  toProfile, toggleGenre, topRanks, type Draft,
} from './memberProfile';
import { canEditProfile, needJoin, needsProfile, profileApiOn } from './profileGate';
import type { ClubMemberDto, ProfileDto, ThemeRef } from './server';

const TODAY = '2026-10-20';
const P: ProfileDto = {
  realName: '김방탈', birthDate: '1997-06-28', mbti: 'ENFP', roomCount: 312, genres: ['공포', '추리'],
  lifeTheme: { themeName: '메모리컴퍼니', branchName: '키이스케이프 강남점', themeKey: 'k-mem' },
};
const full: Draft = {
  nickname: '방탈출러버', realName: '김방탈', birth: '1997.06.28', mbti: 'ENFP', rooms: '312', genres: ['공포'],
  life: { themeName: '메모리컴퍼니', branchName: '키이스케이프 강남점', themeKey: 'k-mem' },
};

describe('목록 값', () => {
  it('장르 13개는 계약 순서, MBTI 는 16개(4×4)', () => {
    expect(GENRES).toEqual(['공포', '스릴러', '추리', '미스터리', '감성', '드라마', '코믹', '판타지', 'SF', '어드벤처', '잠입', '액션', '기타']);
    expect(MBTI_ROWS.flat()).toHaveLength(16);
    expect(new Set(MBTI_ROWS.flat()).size).toBe(16);
  });
});

describe('생일 칸', () => {
  it('숫자만 쳐도 점이 들어간다', () => {
    expect(maskBirth('1997')).toBe('1997');
    expect(maskBirth('19970')).toBe('1997.0');
    expect(maskBirth('199706')).toBe('1997.06');
    expect(maskBirth('19970628')).toBe('1997.06.28');
    expect(maskBirth('199706281')).toBe('1997.06.28');
  });
  it('붙여 넣은 1997-06-28·점을 지운 값도 같은 모양', () => {
    expect(maskBirth('1997-06-28')).toBe('1997.06.28');
    expect(maskBirth('1997.')).toBe('1997');
    expect(maskBirth('1997.06.2')).toBe('1997.06.2');
  });
  it('여덟 자리·있는 날짜·1940-01-01 ~ 오늘(KST)만 받고 YYYY-MM-DD 로 바꾼다', () => {
    expect(checkBirth('1997.06.28', TODAY)).toEqual({ ok: true, iso: '1997-06-28' });
    expect(checkBirth('', TODAY)).toEqual({ ok: false, why: 'empty' });
    expect(checkBirth('1997.06', TODAY)).toEqual({ ok: false, why: 'partial' });
    expect(checkBirth('1997.02.30', TODAY)).toEqual({ ok: false, why: 'invalid' });
    expect(checkBirth('1997.13.01', TODAY)).toEqual({ ok: false, why: 'invalid' });
    expect(checkBirth('2001.02.29', TODAY)).toEqual({ ok: false, why: 'invalid' });
    expect(checkBirth('2000.02.29', TODAY)).toEqual({ ok: true, iso: '2000-02-29' });
    expect(checkBirth('1939.12.31', TODAY)).toEqual({ ok: false, why: 'range' });
    expect(checkBirth('1940.01.01', TODAY).ok).toBe(true);
    expect(checkBirth('2026.10.20', TODAY).ok).toBe(true);
    expect(checkBirth('2026.10.21', TODAY)).toEqual({ ok: false, why: 'range' });
  });
  it('1940 전 아주 작은 해(0001·0099·1000)도 "없는 날짜"가 아니라 범위 문구', () => {
    expect(checkBirth('0001.01.01', TODAY)).toEqual({ ok: false, why: 'range' });
    expect(checkBirth('0099.06.28', TODAY)).toEqual({ ok: false, why: 'range' });
    expect(checkBirth('1000.02.30', TODAY)).toEqual({ ok: false, why: 'range' });
  });
});

describe('만 나이(한국 날짜)', () => {
  it('생일 전날·당일·다음 날', () => {
    expect(ageKst('1997-06-28', '2026-06-27')).toBe(28);
    expect(ageKst('1997-06-28', '2026-06-28')).toBe(29);
    expect(ageKst('1997-06-28', '2026-10-20')).toBe(29);
    expect(ageKst('1997-12-31', '2026-01-01')).toBe(28);
  });
  it('생일 표시는 월.일(입력 칸과 같은 두 자리)', () => {
    expect(birthLabel('1997-06-28')).toBe('06.28');
    expect(birthLabel('2000-02-29')).toBe('02.29');
  });
  it('2월 29일생은 평년엔 3월 1일부터 한 살 더(2월 28일은 아직)', () => {
    expect(ageKst('2000-02-29', '2025-02-28')).toBe(24);
    expect(ageKst('2000-02-29', '2025-03-01')).toBe(25);
    expect(ageKst('2000-02-29', '2028-02-29')).toBe(28);
  });
});

describe('장르 고르기', () => {
  it('누르면 넣고 다시 누르면 뺀다, 고른 순서 유지', () => {
    expect(toggleGenre(['공포'], '추리')).toEqual({ list: ['공포', '추리'], blocked: false });
    expect(toggleGenre(['공포', '추리'], '공포')).toEqual({ list: ['추리'], blocked: false });
  });
  it('다섯 개면 여섯 번째는 막는다(빼기는 된다)', () => {
    const five = GENRES.slice(0, 5);
    expect(toggleGenre(five, '기타')).toEqual({ list: five, blocked: true });
    expect(toggleGenre(five, '공포').list).toHaveLength(4);
  });
});

describe('방 수 칸', () => {
  it('숫자만, 앞의 0 떼기, 네 자리까지', () => {
    expect(cleanRooms('0')).toBe('0');
    expect(cleanRooms('007')).toBe('7');
    expect(cleanRooms('3a1,2')).toBe('312');
    expect(cleanRooms('123456')).toBe('1234');
    expect(cleanRooms('')).toBe('');
  });
});

describe('폼 완성 판정', () => {
  it('다 채우면 문제 없음, 보낼 모양(생일 YYYY-MM-DD, 방 수 숫자, 별명·이름 앞뒤 공백 제거)', () => {
    expect(draftIssues(full, TODAY)).toEqual({});
    expect(toProfile({ ...full, nickname: ' 방탈출러버 ', realName: ' 김방탈 ' }, TODAY)).toEqual({
      nickname: '방탈출러버',
      profile: { realName: '김방탈', birthDate: '1997-06-28', mbti: 'ENFP', roomCount: 312, genres: ['공포'], lifeTheme: full.life },
    });
  });
  it('서버가 타입까지 본다(§4.11) — roomCount 는 정수 number, genres 는 배열, birthDate 는 YYYY-MM-DD', () => {
    const out = toProfile({ ...full, rooms: '0' }, TODAY)!;
    expect(Number.isInteger(out.profile.roomCount)).toBe(true);
    expect(out.profile.roomCount).toBe(0);
    expect(Array.isArray(out.profile.genres)).toBe(true);
    expect(out.profile.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(JSON.stringify(out.profile)).roomCount).toBe(0);
  });
  it('빈 폼은 일곱 칸 모두 안내, 보낼 모양 없음', () => {
    const iss = draftIssues(emptyDraft(), TODAY);
    expect(Object.keys(iss).sort()).toEqual(['birth', 'genres', 'life', 'mbti', 'nickname', 'realName', 'rooms']);
    expect(toProfile(emptyDraft(), TODAY)).toBeNull();
  });
  it('글자 수는 코드 포인트(이모지 1개 = 1자), 20자 넘으면 막는다', () => {
    expect(draftIssues({ ...full, nickname: '🐻'.repeat(20) }, TODAY).nickname).toBeUndefined();
    expect(draftIssues({ ...full, realName: '가'.repeat(21) }, TODAY).realName).toContain('20자까지');
    expect(draftIssues({ ...full, nickname: '   ' }, TODAY).nickname).toBe('별명을 적어 주세요.');
  });
  it('MBTI "잘 몰라요"(UNKNOWN)도 채운 것, 방 수 0 도 채운 것', () => {
    expect(draftIssues({ ...full, mbti: 'UNKNOWN', rooms: '0' }, TODAY)).toEqual({});
  });
  it('인생 테마 — 글자 없는 이름·40자 넘는 이름은 막는다', () => {
    expect(draftIssues({ ...full, life: { themeName: '!!!', branchName: null, themeKey: null } }, TODAY).life).toBeDefined();
    expect(draftIssues({ ...full, life: { themeName: '가'.repeat(41), branchName: null, themeKey: null } }, TODAY).life).toContain('40자');
  });
  it('있는 프로필로 다시 채우면 같은 값이 나온다', () => {
    const d = draftFrom('방탈출러버', P);
    expect(d.birth).toBe('1997.06.28');
    expect(toProfile(d, TODAY)?.profile).toEqual(P);
    expect(draftFrom('곰', null)).toEqual(emptyDraft('곰'));
  });
});

describe('인생 테마 찾기', () => {
  const T = (themeName: string, storeName: string, branchName: string, themeKey: string): ThemeRef => ({ themeName, storeName, branchName, themeKey });
  const all = [T('메모리컴퍼니', '키이스케이프', '강남점', 'k-mem'), T('셜록', '제로월드', '강남점', 'z1'), T('셜록', '제로월드', '홍대점', 'z2')];
  it('이름·매장·지점 부분 일치, 빈 글자면 없음', () => {
    expect(searchLife(all, '셜록').map((r) => r.themeKey)).toEqual(['z1', 'z2']);
    expect(searchLife(all, '키이 스케이프').map((r) => r.themeKey)).toEqual(['k-mem']);
    expect(searchLife(all, ' ')).toEqual([]);
  });
  it('고르면 매장 칸에 "매장 지점"(40자), 표시는 "이름 (매장)"', () => {
    const l = lifeFromRef(all[0]);
    expect(l).toEqual({ themeName: '메모리컴퍼니', branchName: '키이스케이프 강남점', themeKey: 'k-mem' });
    expect(lifeLabel(l)).toBe('메모리컴퍼니 (키이스케이프 강남점)');
    expect(lifeLabel({ themeName: '동네 방', branchName: null, themeKey: null })).toBe('동네 방');
    expect([...(lifeFromRef(T('a', '가'.repeat(30), '나'.repeat(30), 'x')).branchName ?? '')]).toHaveLength(40);
  });
});

describe('멤버 목록', () => {
  const M = (uid: string, nickname: string, profile: ProfileDto | null): ClubMemberDto => ({ uid, nickname, role: 'MEMBER', approvedAt: null, profile });
  const list = [M('a', '다람쥐', { ...P, realName: '박다람', roomCount: 50 }), M('b', '가오리', { ...P, roomCount: 500 }), M('me', '하마', null), M('c', '나비', null)];
  it('가나다 순, 내 카드는 맨 위', () => {
    expect(sortPeople(list, 'name', 'me').map((m) => m.nickname)).toEqual(['하마', '가오리', '나비', '다람쥐']);
  });
  it('방 수 많은 순 — 프로필 없는 사람은 뒤(그 안은 가나다)', () => {
    expect(sortPeople(list, 'rooms', 'me').map((m) => m.nickname)).toEqual(['하마', '가오리', '다람쥐', '나비']);
  });
  it('별명·이름으로 찾는다(공백·대소문자 무시)', () => {
    expect(list.filter((m) => matchPerson(m, '박다')).map((m) => m.uid)).toEqual(['a']);
    expect(list.filter((m) => matchPerson(m, '나 비')).map((m) => m.uid)).toEqual(['c']);
    expect(list.filter((m) => matchPerson(m, '')).length).toBe(4);
  });
  it('둘째 줄 "만 29세 · ENFP · 방 312개", 잘 몰라요·천 단위', () => {
    expect(personLine(P, TODAY)).toBe('만 29세 · ENFP · 방 312개');
    expect(personLine({ ...P, mbti: 'UNKNOWN', roomCount: 1234 }, TODAY)).toBe('만 29세 · 잘 몰라요 · 방 1,234개');
  });
});

describe('랭킹 달 범위', () => {
  it('처음은 이번 달(KST)을 포함한 최근 3달', () => {
    expect(firstRange('2026-10-20')).toEqual({ from: '2026-08', to: '2026-10' });
    expect(firstRange('2026-01-01')).toEqual({ from: '2025-11', to: '2026-01' });
  });
  it('더 보기는 가장 오래된 달 바로 앞 3달(해 넘김 포함)', () => {
    expect(olderRange('2026-08')).toEqual({ from: '2026-05', to: '2026-07' });
    expect(olderRange('2026-02')).toEqual({ from: '2025-11', to: '2026-01' });
  });
  it('한 번에 묻는 범위는 12달을 넘지 않는다', () => {
    let r = firstRange(TODAY);
    for (let i = 0; i < 10; i++) {
      expect(monthsBetween(r.from, r.to)).toBeLessThanOrEqual(12);
      r = olderRange(r.from);
    }
    expect(monthsBetween('2025-11', '2026-10')).toBe(12);
  });
  it('달 더하기·이름', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(monthLabel('2026-07')).toBe('2026년 7월');
  });
  it('더 보기로 받은 달이 모두 비면(또는 하나도 안 오면) 끝', () => {
    expect(allEmpty([{ month: '2026-07', ranks: [] }, { month: '2026-06', ranks: [] }])).toBe(true);
    expect(allEmpty([])).toBe(true);
    expect(allEmpty([{ month: '2026-07', ranks: [] }, { month: '2026-06', ranks: [{ rank: 1, uid: 'a', nickname: 'a', count: 1 }] }])).toBe(false);
  });
  it('받은 달 합치기 — 최신 달 먼저, 빠진 달은 빈 달, 같은 달은 새것', () => {
    const r1 = { month: '2026-10', ranks: [{ rank: 1, uid: 'a', nickname: '곰', count: 3 }] };
    const m = mergeMonths([], [r1], { from: '2026-08', to: '2026-10' });
    expect(m.map((x) => [x.month, x.ranks.length])).toEqual([['2026-10', 1], ['2026-09', 0], ['2026-08', 0]]);
    const m2 = mergeMonths(m, [{ month: '2026-07', ranks: [] }], { from: '2026-05', to: '2026-07' });
    expect(m2.map((x) => x.month)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  });
  it('같은 순위는 같은 숫자, 5등에 걸리면 6명 이상도 그대로', () => {
    const ranks = [1, 1, 3, 4, 5, 5].map((rank, i) => ({ rank, uid: 'u' + i, nickname: 'n' + i, count: 10 - rank }));
    expect(topRanks({ month: '2026-10', ranks }).map((r) => r.rank)).toEqual([1, 1, 3, 4, 5, 5]);
    expect(topRanks({ month: '2026-10', ranks: [...ranks, { rank: 7, uid: 'x', nickname: 'x', count: 1 }] })).toHaveLength(6);
  });
});

describe('프로필을 묻고 보일 조건(profileGate — 진입 청크)', () => {
  it('needJoin — 가입 전·거절·내보낸 계정은 가입 신청, 대기·승인·모름은 아니다', () => {
    expect(['NONE', 'REJECTED', 'REMOVED'].map(needJoin)).toEqual([true, true, true]);
    expect(['PENDING', 'APPROVED', null, undefined].map(needJoin)).toEqual([false, false, false, false]);
  });

  const me = (status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED', profile?: ProfileDto | null) => ({ status, profile });
  it('옛 서버(profile 필드 없음)면 묻지도, 열지도 않는다', () => {
    expect(profileApiOn(me('APPROVED'))).toBe(false);
    expect(needsProfile(me('APPROVED'))).toBe(false);
    expect(canEditProfile(me('APPROVED'))).toBe(false);
    expect(profileApiOn(null)).toBe(false);
  });
  it('프로필이 null 인 가입 신청자·승인 멤버에게 "채워 주세요"', () => {
    expect(needsProfile(me('APPROVED', null))).toBe(true);
    expect(needsProfile(me('PENDING', null))).toBe(true);
    expect(needsProfile(me('APPROVED', P))).toBe(false);
  });
  it('가입 전·거절·내보냄은 묻지 않고 고치기도 없다(가입 창에서 받는다)', () => {
    for (const s of ['NONE', 'REJECTED', 'REMOVED'] as const) {
      expect(needsProfile(me(s, null))).toBe(false);
      expect(canEditProfile(me(s, null))).toBe(false);
    }
    expect(canEditProfile(me('PENDING', P))).toBe(true);
  });
});
