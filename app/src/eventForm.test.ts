import { describe, it, expect } from 'vitest';
import type { EventDto } from './server';
import type { PathStep } from './core';
import { applyPaste, shouldApplyOnBlur, emptyForm, formFromEvent, formFromSteps, toInput, type FormState } from './eventForm';

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

  it('테마 행에서 EventInput 으로', () => {
    const f = base({
      booked: true,
      segs: [{ themeName: ' 비밀의 화원 ', branchName: '강남점', themeKey: null, start: '13:40', end: '14:50' }, 
             { themeName: '셜록', branchName: '', themeKey: 'k', start: '24:30', end: '' }],
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

  it('끝이 시작보다 이르면 오류', () => {
    expect(err(base({ title: 'a', allDay: false, start: '14:00', end: '13:00' }))).toBe('끝 시각이 시작보다 늦어야 해요.');
    expect(err(base({ title: 'a', allDay: false, start: '1pm', end: '13:00' }))).toBe('시작 시각은 13:40 처럼 적어 주세요.');
  });

  it('61자 제목은 오류', () => {
    expect(err(base({ title: '😀'.repeat(60) }))).toBeNull();
    expect(err(base({ title: '😀'.repeat(61) }))).toBe('제목은 60자까지예요.');
  });

  it('formFromSteps 는 계산 결과 단계를 구간으로', () => {
    const step = (name: string, place: string, start: number, end: number) =>
      ({ i: 0, name, place, dur: end - start, start, end, soldout: false, move: 0 }) as PathStep;
    const f = formFromSteps('2026-10-25', [step('A', '강남점', 820, 890), step('B', '홍대점', 1470, 1530)]);
    expect(f.date).toBe('2026-10-25');
    expect(f.segs[0]).toMatchObject({ themeName: 'A', branchName: '강남점', start: '13:40', end: '14:50' });
    expect(f.segs[1].start).toBe('24:30');
  });

  it('구간이 있을 때 blur 로는 구간이 바뀌지 않는다', () => {
    const seg = { themeName: 'A', branchName: '강남점', themeKey: 'k', start: '13:40', end: '14:50' };
    expect(shouldApplyOnBlur(base({ segs: [seg] }))).toBe(false);
    expect(shouldApplyOnBlur(base())).toBe(true);
  });

  it('구간 시각 오류는 몇 번째 테마인지 알려 준다', () => {
    const ok = { themeName: 'A', branchName: '', themeKey: null, start: '13:40', end: '' };
    expect(err(base({ segs: [ok, { ...ok, start: 'abc' }] }))).toBe('2번째 테마의 시작 시각은 13:40 처럼 적어 주세요.');
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
