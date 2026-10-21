import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bdayStrip, bdayText, Cake, duesOf, MemberLink, openMember, refreshDues, useClubStore } from '../clubStore';
import { won } from '../settle';
import { showToast } from '../toast';
import type { UseProfileReturn } from '../useProfile';
import type { View } from '../useView';
import { monthGrid, toISO, WEEKDAYS } from '../core';
import {
  addDays, clockLabel, eventStatus, eventTitle, sortKeyDate, STATUS_LABEL, timeLabel, weekday,
} from '../clubEvents';
import { courseLine, dDay, monthDayLabel, peopleLabel, placeLabel, weekDays, weekTitle } from '../eventView';
import { nextMine, todayStrip, upcoming } from '../homeStrip';
import { playedWho, playedWhoLabel, playedWhoTitle } from '../playedWho';
import type { EventDto } from '../server';
import type { UseClubEventsReturn } from '../useClubEvents';

/* 홈(대시보드) — 2026-10-21 개편(승인 목업 Main·DesktopHome). 주인공은 "내 다음 일정" 하나(D-day 큰 청록 숫자 —
   홈에서 유일한 청록 숫자). 그 아래 알림 줄(오늘·내일 일정, 보낼 돈, 생일), 가까운 일정(탭·쪽).
   그 아래는 회색으로 낮춘 것: 달력(좁은 화면은 이번 주 한 줄 + "n월 달력" 펼치기), 바로가기 4칸, 내 정보 요약.
   넓은 화면은 2열(왼쪽 다음 일정·알림·바로가기·요약, 오른쪽 가까운 일정·한 달 달력). 기능은 개편 전과 같다.
   데이터는 SchedulerPage 의 useClubEvents 목록 하나를 그대로 쓴다. */

const HOME_DAYS = 62;   // 참여한 일정 수를 세는 범위 — 오늘 ~ 오늘+61 (SchedulerPage 의 홈 범위)
const LIST_DAYS = 14;   // 가까운 일정 — 2주
const PER_PAGE = 5;

type Tab = 'all' | 'mine' | 'open';
const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'all', label: '전체', empty: '2주 안에 잡힌 일정이 없어요. 하나 만들어 볼까요?' },
  { id: 'mine', label: '내 일정', empty: '2주 안에 참여한 일정이 없어요.' },
  { id: 'open', label: '참여 가능', empty: '2주 안에 참여할 수 있는 일정이 없어요.' },
];

/* 해 본 테마 한꺼번에 넣기 창 — 바로가기를 누를 때 받는다(내 정보 화면과 같은 지연 청크). 안 받아지면 한 번 더 */
type BulkComp = typeof import('./BulkModal').BulkModal;
const loadBulk = () => import('./BulkModal')
  .catch(() => new Promise((r) => setTimeout(r, 400)).then(() => import('./BulkModal')));

const full = (ev: EventDto) => ev.capacity !== null && ev.count >= ev.capacity;
const people = (ev: EventDto) => (ev.capacity === null ? `${ev.count}명` : `${ev.count}/${ev.capacity}명`);
/* 토 파랑·일 빨강 — 캘린더와 같은 토큰 */
const dowClass = (dow: number) => (dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');

/* 선 아이콘(앱 관용 — 24 상자, 1.75 선). 뜻은 옆 글이 전한다 */
const Ic = ({ size = 18, children }: { size?: number; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Chev = () => <Ic size={16}><path d="m9 6 6 6-6 6" /></Ic>;

export function HomePage({
  active, club, today, isAdmin, watchCount, watchLimit, pendingCount, month,
  onMonth, onWatches, onMembers, onNewEvent, onOpenEvent, onPickDay, profile, peopleOn, rankOn, onView,
}: {
  /* 홈이 지금 보이는지(숨겨 둔 채 남아 있을 때는 정산을 받지 않는다) */
  active: boolean;
  club: UseClubEventsReturn;
  today: string;
  /* 개편 전 큰 프로필 카드(이름·사진)용 — 이름은 위쪽 막대·왼쪽 메뉴에 있어 지금은 쓰지 않는다. 부르는 쪽을 덜 고치려고 받아만 둔다 */
  nickname: string;
  photo?: string;
  isAdmin: boolean;
  watchCount: number;
  watchLimit: number;
  pendingCount: number;
  /* 달력이 보이는 달 — SchedulerPage 가 들고 그 달 칸을 일정 범위에 넣는다 */
  month: { y: number; m: number };
  onMonth: (dir: 1 | -1) => void;
  onWatches: () => void;
  onMembers: () => void;
  onNewEvent: () => void;
  /* 바로가기 — 해 본 테마 기록(해 본 테마 API 가 있을 때 profile), 멤버·랭킹(6단계 서버일 때) */
  profile: UseProfileReturn | null;
  peopleOn: boolean;
  rankOn: boolean;
  onView: (v: View) => void;
  onOpenEvent: (ev: EventDto) => void;
  onPickDay: (iso: string) => void;
}) {
  const events = club.events;
  const [Bulk, setBulk] = useState<BulkComp | null>(null);
  const [bulkOn, setBulkOn] = useState(false);
  const openBulk = async () => {
    try {
      const m = await loadBulk();
      setBulk(() => m.BulkModal);
      setBulkOn(true);
    } catch {
      showToast('새 버전이 나왔거나 연결이 끊겼어요. 새로 고침해 주세요.');
    }
  };
  const club7 = useClubStore();
  const wishOn = club7.wishApi === 'on';
  /* 바로가기 — 아래 탭에 있는 시간표 계산·빈자리 알림 대신 자주 쓰는 곳으로. 쓸 수 없는 칸은 뺀다.
     네 칸까지 — 같이 가요(§4.12)가 켜지면 맨 뒤 랭킹이 빠진다(랭킹은 더보기·왼쪽 메뉴에 있다). 글은 짧게 */
  const tiles = [
    { key: 'new', label: '일정 만들기', on: true, go: onNewEvent,
      ic: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></> },
    { key: 'together', label: '같이 가요', on: wishOn, go: () => onView('together'), ic: <path d="M5 21V4h11l-1.6 4L16 12H5" /> },
    { key: 'played', label: '해 본 테마', on: !!profile, go: () => void openBulk(),
      ic: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 9.5l2.2 2.2L15 7M8 16h8" /></> },
    { key: 'people', label: '멤버', on: peopleOn, go: () => onView('people'),
      ic: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.4c1.9.8 3 2.7 3 5.6" /></> },
    { key: 'ranking', label: '랭킹', on: rankOn, go: () => onView('ranking'), ic: <path d="M5 20v-8M12 20V5M19 20v-5" /> },
  ].filter((t) => t.on).slice(0, 4);
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(0);
  /* 좁은 화면의 한 달 달력 펼침 — 넓은 화면은 늘 한 달(CSS) */
  const [calOpen, setCalOpen] = useState(false);
  /* 지금 시각 — 1분마다(탭이 보일 때만, 다시 보이면 바로) 갱신해 끝난 일정·자정 넘긴 '내일'이 띠와 다음 일정에 반영되게 한다 */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    const t = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const homeLast = addDays(today, HOME_DAYS - 1);
  /* 내 다음 일정도 같은 범위에서 고른다 — 캘린더에서 넘겨 본 먼 달 일정이 수(0)와 따로 뜨지 않게 */
  const homeEvents = events.filter((e) => { const k = sortKeyDate(e, today); return k >= today && k <= homeLast; });
  const joinedCount = homeEvents.filter((e) => e.joined).length;
  /* 오늘 일정은 이미 끝났으면 건너뛴다(한국 시각) */
  const next = nextMine(homeEvents, now);

  const twoWeeks = upcoming(events, today, LIST_DAYS);
  const rows = tab === 'mine' ? twoWeeks.filter((e) => e.joined)
    : tab === 'open' ? twoWeeks.filter((e) => !e.joined && !full(e))
    : twoWeeks;
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  /* 참여하면 "참여 가능" 에서 빠져 목록이 줄 수 있다 — 쪽 번호는 그리면서 맞춘다 */
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const tabInfo = TABS.find((t) => t.id === tab)!;

  /* 달력 — 날짜별 동호회 일정 수. 날짜 미정 일정은 캘린더처럼 후보 날짜마다 센다 */
  const perDay = new Map<string, number>();
  for (const e of events) {
    for (const d of e.date !== null ? [e.date] : e.candidates.map((c) => c.date)) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const cells = monthGrid(month.y, month.m);
  /* 날짜 한 칸 — 이번 주 줄과 한 달 칸이 같이 쓴다. 일정이 있으면 점(두 개 이상이면 작은 수) */
  const dayCell = (iso: string, out: boolean) => {
    const n = perDay.get(iso) ?? 0;
    const cls = ['hm-d', dowClass(weekday(iso)), out ? 'out' : '', iso === today ? 'today' : '', iso < today ? 'past' : ''].filter(Boolean).join(' ');
    return (
      <button
        key={iso} type="button" className={cls} onClick={() => onPickDay(iso)}
        aria-label={`${+iso.slice(5, 7)}월 ${+iso.slice(8, 10)}일${n ? `, 모임 일정 ${n}개` : ''}`}
        aria-current={iso === today ? 'date' : undefined}
      >
        <span className="hm-dn">{+iso.slice(8, 10)}</span>
        <span className="hm-dm" aria-hidden="true">{n > 1 ? n : n === 1 ? <i /> : null}</span>
      </button>
    );
  };

  /* 보낼 돈 띠(§4.13) — 정산이 있는 내 일정(받아 둔 목록 + 지난 일정 첫 쪽)에서 최근 것 몇 개만 정산을 받는다.
     합계가 그대로면 다시 받지 않고, 창이 다시 보이면 새로 받는다(보냈어요 체크는 합계를 바꾸지 않는다) */
  /* 홈이 실제로 보일 때만 — refreshDues 가 5분에 한 번으로 줄인다(목록 폴링·포커스마다 나가지 않게) */
  const settleOn = club7.settleApi === 'on';
  const evRef = useRef(events);
  useEffect(() => { evRef.current = events; }, [events]);
  useEffect(() => { if (settleOn && active) void refreshDues(events); }, [settleOn, active, events]);
  useEffect(() => {
    if (!settleOn || !active) return;
    const on = () => { if (document.visibilityState === 'visible') void refreshDues(evRef.current); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [settleOn, active]);
  const dues = settleOn && !club.error ? duesOf(club7) : [];
  const due = dues[0];
  /* 지난 일정은 받아 둔 목록 밖일 수 있어 먼저 넣는다(없으면 '연 일정이 목록에서 사라짐' 처리가 패널을 바로 닫는다) */
  const openDue = (ev: EventDto) => { if (!events.some((e) => e.id === ev.id)) club.adopt(ev); onOpenEvent(ev); };

  /* 오늘·내일 줄 — 내가 참여한 오늘·내일 일정(푸시를 못 받는 사람용, §4.10). 오늘 이미 끝난 일정은 뺀다(한국 시각) */
  /* 목록을 못 받은 상태면 낡은 목록으로 줄을 만들지 않는다 */
  const strip = club.error ? null : todayStrip(events, now);
  /* 생일 줄 — 받아 둔 승인 멤버 목록(멤버 카드용, clubStore)에서 오늘(KST) 생일인 사람. 목록이 없으면(6단계 전 서버 등) 없음 */
  const bday = bdayStrip(club7.members?.values(), club7.uid, today);

  const nextPpl = next ? peopleLabel(next) : null;
  const nextPlace = next ? placeLabel(next) : '';

  return (
    <>
    <div className="hm-grid home-grid">
      <div className="hm-col">
        <section className="hm-card hm-next" aria-label="내 다음 일정">
          <div className="hm-next-h">
            <h2 className="hm-cap">내 다음 일정</h2>
            {next && <span className={'chip-st ' + eventStatus(next)}>{STATUS_LABEL[eventStatus(next)]}</span>}
          </div>
          {next ? (
            <>
              <div className="hm-when">
                <b className="hm-dday">{dDay(next.date!, today)}</b>
                <span className="hm-when-t">
                  <span className="hm-date">{monthDayLabel(next.date!)}</span>
                  <b className="hm-time">{timeLabel(next).replace('–', ' – ') || '하루 종일'}</b>
                </span>
              </div>
              <div className="hm-what">
                <b className="hm-title">{eventTitle(next)}</b>
                {/* 좁은 화면은 코스 한 줄, 넓은 화면은 구간 표(CSS 로 하나만) */}
                {(next.segments.length > 0 || nextPlace) && (
                  <span className="hm-course">{[courseLine(next), nextPlace].filter(Boolean).join(' · ')}</span>
                )}
                {next.segments.length > 0 && (
                  <ul className="hm-segs">
                    {next.segments.map((g, i) => (
                      <li key={i}><b>{clockLabel(g.startMin)}</b><span className="hm-seg-n">{g.themeName}</span>{g.branchName && <span className="hm-seg-b">{g.branchName}</span>}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="hm-foot">
                <div className="hm-ppl">
                  <span className="hm-avas">
                    {next.participants.slice(0, 4).map((p) => (
                      <MemberLink key={p.uid} uid={p.uid} name={p.nickname} className="hm-ava">{[...p.nickname][0] ?? '?'}</MemberLink>
                    ))}
                    {next.participants.length > 4 && <span className="hm-ava more" aria-hidden="true">+{next.participants.length - 4}</span>}
                  </span>
                  <b className="hm-n">{nextPpl!.n}</b>
                  {nextPpl!.left && <span className="hm-left">{nextPpl!.left}</span>}
                </div>
                <button type="button" className="hm-go" onClick={() => onOpenEvent(next)}>일정 보기<Chev /></button>
              </div>
            </>
          ) : (
            <div className="hm-none">
              <p>다가오는 일정이 없어요</p>
              <div className="hm-none-b">
                <button type="button" className="btn-go" onClick={onNewEvent}>일정 만들기</button>
                {wishOn && <button type="button" className="btn" onClick={() => onView('together')}>같이 가요 보기</button>}
              </div>
            </div>
          )}
        </section>

        {(strip || due || bday) && (
          <section className="hm-card hm-alerts" aria-label="알림">
            {strip && (
              <button type="button" className="hm-alert home-today" onClick={() => onOpenEvent(strip.event)}>
                <Ic><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ic>
                <span className="hm-alert-t"><b>{strip.when}</b> {strip.name}{strip.more > 0 && <> 외 {strip.more}</>}</span>
                <Chev />
              </button>
            )}
            {due && (
              <button type="button" className="hm-alert home-due" onClick={() => openDue(due.ev)}>
                <Ic><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10.5h18M7 15h4" /></Ic>
                <span className="hm-alert-t">
                  <b>보낼 돈 {won(due.amount)}</b> · {due.ev.date ? `${+due.ev.date.slice(5, 7)}/${+due.ev.date.slice(8, 10)} ` : ''}{eventTitle(due.ev)}
                  {dues.length > 1 && <> 외 {dues.length - 1}건</>}
                </span>
                <Chev />
              </button>
            )}
            {bday && (
              <button type="button" className="hm-alert home-bday" onClick={(e) => openMember({ uid: bday.uid, name: bday.name, from: e.currentTarget })}>
                <Cake className="bday-ic" />
                <span className="hm-alert-t">{bdayText(bday)}</span>
                <Chev />
              </button>
            )}
          </section>
        )}

        <nav className="hm-card hm-quick" aria-label="바로가기">
          {tiles.map((t) => (
            <button key={t.key} type="button" className="hm-tile" onClick={t.go}>
              <Ic size={22}>{t.ic}</Ic>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <section className={'hm-card hm-me' + (isAdmin ? '' : ' two')} aria-label="내 정보 요약">
          <div className="hm-me-c">
            <b>{joinedCount}번</b><span>참여한 일정</span>
          </div>
          <button type="button" className="hm-me-c" onClick={onWatches}>
            <b>{watchCount}/{watchLimit}개</b><span>빈자리 알림</span>
          </button>
          {isAdmin && (
            <button type="button" className="hm-me-c" onClick={onMembers}>
              <b>{pendingCount}명</b><span>승인 대기</span>
            </button>
          )}
        </section>
      </div>

      <div className="hm-col">
        <section className="hm-up" aria-labelledby="hm-up-h">
          <h2 className="hm-h" id="hm-up-h">가까운 일정</h2>
          <div className="hm-card hm-up-c">
            <div role="tablist" aria-label="일정 거르기" className="hm-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                  className="hm-tab"
                  onClick={() => { setTab(t.id); setPage(0); }}
                >{t.label}</button>
              ))}
            </div>
            {shown.length === 0 ? (
              <div className="hm-empty">
                <p>{tabInfo.empty}</p>
                {tab === 'all' && <button type="button" className="btn" onClick={onNewEvent}>일정 만들기</button>}
              </div>
            ) : (
              <ul className="hm-list">
                {shown.map((ev) => {
                  const st = eventStatus(ev);
                  const busy = club.busyIds.has(ev.id);
                  const who = playedWho(ev);
                  return (
                    <li key={ev.id} className="hm-row">
                      {/* 날짜 미정은 기준 후보 날짜 자리에 놓이지만 날짜를 정해진 것처럼 적지 않는다 */}
                      {ev.date === null ? (
                        <span className="hm-row-d undecided"><b>미정</b><span>후보 {ev.candidates.length}</span></span>
                      ) : (
                        <span className="hm-row-d"><b>{+ev.date.slice(5, 7)}/{ev.date.slice(8, 10)}</b><span className={dowClass(weekday(ev.date))}>{WEEKDAYS[weekday(ev.date)]}</span></span>
                      )}
                      <div className="hm-row-main">
                        {/* 제목 단추의 ::after 가 줄 전체를 덮어 줄 어디를 눌러도 연다. 참여 단추·이름은 그 위에 따로 있다 */}
                        <button type="button" className="hm-row-open" onClick={() => onOpenEvent(ev)}>{eventTitle(ev)}</button>
                        <span className="hm-row-m">
                          <i className={'cal-dot ' + st} aria-hidden="true" />{STATUS_LABEL[st]} · {people(ev)} · <MemberLink uid={ev.createdBy.uid} name={ev.createdBy.nickname} />
                          {ev.settlementTotal !== null && <> · 정산</>}
                        </span>
                        {/* 좁은 줄이라 이름은 둘까지, 나머지는 title 로 */}
                        {who.length > 0 && <span className="hm-row-who" title={playedWhoTitle(who)}>{playedWhoLabel(who)}</span>}
                      </div>
                      {ev.joined ? (
                        <span className="hm-row-a">참여 중</span>
                      ) : full(ev) ? (
                        <span className="hm-row-a">마감</span>
                      ) : (
                        <button
                          type="button" className="hm-join" disabled={busy}
                          onClick={() => void club.join(ev.id)}
                        >참여</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {pages > 1 && (
              <nav className="hm-pager" aria-label="쪽 넘기기">
                <button type="button" aria-label="이전 쪽" disabled={cur === 0} onClick={() => setPage(cur - 1)}><Ic size={16}><path d="m15 6-6 6 6 6" /></Ic></button>
                <span>{cur + 1} / {pages}</span>
                <button type="button" aria-label="다음 쪽" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><Chev /></button>
              </nav>
            )}
          </div>
        </section>

        <section className={'hm-card hm-cal' + (calOpen ? ' open' : '')} aria-label="달력">
          {/* 좁은 화면 — 이번 주 한 줄 + "n월 달력" 펼치기 */}
          <div className="hm-week-h">
            <h2 className="hm-h2">{weekTitle(today)}</h2>
            <button type="button" className="hm-cal-tg" aria-expanded={calOpen} onClick={() => setCalOpen(!calOpen)}>
              {month.m + 1}월 달력<Ic size={14}><path d={calOpen ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></Ic>
            </button>
          </div>
          <div className="hm-week">
            {WEEKDAYS.map((w, i) => <span key={w} className={'hm-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</span>)}
            {weekDays(today).map((iso) => dayCell(iso, false))}
          </div>
          {/* 한 달 — 넓은 화면은 늘, 좁은 화면은 펼쳤을 때 */}
          <div className="hm-month">
            <div className="hm-month-h">
              <b>{month.y}.{String(month.m + 1).padStart(2, '0')}</b>
              <span>
                <button type="button" className="hm-nav" aria-label="이전 달" onClick={() => onMonth(-1)}><Ic size={16}><path d="m15 6-6 6 6 6" /></Ic></button>
                <button type="button" className="hm-nav" aria-label="다음 달" onClick={() => onMonth(1)}><Chev /></button>
              </span>
            </div>
            <div className="hm-month-g">
              {WEEKDAYS.map((w, i) => <span key={w} className={'hm-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</span>)}
              {cells.map((d) => dayCell(toISO(d), d.getMonth() !== month.m))}
            </div>
          </div>
        </section>
      </div>
    </div>
    {bulkOn && Bulk && profile && <Bulk profile={profile} onClose={() => setBulkOn(false)} />}
    </>
  );
}
