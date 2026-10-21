import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addParticipant, conflictOf, createEvent, deleteEvent, errorCode, getEvent, getMe, isMissingApi, joinClub, kakaoLogin,
  leaveEvent, listClubMembers, listEvents, listMembers, memberAction, removeParticipant, sayClub, setBooked,
  setMemberRole, updateEvent, listPlayed, addPlayed, deletePlayed, memberPlayed, listThemes, myPastEvents, freshThemes, joinEvent, setAvailability, clearAvailability,
  pushTest, deviceStatus, pushTestMessage, updateProfile, rankings, addWatch, sayWatch,
  listMyWishes, addWish, deleteWish, listClubWishes,
  getSettlement, putSettlement, markTransfer, getPayInfo, putPayInfo, settleConflictOf,
} from './server';
import type { EventInput, ProfileDto } from './server';

/* fetch 를 대체해 요청 모양만 본다 — 서버 없이 계약(작업명세서 §4.6)을 확인한다. */
function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const call = (fn: ReturnType<typeof stubFetch>) => {
  const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

afterEach(() => vi.unstubAllGlobals());

describe('동호회 API 호출', () => {
  it('kakaoLogin 은 Authorization 없이 POST 한다', async () => {
    const fn = stubFetch(200, { customToken: 'ct' });
    const r = await kakaoLogin('CODE', 'https://x/cb');
    const { url, init, headers } = call(fn);
    expect(r).toEqual({ customToken: 'ct' });
    expect(url).toContain('/api/auth/kakao');
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ code: 'CODE', redirectUri: 'https://x/cb' });
  });

  it('joinClub 은 Bearer 를 싣는다', async () => {
    const fn = stubFetch(200, { uid: 'u', nickname: '곰', role: null, status: 'PENDING', kakaoLinked: false });
    await joinClub('곰', null, 'TOK');
    const { url, init, headers } = call(fn);
    expect(url).toContain('/api/me/join');
    expect(headers.Authorization).toBe('Bearer TOK');
    expect(JSON.parse(init.body as string)).toEqual({ nickname: '곰' });
  });

  it('멤버 목록·작업·역할 경로', async () => {
    let fn = stubFetch(200, []);
    await listMembers('PENDING', 'T');
    expect(call(fn).url).toContain('/api/admin/members?status=PENDING');
    expect(call(fn).init.method).toBe('GET');
    fn = stubFetch(200, {});
    await memberAction('kakao:1', 'approve', 'T');
    expect(call(fn).url).toContain('/api/admin/members/kakao%3A1/approve');
    expect(call(fn).init.method).toBe('POST');
    fn = stubFetch(200, {});
    await setMemberRole('u', 'ADMIN', 'T');
    expect(call(fn).url).toContain('/api/admin/members/u/role');
    expect(JSON.parse(call(fn).init.body as string)).toEqual({ role: 'ADMIN' });
  });
});

describe('멤버 프로필·랭킹 (§4.11)', () => {
  const PROFILE: ProfileDto = {
    realName: '김방탈', birthDate: '1997-06-28', mbti: 'ENFP', roomCount: 312, genres: ['공포', '추리'],
    lifeTheme: { themeName: '메모리컴퍼니', branchName: '키이스케이프 강남점', themeKey: 'k-mem' }, residence: '서울 마포구',
  };

  it('가입 신청에 프로필을 함께 싣는다', async () => {
    const fn = stubFetch(200, { uid: 'u', nickname: '곰', role: null, status: 'PENDING', kakaoLinked: false, profile: PROFILE });
    const me = await joinClub('곰', PROFILE, 'T');
    expect(JSON.parse(call(fn).init.body as string)).toEqual({ nickname: '곰', profile: PROFILE });
    expect(me.profile).toEqual(PROFILE);
  });

  it('프로필 고치기는 PUT /api/me/profile 에 별명과 통째로', async () => {
    const fn = stubFetch(200, { uid: 'u', nickname: '새별명', role: 'MEMBER', status: 'APPROVED', kakaoLinked: false, profile: PROFILE });
    await updateProfile('새별명', PROFILE, 'T');
    const { url, init, headers } = call(fn);
    expect(url).toContain('/api/me/profile');
    expect(init.method).toBe('PUT');
    expect(headers.Authorization).toBe('Bearer T');
    expect(JSON.parse(init.body as string)).toEqual({ nickname: '새별명', profile: PROFILE });
  });

  it('랭킹은 YYYY-MM 범위로 묻고, ranks 가 빠져 와도 빈 배열', async () => {
    const fn = stubFetch(200, [{ month: '2026-10', ranks: [{ rank: 1, uid: 'a', nickname: '곰', count: 3 }] }, { month: '2026-09' }]);
    const r = await rankings('2026-08', '2026-10', 'T');
    expect(call(fn).url).toContain('/api/club/rankings?from=2026-08&to=2026-10');
    expect(r[1].ranks).toEqual([]);
  });

  it('옛 서버 응답(profile 필드 없음)은 그대로 undefined — null(안 채움)과 구별한다', async () => {
    stubFetch(200, { uid: 'u', nickname: '곰', role: 'MEMBER', status: 'APPROVED', kakaoLinked: false });
    expect((await joinClub('곰', PROFILE, 'T')).profile).toBeUndefined();
    stubFetch(200, [{ uid: 'u', nickname: '곰' }]);
    const [m] = await listClubMembers('T');
    expect(m.profile).toBeUndefined();
    expect(m.role).toBeUndefined();
  });

  it('거주지역 — 옛 서버(칸 없음)는 null 로 맞추고 residenceOn=false, 칸이 오면(null 이어도) residenceOn=true', async () => {
    const { residence: _r, ...old } = PROFILE;
    void _r;
    const me = (profile: unknown) => ({ uid: 'u', nickname: '곰', role: 'MEMBER', status: 'APPROVED', kakaoLinked: false, profile });
    stubFetch(200, me(old));
    let m = await getMe('T');
    expect(m.profile?.residence).toBeNull();
    expect(m.residenceOn).toBe(false);
    stubFetch(200, me({ ...old, residence: null }));
    m = await updateProfile('곰', PROFILE, 'T');
    expect(m.profile?.residence).toBeNull();
    expect(m.residenceOn).toBe(true);
    stubFetch(200, me(PROFILE));
    m = await joinClub('곰', PROFILE, 'T');
    expect(m.profile?.residence).toBe('서울 마포구');
    expect(m.residenceOn).toBe(true);
    stubFetch(200, me(null));
    expect((await getMe('T')).residenceOn).toBeUndefined();
    stubFetch(200, [{ uid: 'u', nickname: '곰', profile: old }, { uid: 'v', nickname: '말', profile: null }]);
    const list = await listClubMembers('T');
    expect(list[0].profile?.residence).toBeNull();
    expect(list[1].profile).toBeNull();
    stubFetch(200, [{ uid: 'u', nickname: '곰', role: 'MEMBER', status: 'APPROVED', createdAt: '', decidedAt: null, hasDevice: false, profile: old }]);
    expect((await listMembers('ALL', 'T'))[0].profile?.residence).toBeNull();
  });

  it('랭킹 API 를 모르는 서버(본문 없는 404)는 isMissingApi, BAD_RANGE 는 서버 문구', async () => {
    stubFetch(404, {});
    expect(isMissingApi(await rankings('2026-08', '2026-10', 'T').catch(e => e))).toBe(true);
    stubFetch(400, { error: 'BAD_RANGE', message: '랭킹은 한 번에 12달까지 볼 수 있어요.' });
    const err = await rankings('2025-01', '2026-10', 'T').catch(e => e);
    expect(isMissingApi(err)).toBe(false);
    expect(sayClub(err)).toBe('랭킹은 한 번에 12달까지 볼 수 있어요.');
  });
});

describe('sayClub', () => {
  it('카카오 코드 재사용 400 은 서버 문구 그대로', async () => {
    stubFetch(400, { error: 'KAKAO_CODE_INVALID', message: '카카오 로그인이 만료됐어요. 다시 눌러 주세요.' });
    const err = await kakaoLogin('c', 'r').catch(e => e);
    expect(sayClub(err)).toBe('카카오 로그인이 만료됐어요. 다시 눌러 주세요.');
  });

  it('404 면 서버가 모른다는 문구', async () => {
    stubFetch(404, {});
    const err = await joinClub('a', null, 'T').catch(e => e);
    expect(sayClub(err)).toBe('서버가 아직 이 기능을 몰라요. 잠시 뒤 다시 열어 주세요.');
  });

  it('"동호회" 가 든 옛 서버 문구 — 아는 코드는 앱 문구로, 모르는 코드는 서버 문구 그대로(낱말만 빼면 뜻이 바뀐다)', async () => {
    stubFetch(403, { error: 'NOT_CLUB_MEMBER', message: '동호회 승인을 받은 계정만 볼 수 있어요.' });
    expect(sayClub(await memberAction('u', 'remove', 'T').catch(e => e))).toBe('가입 승인을 받은 계정만 일정을 볼 수 있어요.');
    stubFetch(403, { error: 'NOT_MEMBER', message: '동호회 승인을 받은 계정만 빈자리 알림을 걸 수 있어요.' });
    const w = await addWatch(1, 'T').catch(e => e);
    expect([sayWatch(w), sayClub(w)]).toEqual(['가입 승인을 받은 계정만 빈자리 알림을 걸 수 있어요.', '가입 승인을 받은 계정만 빈자리 알림을 걸 수 있어요.']);
    stubFetch(400, { error: 'SOMETHING', message: '동호회 일정은 6개까지예요.' });
    expect(sayClub(await memberAction('u', 'remove', 'T').catch(e => e))).toBe('동호회 일정은 6개까지예요.');
    stubFetch(409, { error: 'SOMETHING', message: '같은 동호회 사람만 넣을 수 있어요.' });
    expect(sayWatch(await addWatch(1, 'T').catch(e => e))).toBe('같은 동호회 사람만 넣을 수 있어요.');
  });

  it('본문 message 가 있으면 404 여도 그 문구', async () => {
    stubFetch(404, { error: 'NO_SUCH_MEMBER', message: '그런 멤버를 찾을 수 없어요.' });
    const err = await memberAction('u', 'remove', 'T').catch(e => e);
    expect(sayClub(err)).toBe('그런 멤버를 찾을 수 없어요.');
  });
});

describe('요청 시간 제한', () => {
  it('타임아웃·중단 오류는 사람 말로 나온다', async () => {
    const t = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const a = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(sayClub(t)).toBe('서버가 응답하지 않아요. 잠시 뒤에 다시 해 주세요.');
    expect(sayClub(a)).toBe('서버가 응답하지 않아요. 잠시 뒤에 다시 해 주세요.');
  });

  it('요청에 AbortSignal 이 실린다', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await joinClub('a', null, 'T');
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

const input: EventInput = {
  title: '', date: '2026-10-24', startMin: null, endMin: null, location: null,
  capacity: null, booked: false, memo: null, segments: [],
};

describe('동호회 일정 API 호출 (§4.7)', () => {
  it('listEvents 는 from·to 를 싣고 Bearer 를 보낸다', async () => {
    const fn = stubFetch(200, []);
    expect(await listEvents('2026-10-19', '2026-12-19', 'T')).toEqual([]);
    const c = call(fn);
    expect(c.url).toMatch(/\/api\/club\/events\?from=2026-10-19&to=2026-12-19$/);
    expect(c.init.method).toBe('GET');
    expect(c.headers.Authorization).toBe('Bearer T');
  });

  it('getEvent·createEvent 경로와 메서드', async () => {
    let fn = stubFetch(200, { id: 7 });
    await getEvent(7, 'T');
    expect(call(fn).url).toMatch(/\/api\/club\/events\/7$/);
    fn = stubFetch(200, { id: 8 });
    await createEvent(input, 'T');
    const c = call(fn);
    expect(c.url).toMatch(/\/api\/club\/events$/);
    expect(c.init.method).toBe('POST');
    expect(JSON.parse(c.init.body as string)).toEqual(input);
  });

  it('updateEvent 는 version 을 본문에 싣는다', async () => {
    const fn = stubFetch(200, { id: 3, version: 5 });
    await updateEvent(3, input, 4, 'T');
    const c = call(fn);
    expect(c.url).toMatch(/\/api\/club\/events\/3$/);
    expect(c.init.method).toBe('POST');
    expect(JSON.parse(c.init.body as string)).toEqual({ ...input, version: 4 });
  });

  it('참여·취소·대신 넣기·빼기·예약 상태 경로', async () => {
    let fn = stubFetch(200, {});
    await joinEvent(3, 'T');
    expect([call(fn).url.split('/api')[1], call(fn).init.method]).toEqual(['/club/events/3/join', 'POST']);
    fn = stubFetch(200, {});
    await leaveEvent(3, 'T');
    expect([call(fn).url.split('/api')[1], call(fn).init.method]).toEqual(['/club/events/3/leave', 'POST']);
    fn = stubFetch(200, {});
    await addParticipant(3, 'u 1', 'T');
    expect([call(fn).url.split('/api')[1], call(fn).init.method]).toEqual(['/club/events/3/participants', 'POST']);
    expect(JSON.parse(call(fn).init.body as string)).toEqual({ uid: 'u 1' });
    fn = stubFetch(200, {});
    await removeParticipant(3, 'u 1', 'T');
    expect([call(fn).url.split('/api')[1], call(fn).init.method]).toEqual(['/club/events/3/participants/u%201', 'DELETE']);
    fn = stubFetch(200, {});
    await setBooked(3, true, 'T');
    expect([call(fn).url.split('/api')[1], call(fn).init.method]).toEqual(['/club/events/3/booking', 'POST']);
    expect(JSON.parse(call(fn).init.body as string)).toEqual({ booked: true });
  });

  it('listClubMembers 는 /api/club/members', async () => {
    const fn = stubFetch(200, [{ uid: 'a', nickname: '가' }]);
    expect(await listClubMembers('T')).toEqual([{ uid: 'a', nickname: '가' }]);
    expect(call(fn).url).toMatch(/\/api\/club\/members$/);
  });

  it('삭제 200 은 void 로 끝난다', async () => {
    const fn = stubFetch(200, { id: 3, deleted: true });
    await expect(deleteEvent(3, 'T')).resolves.toBeUndefined();
    expect(call(fn).init.method).toBe('DELETE');
  });

  it('삭제 404 는 성공', async () => {
    stubFetch(404, { error: 'NO_SUCH_EVENT', message: '일정을 찾을 수 없어요.' });
    await expect(deleteEvent(3, 'T')).resolves.toBeUndefined();
    stubFetch(404, {});
    await expect(deleteEvent(3, 'T')).resolves.toBeUndefined();
  });

  it('삭제 403 은 그대로 던진다', async () => {
    stubFetch(403, { error: 'NOT_EVENT_OWNER', message: 'x' });
    const err = await deleteEvent(3, 'T').catch(e => e);
    expect(errorCode(err)).toBe('NOT_EVENT_OWNER');
  });

  it('충돌이면 최신 일정을 꺼낸다', async () => {
    stubFetch(409, { error: 'EVENT_CONFLICT', message: '다른 사람이 먼저 고쳤어요.', event: { id: 3, version: 5 } });
    const err = await updateEvent(3, input, 4, 'T').catch(e => e);
    expect(conflictOf(err)?.version).toBe(5);
    expect(errorCode(err)).toBe('EVENT_CONFLICT');
    stubFetch(409, { error: 'EVENT_FULL', message: '자리가 다 찼어요.' });
    const full = await joinEvent(3, 'T').catch(e => e);
    expect(conflictOf(full)).toBeNull();
    expect(errorCode(full)).toBe('EVENT_FULL');
  });

  it('2단계 모양 응답(candidates·playedBy 없음)에도 기본값을 채운다', async () => {
    const old = { id: 1, segments: [{ themeName: 'A' }, { themeName: 'B', playedBy: ['u1'] }] };
    stubFetch(200, old);
    const one = await getEvent(1, 'T');
    expect(one.candidates).toEqual([]);
    expect(one.segments.map((x) => x.playedBy)).toEqual([[], ['u1']]);
    stubFetch(200, [{ id: 2 }]);
    const [two] = await listEvents('2026-10-19', '2026-12-19', 'T');
    expect(two.candidates).toEqual([]);
    expect(two.segments).toEqual([]);
  });

  it('충돌 본문의 일정도 기본값을 채운다', async () => {
    stubFetch(409, { error: 'EVENT_CONFLICT', message: 'x', event: { id: 3, version: 5, segments: [{ themeName: 'A' }] } });
    const err = await updateEvent(3, input, 4, 'T').catch(e => e);
    const ev = conflictOf(err);
    expect(ev?.candidates).toEqual([]);
    expect(ev?.segments[0].playedBy).toEqual([]);
  });

  it('충돌 아닌 값·일반 오류는 null', () => {
    expect(conflictOf(new Error('x'))).toBeNull();
    expect(conflictOf(null)).toBeNull();
    expect(errorCode(undefined)).toBeNull();
    expect(errorCode(new Error('x'))).toBeNull();
  });

  it('본문 없는 404 는 API 없음, NO_SUCH_EVENT 404 는 아님', async () => {
    stubFetch(404, {});
    expect(isMissingApi(await getEvent(1, 'T').catch(e => e))).toBe(true);
    stubFetch(404, { error: 'NO_SUCH_EVENT', message: '없어요.' });
    expect(isMissingApi(await getEvent(1, 'T').catch(e => e))).toBe(false);
    stubFetch(500, {});
    expect(isMissingApi(await getEvent(1, 'T').catch(e => e))).toBe(false);
  });
});

describe('시간 협의 API (§4.8)', () => {
  it('setAvailability 는 POST …/availability 본문을 그대로', async () => {
    const fn = stubFetch(200, {});
    const body = { date: '2026-10-31', available: true, startMin: 840, endMin: 1080 };
    await setAvailability(3, body, 'T');
    expect([call(fn).url.split('/api')[1], call(fn).init.method]).toEqual(['/club/events/3/availability', 'POST']);
    expect(JSON.parse(call(fn).init.body as string)).toEqual(body);
  });

  it('clearAvailability 는 DELETE …/availability/2026-10-31', async () => {
    const fn = stubFetch(200, {});
    await clearAvailability(3, '2026-10-31', 'T');
    expect([call(fn).url.split('/api')[1], call(fn).init.method]).toEqual(['/club/events/3/availability/2026-10-31', 'DELETE']);
  });
});

describe('해 본 테마 API 호출', () => {
  it('listPlayed·addPlayed·deletePlayed·memberPlayed 경로와 본문', async () => {
    let fn = stubFetch(200, []);
    await listPlayed('T');
    expect(call(fn).url).toContain('/api/me/played');
    expect(call(fn).init.method).toBe('GET');
    fn = stubFetch(200, {});
    await addPlayed({ themeName: '화원', playedOn: '2026-10-01', source: 'PLAN' }, 'T');
    expect(call(fn).init.method).toBe('POST');
    expect(JSON.parse(call(fn).init.body as string)).toEqual({ themeName: '화원', playedOn: '2026-10-01', source: 'PLAN' });
    fn = stubFetch(200, { id: 5, deleted: true });
    await deletePlayed(5, 'T');
    expect(call(fn).url).toContain('/api/me/played/5');
    expect(call(fn).init.method).toBe('DELETE');
    fn = stubFetch(200, []);
    await memberPlayed('kakao:1', 'T');
    expect(call(fn).url).toContain('/api/club/members/kakao%3A1/played');
  });
  it('deletePlayed 는 평소엔 keepalive 없이, 옵션을 줄 때만 keepalive. 받은 기록의 storeName 이 없으면 null', async () => {
    let fn = stubFetch(200, { id: 5, deleted: true });
    await deletePlayed(5, 'T');
    expect(call(fn).init.keepalive).toBeUndefined();
    fn = stubFetch(200, { id: 5, deleted: true });
    await deletePlayed(5, 'T', { keepalive: true });
    expect(call(fn).init.keepalive).toBe(true);
    fn = stubFetch(200, [{ id: 1, themeName: 'x' }]);
    expect((await listPlayed('T'))[0].storeName).toBeNull();
    expect(call(fn).init.keepalive).toBeUndefined();
  });
  it('deletePlayed 는 404 를 성공으로 치지 않고 던진다', async () => {
    stubFetch(404, { error: 'NO_SUCH_PLAYED', message: 'x' });
    await expect(deletePlayed(9, 'T')).rejects.toBeTruthy();
  });
  it('listThemes 는 토큰 없이', async () => {
    const fn = stubFetch(200, []);
    await listThemes();
    expect(call(fn).url).toContain('/api/themes');
    expect(call(fn).headers?.Authorization).toBeUndefined();
  });
  it('myPastEvents·freshThemes 경로', async () => {
    let fn = stubFetch(200, { events: [], total: 0 });
    await myPastEvents({ before: '2026-10-19' }, 20, 'T');
    expect(call(fn).url).toContain('/api/me/events?before=2026-10-19&limit=20');
    fn = stubFetch(200, { events: [], total: 0 });
    await myPastEvents(null, 20, 'T');
    expect(call(fn).url).toMatch(/\/api\/me\/events\?limit=20$/);
    /* 커서는 앞 쪽 마지막 일정의 (date, id) 그대로, 응답은 { events, total } */
    fn = stubFetch(200, { events: [{ id: 3, date: '2026-10-04', segments: [{ themeName: 'x', startMin: 600 }] }], total: 23 });
    const r = await myPastEvents({ before: '2026-10-04', beforeId: 7 }, 10, 'T');
    expect(call(fn).url).toContain('/api/me/events?before=2026-10-04&beforeId=7&limit=10');
    expect(r.total).toBe(23);
    expect(r.events[0].candidates).toEqual([]);
    expect(r.events[0].segments[0].playedBy).toEqual([]);
    fn = stubFetch(200, {});
    await freshThemes(7, '2026-11-01', 'T');
    expect(call(fn).url).toContain('/api/club/events/7/fresh-themes?date=2026-11-01');
    fn = stubFetch(200, {});
    await freshThemes(7, null, 'T');
    expect(call(fn).url).toMatch(/fresh-themes$/);
    /* 배열 필드가 빠져 와도 빈 배열로 채운다 */
    stubFetch(200, { date: '2026-11-01', collected: true, checkedAt: null, themes: [{ id: 'a', name: 'x' }] });
    const f = await freshThemes(7, '2026-11-01', 'T');
    expect([f.missing, f.noRecord, f.themes[0].playedBy, f.themes[0].sessions]).toEqual([[], [], [], []]);
  });
});

describe('이 기기 알림 API (§4.10)', () => {
  it('pushTest 는 본문 없이 POST /api/me/push-test, Bearer 를 싣는다', async () => {
    const fn = stubFetch(200, { devices: 2, delivered: 2, failed: 0 });
    const r = await pushTest('AUTH');
    const { url, init, headers } = call(fn);
    expect(url).toMatch(/\/api\/me\/push-test$/);
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer AUTH');
    expect(init.body).toBeUndefined();
    expect(r).toEqual({ devices: 2, delivered: 2, failed: 0 });
  });
  it('deviceStatus 는 기기 토큰을 본문 { token } 으로, 로그인 토큰은 Bearer 로', async () => {
    const fn = stubFetch(200, { registered: true });
    const r = await deviceStatus('DEV', 'AUTH');
    const { url, init, headers } = call(fn);
    expect(url).toMatch(/\/api\/devices\/status$/);
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer AUTH');
    expect(JSON.parse(init.body as string)).toEqual({ token: 'DEV' });
    expect(r.registered).toBe(true);
  });
  it('1분 안에 다시 보내면 429 — 서버 문구 그대로', async () => {
    stubFetch(429, { error: 'TOO_SOON', message: '1분 뒤에 다시 보내 주세요.' });
    const e = await pushTest('AUTH').catch((x) => x);
    expect(errorCode(e)).toBe('TOO_SOON');
    expect(sayClub(e)).toBe('1분 뒤에 다시 보내 주세요.');
    expect(isMissingApi(e)).toBe(false);
  });
  it('5단계 전 서버(본문 없는 404)는 isMissingApi', async () => {
    const fn = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fn);
    expect(isMissingApi(await pushTest('AUTH').catch((x) => x))).toBe(true);
    expect(isMissingApi(await deviceStatus('DEV', 'AUTH').catch((x) => x))).toBe(true);
  });
  it('테스트 알림 결과 문구 — 나간 수(delivered), 기기 없음, 하나도 못 보냄', () => {
    expect(pushTestMessage({ devices: 2, delivered: 2, failed: 0 })).toBe('2대 기기로 보냈어요.');
    expect(pushTestMessage({ devices: 3, delivered: 1, failed: 2 })).toBe('1대 기기로 보냈어요.');
    expect(pushTestMessage({ devices: 0, delivered: 0, failed: 0 })).toBe('이 계정에 등록된 기기가 없어요. 알림 켜기를 먼저 해 주세요.');
    expect(pushTestMessage({ devices: 1, delivered: 0, failed: 1 })).toBe('기기로 보내지 못했어요. 알림 켜기를 다시 해 주세요.');
  });
});

describe('같이 갈 사람 찾기 API (§4.12)', () => {
  it('내 위시 목록·올리기 모양, storeName 이 빠져 오면 null', async () => {
    let fn = stubFetch(200, [{ id: 1, themeKey: null, themeName: '고백', branchName: null, createdAt: 'x' }]);
    const list = await listMyWishes('T');
    expect(call(fn).url).toContain('/api/me/wishes');
    expect(list[0].storeName).toBeNull();
    fn = stubFetch(200, { id: 2, themeKey: 'k', themeName: '월야애담', branchName: '홍대', storeName: '비트포비아', createdAt: 'x' });
    await addWish({ themeKey: 'k', themeName: '월야애담', branchName: '홍대' }, 'T');
    const { init } = call(fn);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ themeKey: 'k', themeName: '월야애담', branchName: '홍대' });
  });

  it('내리기 — NO_SUCH_WISH(이미 내려감)는 성공, 본문 없는 404(서버가 모름)는 던진다', async () => {
    const fn = stubFetch(404, { error: 'NO_SUCH_WISH', message: '…' });
    await expect(deleteWish(3, 'T')).resolves.toBeUndefined();
    expect(call(fn).url).toContain('/api/me/wishes/3');
    expect(call(fn).init.method).toBe('DELETE');
    stubFetch(404, {});
    const err = await deleteWish(3, 'T').catch((e) => e);
    expect(isMissingApi(err)).toBe(true);
  });

  it('묶음 — 빠진 배열은 빈 배열로', async () => {
    stubFetch(200, [{ themeKey: 'k', themeName: '월야애담', branchName: null }]);
    const [g] = await listClubWishes('T');
    expect(g).toMatchObject({ storeName: null, wanters: [], playedBy: [] });
  });

  it('오류 문구 — 서버 message 그대로(§4.13 서버가 정한 문구)', async () => {
    stubFetch(409, { error: 'TOO_MANY_WISHES', message: '하고 싶은 테마는 200개까지 담을 수 있어요.' });
    const err = await addWish({ themeName: 'a' }, 'T').catch((e) => e);
    expect(sayClub(err)).toBe('하고 싶은 테마는 200개까지 담을 수 있어요.');
  });
});

describe('정산 API (§4.13)', () => {
  const S = { eventId: 5, version: 2, updatedAt: null, updatedBy: null, items: [], total: 0, transfers: [], payInfo: {} };
  it('GET·PUT 모양 — PUT 은 { version, items } 통째로, 정수 그대로', async () => {
    let fn = stubFetch(200, { eventId: 5, version: 0 });
    const d = await getSettlement(5, 'T');
    expect(call(fn).url).toContain('/api/club/events/5/settlement');
    expect(d).toMatchObject({ items: [], transfers: [], payInfo: {}, total: 0 });
    fn = stubFetch(200, S);
    const items = [{ label: '방탈출', amount: 132000, payerUid: 'a', shares: [{ uid: 'a', amount: 66000 }, { uid: 'b', amount: 66000 }] }];
    await putSettlement(5, 2, items, 'T');
    const { init } = call(fn);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ version: 2, items });
    expect(init.body).toContain('"amount":132000');
  });
  it('보냈어요 — POST …/transfers { fromUid, toUid, paid }', async () => {
    const fn = stubFetch(200, S);
    await markTransfer(5, 'b', 'a', true, 'T');
    const { url, init } = call(fn);
    expect(url).toContain('/api/club/events/5/settlement/transfers');
    expect(JSON.parse(init.body as string)).toEqual({ fromUid: 'b', toUid: 'a', paid: true });
  });
  it('409 SETTLEMENT_CONFLICT 면 본문의 최신 정산, 다른 오류는 null', async () => {
    stubFetch(409, { error: 'SETTLEMENT_CONFLICT', message: '다른 사람이 먼저 고쳤어요. 새로 불러온 정산을 확인해 주세요.', settlement: { ...S, version: 4 } });
    const err = await putSettlement(5, 2, [], 'T').catch((e) => e);
    expect(settleConflictOf(err)?.version).toBe(4);
    expect(sayClub(err)).toBe('다른 사람이 먼저 고쳤어요. 새로 불러온 정산을 확인해 주세요.');
    stubFetch(400, { error: 'BAD_SETTLEMENT', message: '정산 내용을 다시 확인해 주세요.' });
    const bad = await putSettlement(5, 2, [], 'T').catch((e) => e);
    expect(settleConflictOf(bad)).toBeNull();
    expect(sayClub(bad)).toBe('정산 내용을 다시 확인해 주세요.');
  });
  it('NOT_PARTICIPANT 는 상황별 서버 문구 그대로', async () => {
    stubFetch(403, { error: 'NOT_PARTICIPANT', message: '보내는 사람, 받는 사람, 만든 사람, 운영진만 체크할 수 있어요.' });
    const err = await markTransfer(5, 'b', 'a', true, 'T').catch((e) => e);
    expect(sayClub(err)).toBe('보내는 사람, 받는 사람, 만든 사람, 운영진만 체크할 수 있어요.');
  });
  it('송금 정보 GET·PUT, 빠진 칸은 null', async () => {
    let fn = stubFetch(200, {});
    expect(await getPayInfo('T')).toEqual({ bankText: null, kakaopayUrl: null });
    expect(call(fn).url).toContain('/api/me/payinfo');
    fn = stubFetch(200, { bankText: '카뱅', kakaopayUrl: null });
    await putPayInfo({ bankText: '카뱅', kakaopayUrl: null }, 'T');
    expect(call(fn).init.method).toBe('PUT');
    expect(JSON.parse(call(fn).init.body as string)).toEqual({ bankText: '카뱅', kakaopayUrl: null });
  });
  it('일정의 settlementTotal — 옛 서버(없음)는 null, 있으면 그대로', async () => {
    stubFetch(200, [{ id: 1, segments: [] }, { id: 2, segments: [], settlementTotal: 212000 }]);
    const evs = await listEvents('2026-10-01', '2026-10-31', 'T');
    expect(evs.map((e) => e.settlementTotal)).toEqual([null, 212000]);
  });
});
