import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmt, monthGrid, toISO, WEEKDAYS } from '../core';
import type { Plan } from '../cloud';
import type { EventDto, PlayedDto, WatchDto } from '../server';
import type { UseAuthReturn } from '../useAuth';
import type { UsePlansReturn } from '../usePlans';
import type { UseWatchesReturn } from '../useWatches';
import type { CalFilter, CalKind, CalMode, UseCalendarReturn } from '../useCalendar';
import { useDaySchedule } from '../useDaySchedule';
import type { Scheduler } from '../scheduler/useScheduler';
import { DayBranches } from './DayBranches';
import { Fold } from './Fold';
import { EventPanel } from './EventPanel';
import { dayLabel, eventStatus, eventTitle, HALF_DAY, halfOf, isUndecided, sortEvents, STATUS_LABEL, timeLabel } from '../clubEvents';
import type { UseClubEventsReturn } from '../useClubEvents';
import type { AddedTheme } from '../scheduler/types';
import { playedWho, playedWhoLabel, playedWhoTitle } from '../playedWho';
import { playedByDate } from '../playedView';
import { withoutPending, type UseProfileReturn } from '../useProfile';
import { useBackClose } from '../backStack';
import { planWaitText } from '../planWait';

/* 캘린더 화면(§4.49) — 모달이던 것(§4.38·§4.40)을 왼쪽 메뉴의 한 화면으로 옮겼다.
   그룹웨어 월간 보기처럼 날짜 칸 안에 일정·감시 회차를 줄로 보여주고, 고른 날짜의
   상세(일정 불러오기·감시 해제·그날 열린 회차)는 오른쪽 패널에 둔다.

   §4.50 — 월/주/일 보기, 칸의 "+n" 을 누르면 그날 전체를 띄우는 작은 창, 일정 줄에
   마우스를 올리면 요약, ←/→ 키로 이동, 종류별 보이기(필터)를 더했다. */

interface DayEntry { plans: Plan[]; watches: WatchDto[] }

/* 칸·주·일 보기가 같이 쓰는 일정 한 줄. 일정(plan)은 시작~끝이 있고, 감시(watch)는
   회차 시작 시각 하나뿐이다. */
interface Ev { key: string; kind: CalKind; start: number; end: number | null; text: string; title: string }

/* 칸 하나에 줄로 보여줄 최대 개수 — 주(週) 줄 높이 110px 에 날짜 숫자와 함께
   들어가는 만큼. 넘치면 두 줄 + "+n" 으로 접는다. */
const CELL_MAX = 3;

function eventsOf(entry: DayEntry | undefined, filter: CalFilter): Ev[] {
  if (!entry) return [];
  const evs: Ev[] = [];
  for (const p of entry.plans) {
    const kind: CalKind = p.status === 'wish' ? 'wish' : 'done';
    if (!filter[kind]) continue;
    const route = p.steps?.length ? '\n' + p.steps.map(x => `${fmt(x.start)} ${x.name}`).join(' → ') : '';
    evs.push({
      key: 'p' + p.id, kind, start: p.start, end: p.end,
      text: `${fmt(p.start)} ${p.count}연방`,
      title: `${kind === 'wish' ? '하고 싶은 일정' : '다녀온 일정'} · ${fmt(p.start)}–${fmt(p.end)} · ${p.count}연방 · ${planWaitText(p)}`
        + route + (p.memo ? '\n' + p.memo : ''),
    });
  }
  if (filter.watch) {
    for (const w of entry.watches) {
      evs.push({
        key: 'w' + w.id, kind: 'watch', start: w.t, end: null,
        text: `${fmt(w.t)} ${w.theme}`,
        title: `빈자리 알림 · ${w.branch} · ${w.theme} ${fmt(w.t)} · ${w.available ? '빈자리 있음' : '매진'}`,
      });
    }
  }
  return evs.sort((a, b) => a.start - b.start);
}

const EvLine = ({ e }: { e: Ev }) => <span className={'cal-ev ' + e.kind} title={e.title}>{e.text}</span>;

/* 해 본 테마(§4.62) — 직접 적은 기록의 날짜에 테마 이름 한 줄. 시각이 없어 그날 줄의 맨 뒤에 둔다.
   휴대폰 달 칸에선 점만 남아 이름은 화면 읽기용 글자로 */
const playedPlace = (p: PlayedDto) => [p.storeName, p.branchName].filter(Boolean).join(' ');
function PlayedLine({ p }: { p: PlayedDto }) {
  const label = ['해 본 테마', p.themeName, playedPlace(p), p.playedOn && dayLabel(p.playedOn)].filter(Boolean).join(' · ');
  return (
    <span className="cal-ev played" title={label}>
      <span className="sr-only">{label}</span><span aria-hidden="true">{p.themeName}</span>
    </span>
  );
}

/* 동호회 일정 칩(계획 Task E6) — 상태 점 + 제목(또는 첫 테마)과 시각 + 참여 수. 누르면 오른쪽 패널에 상세. */
function chipText(ev: EventDto): string {
  const label = ev.title || ev.segments[0]?.themeName || '';
  const half = ev.segments.length === 0 ? halfOf(ev.startMin, ev.endMin) : null;
  if (half) return `${label} ${HALF_DAY[half].label}`;   // 오전·오후 일정은 00:00 이 아니라 "오전"
  const start = ev.startMin ?? ev.segments[0]?.startMin ?? null;
  return start === null ? label : `${label} ${fmt(start)}`;
}
const peopleText = (ev: EventDto) => (ev.capacity === null ? `${ev.count}` : `${ev.count}/${ev.capacity}`);
/* 이 일정 테마를 이미 해 본 참여자(playedWho) — 고른 날 줄은 둘까지 이름(셋부터 "철수 외 2명 해 봄"),
   달 칸 칩은 자리가 없어 "2명 해 봄". 이름은 다 title 로. 없으면 아무것도 안 붙인다 */

/* 날짜 미정 일정은 후보 날짜마다 흐린 칩(cand)으로 — 누르면 그 후보 날짜를 고른 채 상세를 연다.
   onOpen 이 없으면 누를 수 없는 표시만 한다(달·주 칸 — 2026-10-22 사용자 요청: 칸 안 칩을 잘못 눌러 상세로 들어가는 일이 잦았다.
   칸을 누르면 날짜만 고르고, 상세는 아래 그날 목록(ClubRow)에서 연다) */
function ClubChip({ ev, iso, on, past, onOpen }: {
  ev: EventDto; iso: string; on: boolean; past: boolean; onOpen?: (ev: EventDto, date: string) => void;
}) {
  const st = eventStatus(ev);
  const time = timeLabel(ev);
  const cand = isUndecided(ev);
  const who = playedWho(ev);
  const pl = who.length > 0 ? `${who.length}명 해 봄` : '';
  const cls = 'cal-ev club ' + st + (cand ? ' cand' : '') + (on ? ' on' : '') + (past ? ' past' : '');
  const title = `${STATUS_LABEL[st]}${cand ? ` · 후보 날짜(${ev.candidates.length}개 중)` : ''} · ${eventTitle(ev)}${time ? ' · ' + time : ''} · 참여 ${peopleText(ev)}${pl ? ' · ' + playedWhoTitle(who) : ''}`;
  const body = (
    <>
      <i className="cal-dot" /><span className="cal-ev-t">{chipText(ev)}</span>
      {/* 좁은 달 칸에선 세모만 보이고 글자는 읽어 주기만 한다(floduler.css 의 @container) */}
      {pl && (
        <span className="cal-ev-p">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <span className="cal-ev-pt">{pl}</span><span className="sr-only"> ({who.join(', ')})</span>
        </span>
      )}
      <span className="cal-ev-n">{peopleText(ev)}</span>
    </>
  );
  if (!onOpen) return <span className={cls} title={title}>{body}</span>;
  return (
    <button
      type="button" className={cls} title={title} aria-pressed={on}
      /* 칸(role=button)의 클릭·Enter·Space 처리로 번지지 않게 — 칸은 그 키에 preventDefault 를 건다.
         다른 키(←/→ 달 이동 등)는 그대로 둔다 */
      onClick={e => { e.stopPropagation(); onOpen(ev, iso); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
    >
      {body}
    </button>
  );
}

/* 고른 날 상세에 보이는 동호회 일정 한 줄 — 휴대폰에선 칸의 칩이 점이라 여기서 연다 */
function ClubRow({ ev, iso, onOpen }: { ev: EventDto; iso: string; onOpen: (ev: EventDto, date: string) => void }) {
  const st = eventStatus(ev);
  const time = timeLabel(ev);
  const when = isUndecided(ev) ? `날짜 미정 · 후보 ${ev.candidates.length}개${time ? ' · ' + time : ''}` : time || '하루 종일';
  const who = playedWho(ev);
  return (
    <button type="button" className="cal-club-row" onClick={() => onOpen(ev, iso)}>
      <span className={'chip-st ' + st}>{STATUS_LABEL[st]}</span>
      {who.length > 0 && <span className="chip-info warn who" title={playedWhoTitle(who)}>{playedWhoLabel(who)}</span>}
      {ev.settlementTotal !== null && <span className="chip-info muted">정산</span>}
      <span className="ccr-t">{eventTitle(ev)}</span>
      <span className="ccr-m">{when} · 참여 {peopleText(ev)}{(ev.commentCount ?? 0) > 0 && ` · 댓글 ${ev.commentCount}`}</span>
    </button>
  );
}

function cellClass(d: Date, iso: string, today: string, selected: string, outOf?: number) {
  const dow = d.getDay();
  return ['cal-cell', outOf != null && d.getMonth() !== outOf && 'out', iso === today && 'today',
    iso === selected && 'on', dow === 0 && 'sun', dow === 6 && 'sat'].filter(Boolean).join(' ');
}

function PlanDetailRow({ p, s, plans, onLoaded }: { p: Plan; s: Scheduler; plans: UsePlansReturn; onLoaded: () => void }) {
  const wish = p.status === 'wish';
  const busy = p.id != null && plans.busyIds.has(p.id);
  return (
    <div className="loaditem">
      <div className="li-t">
        <strong>{fmt(p.start)} → {fmt(p.end)}</strong>
        <span className="li-m">{p.count}연방 · {planWaitText(p)}</span>
        <span className={'tag ' + (wish ? 'wish' : 'done')}>{wish ? '하고 싶음' : '다녀옴'}</span>
      </div>
      <span className="pbtns">
        <button
          className="btn" type="button"
          /* 불러오기와 화면 전환이 같은 이벤트 안이라 React 가 한 번에 그린다 — 결과
             타임라인은 계산 화면이 보이는 상태에서 너비를 잰다(숨긴 채로 재면 0). */
          onClick={() => { if (s.loadSnapshot(p.snapshot, p.date)) onLoaded(); }}
        >불러오기</button>
        <button
          className="btn-x" type="button" title="삭제" disabled={busy}
          onClick={() => { if (p.id && confirm(`${p.date} 일정을 지울까요?`)) plans.remove(p.id); }}
        >×</button>
      </span>
    </div>
  );
}

function WatchDetailRow({ w, watches }: { w: WatchDto; watches: UseWatchesReturn }) {
  const busy = watches.busyIds.has(w.id);
  return (
    <div className="loaditem">
      <div className="li-t">
        <strong>{w.theme}</strong>
        <span className="li-m">{w.branch} · {fmt(w.t)}</span>
        <span className="li-c">{w.available ? <b>빈자리 있음</b> : '매진'}</span>
      </div>
      <button
        className="btn-x" type="button" title="빈자리 알림 끄기" disabled={busy}
        onClick={() => { if (confirm(`${w.theme} ${fmt(w.t)} 빈자리 알림을 끌까요?`)) watches.remove(w.id); }}
      >×</button>
    </div>
  );
}

const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dayTitle = (iso: string) => {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
};
const weekOf = (iso: string) => {
  const d = parseISO(iso);
  const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i));
};
const p2 = (n: number) => String(n).padStart(2, '0');

function toolbarTitle(mode: CalMode, cursor: { y: number; m: number }, selected: string) {
  if (mode === 'month') return `${cursor.y}.${p2(cursor.m + 1)}`;
  if (mode === 'day') {
    const d = parseISO(selected);
    return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} (${WEEKDAYS[d.getDay()]})`;
  }
  const w = weekOf(selected);
  const a = w[0], b = w[6];
  return `${a.getFullYear()}.${p2(a.getMonth() + 1)}.${p2(a.getDate())} – ${p2(b.getMonth() + 1)}.${p2(b.getDate())}`;
}

/* 일 보기의 시간 축 — 이른 일정이 있으면 그 시각까지 위로 넓힌다. 1시간 = 44px. */
const HOUR_PX = 44;
function DayTimeline({ evs }: { evs: Ev[] }) {
  const first = evs.length ? Math.min(...evs.map(e => e.start)) : 10 * 60;
  const from = Math.min(9, Math.floor(first / 60));
  const hours = Array.from({ length: 24 - from }, (_, i) => from + i);
  const y = (m: number) => ((m - from * 60) / 60) * HOUR_PX;
  return (
    <div className="cal-day-tl" style={{ height: hours.length * HOUR_PX }}>
      {hours.map(h => (
        <div key={h} className="cal-hour" style={{ top: y(h * 60) }}><span>{p2(h)}:00</span></div>
      ))}
      {evs.map(e => {
        /* 감시는 시작 시각만 있어 30분짜리 표시로 그린다. 일정과 겹치지 않게 감시는
           오른쪽 칸, 일정은 왼쪽 칸에 둔다. */
        const end = e.end ?? e.start + 30;
        return (
          <div
            key={e.key} className={'cal-blk ' + e.kind + (e.kind === 'watch' ? ' right' : '')} title={e.title}
            style={{ top: y(e.start), height: Math.max(22, y(end) - y(e.start)) }}
          >
            <b>{e.text}</b>
            {e.end != null && <span>{fmt(e.start)}–{fmt(e.end)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function CalendarPage({
  ctl, active, plans, watches, auth, s, onLoaded, club, clubOn, clubToday, onNewEvent, onEditEvent, onCloseEvent, onOpenEvent, onCalcWindow, onCalcThemes,
  profile, onAllPlayed,
}: {
  ctl: UseCalendarReturn; active: boolean; plans: UsePlansReturn; watches: UseWatchesReturn;
  auth: UseAuthReturn; s: Scheduler; onLoaded: () => void;
  /* 동호회 일정 — clubOn 은 승인 멤버이고 일정 API 가 있을 때(SchedulerPage 의 homeOn) */
  club: UseClubEventsReturn; clubOn: boolean;
  /* 한국 날짜 '오늘' — 지난 일정 흐림 기준. 자정에 SchedulerPage 가 새로 센다 */
  clubToday: string;
  onNewEvent: (date: string) => void; onEditEvent: (ev: EventDto) => void; onCloseEvent: () => void;
  /* 일정을 패널에 연다(그 날짜도 고른다 — 날짜 미정 일정은 누른 후보 날짜). 링크(#e=) 일정이 아니면 주소의 #e= 를 지운다 */
  onOpenEvent: (ev: EventDto, date?: string) => void;
  onCalcWindow: (w: { start: number; end: number }, ev: EventDto) => void;
  onCalcThemes: (items: AddedTheme[], ev: EventDto) => void;
  /* 해 본 테마 — 승인 멤버이고 해 본 테마 API 가 있을 때만(아니면 null). 내 정보가 이미 받아 둔 목록을 그대로 쓴다 */
  profile: UseProfileReturn | null;
  /* 그날 패널의 "해 본 테마 모두 보기" */
  onAllPlayed: () => void;
}) {
  const grid = useMemo(() => monthGrid(ctl.cursor.y, ctl.cursor.m), [ctl.cursor.y, ctl.cursor.m]);
  /* 칸의 오늘 표시와 동호회 일정의 '지난 날짜'는 모두 한국 날짜(clubToday, 자정에 갱신)로 본다 */
  const today = clubToday;
  const day = useDaySchedule(active);
  /* "그날 열려 있는 회차" 는 처음엔 접어 둔다(2026-10-21 사용자 요청) — 펼쳤을 때만 서버에 묻는다. 펼친 상태는 날짜를 바꿔도 유지 */
  const [dayOpen, setDayOpen] = useState(false);
  useEffect(() => {
    if (active && dayOpen) day.load(ctl.selected, ctl.branches);
  }, [active, dayOpen, ctl.selected, ctl.branches, day.load]);
  const byDate = useMemo(() => {
    const m = new Map<string, DayEntry>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { plans: [], watches: [] }), m.get(k)!);
    for (const p of plans.plans) if (p.date) get(p.date).plans.push(p);
    for (const w of watches.watches) if (w.date) get(w.date).watches.push(w);
    return m;
  }, [plans.plans, watches.watches]);
  const evsOf = (iso: string) => eventsOf(byDate.get(iso), ctl.filter);
  const showClub = clubOn && ctl.filter.club;
  /* 날짜가 정해진 일정은 그 날짜에, 날짜 미정 일정은 후보 날짜마다 놓는다. 한 칸 안 순서는 그 칸 날짜 기준으로
     다시 정렬한다 — 목록의 저장 순서(마지막 동작이 어떤 기준 날짜로 정렬했나)에 따라 칸 안 줄이 바뀌지 않게 */
  const clubByDate = useMemo(() => {
    const m = new Map<string, EventDto[]>();
    for (const e of club.events) {
      for (const d of e.date !== null ? [e.date] : e.candidates.map(c => c.date)) (m.get(d) ?? (m.set(d, []), m.get(d)!)).push(e);
    }
    for (const [d, list] of m) m.set(d, sortEvents(list, d));
    return m;
  }, [club.events]);
  const clubOf = (iso: string) => (showClub ? clubByDate.get(iso) ?? [] : []);
  /* 해 본 테마는 날짜별 Map 으로 한 번 묶는다(수백 개여도 칸마다 거르지 않게). 지우려고 미뤄 둔 기록은 뺀다 */
  const playedList = profile?.played ?? null;
  const playedPending = profile?.pendingIds;
  const playedMap = useMemo(
    () => playedByDate(playedList && playedPending ? withoutPending(playedList, playedPending) : []),
    [playedList, playedPending],
  );
  const showPlayed = profile !== null && ctl.filter.played;
  const playedOf = (iso: string) => (showPlayed ? playedMap.get(iso) ?? [] : []);
  const openEv = ctl.openEvent === null ? null : club.events.find(e => e.id === ctl.openEvent) ?? null;
  /* 한 칸 화면(≤1100)에선 상세가 달력 자리를 차지하고 맨 위로 넘긴다 — 달력에서 열 때 보던 자리를 적어 두고,
     상세를 닫으면(‹ 캘린더·뒤로 가기·날짜 고르기) 그 자리로 돌아간다. 일정에서 일정으로 옮겨 갈 때는 처음 자리를 지킨다 */
  const backY = useRef<number | null>(null);
  const openClub = (ev: EventDto, date?: string) => {
    if (ctl.openEvent === null && active && matchMedia('(max-width:1100px)').matches) backY.current = scrollY;
    onOpenEvent(ev, date);
  };
  const detailOn = openEv !== null;
  useLayoutEffect(() => {
    if (detailOn || backY.current === null) return;
    const y = backY.current;
    backY.current = null;
    /* 닫을 때 지워지는 뒤로 가기 기록(useBackClose)에서 브라우저도 같은 자리로 되돌린다 — 상세가 맨 위로 넘기기 전에 그 기록을 쌓아서(EventPanel) */
    if (active) scrollTo({ top: y });
  }, [detailOn, active]);
  /* 날짜를 고르면 그날 상세로 돌아간다 */
  const pick = (iso: string) => { ctl.select(iso); if (ctl.openEvent !== null) onCloseEvent(); };
  /* 칸·창·주 보기가 같이 쓰는 줄 목록: 동호회 일정 먼저, 그다음 내 일정·빈자리 알림 */
  /* 연 일정 표시 — 날짜 미정 일정은 고른(누른) 후보 칸에서만 */
  const isOn = (ev: EventDto, iso: string) => ev.id === ctl.openEvent && (ev.date !== null || iso === ctl.selected);
  /* open: 칩을 눌러 상세를 열 수 있나 — 달·주 칸은 아니고(칸을 누르면 날짜만 고른다), "+n" 창은 그렇다 */
  const lineOf = (iso: string, open = false) => [
    ...clubOf(iso).map(ev => (
      <ClubChip key={'c' + ev.id} ev={ev} iso={iso} on={isOn(ev, iso)} past={iso < clubToday} onOpen={open ? openClub : undefined} />
    )),
    ...evsOf(iso).map(e => <EvLine key={e.key} e={e} />),
    ...playedOf(iso).map(p => <PlayedLine key={'d' + p.id} p={p} />),
  ];

  /* "+n" 작은 창 — 칸은 overflow:hidden 이라 칸 안에 둘 수 없어 문서 기준 위치(absolute)로
     띄운다. 바깥을 누르거나 Esc 면 닫힌다. 스크롤로는 닫지 않는다 — 날짜를 고르면 오른쪽
     패널이 회차를 불러오며 길이가 바뀌고, 그때 브라우저가 스크롤을 살짝 보정하는 것만으로
     창이 바로 닫혀 버렸다(헤드리스 실측). 문서 기준이라 스크롤하면 칸과 같이 움직인다. */
  const [popRaw, setPop] = useState<{ iso: string; x: number; y: number } | null>(null);
  const pop = active ? popRaw : null;   // 다른 화면으로 가면 창도 같이 사라진다
  const popRef = useRef<HTMLDivElement>(null);
  useBackClose(!!pop, () => setPop(null)); // 뒤로 가기로 닫는다
  useEffect(() => {
    if (!pop) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'mousedown' && popRef.current?.contains(e.target as Node)) return;
      setPop(null);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [pop]);

  /* ←/→ 로 이전·다음(보기 단위만큼). 글자를 치는 중이거나 모달·투어가 떠 있으면 안 먹는다. */
  const { prev, next } = ctl;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('.modal.on, .tour-tip.on')) return;
      e.preventDefault();
      (e.key === 'ArrowLeft' ? prev : next)();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [active, prev, next]);

  const sel = ctl.selected;
  const selEntry = byDate.get(sel);
  const weeks = Array.from({ length: grid.length / 7 }, (_, i) => grid.slice(i * 7, i * 7 + 7));
  const popEvs = pop ? lineOf(pop.iso, true) : [];
  const selClub = clubOf(sel);
  const selPlayed = playedOf(sel);

  const kindBtn = (k: CalKind, label: string) => (
    <button
      type="button" className={'chip-pick cal-legend-item' + (ctl.filter[k] ? '' : ' off')}
      aria-pressed={ctl.filter[k]} onClick={() => ctl.toggleKind(k)}
    ><i className={'cal-key ' + k} />{label}</button>
  );

  return (<>
    {/* 머리말은 이 청크 안에 둔다 — 진입 청크 크기(§4.64) */}
    <header className="page-head">
      <h1>캘린더</h1>
      <p>{clubOn ? '모임 일정과 저장한 일정, 빈자리 알림을' : '저장한 일정과 빈자리 알림을'} 날짜별로 모아 봐요. 날짜를 누르면 그날 예약할 수 있는 회차도 볼 수 있어요.</p>
    </header>
    <section className="calpage">
      <div className="cal-toolbar">
        <button className="cal-nav" type="button" onClick={ctl.prev} aria-label="이전" title="이전 (←)">‹</button>
        <span className="cal-title">{toolbarTitle(ctl.mode, ctl.cursor, sel)}</span>
        <button className="cal-nav" type="button" onClick={ctl.next} aria-label="다음" title="다음 (→)">›</button>
        <button className="btn cal-today" type="button" onClick={ctl.goToday}>오늘</button>
        <div className="cal-modes" role="group" aria-label="보기">
          {(['month', 'week', 'day'] as const).map(m => (
            <button
              key={m} type="button" className={'chip-pick' + (ctl.mode === m ? ' on' : '')}
              aria-pressed={ctl.mode === m} onClick={() => ctl.setMode(m)}
            >{m === 'month' ? '월' : m === 'week' ? '주' : '일'}</button>
          ))}
        </div>
        {clubOn && <button className="btn-go cal-new" type="button" onClick={() => onNewEvent(sel)}>+ 일정 만들기</button>}
      </div>
      {/* 넓은 화면에선 왼쪽 메뉴의 "내 캘린더" 가 같은 일을 한다 — 좁은 화면에서만 보인다. */}
      <div className="cal-legend">
        {clubOn && kindBtn('club', '모임 일정')}
        {kindBtn('wish', '하고 싶은 일정')}{kindBtn('done', '다녀온 일정')}{kindBtn('watch', '빈자리 알림')}
        {profile && kindBtn('played', '해 본 테마')}
      </div>
      {showClub && (
        <div className="cal-stlegend" aria-label="모임 일정 상태">
          {(['talk', 'before', 'done'] as const).map(k => <span key={k}><i className={'cal-dot ' + k} />{STATUS_LABEL[k]}</span>)}
          <span><i className="cal-dot cand" />후보 날짜(점선)</span>
        </div>
      )}
      {!auth.me && <p className="cal-note">로그인하면 저장한 일정과 빈자리 알림이 달력에 나와요.</p>}

      <div className="cal-layout">
        <div className="cal-month">
          {ctl.mode === 'month' && (
            <>
              <div className="cal-wk">
                {WEEKDAYS.map((w, i) => <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : undefined}>{w}</span>)}
              </div>
              {weeks.map(week => (
                <div className="cal-week" key={toISO(week[0])}>
                  {week.map(d => {
                    const iso = toISO(d);
                    const evs = lineOf(iso);
                    /* 넘치면 "+n" 자리를 위해 한 줄 덜 — 세 줄 + "+n" 은 110px 칸 아래로 잘렸다(해 본 테마로 네 개 넘는 날이 흔해져 보였다) */
                    const fit = evs.length > CELL_MAX ? CELL_MAX - 1 : CELL_MAX;
                    return (
                      <div
                        key={iso} className={cellClass(d, iso, today, sel, ctl.cursor.m)}
                        role="button" tabIndex={0} aria-pressed={iso === sel}
                        onClick={() => pick(iso)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(iso); } }}
                      >
                        <span className="cal-dnum">{d.getDate()}</span>
                        {evs.length > 0 && (
                          <span className="cal-evs">
                            {evs.slice(0, fit)}
                            {evs.length > CELL_MAX && (
                              <button
                                type="button" className="cal-more"
                                onClick={ev => {
                                  ev.stopPropagation();
                                  const r = (ev.currentTarget.closest('.cal-cell') as HTMLElement).getBoundingClientRect();
                                  pick(iso);
                                  setPop({ iso, x: scrollX + Math.max(8, Math.min(r.left, innerWidth - 276)), y: scrollY + r.top });
                                }}
                              >+{evs.length - fit}</button>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {ctl.mode === 'week' && (
            <div className="cal-weekview">
              {weekOf(sel).map(d => {
                const iso = toISO(d);
                const evs = lineOf(iso);
                return (
                  <div
                    key={iso} className={cellClass(d, iso, today, sel) + ' col'}
                    role="button" tabIndex={0} aria-pressed={iso === sel}
                    onClick={() => pick(iso)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(iso); } }}
                  >
                    <span className="cal-col-h"><em>{WEEKDAYS[d.getDay()]}</em><span className="cal-dnum">{d.getDate()}</span></span>
                    <span className="cal-evs">{evs}</span>
                  </div>
                );
              })}
            </div>
          )}

          {ctl.mode === 'day' && (
            <div className="cal-dayview">
              {/* 동호회 일정은 시각이 없거나(하루 종일·협의 중) 여러 구간이라 시간 축 대신 위에 줄로 둔다. 해 본 테마도 시각이 없어 같이 */}
              {(selClub.length > 0 || selPlayed.length > 0) && (
                <div className="cal-day-club cal-evs">
                  {selClub.map(ev => (
                    <ClubChip key={ev.id} ev={ev} iso={sel} on={isOn(ev, sel)} past={sel < clubToday} onOpen={openClub} />
                  ))}
                  {selPlayed.map(p => <PlayedLine key={'d' + p.id} p={p} />)}
                </div>
              )}
              <DayTimeline evs={evsOf(sel)} />
            </div>
          )}
        </div>

        <aside className={'cal-side' + (openEv ? ' evp-on' : '')}>
          {openEv ? (
            <EventPanel
              key={openEv.id} ev={openEv} club={club} meUid={auth.member?.uid ?? auth.me?.uid ?? ''}
              onClose={onCloseEvent} onEdit={onEditEvent} onCalcWindow={onCalcWindow} onPicked={ctl.select} onCalcThemes={onCalcThemes}
              profile={profile?.api === 'on' ? profile : null}
            />
          ) : (
          <>
          <p className="cal-side-title">{dayTitle(sel)}</p>
          <div className="cal-detail">
            {selClub.map(ev => <ClubRow key={ev.id} ev={ev} iso={sel} onOpen={openClub} />)}
            {!selEntry || (selEntry.plans.length === 0 && selEntry.watches.length === 0) ? (
              selClub.length === 0 && selPlayed.length === 0 && (
                <div className="lmsg">
                  {showClub ? '이날은 모임 일정도, 저장한 일정도, 빈자리 알림도 없어요.' : '이날은 저장한 일정도, 빈자리 알림도 없어요.'}
                </div>
              )
            ) : (
              <>
                {selEntry.plans.map(p => (
                  <PlanDetailRow key={p.id} p={p} s={s} plans={plans} onLoaded={onLoaded} />
                ))}
                {selEntry.watches.map(w => <WatchDetailRow key={w.id} w={w} watches={watches} />)}
              </>
            )}
            {selPlayed.length > 0 && (
              <section className="cal-played" aria-label="이날 해 본 테마">
                <p className="cal-side-h">해 본 테마 <span>{selPlayed.length}</span></p>
                <ul>
                  {selPlayed.map(p => (
                    <li key={p.id}><i className="cal-key played" /><b>{p.themeName}</b>{playedPlace(p) && <span>{playedPlace(p)}</span>}</li>
                  ))}
                </ul>
                <button type="button" className="cal-played-all" onClick={onAllPlayed}>해 본 테마 모두 보기 ›</button>
              </section>
            )}
            <div className="evp-folds cal-day-fold">
              <Fold name="그날 열려 있는 회차" sum={ctl.branches.length ? `지점 ${ctl.branches.length}곳` : '지점을 골라 보기'} open={dayOpen} onOpen={setDayOpen}>
                <DayBranches iso={sel} day={day} picked={ctl.branches} onToggle={ctl.toggleBranch} onClear={ctl.clearBranches} />
              </Fold>
            </div>
          </div>
          </>
          )}
        </aside>
      </div>

      {pop && (
        <div ref={popRef} className="cal-pop" style={{ left: pop.x, top: pop.y }} role="dialog" aria-label={dayTitle(pop.iso)}>
          <div className="cal-pop-h">
            <b>{dayTitle(pop.iso)}</b>
            <button type="button" className="btn-x" aria-label="닫기" onClick={() => setPop(null)}>×</button>
          </div>
          <div className="cal-evs">{popEvs}</div>
        </div>
      )}
    </section>
  </>);
}
