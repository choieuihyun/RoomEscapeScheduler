import { describe, it, expect } from 'vitest';
import type { EventDto } from './server';
import type { PathStep } from './core';
import { applyPaste, shouldApplyOnBlur, emptyForm, formFromEvent, formFromSteps, segTimeText, toInput, type FormState } from './eventForm';

const ev = (o: Partial<EventDto> = {}): EventDto => ({
  id: 1, title: '', date: '2026-10-20', startMin: null, endMin: null, location: null,
  capacity: null, booked: false, memo: null, segments: [], version: 3,
  createdBy: { uid: 'u1', nickname: '가' }, createdAt: '', updatedAt: '',
  participants: [], count: 1, joined: false, mine: true, canManage: true, ...o,
});

const base = (o: Partial<FormState> = {}): FormState => ({ ...emptyForm('2026-10-20'), ...o });
const err = (f: FormState) => ('error' in toInput(f) ? (toInput(f) as { error: string }).error : null);

describe('eventForm', () => {
  it('붙여넣기로 구간과 예약을 채우고 제목은 비운다', () => {
    const f = base({ title: '옛 제목' });
    const { form, note } = applyPaste(f, '[예약O] 비밀의 화원 13:40 + 셜록의 서재 15:20');
    expect(form.title).toBe('');
    expect(form.booked).toBe(true);
    expect(form.segs.map((s) => [s.themeName, s.start])).toEqual([['비밀의 화원', '13:40'], ['셜록의 서재', '15:20']]);
    expect(note).toBe('카톡 제목에서 예약 완료 · 테마 2개를 채웠어요.');
    expect(f.title).toBe('옛 제목'); // 원본 불변
    expect(applyPaste(f, '비밀의 화원 13:40 + 셜록의 서재 15:20').note).toBe('테마 2개를 채웠어요.');
  });

  it('구간 없는 제목은 그대로', () => {
    const { form, note } = applyPaste(base(), '이번 주 모임 어때요');
    expect(form.title).toBe('이번 주 모임 어때요');
    expect(form.segs).toEqual([]);
    expect(note).toBe('');
  });

  it('테마 행에서 EventInput 으로 (24시간제 — 24:30 대신 00:30 이 다음날로)', () => {
    const f = base({
      booked: true,
      segs: [{ themeName: ' 비밀의 화원 ', branchName: '강남점', themeKey: null, start: '13:40', end: '14:50' },
             { themeName: '셜록', branchName: '', themeKey: 'k', start: '00:30', end: '' }],
    });
    const r = toInput(f);
    if ('error' in r) throw new Error(r.error);
    expect(r.input.segments[0]).toEqual({ themeName: '비밀의 화원', branchName: '강남점', themeKey: null, startMin: 820, endMin: 890 });
    expect(r.input.segments[1]).toEqual({ themeName: '셜록', branchName: null, themeKey: 'k', startMin: 1470, endMin: null });
    expect(r.input.startMin).toBeNull();
    expect(r.input.endMin).toBeNull();
    expect(r.input.booked).toBe(true);
  });

  it('하루 종일이면 startMin·endMin 이 null', () => {
    const r = toInput(base({ title: '모임', allDay: true, start: '10:00', end: '11:00' }));
    if ('error' in r) throw new Error(r.error);
    expect(r.input.startMin).toBeNull();
    expect(r.input.endMin).toBeNull();
    const t = toInput(base({ title: '모임', allDay: false, start: '10:00', end: '11:30' }));
    if ('error' in t) throw new Error(t.error);
    expect([t.input.startMin, t.input.endMin]).toEqual([600, 690]);
  });

  it('제목도 테마도 없으면 오류 문구', () => {
    expect(err(base())).toBe('제목이나 테마 중 하나는 적어 주세요.');
  });

  it('끝이 시작보다 이르면 다음날, 같으면 오류 (2026-10-19 다듬기 — 전에는 이르면 오류)', () => {
    const r = toInput(base({ title: 'a', allDay: false, start: '22:00', end: '01:00' }));
    if ('error' in r) throw new Error(r.error);
    expect([r.input.startMin, r.input.endMin]).toEqual([1320, 1500]);
    expect(err(base({ title: 'a', allDay: false, start: '14:00', end: '14:00' }))).toBe('끝 시각이 시작과 같아요.');
    expect(err(base({ title: 'a', allDay: false, start: '1pm', end: '13:00' }))).toBe('시작 시각은 13:40 처럼 24시간제로 적어 주세요.');
  });

  it('24시 이상은 칸 오류 (24시간제)', () => {
    expect(err(base({ title: 'a', allDay: false, start: '24:30' }))).toBe('시작 시각은 13:40 처럼 24시간제로 적어 주세요.');
    const ok = { themeName: 'A', branchName: '', themeKey: null, start: '13:40', end: '' };
    expect(err(base({ segs: [{ ...ok, end: '25:00' }] }))).toBe('1번째 테마의 끝 시각은 13:40 처럼 24시간제로 적어 주세요.');
  });

  it('시작만 있는 일정 — 끝 칸을 비우면 endMin null', () => {
    const r = toInput(base({ title: '정모', allDay: false, start: '19:00', end: '' }));
    if ('error' in r) throw new Error(r.error);
    expect([r.input.startMin, r.input.endMin]).toEqual([1140, null]);
  });

  it('구간 자정 넘김 자동', () => {
    const s = (start: string, end = '') => ({ themeName: 'A', branchName: '', themeKey: null, start, end });
    const r = toInput(base({ segs: [s('23:30'), s('00:40')] }));
    if ('error' in r) throw new Error(r.error);
    expect(r.input.segments.map((g) => g.startMin)).toEqual([1410, 1480]);
    const t = toInput(base({ segs: [s('23:00', '00:10'), s('00:30', '01:40')] }));
    if ('error' in t) throw new Error(t.error);
    expect(t.input.segments.map((g) => [g.startMin, g.endMin])).toEqual([[1380, 1450], [1470, 1540]]);
    expect(err(base({ segs: [s('23:00'), s('01:00'), s('00:30')] }))).toBe('테마 시각은 다음날까지만 이어질 수 있어요.');
    expect(segTimeText([s('23:30'), s('00:40', '01:50')])).toBe('23:30–다음날 01:50 (테마에서)');
    expect(segTimeText([s('13:40'), s('abc')])).toBe('13:40 (테마에서)');
  });

  it('불러온 일정은 24시간제로 보이고 다시 저장하면 같은 분으로 (왕복)', () => {
    const seg = (startMin: number, endMin: number | null) => ({ themeName: 'A', branchName: null, themeKey: null, startMin, endMin });
    const f = formFromEvent(ev({ segments: [seg(1380, 1450), seg(1470, null)] }));
    expect(f.segs.map((g) => [g.start, g.end])).toEqual([['23:00', '00:10'], ['00:30', '']]);
    const r = toInput(f);
    if ('error' in r) throw new Error(r.error);
    expect(r.input.segments.map((g) => [g.startMin, g.endMin])).toEqual([[1380, 1450], [1470, null]]);
    const g = formFromEvent(ev({ title: '번개', startMin: 1320, endMin: 1500 }));
    expect([g.allDay, g.start, g.end]).toEqual([false, '22:00', '01:00']);
    const t = toInput(g);
    if ('error' in t) throw new Error(t.error);
    expect([t.input.startMin, t.input.endMin]).toEqual([1320, 1500]);
  });

  it('붙여넣은 시간 범위는 끝 칸도 채운다', () => {
    const { form } = applyPaste(base(), 'A 23:30~00:40 + B 01:00');
    expect(form.segs.map((g) => [g.start, g.end])).toEqual([['23:30', '00:40'], ['01:00', '']]);
    const r = toInput(form);
    if ('error' in r) throw new Error(r.error);
    expect(r.input.segments.map((g) => [g.startMin, g.endMin])).toEqual([[1410, 1480], [1500, null]]);
  });

  it('61자 제목은 오류', () => {
    expect(err(base({ title: '😀'.repeat(60) }))).toBeNull();
    expect(err(base({ title: '😀'.repeat(61) }))).toBe('제목은 60자까지예요.');
  });

  it('formFromSteps 는 계산 결과 단계를 구간으로 (1440 이상은 24시간제로 접고 저장 때 다음날로)', () => {
    const step = (name: string, place: string, start: number, end: number) =>
      ({ i: 0, name, place, dur: end - start, start, end, soldout: false, move: 0 }) as PathStep;
    const f = formFromSteps('2026-10-25', [step('A', '강남점', 820, 890), step('B', '홍대점', 1470, 1530)]);
    expect(f.date).toBe('2026-10-25');
    expect(f.segs[0]).toMatchObject({ themeName: 'A', branchName: '강남점', start: '13:40', end: '14:50' });
    expect(f.segs[1].start).toBe('00:30');
    const r = toInput(f);
    if ('error' in r) throw new Error(r.error);
    expect(r.input.segments.map((g) => [g.startMin, g.endMin])).toEqual([[820, 890], [1470, 1530]]);
  });

  it('구간이 있을 때 blur 로는 구간이 바뀌지 않는다', () => {
    const seg = { themeName: 'A', branchName: '강남점', themeKey: 'k', start: '13:40', end: '14:50' };
    expect(shouldApplyOnBlur(base({ segs: [seg] }))).toBe(false);
    expect(shouldApplyOnBlur(base({ title: '[예약O] A 13:40', segs: [seg] }))).toBe(false); // 구간이 있으면 마커가 있어도 안 덮는다
  });

  it('blur 는 카톡 표시가 있고 구간이 비었을 때만 적용한다', () => {
    expect(shouldApplyOnBlur(base({ title: '정모 19:00' }))).toBe(false);
    expect(shouldApplyOnBlur(base({ title: '정기 모임 7시' }))).toBe(false);
    expect(shouldApplyOnBlur(base({ title: '[예약X] 정모 19:00' }))).toBe(true);
    expect(shouldApplyOnBlur(base({ title: 'ABC 13:40 + DEF 15:20' }))).toBe(true);
  });

  it('구간 시각 오류는 몇 번째 테마인지 알려 준다', () => {
    const ok = { themeName: 'A', branchName: '', themeKey: null, start: '13:40', end: '' };
    expect(err(base({ segs: [ok, { ...ok, start: 'abc' }] }))).toBe('2번째 테마의 시작 시각은 13:40 처럼 24시간제로 적어 주세요.');
  });

  it('충돌이면 입력을 지키고 최신으로 바꿀 수 있다', () => {
    const mine = base({ title: '내가 고친 제목', memo: '내 메모' });
    const snapshot = JSON.stringify(mine);
    const latest = formFromEvent(ev({ title: '남이 고친 제목', version: 4, capacity: 4 }));
    expect(latest.title).toBe('남이 고친 제목');
    expect(latest.capacity).toBe(4);
    expect(JSON.stringify(mine)).toBe(snapshot);
  });
});
