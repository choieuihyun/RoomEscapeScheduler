import { describe, expect, it } from 'vitest';
import { eventLink, readEventHash } from './eventLink';
import { readShareHash } from './serialize';

describe('readEventHash', () => {
  it('#e=12 → 12', () => {
    expect(readEventHash('#e=12')).toBe(12);
  });

  it('숫자가 아니거나 다른 해시면 null', () => {
    for (const h of ['#e=abc', '#s=abc', '#z=abc', '', '#', '#e=', '#e=0', '#e=12x', '#E=12']) {
      expect(readEventHash(h)).toBeNull();
    }
  });

  it('공유 해시와 섞이지 않는다', () => {
    expect(readEventHash('#z=e=12')).toBeNull();
    expect(readEventHash('#s=e=12')).toBeNull();
  });

  it('일정 링크는 공유 링크가 아니다 — 계산 화면은 자동저장을 그대로 띄운다', () => {
    expect(readShareHash('#e=12').kind).toBe('none');
  });
});

describe('eventLink', () => {
  it('앱 주소에 #e=<id> 를 붙인다', () => {
    expect(eventLink(12, { origin: 'https://choieuihyun.github.io', pathname: '/RoomEscapeScheduler/' }))
      .toBe('https://choieuihyun.github.io/RoomEscapeScheduler/#e=12');
  });
});
