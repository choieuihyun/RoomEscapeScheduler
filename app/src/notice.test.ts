import { describe, expect, it } from 'vitest';
import { linkParts, noticeIssue, noticeMeta } from './notice';

describe('홈 공지(§4.14)', () => {
  it('글 검사 — 앞뒤 공백 걷고 1~500자(코드 포인트), 10줄까지', () => {
    expect(noticeIssue('  ')).toBe('공지 내용을 적어 주세요.');
    expect(noticeIssue('a')).toBe('');
    expect(noticeIssue('가'.repeat(500))).toBe('');
    expect(noticeIssue('😀'.repeat(500))).toBe('');
    expect(noticeIssue('가'.repeat(501))).toBe('공지는 500자까지 적을 수 있어요.');
    expect(noticeIssue(Array(10).fill('줄').join('\n'))).toBe('');
    expect(noticeIssue(Array(11).fill('줄').join('\n'))).toBe('공지는 10줄까지 적을 수 있어요.');
    expect(noticeIssue('\n\n가\n\n')).toBe('');
  });
  it('글 속 주소는 눌러 열 수 있게 나눈다(http·https 만, 끝의 마침표·괄호는 빼고)', () => {
    expect(linkParts('카톡방 https://open.kakao.com/o/abc 들어와요.')).toEqual([
      { text: '카톡방 ' }, { url: 'https://open.kakao.com/o/abc' }, { text: ' 들어와요.' },
    ]);
    expect(linkParts('(http://a.com/x).')).toEqual([{ text: '(' }, { url: 'http://a.com/x' }, { text: ').' }]);
    expect(linkParts('주소 없음')).toEqual([{ text: '주소 없음' }]);
    expect(linkParts('javascript:alert(1) ftp://x')).toEqual([{ text: 'javascript:alert(1) ftp://x' }]);
  });
  it('아래 줄 — "10/23 · 열쇠"(한국 날짜)', () => {
    expect(noticeMeta({ id: 1, text: 'a', updatedAt: '2026-10-22T16:30:00Z', updatedBy: { uid: 'u', nickname: '열쇠' } })).toBe('10/23 · 열쇠');
  });
});
