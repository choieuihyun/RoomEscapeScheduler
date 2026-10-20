import { useEffect, useRef, useState } from 'react';
import { duesOf, refreshDues, useClubStore } from '../clubStore';
import { won } from '../settle';
import { showToast } from '../toast';
import type { UseProfileReturn } from '../useProfile';
import type { View } from '../useView';
import { Avatar } from './Avatar';
import { monthGrid, toISO, WEEKDAYS } from '../core';
import {
  addDays, clockLabel, dayLabel, eventStatus, eventTitle, longDayLabel, sortKeyDate, STATUS_LABEL, timeLabel,
  weekday,
} from '../clubEvents';
import { nextMine, relDay, todayStrip, upcoming } from '../homeStrip';
import { playedWho, playedWhoLabel, playedWhoTitle } from '../playedWho';
import type { EventDto } from '../server';
import type { UseClubEventsReturn } from '../useClubEvents';

/* 홈(대시보드) — 계획 Task E7. 세 칸 카드(다우오피스 홈 배치):
   ① 내 정보(참여한 일정 수·빈자리 알림·승인 대기) + 미니 달력, ② 가까운 일정(2주, 탭·5줄씩),
   ③ 내 다음 일정 + 바로가기. 데이터는 SchedulerPage 의 useClubEvents 목록 하나를 그대로 쓴다. */

const HOME_DAYS = 62;   // 참여한 일정 수를 세는 범위 — 오늘 ~ 오늘+61 (SchedulerPage 의 홈 범위)
const LIST_DAYS = 14;   // 가까운 일정 — 2주
const PER_PAGE = 5;

type Tab = 'all' | 'mine' | 'open';
const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'all', label: '전체', empty: '2주 안에 잡힌 일정이 없어요. 하나 만들어 볼까요?' },
  { id: 'mine', label: '내가 참여', empty: '2주 안에 참여한 일정이 없어요.' },
  { id: 'open', label: '자리 있음', empty: '2주 안에 자리가 남은 일정이 없어요.' },
];

/* 해 본 테마 한꺼번에 넣기 창 — 바로가기를 누를 때 받는다(내 정보 화면과 같은 지연 청크). 안 받아지면 한 번 더 */
type BulkComp = typeof import('./BulkModal').BulkModal;
const loadBulk = () => import('./BulkModal')
  .catch(() => new Promise((r) => setTimeout(r, 400)).then(() => import('./BulkModal')));

const full = (ev: EventDto) => ev.capacity !== null && ev.count >= ev.capacity;
const people = (ev: EventDto) => (ev.capacity === null ? `${ev.count}명` : `${ev.count}/${ev.capacity}명`);
/* 토 파랑·일 빨강 — 캘린더와 같은 토큰 */
const dowClass = (dow: number) => (dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');

export function HomePage({
  active, club, today, nickname, photo, isAdmin, watchCount, watchLimit, pendingCount, month,
  onMonth, onWatches, onMembers, onNewEvent, onOpenEvent, onPickDay, profile, peopleOn, rankOn, onView,
}: {
  /* 홈이 지금 보이는지(숨겨 둔 채 남아 있을 때는 정산을 받지 않는다) */
  active: boolean;
  club: UseClubEventsReturn;
  today: string;
  nickname: string;
  /* 구글 사진 주소 — 없으면 이름 첫 글자 */
  photo?: string;
  isAdmin: boolean;
  watchCount: number;
  watchLimit: number;
  pendingCount: number;
  /* 미니 달력이 보이는 달 — SchedulerPage 가 들고 그 달 칸을 일정 범위에 넣는다 */
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
  /* 바로가기 — 아래 탭에 있는 시간표 계산·빈자리 알림 대신 자주 쓰는 곳으로. 쓸 수 없는 칸은 뺀다.
     네 칸까지(2×2) — 같이 가요(§4.12)가 켜지면 맨 뒤 랭킹이 빠진다(랭킹은 더보기·왼쪽 메뉴에 있다) */
  const tiles = [
    { key: 'new', label: '일정 만들기', on: true, go: onNewEvent,
      ic: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></> },
    { key: 'together', label: '같이 가요', on: club7.wishApi === 'on', go: () => onView('together'), ic: <path d="M5 21V4h11l-1.6 4L16 12H5" /> },
    { key: 'played', label: '해 본 테마 기록', on: !!profile, go: () => void openBulk(),
      ic: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 9.5l2.2 2.2L15 7M8 16h8" /></> },
    { key: 'people', label: '멤버', on: peopleOn, go: () => onView('people'),
      ic: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.4c1.9.8 3 2.7 3 5.6" /></> },
    { key: 'ranking', label: '랭킹', on: rankOn, go: () => onView('ranking'), ic: <path d="M5 20v-8M12 20V5M19 20v-5" /> },
  ].filter((t) => t.on).slice(0, 4);
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(0);
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
  /* 참여하면 "자리 있음" 에서 빠져 목록이 줄 수 있다 — 쪽 번호는 그리면서 맞춘다 */
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const tabInfo = TABS.find((t) => t.id === tab)!;

  /* 미니 달력 — 날짜별 동호회 일정 수. 날짜 미정 일정은 캘린더처럼 후보 날짜마다 센다 */
  const perDay = new Map<string, number>();
  for (const e of events) {
    for (const d of e.date !== null ? [e.date] : e.candidates.map((c) => c.date)) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const cells = monthGrid(month.y, month.m);

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

  /* 맨 위 띠 — 내가 참여한 오늘·내일 일정(푸시를 못 받는 사람용, §4.10). 오늘 이미 끝난 일정은 뺀다(한국 시각) */
  /* 목록을 못 받은 상태면 낡은 목록으로 띠를 만들지 않는다 */
  const strip = club.error ? null : todayStrip(events, now);

  return (
    <>
    {strip && (
      /* 그리드 밖에 둔다 — 좁은 화면의 grid-template-areas 에 끼면 자리가 어긋난다 */
      <button type="button" className="home-strip" onClick={() => onOpenEvent(strip.event)}>
        <svg className="home-strip-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <b className="home-strip-when">{strip.when}</b>{' '}
        <span className="home-strip-name">{strip.name}</span>
        {strip.more > 0 && <>{' '}<span className="home-strip-more">외 {strip.more}</span></>}
        <span className="home-strip-go" aria-hidden="true">›</span>
      </button>
    )}
    {due && (
      <button type="button" className="home-strip home-due" onClick={() => openDue(due.ev)}>
        <svg className="home-strip-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10.5h18M7 15h4" /></svg>
        <b className="home-strip-when">보낼 돈 {won(due.amount)}</b>{' '}
        <span className="home-strip-name">· {due.ev.date ? `${+due.ev.date.slice(5, 7)}/${+due.ev.date.slice(8, 10)} ` : ''}{eventTitle(due.ev)}</span>
        {dues.length > 1 && <>{' '}<span className="home-strip-more">외 {dues.length - 1}건</span></>}
        <span className="home-strip-go" aria-hidden="true">›</span>
      </button>
    )}
    <div className="home-grid">
      <div className="home-col">
        <section className="home-card home-me" aria-label="내 정보">
          <Avatar name={nickname} photo={photo} className="home-avatar" />
          <b className="home-name">{nickname} 님</b>
          <span className="home-role">{isAdmin ? '운영진' : '멤버'}</span>
          <b className="home-big">{joinedCount}</b>
          <span className="home-big-l">참여한 일정</span>
          <div className="home-me-rows">
            <button type="button" className="home-me-row" onClick={onWatches}>
              빈자리 알림<span>{watchCount}/{watchLimit}</span>
            </button>
            {isAdmin && (
              <button type="button" className="home-me-row" onClick={onMembers}>
                승인 대기<span>{pendingCount}</span>
              </button>
            )}
          </div>
        </section>

        <section className="home-card home-cal" aria-label="캘린더">
          <h2 className="home-h">캘린더</h2>
          <div className="home-cal-head">
            <button type="button" className="home-cal-nav" aria-label="이전 달" onClick={() => onMonth(-1)}>‹</button>
            <b>{month.y}.{String(month.m + 1).padStart(2, '0')}</b>
            <button type="button" className="home-cal-nav" aria-label="다음 달" onClick={() => onMonth(1)}>›</button>
          </div>
          <div className="home-cal-grid">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className={'home-cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</span>
            ))}
            {cells.map((d) => {
              const iso = toISO(d);
              const n = perDay.get(iso) ?? 0;
              const cls = ['home-cal-d', dowClass(d.getDay()), d.getMonth() !== month.m ? 'out' : '', iso === today ? 'today' : '']
                .filter(Boolean).join(' ');
              return (
                <button
                  key={iso} type="button" className={cls} onClick={() => onPickDay(iso)}
                  aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일${n ? `, 모임 일정 ${n}개` : ''}`}
                >
                  <span className="home-cal-num">{d.getDate()}</span>
                  {n > 0 && <span className={'badge-n sm' + (iso < today ? ' past' : '')}>{n}</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="home-col">
        <section className="home-card home-up" aria-label="가까운 일정">
          <h2 className="home-h">가까운 일정</h2>
          <div role="tablist" className="home-tabs">
            {TABS.map((t) => (
              <button
                key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                className={'chip-pick' + (tab === t.id ? ' on' : '')}
                onClick={() => { setTab(t.id); setPage(0); }}
              >{t.label}</button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="home-empty">
              <p>{tabInfo.empty}</p>
              {tab === 'all' && <button type="button" className="btn" onClick={onNewEvent}>일정 만들기</button>}
            </div>
          ) : (
            <ul className="home-list">
              {shown.map((ev) => {
                const st = eventStatus(ev);
                const busy = club.busyIds.has(ev.id);
                const who = playedWho(ev);
                return (
                  <li key={ev.id} className="home-row">
                    <div className="home-row-main">
                      <div className="home-row-t">
                        <span className={'chip-st ' + st}>{STATUS_LABEL[st]}</span>
                        {/* 좁은 줄이라 이름은 둘까지, 나머지는 title 로 */}
                        {who.length > 0 && <span className="chip-info warn who" title={playedWhoTitle(who)}>{playedWhoLabel(who)}</span>}
                        {ev.settlementTotal !== null && <span className="chip-info muted">정산</span>}
                        {/* 제목 단추의 ::after 가 줄 전체를 덮어 줄 어디를 눌러도 연다. 참여 단추는 그 위에 따로 있다 */}
                        <button type="button" className="home-row-open" onClick={() => onOpenEvent(ev)}>{eventTitle(ev)}</button>
                      </div>
                      <span className="home-row-m">
                        {/* 날짜 미정은 기준 후보 날짜 자리에 놓이지만 날짜를 정해진 것처럼 적지 않는다 */}
                        {ev.date === null ? `날짜 미정 · 후보 ${ev.candidates.length}개`
                          : <span className={dowClass(weekday(ev.date))}>{dayLabel(ev.date)}</span>}
                        {' · '}{ev.createdBy.nickname} · {people(ev)}
                      </span>
                    </div>
                    {ev.joined ? (
                      <span className="home-row-a on">참여 중</span>
                    ) : full(ev) ? (
                      <span className="home-row-a">마감</span>
                    ) : (
                      <button
                        type="button" className="home-join" disabled={busy}
                        onClick={() => void club.join(ev.id)}
                      >참여</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {pages > 1 && (
            <div className="home-pager">
              <button type="button" aria-label="이전" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹</button>
              <span>{cur + 1}/{pages}</span>
              <button type="button" aria-label="다음" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>›</button>
            </div>
          )}
        </section>
      </div>

      <div className="home-col">
        <section className="home-card home-next" aria-label="내 다음 일정">
          <div className="home-next-head">
            <h2 className="home-h">내 다음 일정</h2>
            {next && <span className={'chip-st ' + eventStatus(next)}>{STATUS_LABEL[eventStatus(next)]}</span>}
          </div>
          {next ? (
            <>
              <div className="home-next-date">{longDayLabel(next.date!)} · {relDay(next.date!, today)}</div>
              {next.title && next.segments.length > 0 && <div className="home-next-title">{next.title}</div>}
              <div className="home-next-box">
                {next.segments.length > 0 ? next.segments.map((g, i) => (
                  <div key={i} className="home-next-seg">
                    <b>{clockLabel(g.startMin)}</b>
                    <span className="home-next-n">{g.themeName}</span>
                    {g.branchName && <span className="home-next-b">{g.branchName}</span>}
                  </div>
                )) : (
                  <div className="home-next-seg">
                    <b>{timeLabel(next) || '하루 종일'}</b>
                    <span className="home-next-n">{eventTitle(next)}</span>
                  </div>
                )}
              </div>
              <div className="home-next-ppl">
                참여 {next.capacity === null ? `${next.count}명` : `${next.count}/${next.capacity}`} · {next.participants.map((p) => p.nickname).join(', ')}
              </div>
              <button type="button" className="home-next-go" onClick={() => onOpenEvent(next)}>일정 자세히 보기</button>
            </>
          ) : (
            <p className="home-empty-p">참여한 일정이 아직 없어요. 가까운 일정에서 골라 참여해 보세요.</p>
          )}
        </section>

        <section className="home-card home-quick" aria-label="바로가기">
          <h2 className="home-h">바로가기</h2>
          {/* 네 칸이면 2×2, 그보다 적으면 한 줄 */}
          <div className="home-tiles" style={{ gridTemplateColumns: `repeat(${tiles.length === 4 ? 2 : tiles.length}, minmax(0, 1fr))` }}>
            {tiles.map((t) => (
              <button key={t.key} type="button" className="home-tile" onClick={t.go}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.ic}</svg>
                {t.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
    {bulkOn && Bulk && profile && <Bulk profile={profile} onClose={() => setBulkOn(false)} />}
    </>
  );
}
