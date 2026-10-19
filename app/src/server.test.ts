import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addParticipant, conflictOf, createEvent, deleteEvent, errorCode, getEvent, isMissingApi, joinClub, kakaoLogin,
  leaveEvent, listClubMembers, listEvents, listMembers, memberAction, removeParticipant, sayClub, setBooked,
  setMemberRole, updateEvent, listPlayed, addPlayed, deletePlayed, memberPlayed, listThemes, myPastEvents, freshThemes, joinEvent, setAvailability, clearAvailability,
} from './server';
import type { EventInput } from './server';

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
    await joinClub('곰', 'TOK');
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

describe('sayClub', () => {
  it('카카오 코드 재사용 400 은 서버 문구 그대로', async () => {
    stubFetch(400, { error: 'KAKAO_CODE_INVALID', message: '카카오 로그인이 만료됐어요. 다시 눌러 주세요.' });
    const err = await kakaoLogin('c', 'r').catch(e => e);
    expect(sayClub(err)).toBe('카카오 로그인이 만료됐어요. 다시 눌러 주세요.');
  });

  it('404 면 서버가 모른다는 문구', async () => {
    stubFetch(404, {});
    const err = await joinClub('a', 'T').catch(e => e);
    expect(sayClub(err)).toBe('서버가 아직 동호회 기능을 몰라요. 잠시 뒤 다시 열어 주세요.');
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
    await joinClub('a', 'T');
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
    let fn = stubFetch(200, []);
    await myPastEvents('2026-10-19', 20, 'T');
    expect(call(fn).url).toContain('/api/me/events?before=2026-10-19&limit=20');
    fn = stubFetch(200, []);
    await myPastEvents(null, 20, 'T');
    expect(call(fn).url).toMatch(/\/api\/me\/events\?limit=20$/);
    fn = stubFetch(200, {});
    await freshThemes(7, '2026-11-01', 'T');
    expect(call(fn).url).toContain('/api/club/events/7/fresh-themes?date=2026-11-01');
    fn = stubFetch(200, {});
    await freshThemes(7, null, 'T');
    expect(call(fn).url).toMatch(/fresh-themes$/);
  });
});
