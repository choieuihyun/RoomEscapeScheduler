import { describe, expect, it } from 'vitest';
import { commentIssue, feedbackIssue, kstDay, replaceById, shownFeedback, statusLine, STATUS_LABEL } from './feedback';
import type { FeedbackDto } from './server';

const W = (uid: string, nickname = uid) => ({ uid, nickname });
const fb = (o: Partial<FeedbackDto> = {}): FeedbackDto => ({
  id: 1, text: '글', status: 'OPEN', author: W('a', '열쇠'), createdAt: '2026-10-23T01:00:00Z', updatedAt: '2026-10-23T01:00:00Z',
  statusAt: null, statusBy: null, likes: 0, liked: false, comments: 0, mine: false, canDelete: false, ...o,
});

describe('의견 게시판(§4.15)', () => {
  it('상태 이름 — 접수·검토 중·반영됨·보류', () => {
    expect([STATUS_LABEL.OPEN, STATUS_LABEL.REVIEW, STATUS_LABEL.DONE, STATUS_LABEL.HOLD]).toEqual(['접수', '검토 중', '반영됨', '보류']);
  });
  it('글 검사 — 앞뒤 공백 걷고 1~1000자(코드 포인트), 20줄까지', () => {
    expect(feedbackIssue('   ')).toBe('의견을 적어 주세요.');
    expect(feedbackIssue('가'.repeat(1000))).toBe('');
    expect(feedbackIssue('가'.repeat(1001))).toBe('의견은 1000자까지 적을 수 있어요.');
    expect(feedbackIssue(Array(20).fill('a').join('\n'))).toBe('');
    expect(feedbackIssue(Array(21).fill('a').join('\n'))).toBe('의견은 20줄까지 적을 수 있어요.');
  });
  it('댓글 검사 — 1~300자', () => {
    expect(commentIssue(' ')).toBe('댓글을 적어 주세요.');
    expect(commentIssue('가'.repeat(300))).toBe('');
    expect(commentIssue('가'.repeat(301))).toBe('댓글은 300자까지 적을 수 있어요.');
    /* 일정 댓글(§4.16)은 10줄까지 — 줄 수를 넘기면 그 제한도 본다(의견 댓글은 줄 제한 없음) */
    expect(commentIssue(Array(30).fill('a').join('\n'))).toBe('');
    expect(commentIssue(Array(10).fill('a').join('\n'), 10)).toBe('');
    expect(commentIssue(Array(11).fill('a').join('\r\n'), 10)).toBe('댓글은 10줄까지 적을 수 있어요.');
  });
  it('거르기·정렬 — 상태로 거르고, 최신순(쓴 때) 또는 공감순(같으면 최신)', () => {
    const list = [
      fb({ id: 1, createdAt: '2026-10-20T00:00:00Z', likes: 3, status: 'DONE' }),
      fb({ id: 2, createdAt: '2026-10-22T00:00:00Z', likes: 1 }),
      fb({ id: 3, createdAt: '2026-10-21T00:00:00Z', likes: 3 }),
    ];
    expect(shownFeedback(list, 'ALL', 'new').map((f) => f.id)).toEqual([2, 3, 1]);
    expect(shownFeedback(list, 'ALL', 'likes').map((f) => f.id)).toEqual([3, 1, 2]);
    expect(shownFeedback(list, 'OPEN', 'new').map((f) => f.id)).toEqual([2, 3]);
    expect(shownFeedback(list, 'DONE', 'new').map((f) => f.id)).toEqual([1]);
  });
  it('한국 날짜 "10/23", 상태 줄 — 바꾼 때·사람이 있으면 같이', () => {
    expect(kstDay('2026-10-22T16:30:00Z')).toBe('10/23');
    expect(statusLine(fb())).toBe('접수');
    expect(statusLine(fb({ status: 'DONE', statusAt: '2026-10-24T03:00:00Z', statusBy: W('b', '방린') }))).toBe('반영됨 · 10/24 방린');
  });
  it('목록에서 하나 바꾸기·빼기', () => {
    const list = [fb({ id: 1 }), fb({ id: 2 })];
    expect(replaceById(list, fb({ id: 2, likes: 5 })).map((f) => f.likes)).toEqual([0, 5]);
    expect(replaceById(list, null, 1).map((f) => f.id)).toEqual([2]);
  });
});
