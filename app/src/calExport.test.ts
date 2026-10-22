import { describe, expect, it } from 'vitest';
import { calSpan, googleCalUrl, icsText } from './calExport';
import type { EventDto } from './server';

const ev = (o: Partial<EventDto> = {}): EventDto => ({
  id: 7, title: '', date: '2026-10-24', candidates: [], startMin: null, endMin: null, location: null,
  capacity: null, booked: false, memo: null, segments: [], version: 1,
  createdBy: { uid: 'u1', nickname: '가' }, createdAt: '', updatedAt: '',
  participants: [], count: 1, joined: true, mine: true, canManage: true, settlementTotal: null, ...o,
});
const seg = (themeName: string, startMin: number, endMin: number | null, branchName: string | null = '강남점') =>
  ({ themeName, branchName, themeKey: null, startMin, endMin, playedBy: [] });
const LINK = 'https://roomescapescheduler.web.app/#e=7';

describe('내 캘린더로 내보내기 — 시각(한국 시각 → UTC)', () => {
  it('하루 종일은 날짜만(끝은 다음날), 시각은 UTC 로 바꾼다(KST −9시간)', () => {
    expect(calSpan(ev())).toEqual({ allDay: true, start: '20261024', end: '20261025' });
    expect(calSpan(ev({ startMin: 1140, endMin: 1260 }))).toEqual({ allDay: false, start: '20261024T100000Z', end: '20261024T120000Z' });
  });
  it('끝이 없으면 시작 + 2시간, 구간이 있으면 첫 시작 ~ 마지막 끝(마지막 끝이 없으면 마지막 시작 + 2시간)', () => {
    expect(calSpan(ev({ startMin: 1140 }))).toEqual({ allDay: false, start: '20261024T100000Z', end: '20261024T120000Z' });
    expect(calSpan(ev({ segments: [seg('A', 820, 890), seg('B', 920, 990)] }))).toMatchObject({ start: '20261024T044000Z', end: '20261024T073000Z' });
    expect(calSpan(ev({ segments: [seg('A', 820, 890), seg('B', 920, null)] }))).toMatchObject({ end: '20261024T082000Z' });
  });
  it('새벽(KST 09시 전)은 UTC 로 전날, 다음날 시각(1440 이상)도 맞게', () => {
    expect(calSpan(ev({ startMin: 300, endMin: 400 }))).toMatchObject({ start: '20261023T200000Z', end: '20261023T214000Z' });
    expect(calSpan(ev({ startMin: 1410, endMin: 1500 }))).toMatchObject({ start: '20261024T143000Z', end: '20261024T160000Z' });
  });
  it('날짜 미정이면 내보낼 수 없다(null)', () => {
    expect(calSpan(ev({ date: null }))).toBeNull();
  });
});

describe('구글 캘린더 주소', () => {
  it('제목·시각·설명(코스·앱 링크)·장소를 싣는다', () => {
    const u = new URL(googleCalUrl(ev({ title: '정모', segments: [seg('비밀의 화원', 820, 890)] }), LINK) as string);
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('정모');
    expect(u.searchParams.get('dates')).toBe('20261024T044000Z/20261024T055000Z');
    expect(u.searchParams.get('details')).toBe('13:40 비밀의 화원 · 강남점\n\nFloduler: ' + LINK);
    expect(u.searchParams.get('location')).toBe('강남점');
  });
  it('장소는 일정 장소가 먼저, 날짜 미정이면 null', () => {
    const u = new URL(googleCalUrl(ev({ title: 'a', location: '홍대입구역 2번 출구' }), LINK) as string);
    expect(u.searchParams.get('location')).toBe('홍대입구역 2번 출구');
    expect(u.searchParams.get('dates')).toBe('20261024/20261025');
    expect(googleCalUrl(ev({ date: null }), LINK)).toBeNull();
  });
});

describe('.ics 파일', () => {
  const now = new Date(Date.UTC(2026, 9, 23, 1, 2, 3));
  it('VEVENT 하나 — UID 는 일정 id 로 고정(다시 넣으면 같은 일정으로 갱신), 글의 , ; \\ 줄바꿈은 이스케이프', () => {
    const t = icsText(ev({ title: '정모, 2차; 끝', startMin: 1140, endMin: 1260, memo: null }), LINK, now) as string;
    const lines = t.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('UID:floduler-event-7@roomescapescheduler.web.app');
    expect(lines).toContain('DTSTAMP:20261023T010203Z');
    expect(lines).toContain('DTSTART:20261024T100000Z');
    expect(lines).toContain('DTEND:20261024T120000Z');
    expect(lines).toContain('SUMMARY:정모\\, 2차\\; 끝');
    expect(lines).toContain('URL:' + LINK);
    expect(lines[lines.length - 2]).toBe('END:VCALENDAR');
    expect(t.endsWith('\r\n')).toBe(true);
  });
  it('하루 종일은 VALUE=DATE, 긴 줄은 75바이트로 접는다(이어지는 줄은 공백으로 시작)', () => {
    const t = icsText(ev({ title: '가'.repeat(60) }), LINK, now) as string;
    expect(t).toContain('DTSTART;VALUE=DATE:20261024');
    expect(t).toContain('DTEND;VALUE=DATE:20261025');
    for (const l of t.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const summary = t.split('\r\n').filter((l, i, a) => l.startsWith('SUMMARY:') || (l.startsWith(' ') && a.slice(0, i).reverse().find((x) => !x.startsWith(' '))?.startsWith('SUMMARY:')));
    expect(summary.map((l, i) => (i === 0 ? l.slice('SUMMARY:'.length) : l.slice(1))).join('')).toBe('가'.repeat(60));
  });
  it('날짜 미정이면 null', () => {
    expect(icsText(ev({ date: null }), LINK, now)).toBeNull();
  });
});
