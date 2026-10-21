import { describe, expect, it } from 'vitest';
import { moreGroups } from './moreRows';

const approved = { status: 'APPROVED', kakaoLinked: false };
const member = {
  loggedIn: true, profileOn: true, clubOn: true, isAdmin: false,
  member: approved, providerIds: ['google.com'],
};
const shape = (g: ReturnType<typeof moreGroups>) => g.map(x => `${x.id}:${x.rows.map(r => r.id + (r.link ? '/' + r.link : '')).join(',')}`);

describe('moreGroups', () => {
  it('로그아웃이면 설정만', () => {
    expect(shape(moreGroups({ ...member, loggedIn: false, profileOn: false, clubOn: false, member: null, providerIds: [] })))
      .toEqual(['settings:dark,tour,terms']);
  });

  it('승인 멤버(구글 로그인) — 내 기록·알림·설정·계정(구글 연결됨만)·로그아웃', () => {
    expect(shape(moreGroups(member))).toEqual([
      'records:played,past', 'alerts:push', 'settings:dark,tour,terms', 'account:google/done', 'out:logout',
    ]);
  });

  it('서버가 프로필을 알면 모임 그룹에 멤버 목록·랭킹(랭킹 API 가 없으면 멤버 목록만)', () => {
    expect(shape(moreGroups({ ...member, peopleOn: true, rankOn: true }))).toEqual([
      'records:played,past', 'club:people,ranking', 'alerts:push', 'settings:dark,tour,terms', 'account:google/done', 'out:logout',
    ]);
    expect(moreGroups({ ...member, peopleOn: true, rankOn: true }).find(x => x.id === 'club')?.title).toBe('모임');
    expect(shape(moreGroups({ ...member, peopleOn: true, rankOn: false }))[1]).toBe('club:people');
    expect(shape(moreGroups({ ...member, loggedIn: false, peopleOn: true, rankOn: true }))).toEqual(['settings:dark,tour,terms']);
  });

  it('위시 API(§4.12)를 알면 모임 그룹 맨 앞에 같이 가요 — 프로필 API 와 따로 본다', () => {
    expect(shape(moreGroups({ ...member, togetherOn: true, peopleOn: true, rankOn: true }))[1]).toBe('club:together,people,ranking');
    expect(shape(moreGroups({ ...member, togetherOn: true }))[1]).toBe('club:together');
    expect(shape(moreGroups({ ...member, loggedIn: false, togetherOn: true }))).toEqual(['settings:dark,tour,terms']);
  });

  it('정산 API(§4.13)를 알면 계정 그룹 맨 앞에 송금 정보', () => {
    expect(shape(moreGroups({ ...member, payOn: true })).find((x) => x.startsWith('account'))).toBe('account:pay,google/done');
    expect(shape(moreGroups({ ...member, loggedIn: false, payOn: true }))).toEqual(['settings:dark,tour,terms']);
  });

  it('운영진이면 운영진 그룹에 멤버 관리', () => {
    const g = moreGroups({ ...member, isAdmin: true, member: { ...approved, kakaoLinked: true } });
    expect(shape(g)).toEqual([
      'records:played,past', 'alerts:push', 'admin:members', 'settings:dark,tour,terms', 'account:kakao/done,google/done', 'out:logout',
    ]);
    expect(g.find(x => x.id === 'admin')?.title).toBe('운영진');
  });

  it('아이디 계정이면 카카오 연결·구글 연결 행(누르면 연결)', () => {
    const g = moreGroups({ ...member, providerIds: ['password'] });
    const acct = g.find(x => x.id === 'account')!;
    expect(acct.rows.map(r => [r.label, r.link])).toEqual([['카카오 연결', 'link'], ['구글 연결', 'link']]);
  });

  it('서버가 동호회 기능을 모르면(member null) 카카오 행을 빼고, 내 기록·알림도 없다', () => {
    const g = moreGroups({ ...member, profileOn: false, clubOn: false, member: null, providerIds: ['password'] });
    expect(shape(g)).toEqual(['settings:dark,tour,terms', 'account:google/link', 'out:logout']);
  });

  it('가입 전·거절·내보낸 계정이면 가입 신청 행(내보낸 계정도 다시 신청, 2026-10-20)', () => {
    for (const status of ['NONE', 'REJECTED', 'REMOVED']) {
      const g = moreGroups({ ...member, profileOn: false, clubOn: false, member: { status, kakaoLinked: false } });
      expect(g.find(x => x.id === 'account')?.rows.map(r => r.id)).toEqual(['google', 'join']);
    }
  });

  it('승인 대기(소셜 계정, 붙은 것 없음)면 계정 그룹 없이 로그아웃만', () => {
    const g = moreGroups({ ...member, profileOn: false, clubOn: false, member: { status: 'PENDING', kakaoLinked: false }, providerIds: [] });
    expect(shape(g)).toEqual(['settings:dark,tour,terms', 'out:logout']);
  });
});
