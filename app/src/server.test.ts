import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinClub, kakaoLogin, listMembers, memberAction, sayClub, setMemberRole } from './server';

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
