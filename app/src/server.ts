import type { Session } from './core';

/* 서버에서 회차 불러오기 (F-15) — 네트워크만. index.html의 server.js 이식.
   서버는 선택이다 — 여기가 통째로 실패해도 직접 입력·사진 경로는 그대로 동작한다.
   계약: 서버 저장소 작업명세서 §4.4, §6.5. */

/* ⚠️ 서버를 옮기면 여기와 index.html의 server.js DEFAULT_BASE를 함께 바꾼다. */
const DEFAULT_BASE = 'https://floduler.duckdns.org';

/* 서버 쪽 CORS 허용 출처는 배포 주소(choieuihyun.github.io)뿐이라 로컬 개발
   서버(localhost)에서 절대경로로 바로 fetch하면 막힌다. dev에서는 vite.config.ts의
   프록시가 받아주는 상대경로(/api/...)를 쓰고, 빌드된 프로덕션에서는 배포 주소가
   곧 허용 출처이므로 절대경로를 그대로 쓴다. */
function base(): string {
  try {
    const override = (localStorage.getItem('flod.server') || '').trim();
    if (override) return override;
  } catch { /* 시크릿 창 등에서 localStorage가 막혀 있어도 동작한다 */ }
  return import.meta.env.DEV ? '' : DEFAULT_BASE;
}

/* 서버가 응답 없이 멈춰도 10초 뒤엔 실패시킨다 — 안 그러면 "확인 중"이 끝나지 않는다 */
const TIMEOUT_MS = 10_000;
/* AbortSignal.timeout 은 iOS 15 이하에 없다 — 없으면 시간 제한 없이 보낸다(요청이 통째로 실패하는 것보다 낫다) */
const timeoutSignal = (): AbortSignal | undefined =>
  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;

interface ApiError extends Error {
  status?: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(base() + path, { headers: { Accept: 'application/json' }, signal: timeoutSignal() });
  if (!res.ok) {
    const e: ApiError = new Error('HTTP ' + res.status);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export interface Branch {
  id: string;
  store: string;
  branch: string;
  /* 지역(§4.4, 2026-10-21) — 옛 서버엔 없고, 모르면 null. 화면은 있으면 이름 추측보다 먼저 쓴다(regions.ts) */
  region?: string | null;
  dates: string[];
  checkedAt: string | null;
}

export interface ServerSession {
  id: number;
  t: number;
  soldout?: boolean;
}

export interface ServerTheme {
  id: string;
  name: string;
  place?: string;
  dur?: number;
  genre?: string;
  capacity?: string;
  difficulty?: number;
  posterUrl?: string;
  minPeople?: number;
  maxPeople?: number;
  sessions: ServerSession[];
}

export interface ScheduleResponse {
  store: string;
  branch: string;
  date: string;
  checkedAt: string | null;
  themes: ServerTheme[];
}

/* 지점 목록 — 고를 수 있는 날짜(dates)까지 함께 온다. */
export const branches = (): Promise<Branch[]> => get('/api/branches');

export const schedule = (branchId: string, date: string): Promise<ScheduleResponse> =>
  get(`/api/schedule?branch=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`);

/* 사용자에게 보일 말로 바꾼다. "서버가 없다"가 이 도구의 고장이 아니라는 걸 분명히 한다. */
export function say(err: unknown): string {
  const e = err as ApiError;
  if (e?.status === 404) return '그 날짜는 아직 정보가 없어요. 다른 날짜를 골라 보세요.';
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return '서버가 응답하지 않아요. 잠시 뒤에 다시 해 주세요.';
  if (e instanceof TypeError)              /* fetch가 못 닿으면 TypeError다 */
    return `서버에 연결이 안 돼요 (${base() || DEFAULT_BASE}). 직접 입력과 사진 읽기는 그대로 쓸 수 있어요.`;
  return '불러오지 못했어요. 잠시 뒤에 다시 해 주세요.';
}

/* "3분 전 기준" 같은 말. 취소표는 시간에 민감해서 언제 기준인지가 곧 신뢰다. */
export function ago(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return '방금 기준';
  const m = Math.round(s / 60); if (m < 60) return `${m}분 전 기준`;
  const h = Math.round(m / 60); if (h < 24) return `${h}시간 전 기준`;
  return `${Math.round(h / 24)}일 전 기준`;
}

/* 오름차순으로 세워서 돌려준다. 서버 응답 순서를 그대로 믿으면, 이 배열이
   sessionsToText()로 글자가 됐다가 parseSessions()로 되돌아올 때(자동저장 복원)
   §4.1-2의 "오전/오후 표기가 없으면 오름차순 가정" 보정이 걸려 시각이 12시간씩
   밀린다. 정렬해 두면 그 보정이 아예 발동하지 않아 왕복이 정확해진다. */
export function toSessions(ss: ServerSession[]): Session[] {
  return ss.map(s => ({ t: s.t, soldout: !!s.soldout, id: s.id })).sort((a, b) => a.t - b.t);
}

/* ── F-16 감시 API ── 인증이 필요한 유일한 엔드포인트들이라 get()과 갈라놨다.
   server.ts는 SchedulerPage 가 항상 정적 import하므로, 여기서 cloud.ts를
   끌어오면 로그인 전 0바이트 불변식이 깨진다 — 그래서 토큰은 호출부(지연
   로드되는 useWatches.ts)가 넘겨준다. 계약: 작업명세서 §4.5, 이 세션에서
   테스트 계정으로 실측 확인(2026-09-01). */
export interface WatchDto {
  id: number;
  branch: string;
  theme: string;
  date: string;
  t: number;
  available: boolean;
  createdAt: string;
}

interface WatchApiError extends ApiError {
  body?: { error?: string; message?: string; event?: EventDto; settlement?: SettlementDto };
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
/* token 이 null 이면 Authorization 헤더를 싣지 않는다(카카오 로그인처럼 인증 전 POST). */
/* keepalive: 탭이 닫히거나 가려진 뒤에도 요청이 끝까지 가게(미뤄 둔 지우기, §4.9 내 정보) */
async function send<T>(path: string, token: string | null, method: Method, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(base() + path, {
    method,
    ...(keepalive ? { keepalive: true } : {}),
    headers: {
      Accept: 'application/json',
      ...(token != null ? { Authorization: `Bearer ${token}` } : {}),
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: timeoutSignal(),
  });
  if (!res.ok) {
    const e: WatchApiError = new Error('HTTP ' + res.status);
    e.status = res.status;
    try { e.body = await res.json(); } catch { /* 바디 없는 에러(예: 204류)도 있다 */ }
    throw e;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const authed = <T>(path: string, token: string, method: Method, body?: unknown): Promise<T> =>
  send<T>(path, token, method, body);

/* 실측: GET은 배열이 아니라 { limit, watches } 객체로 온다(작업명세서 §4.5 문서와 다른 점). */
export const listWatches = (token: string): Promise<{ limit: number; watches: WatchDto[] }> =>
  authed('/api/watches', token, 'GET');

export const addWatch = (slotId: number, token: string): Promise<WatchDto> =>
  authed('/api/watches', token, 'POST', { slotId });

export const removeWatch = (id: number, token: string): Promise<void> =>
  authed(`/api/watches/${id}`, token, 'DELETE');

/* 푸시 알림 받을 주소 등록 (작업명세서 §4.5 ㉡). 서버가 지금 502라 계약을
   실측 못 했다 — 문서 스펙 {token, platform} 그대로 가정. 살아나면 재확인. */
export const registerDevice = (deviceToken: string, authToken: string): Promise<void> =>
  authed('/api/devices', authToken, 'POST', { token: deviceToken, platform: 'web' });

/* ── 이 기기 알림 (작업명세서 §4.10, 5단계) ── 둘 다 로그인만 있으면 된다(승인 무관).
   인자 차례는 registerDevice 와 같게 기기 토큰 → 로그인 토큰. 둘 다 문자열이라 바뀌어도 컴파일이 못 잡는다. */
export interface PushTestDto { devices: number; delivered: number; failed: number }

/* 부른 사람 기기에만 보낸다. 1분 안에 다시 부르면 429 TOO_SOON(본문 message 를 그대로 — sayClub) */
export const pushTest = (authToken: string): Promise<PushTestDto> =>
  authed('/api/me/push-test', authToken, 'POST');

/* 이 기기 토큰이 내 계정에 등록돼 있는지. 남의 토큰·모르는 토큰이면 false */
export const deviceStatus = (deviceToken: string, authToken: string): Promise<{ registered: boolean }> =>
  authed('/api/devices/status', authToken, 'POST', { token: deviceToken });

/* 테스트 알림 결과 문구. n 은 실제로 나간 수(delivered). 기기는 있는데 하나도 못 보냈으면(토큰이 낡음 등) 다시 켜라고 한다 */
export function pushTestMessage(r: PushTestDto): string {
  if (r.devices === 0) return '이 계정에 등록된 기기가 없어요. 알림 켜기를 먼저 해 주세요.';
  if (r.delivered === 0) return '기기로 보내지 못했어요. 알림 켜기를 다시 해 주세요.';
  return `${r.delivered}대 기기로 보냈어요.`;
}

/* 3개 제한(409 WATCH_LIMIT_EXCEEDED)은 서버가 이미 완성된 한국어 message를
   주므로 그대로 쓴다 — 나머지 에러는 say()와 같은 판단을 따른다. */
export function sayWatch(err: unknown): string {
  const e = err as WatchApiError;
  if ((e?.status === 409 || e?.status === 400 || e?.status === 403) && e.body?.message) return serverMsg(e); // 403 = NOT_MEMBER
  return say(err);
}

/* 서버 문구를 화면에 보일 때 — 앱이 아는 코드는 앱 문구로(서버가 옛 문구를 보내도 같은 말이 보이게),
   그 밖은 서버 문구 그대로. 낱말만 빼면 "동호회에"·"같은 동호회 사람만" 처럼 조사가 남거나 뜻이 바뀐다 */
const APP_MSG: Record<string, string> = {
  NOT_MEMBER: '가입 승인을 받은 계정만 빈자리 알림을 걸 수 있어요.',
  NOT_CLUB_MEMBER: '가입 승인을 받은 계정만 일정을 볼 수 있어요.',
  /* §4.12·§4.13 오류(BAD_WISH·BAD_SETTLEMENT·NOT_PARTICIPANT 등)는 서버 문구를 그대로 쓴다 — 상황마다 문구가 달라서다(§4.13 서버가 정한 문구) */
};
export function serverMsg(e: WatchApiError): string {
  return APP_MSG[e.body?.error ?? ''] ?? e.body?.message ?? '';
}

/* ── 동호회 계정 API (작업명세서 §4.6) ── 서버가 아직 모르면 404 가 온다.
   토큰은 위 감시 API 와 같은 이유로 호출부가 넘긴다(cloud.ts 를 끌어오지 않는다). */
export interface MeDto {
  uid: string;
  nickname: string | null;
  role: 'ADMIN' | 'MEMBER' | null;
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  kakaoLinked: boolean;
  /* §4.11 — null 은 아직 안 채움, 필드가 없으면(undefined) 서버가 프로필을 모른다(묻지도 보이지도 않는다) */
  profile?: ProfileDto | null;
}

export interface MemberDto {
  uid: string;
  nickname: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  createdAt: string;
  decidedAt: string | null;
  hasDevice: boolean;
  profile?: ProfileDto | null;
}

/* ── 멤버 프로필·랭킹 (작업명세서 §4.11) ── 장르·MBTI 목록과 화면 규칙은 지연 청크(memberProfile.ts)에 둔다 */
export type Genre = '공포' | '스릴러' | '추리' | '미스터리' | '감성' | '드라마' | '코믹' | '판타지' | 'SF' | '어드벤처' | '잠입' | '액션' | '기타';
export type Mbti = 'ISTJ' | 'ISFJ' | 'INFJ' | 'INTJ' | 'ISTP' | 'ISFP' | 'INFP' | 'INTP'
  | 'ESTP' | 'ESFP' | 'ENFP' | 'ENTP' | 'ESTJ' | 'ESFJ' | 'ENFJ' | 'ENTJ' | 'UNKNOWN';
export interface LifeTheme { themeName: string; branchName: string | null; themeKey: string | null }
export interface ProfileDto {
  realName: string;
  birthDate: string; // YYYY-MM-DD
  mbti: Mbti;
  roomCount: number;
  genres: Genre[];
  lifeTheme: LifeTheme;
}
export interface RankMonthDto { month: string; ranks: { rank: number; uid: string; nickname: string; count: number }[] }

/* 로그인 전이라 토큰이 없다 — 받은 customToken 으로 Firebase 에 로그인하는 건 호출부 몫. */
export const kakaoLogin = (code: string, redirectUri: string): Promise<{ customToken: string }> =>
  send('/api/auth/kakao', null, 'POST', { code, redirectUri });

export const kakaoLink = (code: string, redirectUri: string, token: string): Promise<{ linked: boolean }> =>
  authed('/api/auth/kakao/link', token, 'POST', { code, redirectUri });

export const getMe = (token: string): Promise<MeDto> => authed('/api/me', token, 'GET');

/* profile 은 서버가 선택으로 받는다(옛 서버는 무시) — 화면이 필수로 받아 함께 보낸다 */
export const joinClub = (nickname: string, profile: ProfileDto | null, token: string): Promise<MeDto> =>
  authed('/api/me/join', token, 'POST', profile ? { nickname, profile } : { nickname });

/* 별명·프로필을 통째로 바꾼다(PENDING·APPROVED). 서버가 모르면 본문 없는 404 */
export const updateProfile = (nickname: string, profile: ProfileDto, token: string): Promise<MeDto> =>
  authed('/api/me/profile', token, 'PUT', { nickname, profile });

/* from·to 는 YYYY-MM, 둘 다 포함, 12달까지. 최신 달 먼저 */
export const rankings = async (from: string, to: string, token: string): Promise<RankMonthDto[]> =>
  (await authed<RankMonthDto[]>(`/api/club/rankings?from=${from}&to=${to}`, token, 'GET')).map((m) => ({ ...m, ranks: m.ranks ?? [] }));

export const listMembers = (status: 'PENDING' | 'APPROVED' | 'ALL', token: string): Promise<MemberDto[]> =>
  authed(`/api/admin/members?status=${status}`, token, 'GET');

export const memberAction = (uid: string, action: 'approve' | 'reject' | 'remove', token: string): Promise<MemberDto> =>
  authed(`/api/admin/members/${encodeURIComponent(uid)}/${action}`, token, 'POST');

export const setMemberRole = (uid: string, role: 'ADMIN' | 'MEMBER', token: string): Promise<MemberDto> =>
  authed(`/api/admin/members/${encodeURIComponent(uid)}/role`, token, 'POST', { role });

/* 서버가 준 해요체 message 는 상태 코드와 상관없이 그대로 보여 준다(§4.6 에러 본문).
   본문 없는 404 는 서버가 이 기능을 아직 배포받지 못한 것이다. */
export function sayClub(err: unknown): string {
  const e = err as WatchApiError;
  if (e?.body?.message) return serverMsg(e);
  if (e?.status === 404) return '서버가 아직 이 기능을 몰라요. 잠시 뒤 다시 열어 주세요.';
  return say(err);
}

/* ── 동호회 일정 (작업명세서 §4.7) ── */
export interface SegmentInput {
  themeName: string;
  branchName: string | null;
  themeKey: string | null;
  startMin: number;
  endMin: number | null;
}
/* 서버가 읽을 때마다 계산해 붙인다(§4.9) — 그 일정 참여자 중 이 테마를 해 본 사람 */
export interface SegmentDto extends SegmentInput {
  playedBy: string[];
}

export interface EventInput {
  title: string;
  date: string | null; // null = 날짜 미정(§4.8) — candidates 가 1개 이상
  /* 후보 날짜. 빠지거나 null 이면 서버가 그대로 둔다 — 후보를 고칠 때만 보낸다(★ §4.8) */
  candidates?: string[] | null;
  startMin: number | null;
  endMin: number | null;
  location: string | null;
  capacity: number | null;
  booked: boolean;
  memo: string | null;
  segments: SegmentInput[];
}

/* 후보 날짜 하나에 대한 한 사람의 응답(§4.8). 종일 됨 = available true + 시각 둘 다 null */
export interface AvailabilityDto {
  uid: string;
  available: boolean;
  startMin: number | null;
  endMin: number | null;
}
export interface CandidateDto {
  date: string;
  responses: AvailabilityDto[];
}

export interface EventDto {
  id: number;
  title: string;
  date: string | null; // null = 날짜 미정
  candidates: CandidateDto[]; // date 순. 날짜를 정한 뒤에도 남는다

  startMin: number | null;
  endMin: number | null;
  location: string | null;
  capacity: number | null;
  booked: boolean;
  memo: string | null;
  segments: SegmentDto[];
  version: number;
  createdBy: { uid: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  participants: { uid: string; nickname: string; addedBy: string | null; joinedAt: string }[];
  count: number;
  joined: boolean;
  mine: boolean;
  canManage: boolean;
  /* 정산(§4.13)이 있으면 합계, 없으면 null — 목록·칩용. 옛 서버면 빠져 오는데 normEvent 가 null 로 채운다 */
  settlementTotal: number | null;
}

/* §4.11 에서 늘어난 필드는 옛 서버면 빠져 온다 — 정규화하지 않고 undefined 로 둔다(프로필 없음 = null 과 구별) */
export interface ClubMemberDto {
  uid: string;
  nickname: string;
  role?: 'ADMIN' | 'MEMBER';
  approvedAt?: string | null;
  profile?: ProfileDto | null;
}

const EVENTS = '/api/club/events';

/* 서버가 2단계 모양(candidates·playedBy 없음)으로 답해도(배포 경주 등) 화면이 안 깨지게 경계에서 기본값을 채운다.
   타입은 필수 필드 그대로 두고, 이 함수가 실행 시점에 보장한다. */
export function normEvent(ev: EventDto): EventDto {
  return {
    ...ev,
    candidates: ev.candidates ?? [],
    segments: (ev.segments ?? []).map((s) => ({ ...s, playedBy: s.playedBy ?? [] })),
    settlementTotal: ev.settlementTotal ?? null,
  };
}
const evOne = async (p: Promise<EventDto>): Promise<EventDto> => normEvent(await p);
const evMany = async (p: Promise<EventDto[]>): Promise<EventDto[]> => (await p).map(normEvent);

export const listEvents = (from: string, to: string, token: string): Promise<EventDto[]> =>
  evMany(authed(`${EVENTS}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token, 'GET'));

export const getEvent = (id: number, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}`, token, 'GET'));

export const createEvent = (input: EventInput, token: string): Promise<EventDto> =>
  evOne(authed(EVENTS, token, 'POST', input));

/* version 은 화면이 받아 둔 값. 다르면 서버가 409 EVENT_CONFLICT 로 거절한다. */
export const updateEvent = (id: number, input: EventInput, version: number, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}`, token, 'POST', { ...input, version }));

/* 이미 지워졌으면(404) 목적은 이뤄진 것이라 성공으로 끝낸다. 그 밖의 오류는 그대로 던진다. */
export async function deleteEvent(id: number, token: string): Promise<void> {
  try {
    await authed<unknown>(`${EVENTS}/${id}`, token, 'DELETE');
  } catch (e) {
    if ((e as WatchApiError)?.status === 404) return;
    throw e;
  }
}

export const joinEvent = (id: number, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}/join`, token, 'POST'));

export const leaveEvent = (id: number, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}/leave`, token, 'POST'));

export const addParticipant = (id: number, uid: string, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}/participants`, token, 'POST', { uid }));

export const removeParticipant = (id: number, uid: string, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}/participants/${encodeURIComponent(uid)}`, token, 'DELETE'));

export const setBooked = (id: number, booked: boolean, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}/booking`, token, 'POST', { booked }));

export interface AvailabilityInput {
  date: string;
  available: boolean;
  startMin: number | null;
  endMin: number | null;
}

/* 되는 시간 고르기(§4.8). 같은 날짜면 덮어쓴다, version 은 안 오른다. */
export const setAvailability = (id: number, input: AvailabilityInput, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}/availability`, token, 'POST', input));

/* 응답 지우기 = "응답 안 함" */
export const clearAvailability = (id: number, date: string, token: string): Promise<EventDto> =>
  evOne(authed(`${EVENTS}/${id}/availability/${encodeURIComponent(date)}`, token, 'DELETE'));

/* ── 해 본 테마 (작업명세서 §4.9) ── */
export interface PlayedDto {
  id: number;
  themeKey: string | null;
  themeName: string;
  branchName: string | null;
  /* 키로 서버가 아는 매장 이름. 직접 적은 기록은 null */
  storeName: string | null;
  playedOn: string | null;
  /* 멱등 POST 는 이미 있던 행을 그대로 주므로, 보낸 source 와 다를 수 있다 */
  source: 'MANUAL' | 'EVENT' | 'PLAN';
  eventId: number | null;
  createdAt: string;
}
export interface ThemeRef {
  themeKey: string;
  themeName: string;
  branchName: string;
  storeName: string;
}
export interface PlayedInput {
  themeKey?: string | null;
  themeName: string;
  branchName?: string | null;
  playedOn?: string | null;
  source?: 'MANUAL' | 'PLAN';
}
export interface FreshTheme extends ServerTheme {
  themeKey: string;
  storeName: string;
  branchName: string;
  playedBy: string[];
}
export interface FreshDto {
  date: string;
  collected: boolean; // false 면 themes 가 비어도 "열린 테마 없음"이 아니다
  checkedAt: string | null;
  missing: { store: string; branch: string }[];
  noRecord: string[];
  themes: FreshTheme[];
}

/* storeName 이 없던 서버(배포 경주)에서 받아도 null 로 채운다 — normEvent 와 같은 까닭 */
const normPlayed = (p: PlayedDto): PlayedDto => ({ ...p, storeName: p.storeName ?? null });

export const listPlayed = async (token: string): Promise<PlayedDto[]> =>
  (await authed<PlayedDto[]>('/api/me/played', token, 'GET')).map(normPlayed);

export const addPlayed = async (body: PlayedInput, token: string): Promise<PlayedDto> =>
  normPlayed(await authed<PlayedDto>('/api/me/played', token, 'POST', body));

/* 404 를 성공으로 치지 않는다 — 그대로 던진다.
   keepalive 는 탭이 가려지거나 닫힐 때만 쓴다 — 배포는 교차 출처(github.io → duckdns)라 Authorization 때문에 사전 요청이 붙고,
   브라우저가 keepalive 와 사전 요청을 함께 거절할 수 있다. 화면에 있을 때의 평소 지우기는 보통 fetch 로. */
export const deletePlayed = (id: number, token: string, opts?: { keepalive?: boolean }): Promise<{ id: number; deleted: boolean }> =>
  send(`/api/me/played/${id}`, token, 'DELETE', undefined, opts?.keepalive ?? false);

/* 창이 가려지거나 로그아웃할 때 미뤄 둔 지우기를 바로 보낸다 — keepalive, 결과는 기다리지 않는다(받을 화면이 없을 수 있다).
   교차 출처 사전 요청 때문에 브라우저가 거절할 수 있는, 실패해도 어쩔 수 없는 마지막 시도다. 토큰은 부르는 쪽이 미리 받아 둔 것. */
export function deletePlayedNow(id: number, token: string): void {
  deletePlayed(id, token, { keepalive: true }).catch(() => { /* 닫히는 중 — 알릴 곳이 없다 */ });
}

export const memberPlayed = async (uid: string, token: string): Promise<PlayedDto[]> =>
  (await authed<PlayedDto[]>(`/api/club/members/${encodeURIComponent(uid)}/played`, token, 'GET')).map(normPlayed);

/* 로그인 없이 — 은퇴한 테마도 들어 있고 매장·지점·이름 순 */
export const listThemes = (): Promise<ThemeRef[]> => get('/api/themes');

/* 커서 = 앞 쪽 마지막 일정의 (date, id) — 서버가 (date, id) < (before, beforeId) 로 거른다. before 만 주면 date < before,
   없으면 오늘(KST) 이전. beforeId 만 주면 400 BAD_RANGE 라 before 없이 싣지 않는다. total 은 커서와 상관없이 전체 수. */
export type PastCursor = { before: string; beforeId?: number };
export async function myPastEvents(
  cursor: PastCursor | null, limit: number, token: string,
): Promise<{ events: EventDto[]; total: number }> {
  const q = new URLSearchParams();
  if (cursor) {
    q.set('before', cursor.before);
    if (cursor.beforeId != null) q.set('beforeId', String(cursor.beforeId));
  }
  q.set('limit', String(limit));
  const r = await authed<{ events: EventDto[]; total: number }>(`/api/me/events?${q}`, token, 'GET');
  return { events: r.events.map(normEvent), total: r.total };
}

/* 배열 필드가 빠져 와도(배포 경주) 화면이 안 깨지게 — normEvent 와 같은 까닭 */
const normFresh = (d: FreshDto): FreshDto => ({
  ...d,
  missing: d.missing ?? [],
  noRecord: d.noRecord ?? [],
  themes: (d.themes ?? []).map((t) => ({ ...t, sessions: t.sessions ?? [], playedBy: t.playedBy ?? [] })),
});

export const freshThemes = async (eventId: number, date: string | null, token: string): Promise<FreshDto> =>
  normFresh(await authed<FreshDto>(`${EVENTS}/${eventId}/fresh-themes${date ? `?date=${encodeURIComponent(date)}` : ''}`, token, 'GET'));

export const listClubMembers = (token: string): Promise<ClubMemberDto[]> =>
  authed('/api/club/members', token, 'GET');

/* ── 같이 갈 사람 찾기 — 하고 싶은 테마 (작업명세서 §4.12) ── 알림은 없다(화면에서만) */
export interface WishDto {
  id: number;
  themeKey: string | null;
  themeName: string;
  branchName: string | null;
  /* 키로 서버가 아는 매장 이름(해 본 테마와 같다). 키 없음·모르는 키는 null */
  storeName: string | null;
  createdAt: string;
}
export interface WishInput { themeKey?: string | null; themeName: string; branchName?: string | null }
/* 같은 테마끼리 묶은 것 — 원하는 사람이 많은 순 → 가장 최근 since 순. 키·이름·지점은 묶음 대표(가장 먼저 생긴 위시) 값 */
export interface WishGroupDto {
  themeKey: string | null;
  themeName: string;
  branchName: string | null;
  storeName: string | null;
  wanters: { uid: string; nickname: string; since: string }[]; // since 오래된 순
  playedBy: string[]; // 승인 멤버 중 이 테마를 해 본 사람
}

/* 필드가 빠져 와도(배포 경주) 화면이 안 깨지게 — normPlayed 와 같은 까닭 */
const normWish = (w: WishDto): WishDto => ({ ...w, storeName: w.storeName ?? null });
const normGroup = (g: WishGroupDto): WishGroupDto => ({ ...g, storeName: g.storeName ?? null, wanters: g.wanters ?? [], playedBy: g.playedBy ?? [] });

export const listMyWishes = async (token: string): Promise<WishDto[]> =>
  (await authed<WishDto[]>('/api/me/wishes', token, 'GET')).map(normWish);

/* 같은 테마가 이미 있으면 그 행을 그대로 준다(멱등) */
export const addWish = async (body: WishInput, token: string): Promise<WishDto> =>
  normWish(await authed<WishDto>('/api/me/wishes', token, 'POST', body));

/* 이미 내려갔으면(NO_SUCH_WISH) 목적은 이뤄진 것이라 성공으로 끝낸다. 본문 없는 404(서버가 모름)는 그대로 던진다 */
export async function deleteWish(id: number, token: string): Promise<void> {
  try {
    await authed<unknown>(`/api/me/wishes/${id}`, token, 'DELETE');
  } catch (e) {
    if (errorCode(e) === 'NO_SUCH_WISH') return;
    throw e;
  }
}

export const listClubWishes = async (token: string): Promise<WishGroupDto[]> =>
  (await authed<WishGroupDto[]>('/api/club/wishes', token, 'GET')).map(normGroup);

/* 수정 충돌(409 EVENT_CONFLICT)이면 서버가 실어 보낸 최신 일정을, 아니면 null. */
export function conflictOf(err: unknown): EventDto | null {
  const e = err as WatchApiError | null | undefined;
  return e?.status === 409 && e.body?.error === 'EVENT_CONFLICT' && e.body.event ? normEvent(e.body.event) : null;
}

/* 정산 저장 충돌(409 SETTLEMENT_CONFLICT)이면 서버가 실어 보낸 최신 정산을, 아니면 null(conflictOf 와 같은 모양) */
export function settleConflictOf(err: unknown): SettlementDto | null {
  const e = err as WatchApiError | null | undefined;
  return e?.status === 409 && e.body?.error === 'SETTLEMENT_CONFLICT' && e.body.settlement ? normSettle(e.body.settlement) : null;
}

export function errorCode(err: unknown): string | null {
  return (err as WatchApiError | null | undefined)?.body?.error ?? null;
}

/* 본문 없는 404 = 서버가 새 API 를 아직 모른다. NO_SUCH_EVENT 같은 본문 있는 404 와 구별한다. */
export function isMissingApi(err: unknown): boolean {
  const e = err as WatchApiError | null | undefined;
  return e?.status === 404 && !e.body?.error;
}

/* ── 정산 (작업명세서 §4.13) ── 알림은 없다. 송금 계산은 서버가 하고 화면은 받은 transfers 를 그린다 */
export interface PayInfoDto {
  bankText: string | null;     // 0~60자 자유 글("카카오뱅크 3333-01-1234567 홍길동")
  kakaopayUrl: string | null;  // null 또는 "https://qr.kakaopay.com/" 로 시작, 200자 이하
}
export interface SettlementItemInput {
  label: string;   // 1~20자
  amount: number;  // 정수 1~10,000,000(원)
  payerUid: string;
  shares: { uid: string; amount: number }[];  // 1~30명, 겹침 없음, 합 = amount
}
export interface Who { uid: string; nickname: string }
export interface SettlementItemDto {
  id: number;
  label: string;
  amount: number;
  payer: Who;
  shares: (Who & { amount: number })[];
}
export interface TransferDto { from: Who; to: Who; amount: number; paid: boolean; paidAt: string | null }
export interface SettlementDto {
  eventId: number;
  version: number;  // 정산이 없으면 0. PUT 마다 +1(송금 체크는 안 오름)
  updatedAt: string | null;
  updatedBy: Who | null;
  items: SettlementItemDto[];   // 보낸 순서
  total: number;
  transfers: TransferDto[];
  payInfo: Record<string, PayInfoDto>;  // transfers 의 받는 사람들 것만
}

/* 배열·맵이 빠져 와도(배포 경주) 화면이 안 깨지게 — normEvent 와 같은 까닭 */
function normSettle(d: SettlementDto): SettlementDto {
  return {
    ...d,
    items: (d.items ?? []).map((it) => ({ ...it, shares: it.shares ?? [] })),
    transfers: d.transfers ?? [],
    payInfo: d.payInfo ?? {},
    total: d.total ?? 0,
  };
}
const stlPath = (eventId: number) => `${EVENTS}/${eventId}/settlement`;

export const getSettlement = async (eventId: number, token: string): Promise<SettlementDto> =>
  normSettle(await authed<SettlementDto>(stlPath(eventId), token, 'GET'));

/* 항목 통째로 바꾼다. version 이 낡으면 409 SETTLEMENT_CONFLICT(settleConflictOf 로 최신을 꺼낸다). items: [] 면 정산 지우기 */
export const putSettlement = async (eventId: number, version: number, items: SettlementItemInput[], token: string): Promise<SettlementDto> =>
  normSettle(await authed<SettlementDto>(stlPath(eventId), token, 'PUT', { version, items }));

/* 보냈어요 체크 — (from, to) 쌍마다. version 은 안 오른다 */
export const markTransfer = async (eventId: number, fromUid: string, toUid: string, paid: boolean, token: string): Promise<SettlementDto> =>
  normSettle(await authed<SettlementDto>(`${stlPath(eventId)}/transfers`, token, 'POST', { fromUid, toUid, paid }));

const normPay = (p: PayInfoDto): PayInfoDto => ({ bankText: p?.bankText ?? null, kakaopayUrl: p?.kakaopayUrl ?? null });

export const getPayInfo = async (token: string): Promise<PayInfoDto> => normPay(await authed<PayInfoDto>('/api/me/payinfo', token, 'GET'));

export const putPayInfo = async (info: PayInfoDto, token: string): Promise<PayInfoDto> =>
  normPay(await authed<PayInfoDto>('/api/me/payinfo', token, 'PUT', info));
