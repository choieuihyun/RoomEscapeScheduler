import { describe, it, expect } from 'vitest';
import type { EventDto } from './server';
import type { PathStep } from './core';
import { applyPaste, shouldApplyOnBlur } from './kakaoTitle';
import { emptyForm, formFromEvent, formFromSteps, segTimeText, switchDateMode, toggleCandidate, toInput, type FormState } from './eventForm';

const ev = (o: Partial<EventDto> = {}): EventDto => ({
  id: 1, title: '', date: '2026-10-20', candidates: [], startMin: null, endMin: null, location: null,
  capacity: null, booked: false, memo: null, segments: [], version: 3,
  createdBy: { uid: 'u1', nickname: '가' }, createdAt: '', updatedAt: '',
  participants: [], count: 1, joined: false, mine: true, canManage: true, ...o,
});

const base = (o: Partial<FormState> = {}): FormState => ({ ...emptyForm('2026-10-20'), ...o });
const err = (f: FormState) => ('error' in toInput(f) ? (toInput(f) as { error: string }).error : null);

const EVENING = '자정을 넘기는 일정은 저녁 6시 이후에 시작할 때만 이어서 적을 수 있어요. 날짜를 나눠 주세요.';

describe('eventForm', () => {
  it('18시 전에 시작해 자정을 넘는 시각은 이유를 말해 준다', () => {
    expect(err(base({ title: 'a', allDay: false, start: '17:00', end: '01:00' }))).toBe(EVENING);
    const s = (start: string, end = '') => ({ themeName: 'A', branchName: '', themeKey: null, start, end });
    expect(err(base({ segs: [s('17:00', '01:00')] }))).toBe('1번째 테마: ' + EVENING);
    expect(err(base({ segs: [s('16:00'), s('01:00')] }))).toBe('2번째 테마: ' + EVENING);
    expect(err(base({ title: 'a', allDay: false, start: '13:00', end: '12:00' }))).toBe('끝 시각이 시작보다 늦어야 해요.');
    const late = '끝 시각이 시작보다 늦어야 해요.';
    expect(err(base({ title: 'a', allDay: false, start: '01:30', end: '01:00' }))).toBe(late);
    expect(err(base({ title: 'a', allDay: false, start: '05:00', end: '03:00' }))).toBe(late);
    expect(err(base({ segs: [s('00:40'), s('00:10')] }))).toBe('2번째 테마 시작이 앞 테마보다 이르네요. 순서를 확인해 주세요.');
  });

  it('날짜를 옮겨 연 창에 붙여넣으면 날짜도 원래대로', () => {
    const f = formFromSteps('2026-10-20', [{ name: 'A', place: '', start: 1470, end: 1540 } as PathStep]);
    expect([f.date, f.dateMoved]).toEqual(['2026-10-21', true]);
    const { form } = applyPaste(f, 'A 13:40 + B 15:20');
    expect([form.date, form.dateMoved]).toEqual(['2026-10-20', false]);
    const night = applyPaste(f, '[예약O] A 00:30 + B 01:40').form;
    expect([night.date, night.dateMoved]).toEqual(['2026-10-21', true]);
    const g = formFromEvent(ev({ date: '2026-10-20', candidates: [], startMin: null, segments: [{ themeName: 'A', branchName: null, themeKey: null, startMin: 1470, endMin: null } as never] }));
    expect(applyPaste(g, 'A 13:40 + B 15:20').form.date).toBe('2026-10-20');
  });

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

  it('테마 행에서 EventInput 으로 (24시간제 — 24:30 대신 00:30, 19시 뒤라 다음날로)', () => {
    const f = base({
      booked: true,
      segs: [{ themeName: ' 비밀의 화원 ', branchName: '강남점', themeKey: null, start: '19:00', end: '20:10' },
             { themeName: '셜록', branchName: '', themeKey: 'k', start: '00:30', end: '' }],
    });
    const r = toInput(f);
    if ('error' in r) throw new Error(r.error);
    expect(r.input.segments[0]).toEqual({ themeName: '비밀의 화원', branchName: '강남점', themeKey: null, startMin: 1140, endMin: 1210 });
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

  it('끝이 시작보다 이르면 자정을 건널 때만 다음날, 아니면 오류 (2026-10-19 다듬기)', () => {
    const r = toInput(base({ title: 'a', allDay: false, start: '22:00', end: '01:00' }));
    if ('error' in r) throw new Error(r.error);
    expect([r.input.startMin, r.input.endMin]).toEqual([1320, 1500]);
    expect(err(base({ title: 'a', allDay: false, start: '14:00', end: '14:00' }))).toBe('끝 시각이 시작보다 늦어야 해요.');
    expect(err(base({ title: 'a', allDay: false, start: '14:00', end: '13:00' }))).toBe('끝 시각이 시작보다 늦어야 해요.');
    expect(err(base({ title: 'a', allDay: false, start: '17:30', end: '05:30' }))).toBe(EVENING);
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
    const u = toInput(base({ segs: [s('23:00'), s('00:30')] }));
    if ('error' in u) throw new Error(u.error);
    expect(u.input.segments.map((g) => g.startMin)).toEqual([1380, 1470]);
  });

  it('자정을 건너지 않는 역순은 오류 — 오타가 하루 뒤로 저장되지 않게', () => {
    const s = (start: string, end = '') => ({ themeName: 'A', branchName: '', themeKey: null, start, end });
    const order = '2번째 테마 시작이 앞 테마보다 이르네요. 순서를 확인해 주세요.';
    expect(err(base({ segs: [s('13:40', '14:50'), s('13:30')] }))).toBe(order);
    expect(err(base({ segs: [s('13:00'), s('12:00')] }))).toBe(order);
    expect(err(base({ segs: [s('17:30'), s('05:30')] }))).toBe('2번째 테마: ' + EVENING);
    expect(err(base({ segs: [s('23:00'), s('00:30'), s('23:50')] }))).toBe('3번째 테마 시작이 앞 테마보다 이르네요. 순서를 확인해 주세요.');
    expect(err(base({ segs: [s('13:00', '12:00')] }))).toBe('1번째 테마의 끝 시각이 시작보다 늦어야 해요.');
    expect(err(base({ segs: [s('13:00', '13:00')] }))).toBe('1번째 테마의 끝 시각이 시작보다 늦어야 해요.');
  });

  it('읽기 전용 시간 — 첫 시작부터 마지막 시각(끝, 없으면 시작)까지', () => {
    const s = (start: string, end = '') => ({ themeName: 'A', branchName: '', themeKey: null, start, end });
    expect(segTimeText([s('23:00'), s('00:40', '01:50')])).toBe('23:00–다음날 01:50 (테마에서)');
    expect(segTimeText([s('13:40', '14:50'), s('15:20')])).toBe('13:40–15:20 (테마에서)');
    expect(segTimeText([s('23:00'), s('00:30')])).toBe('23:00–다음날 00:30 (테마에서)');
    expect(segTimeText([s('13:40')])).toBe('13:40 (테마에서)');
    expect(segTimeText([s('13:40', '14:50')])).toBe('13:40–14:50 (테마에서)');
    /* 못 읽거나 순서가 틀리면 적힌 그대로 */
    expect(segTimeText([s('13:40'), s('abc')])).toBe('13:40–abc (테마에서)');
    expect(segTimeText([s('13:40', '14:50'), s('13:30')])).toBe('13:40–13:30 (테마에서)');
  });

  it('붙여넣기는 날짜 옮김 안내를 끈다(날짜는 그대로)', () => {
    const f = { ...base({ date: '2026-10-25' }), dateMoved: true };
    const { form } = applyPaste(f, 'A 13:40 + B 15:20');
    expect([form.date, form.dateMoved]).toEqual(['2026-10-25', false]);
  });

  it('불러온 일정은 24시간제로 보이고 다시 저장하면 같은 분으로 (왕복)', () => {
    const seg = (startMin: number, endMin: number | null) => ({ themeName: 'A', branchName: null, themeKey: null, startMin, endMin, playedBy: [] as string[] });
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
    const f = formFromSteps('2026-10-25', [step('A', '강남점', 1140, 1210), step('B', '홍대점', 1470, 1530)]);
    expect(f.date).toBe('2026-10-25');
    expect(f.segs[0]).toMatchObject({ themeName: 'A', branchName: '강남점', start: '19:00', end: '20:10' });
    expect(f.segs[1].start).toBe('00:30');
    const r = toInput(f);
    if ('error' in r) throw new Error(r.error);
    expect(r.input.segments.map((g) => [g.startMin, g.endMin])).toEqual([[1140, 1210], [1470, 1530]]);
  });

  it('첫 시각이 자정 뒤(1440 이상)면 날짜를 다음날로 옮기고 안내 표시', () => {
    const step = (start: number, end: number) =>
      ({ i: 0, name: 'A', place: '강남점', dur: end - start, start, end, soldout: false, move: 0 }) as PathStep;
    const f = formFromSteps('2026-10-24', [step(1470, 1540)]);
    expect([f.date, f.segs[0].start, f.segs[0].end, f.dateMoved]).toEqual(['2026-10-25', '00:30', '01:40', true]);
    const r = toInput(f);
    if ('error' in r) throw new Error(r.error);
    expect([r.input.date, r.input.segments[0].startMin, r.input.segments[0].endMin]).toEqual(['2026-10-25', 30, 100]);
    const seg = (startMin: number) => ({ themeName: 'A', branchName: null, themeKey: null, startMin, endMin: null, playedBy: [] as string[] });
    const e = formFromEvent(ev({ date: '2026-10-24', segments: [seg(1470)] }));
    expect([e.date, e.segs[0].start, e.dateMoved]).toEqual(['2026-10-25', '00:30', true]);
    const t = formFromEvent(ev({ date: '2026-10-24', title: '번개', startMin: 1500, endMin: 1560 }));
    expect([t.date, t.start, t.end, t.dateMoved]).toEqual(['2026-10-25', '01:00', '02:00', true]);
  });

  it('첫 시각이 23:59 이하면 날짜 그대로', () => {
    const step = (start: number, end: number) =>
      ({ i: 0, name: 'A', place: '', dur: end - start, start, end, soldout: false, move: 0 }) as PathStep;
    const f = formFromSteps('2026-10-24', [step(1439, 1500), step(1520, 1580)]);
    expect([f.date, f.dateMoved]).toEqual(['2026-10-24', false]);
    const e = formFromEvent(ev({ date: '2026-10-24', segments: [{ themeName: 'A', branchName: null, themeKey: null, startMin: 1380, endMin: null, playedBy: [] }, { themeName: 'B', branchName: null, themeKey: null, startMin: 1470, endMin: null, playedBy: [] }] }));
    expect([e.date, e.dateMoved]).toEqual(['2026-10-24', false]);
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
  describe('후보 여러 개', () => {
    const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    const input = (f: FormState) => {
      const r = toInput(f);
      if ('error' in r) throw new Error(r.error);
      return r.input;
    };

    it('후보 모드는 date null + candidates', () => {
      const i = input(base({ title: 'a', dateMode: 'candidates', candidates: ['2026-11-07', '2026-10-31'] }));
      expect(i.date).toBeNull();
      expect(i.candidates).toEqual(['2026-10-31', '2026-11-07']);
    });

    it('날짜 정하기로 바꿔 저장하면 candidates 를 안 보낸다', () => {
      const f = formFromEvent(ev({ title: 'a', date: null, candidates: [{ date: '2026-10-31', responses: [] }] }));
      const i = input({ ...f, dateMode: 'fixed', date: '2026-10-31' });
      expect(i.date).toBe('2026-10-31');
      expect('candidates' in i).toBe(false);
      expect('candidates' in input(base({ title: 'a' }))).toBe(false);
    });

    it('후보를 고친 뒤 날짜 정하기면 candidates 를 보낸다(비어도)', () => {
      expect(input(base({ title: 'a', candidates: ['2026-11-01'], candidatesTouched: true })).candidates).toEqual(['2026-11-01']);
      expect(input(base({ title: 'a', candidates: [], candidatesTouched: true })).candidates).toEqual([]);
    });

    it('0개·15개는 오류', () => {
      expect(err(base({ title: 'a', dateMode: 'candidates', candidates: [] }))).toBe('후보 날짜를 하나 이상 골라 주세요.');
      expect(err(base({ title: 'a', dateMode: 'candidates', candidates: days(15) }))).toBe('후보 날짜는 14개까지예요.');
      expect(err(base({ title: 'a', dateMode: 'candidates', candidates: days(14) }))).toBeNull();
    });

    it('formFromEvent(미정 일정) → 후보 모드·후보 목록', () => {
      const f = formFromEvent(ev({ title: 'a', date: null, candidates: [{ date: '2026-11-07', responses: [] }, { date: '2026-10-31', responses: [] }] }));
      expect([f.dateMode, f.candidates, f.candidatesTouched, f.date]).toEqual(['candidates', ['2026-10-31', '2026-11-07'], false, '2026-10-31']);
      expect(input(f).date).toBeNull();
    });

    it('toggleCandidate: 찍고 빼고, 15번째는 안내만', () => {
      expect(toggleCandidate(['2026-11-02'], '2026-11-01')).toEqual({ list: ['2026-11-01', '2026-11-02'], error: '' });
      expect(toggleCandidate(['2026-11-02'], '2026-11-02')).toEqual({ list: [], error: '' });
      const full = days(14);
      const r = toggleCandidate(full, '2026-12-01');
      expect(r.list).toBe(full);
      expect(r.error).toBe('후보 날짜는 14개까지예요.');
      expect(toggleCandidate(full, full[0]).list).toHaveLength(13);
    });

    it('첫 시각이 1470 인 정해진 일정을 다시 미정으로 돌려도 하루 어긋나지 않는다(원래 날짜·1470 그대로)', () => {
      const e = ev({
        title: '', date: '2026-10-31', segments: [{ themeName: '심야', branchName: null, themeKey: null, startMin: 1470, endMin: 1560, playedBy: [] }],
        candidates: [{ date: '2026-10-31', responses: [] }, { date: '2026-11-07', responses: [] }],
      });
      const f = formFromEvent(e);
      expect([f.date, f.dateMoved, f.segs[0].start]).toEqual(['2026-11-01', true, '00:30']); // 화면은 하루 옮겨 열림
      const i = input({ ...f, dateMode: 'candidates' });
      expect(i.date).toBeNull();
      expect(i.candidates).toEqual(['2026-10-31', '2026-11-07']);
      expect([i.segments[0].startMin, i.segments[0].endMin]).toEqual([1470, 1560]);
      /* 날짜 정하기로 두면 옮긴 날짜 + 30 (같은 순간) */
      const j = input(f);
      expect([j.date, j.segments[0].startMin]).toEqual(['2026-11-01', 30]);
    });

    it('첫 시각이 정각 24:00(1440)인 일정도 1440 으로 돌아간다', () => {
      const e = ev({ date: '2026-10-31', segments: [{ themeName: '심야', branchName: null, themeKey: null, startMin: 1440, endMin: null, playedBy: [] }] });
      const i = input({ ...formFromEvent(e), dateMode: 'candidates', candidates: ['2026-10-31'] });
      expect(i.segments[0].startMin).toBe(1440);
    });

    it('하루 옮긴 일정도 첫 시각을 낮으로 고쳤으면 더하지 않는다', () => {
      const f = base({ title: 'a', dateMode: 'candidates', candidates: ['2026-10-31'], dateMoved: true, allDay: false, start: '14:00', end: '15:00' });
      const i = input(f);
      expect([i.startMin, i.endMin]).toEqual([840, 900]);
    });

    it('정한 일정은 날짜 정하기로 열고 옛 후보를 들고만 있다', () => {
      const f = formFromEvent(ev({ title: 'a', candidates: [{ date: '2026-10-31', responses: [] }] }));
      expect([f.dateMode, f.candidates, f.date]).toEqual(['fixed', ['2026-10-31'], '2026-10-20']);
      expect('candidates' in input(f)).toBe(false);
    });
  });

  it('날짜 모드를 몇 번 바꿔도 하루 옮긴 일정의 원래 날짜·1470 이 유지된다', () => {
    const seg = { themeName: 'A', branchName: null, themeKey: null, startMin: 1470, endMin: null, playedBy: [] as string[] };
    const f0 = formFromEvent(ev({ date: '2026-10-31', segments: [seg as never], candidates: [{ date: '2026-10-31', responses: [] } as never] }));
    expect([f0.date, f0.dateMoved, f0.segs[0].start]).toEqual(['2026-11-01', true, '00:30']);
    const f = ['candidates', 'fixed', 'candidates'].reduce((cur, m) => switchDateMode(cur, m as 'fixed' | 'candidates', '2026-10-20'), f0);
    expect(f.dateMoved).toBe(true);
    const r = toInput(f);
    if ('error' in r) throw new Error(r.error);
    expect([r.input.date, r.input.segments[0].startMin]).toEqual([null, 1470]);
    const g = switchDateMode(switchDateMode(f0, 'candidates', '2026-10-20'), 'fixed', '2026-10-20');
    const t = toInput(g);
    if ('error' in t) throw new Error(t.error);
    expect([t.input.date, t.input.segments[0].startMin]).toEqual(['2026-11-01', 30]);
  });

  it('새 일정에서 후보를 고른 뒤 날짜 정하기로 바꾸면 가장 이른 후보로 채운다', () => {
    const f = base({ dateMode: 'candidates', candidates: ['2026-10-28', '2026-10-21'].sort() });
    expect(switchDateMode(f, 'fixed', '2026-10-20', true).date).toBe('2026-10-21');
    expect(switchDateMode(base({ dateMode: 'candidates' }), 'fixed', '2026-10-20', true).date).toBe('2026-10-20');
    expect(switchDateMode(f, 'fixed', '2026-10-20').date).toBe('2026-10-20'); // 정한 일정을 고칠 때는 그대로
  });

  describe('붙여넣은 제목 앞의 날짜', () => {
    const T = '2026-10-20';
    it('날짜 정하기: 이름에서 떼고 날짜 칸을 채운다', () => {
      const { form, note } = applyPaste(base(), '[예약O] 10/31 비밀의 방 19:00', T);
      expect([form.segs[0].themeName, form.date]).toEqual(['비밀의 방', '2026-10-31']);
      expect(note).toContain('10/31');
      expect(applyPaste(base(), '[예약O] 10/31(토) 비밀의 방 19:00', T).form.segs[0].themeName).toBe('비밀의 방');
      expect(applyPaste(base(), '비밀의 방 19:00 (10/31)', T).form.date).toBe('2026-10-31');
    });
    it('후보 모드: 후보에 더하고 14개면 안내한다', () => {
      const c = base({ dateMode: 'candidates', candidates: ['2026-10-25'] });
      const r = applyPaste(c, '10/31 비밀의 방 19:00', T);
      expect(r.form.candidates).toEqual(['2026-10-25', '2026-10-31']);
      expect(r.form.candidatesTouched).toBe(true);
      const full = base({ dateMode: 'candidates', candidates: Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`) });
      const g = applyPaste(full, '10/31 비밀의 방 19:00', T);
      expect(g.form.candidates).toHaveLength(14);
      expect(g.note).toContain('더하지 못했어요');
    });
    it('연도는 오늘 기준 가장 가까운 앞날', () => {
      expect(applyPaste(base(), '1/5 방 19:00', T).form.date).toBe('2027-01-05');
      expect(applyPaste(base(), '10/20 방 19:00', T).form.date).toBe('2026-10-20');
    });
  });
});
