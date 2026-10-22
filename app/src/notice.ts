/* 홈 공지(작업명세서 §4.14, 2026-10-23 사용자 요청) — 순수 함수. 운영진이 홈 맨 위에 하나 고정한다. */
import type { NoticeDto } from './server';

export const NOTICE_MAX = 500;
export const NOTICE_LINES = 10;

/* 서버 검사와 같다 — 앞뒤 공백 걷고 1~500자(코드 포인트), 10줄까지. 통과면 '' */
export function noticeIssue(text: string): string {
  const t = text.trim();
  if (!t) return '공지 내용을 적어 주세요.';
  if ([...t].length > NOTICE_MAX) return `공지는 ${NOTICE_MAX}자까지 적을 수 있어요.`;
  if (t.split('\n').length > NOTICE_LINES) return `공지는 ${NOTICE_LINES}줄까지 적을 수 있어요.`;
  return '';
}

/* 글 속 http(s) 주소를 눌러 열 수 있게 나눈다. 주소 끝에 붙은 마침표·쉼표·닫는 괄호는 글로 돌린다 */
export type LinkPart = { text: string } | { url: string };
export function linkParts(text: string): LinkPart[] {
  const out: LinkPart[] = [];
  const re = /https?:\/\/[^\s<>"']+/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let url = m[0];
    const tail = /[.,!?;:)\]]+$/.exec(url);
    if (tail) url = url.slice(0, -tail[0].length);
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ url });
    last = m.index + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

/* 카드 아래 줄 "10/23 · 열쇠" — 고친 날(한국 날짜) · 쓴 사람 */
export function noticeMeta(n: NoticeDto): string {
  const d = new Date(new Date(n.updatedAt).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} · ${n.updatedBy.nickname}`;
}

/* 이 기기에서 닫은 공지 id — 새로 쓰거나 고치면 id 가 바뀌어 다시 보인다. 저장소가 막혀도 화면은 그대로 돈다 */
const CLOSED_KEY = 'flod.notice.closed';
export function closedNoticeId(): number | null {
  try { const v = localStorage.getItem(CLOSED_KEY); return v ? Number(v) : null; } catch { return null; }
}
export function closeNotice(id: number): void {
  try { localStorage.setItem(CLOSED_KEY, String(id)); } catch { /* 저장 못 하면 이번 화면에서만 닫힌다 */ }
}
