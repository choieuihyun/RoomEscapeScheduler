/* 의견 게시판(작업명세서 §4.15, 2026-10-23 사용자 요청) — 순수 함수. 멤버 모두 보고, 누구나 댓글, 운영진이 처리 상태를 붙인다 */
import type { FeedbackDto, FeedbackStatus } from './server';

export const STATUS_LABEL: Record<FeedbackStatus, string> = { OPEN: '접수', REVIEW: '검토 중', DONE: '반영됨', HOLD: '보류' };
export const STATUSES: readonly FeedbackStatus[] = ['OPEN', 'REVIEW', 'DONE', 'HOLD'];

const count = (s: string) => [...s.trim()].length;
const lines = (s: string) => s.trim().split(/\r\n|\r|\n/).length;

/* 서버 검사와 같다 — 앞뒤 공백 걷고 코드 포인트로 센다. 통과면 '' */
export function feedbackIssue(text: string): string {
  if (!count(text)) return '의견을 적어 주세요.';
  if (count(text) > 1000) return '의견은 1000자까지 적을 수 있어요.';
  if (lines(text) > 20) return '의견은 20줄까지 적을 수 있어요.';
  return '';
}
export function commentIssue(text: string): string {
  if (!count(text)) return '댓글을 적어 주세요.';
  if (count(text) > 300) return '댓글은 300자까지 적을 수 있어요.';
  return '';
}

export type FeedbackSort = 'new' | 'likes';
/* 상태로 거르고(ALL 이면 전부) 최신순(쓴 때) 또는 공감순(같으면 최신) */
export function shownFeedback(list: readonly FeedbackDto[], filter: FeedbackStatus | 'ALL', sort: FeedbackSort): FeedbackDto[] {
  const byNew = (a: FeedbackDto, b: FeedbackDto) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id);
  return list.filter((f) => filter === 'ALL' || f.status === filter)
    .sort(sort === 'likes' ? (a, b) => b.likes - a.likes || byNew(a, b) : byNew);
}

/* ISO → 한국 날짜 "10/23" */
export function kstDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/* 상태 줄 — 운영진이 바꿨으면 "반영됨 · 10/24 방린" */
export const statusLine = (f: Pick<FeedbackDto, 'status' | 'statusAt' | 'statusBy'>): string =>
  f.statusAt && f.statusBy ? `${STATUS_LABEL[f.status]} · ${kstDay(f.statusAt)} ${f.statusBy.nickname}` : STATUS_LABEL[f.status];

/* 받은 글 하나로 목록을 고친다 — dto 가 null 이면 그 id 를 뺀다 */
export function replaceById(list: readonly FeedbackDto[], dto: FeedbackDto | null, removeId?: number): FeedbackDto[] {
  if (dto === null) return list.filter((f) => f.id !== removeId);
  return list.map((f) => (f.id === dto.id ? dto : f));
}
