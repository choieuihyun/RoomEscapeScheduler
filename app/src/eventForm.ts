/* 일정 만들기·수정 창의 폼 상태 ↔ EventInput 변환과 검사 — React 밖의 순수 함수 (계획 Task E5).
   시각은 입력 칸 문자열("13:40"), 서버로 보낼 때만 분으로 바꾼다. */
import { pad, parseClock, type PathStep } from './core';
import { cpLen, parseKakaoTitle } from './clubEvents';
import type { EventDto, EventInput, SegmentInput } from './server';

export interface FormSeg {
  themeName: string;
  branchName: string;
  themeKey: string | null;
  start: string;
  end: string;
}

export interface FormState {
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  location: string;
  capacity: number | null;
  booked: boolean;
  memo: string;
  segs: FormSeg[];
}

export const MAX_SEGS = 6;
export const emptySeg = (): FormSeg => ({ themeName: '', branchName: '', themeKey: null, start: '', end: '' });

/* 입력 칸에 쓰는 시각 — core.fmt 는 24시를 0시로 접어 버려서 자정 넘김(24:30)을 잃는다. */
const clock = (min: number): string => pad(Math.floor(min / 60)) + ':' + pad(min % 60);
const clockOrBlank = (min: number | null): string => (min === null ? '' : clock(min));

export function emptyForm(date: string): FormState {
  return {
    title: '', date, allDay: true, start: '', end: '', location: '',
    capacity: null, booked: false, memo: '', segs: [],
  };
}

export function formFromEvent(ev: EventDto): FormState {
  return {
    title: ev.title,
    date: ev.date,
    allDay: ev.startMin === null && ev.segments.length === 0,
    start: clockOrBlank(ev.startMin),
    end: clockOrBlank(ev.endMin),
    location: ev.location ?? '',
    capacity: ev.capacity,
    booked: ev.booked,
    memo: ev.memo ?? '',
    segs: ev.segments.map((s) => ({
      themeName: s.themeName,
      branchName: s.branchName ?? '',
      themeKey: s.themeKey,
      start: clock(s.startMin),
      end: clockOrBlank(s.endMin),
    })),
  };
}

/* 계산 결과 단계 → 구간 (결과 카드에서 일정으로 만들 때, E8). 예약은 아직 안 한 것으로 시작한다. */
export function formFromSteps(date: string, steps: PathStep[]): FormState {
  return {
    ...emptyForm(date),
    allDay: false,
    segs: steps.slice(0, MAX_SEGS).map((st) => ({
      themeName: st.name, branchName: st.place, themeKey: null,
      start: clock(st.start), end: clock(st.end),
    })),
  };
}

/* 카톡 제목을 붙여넣었을 때. 구간을 알아보면 구간·예약을 채우고 제목은 비운다(제목은 구간으로 만들어진다).
   못 알아보면 제목만 바꾼다. 원래 폼 객체는 건드리지 않는다. */
export function applyPaste(f: FormState, title: string): { form: FormState; note: string } {
  const p = parseKakaoTitle(title);
  if (p.segments.length === 0) return { form: { ...f, title }, note: '' };
  const segs = p.segments.slice(0, MAX_SEGS).map((s) => ({
    ...emptySeg(), themeName: s.themeName, start: clock(s.startMin),
  }));
  const bits: string[] = [];
  if (p.booked !== null) bits.push(p.booked ? '예약 완료' : '예약 전');
  bits.push(`테마 ${segs.length}개`);
  return {
    form: { ...f, title: '', segs, booked: p.booked ?? f.booked },
    note: (p.booked !== null ? '카톡 제목에서 ' : '') + bits.join(' · ') + '를 채웠어요.',
  };
}

/* 제목 칸을 벗어날 때는 구간이 비어 있을 때만 카톡 제목으로 채운다 — 이미 있는 구간(지점·끝 시각)을
   "정기 모임 19:00" 같은 평범한 제목이 덮어쓰지 못하게. 붙여넣기는 바로 적용한다. */
export const shouldApplyOnBlur = (f: FormState): boolean => f.segs.length === 0;

const MAX_MIN = 2879;

function readClock(s: string): number | null {
  const m = parseClock(s);
  return m !== null && m <= MAX_MIN ? m : null;
}

export function toInput(f: FormState): { input: EventInput } | { error: string } {
  const title = f.title.trim();
  const location = f.location.trim();
  const memo = f.memo.trim();
  if (cpLen(title) > 60) return { error: '제목은 60자까지예요.' };
  if (cpLen(location) > 60) return { error: '위치는 60자까지예요.' };
  if (cpLen(memo) > 500) return { error: '메모는 500자까지예요.' };
  if (!f.date) return { error: '날짜를 골라 주세요.' };

  /* 완전히 빈 행은 없는 것으로 친다 */
  const rows = f.segs.filter((g) => g.themeName.trim() || g.branchName.trim() || g.start.trim() || g.end.trim());
  if (rows.length > MAX_SEGS) return { error: `테마는 ${MAX_SEGS}개까지예요.` };
  const segments: SegmentInput[] = [];
  for (const [i, g] of rows.entries()) {
    const label = `${i + 1}번째 테마`;
    const themeName = g.themeName.trim();
    const branchName = g.branchName.trim();
    if (!themeName) return { error: `${label}의 이름을 적어 주세요.` };
    if (cpLen(themeName) > 40) return { error: `${label}의 이름은 40자까지예요.` };
    if (cpLen(branchName) > 40) return { error: `${label}의 지점은 40자까지예요.` };
    const startMin = readClock(g.start);
    if (startMin === null) return { error: `${label}의 시작 시각은 13:40 처럼 적어 주세요.` };
    let endMin: number | null = null;
    if (g.end.trim()) {
      endMin = readClock(g.end);
      if (endMin === null) return { error: `${label}의 끝 시각은 13:40 처럼 적어 주세요.` };
      if (endMin <= startMin) return { error: `${label}의 끝 시각이 시작보다 늦어야 해요.` };
    }
    segments.push({ themeName, branchName: branchName || null, themeKey: g.themeKey, startMin, endMin });
  }
  if (!title && segments.length === 0) return { error: '제목이나 테마 중 하나는 적어 주세요.' };

  /* 구간이 있으면 일정 시각은 구간에서 읽으므로 보내지 않는다 */
  let startMin: number | null = null;
  let endMin: number | null = null;
  if (segments.length === 0 && !f.allDay) {
    startMin = readClock(f.start);
    if (startMin === null) return { error: '시작 시각은 13:40 처럼 적어 주세요.' };
    if (f.end.trim()) {
      endMin = readClock(f.end);
      if (endMin === null) return { error: '끝 시각은 13:40 처럼 적어 주세요.' };
      if (endMin <= startMin) return { error: '끝 시각이 시작보다 늦어야 해요.' };
    }
    /* 서버는 시작·끝이 둘 다 있거나 둘 다 없어야 한다 */
    if (endMin === null) return { error: '끝 시각도 적어 주세요.' };
  }
  if (f.capacity !== null && !(Number.isInteger(f.capacity) && f.capacity >= 2 && f.capacity <= 8)) {
    return { error: '인원은 2~8명이에요.' };
  }
  return {
    input: {
      title, date: f.date, startMin, endMin,
      location: location || null,
      capacity: f.capacity,
      booked: segments.length > 0 && f.booked,
      memo: memo || null,
      segments,
    },
  };
}
