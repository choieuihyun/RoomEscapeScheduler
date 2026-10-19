/* 일정 만들기·수정 창의 폼 상태 ↔ EventInput 변환과 검사 — React 밖의 순수 함수 (계획 Task E5).
   시각은 입력 칸 문자열("13:40", 24시간제), 서버로 보낼 때만 분으로 바꾸며 자정 넘김(다음날)을 채운다. */
import { fmt, type PathStep } from './core';
import { addDays, sortKeyDate, clockLabel, cpLen, parseClock24, parseKakaoTitle, rangeLabel, rollDays, type TimeRow } from './clubEvents';
import type { EventDto, EventInput, SegmentInput } from './server';

const DAY_MIN = 1440;

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
  /* 불러온 첫 시각이 자정 뒤(1440 이상)라 날짜를 다음날로 옮겼다 — 창이 안내를 보이고, 날짜를 직접 바꾸면 끈다 */
  dateMoved: boolean;
  /* 날짜를 옮기기 전 날짜 — 붙여넣어 시각이 바뀌면 옮긴 날짜가 틀리므로 되돌린다 */
  origDate?: string;
  /* 날짜 정하기(fixed) / 후보 여러 개(candidates) — 후보 모드는 date 를 null 로 보낸다 (§4.8) */
  dateMode: 'fixed' | 'candidates';
  /* 후보 날짜 "YYYY-MM-DD" 오름차순. fixed 일정이 가진 옛 후보도 담는다(다시 미정으로 돌릴 때 쓰게) */
  candidates: string[];
  /* 창에서 후보를 고쳤나 — 고치지 않은 fixed 저장은 candidates 를 아예 보내지 않아 서버가 그대로 둔다 */
  candidatesTouched: boolean;
}

export const MAX_CANDIDATES = 14;

/* 후보 날짜 찍기/빼기 — 가득 찼는데 새 날을 찍으면 목록은 그대로, 안내 문구를 돌려준다 */
export function toggleCandidate(list: string[], iso: string): { list: string[]; error: string } {
  if (list.includes(iso)) return { list: list.filter((d) => d !== iso), error: '' };
  if (list.length >= MAX_CANDIDATES) return { list, error: `후보 날짜는 ${MAX_CANDIDATES}개까지예요.` };
  return { list: [...list, iso].sort(), error: '' };
}

export const MAX_SEGS = 6;
export const emptySeg = (): FormSeg => ({ themeName: '', branchName: '', themeKey: null, start: '', end: '' });

/* 입력 칸에 쓰는 시각 — 24시간제로 접는다(1470 → `00:30`). 저장할 때 toInput 이 다음날을 다시 채운다. */
const clockOrBlank = (min: number | null): string => (min === null ? '' : fmt(min));

export function emptyForm(date: string): FormState {
  return {
    title: '', date, allDay: true, start: '', end: '', location: '',
    capacity: null, booked: false, memo: '', segs: [], dateMoved: false,
    dateMode: 'fixed', candidates: [], candidatesTouched: false,
  };
}

/* 첫 시각(첫 구간 시작, 없으면 일정 시작)이 1440 이상이면 날짜를 하루 뒤로 옮긴다. 칸은 fmt 로 24 에 접혀
   그대로 맞고, 저장할 때 toInput 이 옮긴 날짜 기준으로 다시 다음날을 채운다 — 같은 순간이 그대로 저장된다. */
function nextDayDate(date: string, first: number | null): { date: string; dateMoved: boolean; origDate?: string } {
  return first !== null && first >= 1440 ? { date: addDays(date, 1), dateMoved: true, origDate: date } : { date, dateMoved: false };
}

export function formFromEvent(ev: EventDto): FormState {
  const undecided = ev.date === null;
  return {
    title: ev.title,
    /* 미정 일정은 후보 모드로 연다 — 날짜 칸은 가장 이른 후보로 채워 두지만 모드가 candidates 라 보내지 않는다 */
    ...(undecided
      ? { date: sortKeyDate(ev), dateMoved: false }
      : nextDayDate(ev.date as string, ev.segments[0]?.startMin ?? ev.startMin)),
    dateMode: undecided ? 'candidates' : 'fixed',
    candidates: ev.candidates.map((c) => c.date).sort(),
    candidatesTouched: false,
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
      start: fmt(s.startMin),
      end: clockOrBlank(s.endMin),
    })),
  };
}

/* 계산 결과 단계 → 구간 (결과 카드에서 일정으로 만들 때, E8). 예약은 아직 안 한 것으로 시작한다. */
export function formFromSteps(date: string, steps: PathStep[]): FormState {
  return {
    ...emptyForm(date),
    ...nextDayDate(date, steps[0]?.start ?? null),
    allDay: false,
    segs: steps.slice(0, MAX_SEGS).map((st) => ({
      themeName: st.name, branchName: st.place, themeKey: null,
      start: fmt(st.start), end: fmt(st.end),
    })),
  };
}

/* 카톡 제목을 붙여넣었을 때. 구간을 알아보면 구간·예약을 채우고 제목은 비운다(제목은 구간으로 만들어진다).
   못 알아보면 제목만 바꾼다. 원래 폼 객체는 건드리지 않는다. */
export function applyPaste(f: FormState, title: string): { form: FormState; note: string } {
  const p = parseKakaoTitle(title);
  if (p.segments.length === 0) return { form: { ...f, title }, note: '' };
  const segs = p.segments.slice(0, MAX_SEGS).map((s) => ({
    ...emptySeg(), themeName: s.themeName, start: fmt(s.startMin), end: s.endMin === undefined ? '' : fmt(s.endMin),
  }));
  const bits: string[] = [];
  if (p.booked !== null) bits.push(p.booked ? '예약 완료' : '예약 전');
  bits.push(`테마 ${segs.length}개`);
  return {
    /* 붙여넣은 첫 시각이 06시 전이면 자정 뒤 시각이라 옮긴 날짜가 맞다 — 그대로 두고 안내도 유지.
       아니면 옮긴 날짜와 무관하니 날짜를 원래대로 되돌리고 안내를 끈다 */
    form: p.segments[0].startMin < 6 * 60
      ? { ...f, title: '', segs, booked: p.booked ?? f.booked }
      : { ...f, title: '', segs, booked: p.booked ?? f.booked, date: f.dateMoved && f.origDate ? f.origDate : f.date, dateMoved: false, origDate: undefined },
    note: (p.booked !== null ? '카톡 제목에서 ' : '') + bits.join(' · ') + '를 채웠어요.',
  };
}

/* 제목 칸을 벗어날 때는 구간이 비어 있고 제목에 카톡 표시(맨 앞 `[예약…]` 대괄호나 조각 사이 `+`)가 있을 때만
   카톡 제목으로 채운다 — 이미 있는 구간(지점·끝 시각)이나 "정모 19:00" 같은 평범한 제목(협의 중 일정)이
   구간으로 바뀌지 못하게. 붙여넣기는 바로 적용한다. */
const hasKakaoMarker = (t: string): boolean => /^\s*\[\s*예약/.test(t) || t.includes('+');
export const shouldApplyOnBlur = (f: FormState): boolean => f.segs.length === 0 && hasKakaoMarker(f.title);

/* 창의 읽기 전용 시간(구간이 있을 때): 첫 시작부터 마지막 시각(마지막 구간 끝, 없으면 마지막 구간 시작)까지.
   예: `23:00–다음날 01:50 (테마에서)`. 못 읽는 칸이 있거나 순서가 틀렸으면 적힌 그대로. */
export function segTimeText(segs: FormSeg[]): string {
  if (segs.length === 0) return '';
  const first = segs[0], last = segs[segs.length - 1];
  const lastRaw = last.end.trim() || last.start;
  const raw = (first.start || '--:--') + (segs.length > 1 || last.end.trim() ? '–' + (lastRaw || '--:--') : '');
  const rows: TimeRow[] = [];
  for (const g of segs) {
    const start = parseClock24(g.start);
    const end = g.end.trim() ? parseClock24(g.end) : null;
    if (start === null || (g.end.trim() && end === null)) return raw + ' (테마에서)';
    rows.push({ start, end });
  }
  const rolled = rollDays(rows);
  if (!('rows' in rolled)) return raw + ' (테마에서)';
  const a = rolled.rows[0], z = rolled.rows[rolled.rows.length - 1];
  const lastMin = z.end ?? z.start;
  return (lastMin === a.start ? clockLabel(a.start) : rangeLabel(a.start, lastMin)) + ' (테마에서)';
}

/* 18시 전에 시작해 자정을 넘기려는 경우 — 규칙상 안 되는 이유를 말해 준다(13:00→12:00 같은 오타와 구분).
   starts: 첫 행부터 이 행까지의 시작 시각(앞에서 이미 자정을 넘은 적이 없어야 한다). */
const EVENING_MSG = '자정을 넘기는 일정은 저녁 6시 이후에 시작할 때만 이어서 적을 수 있어요. 날짜를 나눠 주세요.';
function isEarlyOvernight(rows: TimeRow[], bad: 'start' | 'end', i: number): boolean {
  for (let k = 1; k <= i; k++) if (rows[k].start < rows[k - 1].start && !(bad === 'start' && k === i)) return false;
  const early = bad === 'start' ? rows[i - 1].start : rows[i].start;
  const late = bad === 'start' ? rows[i].start : rows[i].end;
  return late !== null && late < early && late < 6 * 60 && early >= 6 * 60 && early < 18 * 60;
}

const TIME_HINT = '13:40 처럼 24시간제로 적어 주세요.';

export function toInput(f: FormState): { input: EventInput } | { error: string } {
  const title = f.title.trim();
  const location = f.location.trim();
  const memo = f.memo.trim();
  if (cpLen(title) > 60) return { error: '제목은 60자까지예요.' };
  if (cpLen(location) > 60) return { error: '위치는 60자까지예요.' };
  if (cpLen(memo) > 500) return { error: '메모는 500자까지예요.' };
  if (f.dateMode === 'candidates') {
    if (f.candidates.length === 0) return { error: '후보 날짜를 하나 이상 골라 주세요.' };
    if (f.candidates.length > MAX_CANDIDATES) return { error: `후보 날짜는 ${MAX_CANDIDATES}개까지예요.` };
  } else {
    if (!f.date) return { error: '날짜를 골라 주세요.' };
    if (f.candidatesTouched && f.candidates.length > MAX_CANDIDATES) return { error: `후보 날짜는 ${MAX_CANDIDATES}개까지예요.` };
  }

  /* 완전히 빈 행은 없는 것으로 친다 */
  const rows = f.segs.filter((g) => g.themeName.trim() || g.branchName.trim() || g.start.trim() || g.end.trim());
  if (rows.length > MAX_SEGS) return { error: `테마는 ${MAX_SEGS}개까지예요.` };
  const segments: SegmentInput[] = [];
  const times: { start: number; end: number | null }[] = [];
  for (const [i, g] of rows.entries()) {
    const label = `${i + 1}번째 테마`;
    const themeName = g.themeName.trim();
    const branchName = g.branchName.trim();
    if (!themeName) return { error: `${label}의 이름을 적어 주세요.` };
    if (cpLen(themeName) > 40) return { error: `${label}의 이름은 40자까지예요.` };
    if (cpLen(branchName) > 40) return { error: `${label}의 지점은 40자까지예요.` };
    const start = parseClock24(g.start);
    if (start === null) return { error: `${label}의 시작 시각은 ${TIME_HINT}` };
    let end: number | null = null;
    if (g.end.trim()) {
      end = parseClock24(g.end);
      if (end === null) return { error: `${label}의 끝 시각은 ${TIME_HINT}` };
    }
    times.push({ start, end });
    segments.push({ themeName, branchName: branchName || null, themeKey: g.themeKey, startMin: start, endMin: end });
  }
  /* 자정을 건너면 다음날로 본다. 그 밖에 순서가 뒤집혔으면 오류 — 오타가 하루 뒤로 저장되지 않게 */
  const rolled = rollDays(times);
  if (!('rows' in rolled)) {
    const n = rolled.index + 1;
    if (isEarlyOvernight(times, rolled.bad, rolled.index)) return { error: `${n}번째 테마: ${EVENING_MSG}` };
    return { error: rolled.bad === 'start'
      ? `${n}번째 테마 시작이 앞 테마보다 이르네요. 순서를 확인해 주세요.`
      : `${n}번째 테마의 끝 시각이 시작보다 늦어야 해요.` };
  }
  rolled.rows.forEach((r, i) => { segments[i].startMin = r.start; segments[i].endMin = r.end; });
  if (!title && segments.length === 0) return { error: '제목이나 테마 중 하나는 적어 주세요.' };

  /* 구간이 있으면 일정 시각은 구간에서 읽으므로 보내지 않는다. 끝은 비워도 된다(시작만 있는 일정). */
  let startMin: number | null = null;
  let endMin: number | null = null;
  if (segments.length === 0 && !f.allDay) {
    startMin = parseClock24(f.start);
    if (startMin === null) return { error: `시작 시각은 ${TIME_HINT}` };
    if (f.end.trim()) {
      const end = parseClock24(f.end);
      if (end === null) return { error: `끝 시각은 ${TIME_HINT}` };
      const rolled = rollDays([{ start: startMin, end }]); // 자정을 건너면 다음날
      if (!('rows' in rolled)) {
        return { error: isEarlyOvernight([{ start: startMin, end }], 'end', 0) ? EVENING_MSG : '끝 시각이 시작보다 늦어야 해요.' };
      }
      endMin = rolled.rows[0].end;
    }
  }
  if (f.capacity !== null && !(Number.isInteger(f.capacity) && f.capacity >= 2 && f.capacity <= 8)) {
    return { error: '인원은 2~8명이에요.' };
  }
  /* 날짜를 하루 옮겨 연 정해진 일정(첫 시각 24:00 넘김)을 후보 모드로 돌리면, 화면의 00:30 은 "옮긴 날 00:30" 이다.
     후보 일정은 날짜가 없어 이 보정이 안 되므로 원래 날짜 기준(1470)으로 되돌려 보낸다 — 안 그러면 후보 날짜마다 하루 어긋난다.
     첫 시각이 아직 새벽(06시 전)일 때만 — 그 사이 첫 시각을 낮 시각으로 고쳤으면 옮긴 날짜와 상관없다. */
  if (f.dateMode === 'candidates' && f.dateMoved) {
    const first = segments.length > 0 ? segments[0].startMin : startMin;
    if (first !== null && first < 6 * 60) {
      for (const g of segments) { g.startMin += DAY_MIN; if (g.endMin !== null) g.endMin += DAY_MIN; }
      if (startMin !== null) startMin += DAY_MIN;
      if (endMin !== null) endMin += DAY_MIN;
    }
  }
  const input: EventInput = {
    title, date: f.dateMode === 'candidates' ? null : f.date, startMin, endMin,
    location: location || null,
    capacity: f.capacity,
    booked: segments.length > 0 && f.booked,
    memo: memo || null,
    segments,
  };
  /* candidates 키: 후보 모드는 늘 보내고, 날짜 정하기는 창에서 고쳤을 때만(없으면 서버가 그대로 둔다 — §4.8 ★) */
  if (f.dateMode === 'candidates') input.candidates = [...f.candidates].sort();
  else if (f.candidatesTouched) input.candidates = [...f.candidates].sort();
  return { input };
}
