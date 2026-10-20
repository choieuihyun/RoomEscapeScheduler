import { describe, it, expect } from 'vitest';
import { emptyForm, MAX_SEGS, toInput, type FormSeg, type FormState } from './eventForm';
import { branchLabel, filterBranches, mergePicks, overlaps, playedByMe, roomLeft, segFromPick, segMeta, segRanges, toPick, type PickedSession } from './eventPick';
import type { Branch, PlayedDto, ServerTheme } from './server';

const B = { id: 'zero-gn', store: '제로월드', branch: '강남점' };
const th = (o: Partial<ServerTheme> = {}): ServerTheme => ({ id: 'zero-gn:1', name: '비밀의 화원', dur: 70, sessions: [], ...o });
const pick = (t: number, o: Partial<PickedSession> = {}): PickedSession => ({
  key: `k${t}`, date: '2026-10-22', themeName: `T${t}`, branchName: '제로월드 강남점', themeKey: `zero-gn:${t}`, t, dur: 70, ...o,
});
const seg = (start: string, end = '', themeName = 'A'): FormSeg => ({ themeName, branchName: '', themeKey: null, start, end });
const blank = (): FormSeg => ({ themeName: '', branchName: '', themeKey: null, start: '', end: '' });
const base = (o: Partial<FormState> = {}): FormState => ({ ...emptyForm('2026-10-22'), ...o });
const sent = (f: FormState) => {
  const r = toInput(f);
  if ('error' in r) throw new Error(r.error);
  return r.input;
};

describe('eventPick — 회차를 구간으로', () => {
  it('지점 이름은 시간표 계산과 같은 규칙(매장 + 지점, 매장이 없으면 지점만)', () => {
    expect(branchLabel(B)).toBe('제로월드 강남점');
    expect(branchLabel({ store: '', branch: '동네방탈출' })).toBe('동네방탈출');
  });

  it('회차 → 고른 회차: 테마 키는 테마 id, 소요 시간, 지점 이름', () => {
    const p = toPick(B, '2026-10-22', th(), { id: 9, t: 820 });
    expect(p).toEqual({ key: 'zero-gn::2026-10-22::zero-gn:1::9', date: '2026-10-22', themeName: '비밀의 화원', branchName: '제로월드 강남점', themeKey: 'zero-gn:1', t: 820, dur: 70 });
    expect(toPick(B, '2026-10-22', th({ dur: undefined }), { id: 1, t: 820 }).dur).toBeNull();
    expect(toPick(B, '2026-10-22', th({ dur: 0 }), { id: 1, t: 820 }).dur).toBeNull();
  });

  it('이름·지점은 40자, 키는 80자를 넘으면 자르거나 비운다(저장이 막히지 않게)', () => {
    const long = '가'.repeat(45);
    const p = toPick({ id: 'x', store: long, branch: '점' }, '2026-10-22', th({ name: long, id: 'k'.repeat(81) }), { id: 1, t: 600 });
    expect([...p.themeName].length).toBe(40);
    expect([...p.branchName].length).toBe(40);
    expect(p.themeKey).toBeNull();
  });

  it('구간 칸: 시작 = 회차, 끝 = 시작 + 소요 시간, 소요 시간을 모르면 끝은 비움', () => {
    expect(segFromPick(pick(820))).toEqual({ themeName: 'T820', branchName: '제로월드 강남점', themeKey: 'zero-gn:820', start: '13:40', end: '14:50' });
    expect(segFromPick(pick(820, { dur: null })).end).toBe('');
    // 다음날 회차는 24시간제로 접고, 저장할 때 자정 넘김을 채운다
    expect(segFromPick(pick(1470, { dur: 80 }))).toMatchObject({ start: '00:30', end: '01:50' });
    expect(segFromPick(pick(1400, { dur: 80 }))).toMatchObject({ start: '23:20', end: '00:40' });
  });
});

describe('eventPick — 합치기', () => {
  it('시작 순으로 세우고, 빈 카드는 치운다', () => {
    const f = base({ segs: [seg('15:00', '16:00', 'X'), blank()] });
    const { form, note } = mergePicks(f, [pick(1000), pick(820)], '2026-10-22');
    expect(form.segs.map((g) => g.themeName)).toEqual(['T820', 'X', 'T1000']);
    expect(note).toBe('');
    expect(form.allDay).toBe(false);
  });

  it('자정 넘는 구간과 섞여도 실제 시각 순', () => {
    const f = base({ segs: [seg('23:00', '', 'X'), seg('00:40', '', 'Y')] });
    const { form } = mergePicks(f, [pick(1500, { dur: null }), pick(1320, { dur: null })], '2026-10-22');
    expect(form.segs.map((g) => g.themeName)).toEqual(['T1320', 'X', 'Y', 'T1500']);
    expect(sent(form).segments.map((s) => s.startMin)).toEqual([1320, 1380, 1480, 1500]);
  });

  it('이미 있는 구간을 못 읽으면 순서는 그대로 두고 뒤에 붙인다', () => {
    const f = base({ segs: [seg('', '', '이름만')] });
    const { form } = mergePicks(f, [pick(900), pick(820)], '2026-10-22');
    expect(form.segs.map((g) => g.themeName)).toEqual(['이름만', 'T820', 'T900']);
  });

  it(`구간은 ${MAX_SEGS}개까지 — 남은 자리만큼만 넣는다`, () => {
    const f = base({ segs: [seg('10:00'), seg('11:00'), seg('12:00'), seg('13:00'), blank()] });
    expect(roomLeft(f.segs)).toBe(2);
    const { form } = mergePicks(f, [pick(1500), pick(1400), pick(1450)], '2026-10-22');
    expect(form.segs).toHaveLength(MAX_SEGS);
    expect(form.segs.slice(4).map((g) => g.start)).toEqual(['23:20', '00:10']);
    expect(mergePicks(base({ segs: Array.from({ length: 6 }, () => seg('10:00')) }), [pick(900)], '2026-10-22').form.segs).toHaveLength(6);
  });

  it('저장하면 테마 키·지점·분이 그대로 간다(다음날 회차는 1440 이상)', () => {
    const { form } = mergePicks(base(), [pick(1170, { dur: null }), pick(1470, { dur: 80 })], '2026-10-22');
    expect(sent(form)).toMatchObject({
      date: '2026-10-22',
      segments: [
        { themeName: 'T1170', branchName: '제로월드 강남점', themeKey: 'zero-gn:1170', startMin: 1170, endMin: null },
        { themeName: 'T1470', themeKey: 'zero-gn:1470', startMin: 1470, endMin: 1550 },
      ],
    });
  });

  it('다음날 회차만 넣으면 날짜를 하루 뒤로 — 같은 순간이 저장된다', () => {
    const { form } = mergePicks(base(), [pick(1470, { dur: 80 })], '2026-10-22');
    expect([form.date, form.dateMoved, form.origDate]).toEqual(['2026-10-23', true, '2026-10-22']);
    expect(sent(form)).toMatchObject({ date: '2026-10-23', segments: [{ startMin: 30, endMin: 110 }] });
  });

  it('18시 전 구간 뒤의 다음날 회차는 지금 규칙대로 막힌다(카톡 제목과 같게)', () => {
    const { form } = mergePicks(base({ segs: [seg('13:40', '14:50')] }), [pick(1470)], '2026-10-22');
    const r = toInput(form);
    expect('error' in r && r.error).toMatch(/저녁 6시 이후/);
  });

  it('찾은 날짜가 일정 날짜와 다르면 일정 날짜를 그 날로 바꾸고 알린다', () => {
    const f = base({ date: '2026-10-22', segs: [seg('10:00', '11:00')] });
    const { form, note } = mergePicks(f, [pick(820)], '2026-10-24');
    expect(form.date).toBe('2026-10-24');
    expect(note).toBe('일정 날짜를 10/24 로 맞췄어요.');
    expect(mergePicks(f, [pick(820)], '2026-10-22').note).toBe('');
  });

  it('구간이 비어 있으면 옮겨 둔 날짜 표시는 지운다', () => {
    const f = base({ date: '2026-10-23', dateMoved: true, origDate: '2026-10-22' });
    const { form } = mergePicks(f, [pick(820)], '2026-10-23');
    expect([form.date, form.dateMoved, form.origDate]).toEqual(['2026-10-23', false, undefined]);
  });

  it('후보 여러 개면 후보·날짜는 그대로, 다음날 회차만이면 같은 순간으로 보낸다', () => {
    const f = base({ dateMode: 'candidates', candidates: ['2026-10-24', '2026-10-25'], date: '2026-10-24' });
    const day = mergePicks(f, [pick(820)], '2026-10-26').form;
    expect([day.date, day.candidates, day.dateMode]).toEqual(['2026-10-24', ['2026-10-24', '2026-10-25'], 'candidates']);
    const late = mergePicks(f, [pick(1470)], '2026-10-24').form;
    expect(sent(late)).toMatchObject({ date: null, segments: [{ startMin: 1470, endMin: 1540 }] });
  });

  it('넣을 것이 없으면 그대로', () => {
    const f = base({ segs: [seg('10:00')] });
    expect(mergePicks(f, [], '2026-10-22').form).toBe(f);
  });
});

describe('eventPick — 카드 표시·겹침·지점 찾기', () => {
  it('카드마다 소요 시간과 다음날', () => {
    expect(segMeta([seg('13:40', '14:50'), seg('23:00', '00:20'), seg('00:40', '01:40')])).toEqual([
      { dur: 70, next: false }, { dur: 80, next: true }, { dur: 60, next: true },
    ]);
    expect(segMeta([seg('13:40'), seg('')])).toEqual([{ dur: null, next: false }, { dur: null, next: false }]);
    // 순서가 틀려도 그 카드만으로
    expect(segMeta([seg('15:00', '16:10'), seg('13:00', '13:50')])).toEqual([{ dur: 70, next: false }, { dur: 50, next: false }]);
    expect(segMeta([seg('13:00', '12:00')])).toEqual([{ dur: null, next: false }]);
  });

  it('구간 시각(분) — 끝이 틀렸으면 시작만', () => {
    expect(segRanges([seg('23:00', '00:30')])).toEqual([{ start: 1380, end: 1470 }]);
    expect(segRanges([seg('13:00', '12:00')])).toEqual([{ start: 780, end: null }]);
    expect(segRanges([seg('13:00'), seg('12:00')])).toBeNull();
  });

  it('겹침 — 끝이 없으면 한 점', () => {
    expect(overlaps({ start: 820, end: 890 }, { start: 870, end: 930 })).toBe(true);
    expect(overlaps({ start: 820, end: 890 }, { start: 890, end: 950 })).toBe(false);
    expect(overlaps({ start: 820, end: null }, { start: 800, end: 830 })).toBe(true);
    expect(overlaps({ start: 820, end: null }, { start: 821, end: null })).toBe(false);
  });

  it('내가 해 본 테마 — 키가 같거나, 키가 없으면 이름', () => {
    const P = (themeKey: string | null, themeName: string) => ({ themeKey, themeName }) as PlayedDto;
    expect(playedByMe({ id: 'zero-gn:1', name: '비밀의 화원' }, [P('zero-gn:1', '다른 이름')])).toBe(true);
    expect(playedByMe({ id: 'zero-gn:1', name: '비밀의 화원' }, [P('key-hd:1', '비밀의 화원')])).toBe(false);
    expect(playedByMe({ id: 'zero-gn:1', name: '비밀의 화원' }, [P(null, '비밀의화원!')])).toBe(true);
  });

  it('지점 찾기 — 부분 일치, 그날 시간표 있는 지점 먼저', () => {
    const br = (id: string, store: string, branch: string, dates: string[]): Branch => ({ id, store, branch, dates, checkedAt: null });
    const list = [br('a', '비트포비아', '던전101', ['2026-10-20']), br('b', '제로월드', '강남점', ['2026-10-22']), br('c', '키이스케이프', '강남 더오리지널', ['2026-10-22'])];
    expect(filterBranches(list, '', '2026-10-22').map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(filterBranches(list, '강 남', '2026-10-22').map((b) => b.id)).toEqual(['b', 'c']);
    expect(filterBranches(list, '던전', '2026-10-22').map((b) => b.id)).toEqual(['a']);
  });
});
