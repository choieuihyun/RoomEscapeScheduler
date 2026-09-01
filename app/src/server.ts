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

interface ApiError extends Error {
  status?: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(base() + path, { headers: { Accept: 'application/json' } });
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
  dates: string[];
  checkedAt: string | null;
}

export interface ServerSession {
  id: number;
  t: number;
  soldout?: boolean;
}

export interface ServerTheme {
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

interface ScheduleResponse {
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
  if (e?.status === 404) return '그 날짜는 아직 수집되지 않았습니다. 다른 날짜를 골라 보세요.';
  if (e instanceof TypeError)              /* fetch가 못 닿으면 TypeError다 */
    return `서버에 닿지 못했습니다 (${base() || DEFAULT_BASE}). 꺼져 있거나 주소가 다를 수 있어요 — 직접 입력과 사진은 그대로 쓸 수 있습니다.`;
  return '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
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

export function toSessions(ss: ServerSession[]): Session[] {
  return ss.map(s => ({ t: s.t, soldout: !!s.soldout, id: s.id }));
}

/* ── F-16 감시 API ── 인증이 필요한 유일한 엔드포인트들이라 get()과 갈라놨다.
   server.ts는 useLoadModal.ts가 항상 정적 import하므로, 여기서 cloud.ts를
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
  body?: { error?: string; message?: string };
}

async function authed<T>(path: string, token: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(base() + path, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
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

/* 3개 제한(409 WATCH_LIMIT_EXCEEDED)은 서버가 이미 완성된 한국어 message를
   주므로 그대로 쓴다 — 나머지 에러는 say()와 같은 판단을 따른다. */
export function sayWatch(err: unknown): string {
  const e = err as WatchApiError;
  if (e?.status === 409 && e.body?.message) return e.body.message;
  if (e?.status === 400 && e.body?.message) return e.body.message;
  return say(err);
}
