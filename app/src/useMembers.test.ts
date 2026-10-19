import { describe, expect, it } from 'vitest';
import type { MemberDto } from './server';
import { formatKst, memberName, sameNicknameUids, splitMembers } from './useMembers';

const m = (uid: string, nickname: string | null, status: MemberDto['status'], over: Partial<MemberDto> = {}): MemberDto => ({
  uid, nickname: nickname as string, role: 'MEMBER', status,
  createdAt: '2026-10-19T05:02:00Z', decidedAt: null, hasDevice: false, ...over,
});

describe('sameNicknameUids', () => {
  it('승인 대기 줄이 다른 대기·멤버 줄과 같은 닉네임이면 그 대기 줄만 잡는다', () => {
    const r = sameNicknameUids([
      m('a', '방탈출러버', 'PENDING'),
      m('b', '방탈출러버', 'PENDING'),
      m('c', '방린이', 'APPROVED'),
      m('d', '방린이', 'PENDING'),
      m('e', '혼자', 'PENDING'),
    ]);
    expect([...r].sort()).toEqual(['a', 'b', 'd']);
  });
  it('앞뒤 공백과 대소문자를 무시한다', () => {
    const r = sameNicknameUids([m('a', '  Escape ', 'PENDING'), m('b', 'escape', 'APPROVED')]);
    expect([...r]).toEqual(['a']);
  });
  it('거절·내보낸 줄과, 닉네임이 없는 줄은 비교하지 않는다', () => {
    const r = sameNicknameUids([
      m('a', '같다', 'PENDING'), m('b', '같다', 'REJECTED'), m('c', '같다', 'REMOVED'),
      m('x', null, 'PENDING'), m('y', '  ', 'PENDING'),
    ]);
    expect(r.size).toBe(0);
  });
});

describe('formatKst', () => {
  it('UTC 시각을 한국 시간 "10월 19일 14:02" 로', () => {
    expect(formatKst('2026-10-19T05:02:00Z')).toBe('10월 19일 14:02');
  });
  it('날짜가 넘어가고 한 자리 시·분은 0 을 채운다', () => {
    expect(formatKst('2026-12-31T15:05:00Z')).toBe('1월 1일 00:05');
  });
  it('소수 초·오프셋이 붙어도 읽고, 못 읽으면 빈 글자', () => {
    expect(formatKst('2026-10-19T05:02:00.123456Z')).toBe('10월 19일 14:02');
    expect(formatKst('엉터리')).toBe('');
    expect(formatKst(null)).toBe('');
  });
});

describe('memberName', () => {
  it('닉네임이 없으면 uid 앞 8자', () => {
    expect(memberName({ uid: 'kakao:1234567890', nickname: null })).toBe('kakao:12');
    expect(memberName({ uid: 'abc', nickname: ' 별명 ' })).toBe('별명');
  });
});

describe('splitMembers', () => {
  it('대기·멤버·지난 신청으로 나눈다', () => {
    const r = splitMembers([m('a', 'a', 'PENDING'), m('b', 'b', 'APPROVED'), m('c', 'c', 'REJECTED'), m('d', 'd', 'REMOVED')]);
    expect([r.pending.length, r.members.length, r.past.length]).toEqual([1, 1, 2]);
  });
});
