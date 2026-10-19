import { useState } from 'react';
import { monthGrid, toISO, WEEKDAYS } from '../core';
import {
  addDays, clockLabel, dayLabel, eventStatus, eventTitle, longDayLabel, nextMine, relDay, STATUS_LABEL, timeLabel, upcoming, weekday,
} from '../clubEvents';
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

const full = (ev: EventDto) => ev.capacity !== null && ev.count >= ev.capacity;
const people = (ev: EventDto) => (ev.capacity === null ? `${ev.count}명` : `${ev.count}/${ev.capacity}명`);
/* 토 파랑·일 빨강 — 캘린더와 같은 토큰 */
const dowClass = (dow: number) => (dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');

export function HomePage({
  club, today, nickname, isAdmin, watchCount, watchLimit, pendingCount, month,
  onMonth, onWatches, onMembers, onNewEvent, onCalc, onOpenEvent, onPickDay,
}: {
  club: UseClubEventsReturn;
  today: string;
  nickname: string;
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
  onCalc: () => void;
  onOpenEvent: (ev: EventDto) => void;
  onPickDay: (iso: string) => void;
}) {
  const events = club.events;
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(0);

  const homeLast = addDays(today, HOME_DAYS - 1);
  /* 내 다음 일정도 같은 범위에서 고른다 — 캘린더에서 넘겨 본 먼 달 일정이 수(0)와 따로 뜨지 않게 */
  const homeEvents = events.filter((e) => e.date >= today && e.date <= homeLast);
  const joinedCount = homeEvents.filter((e) => e.joined).length;
  /* 오늘 일정은 이미 끝났으면 건너뛴다(한국 시각) */
  const next = nextMine(homeEvents, new Date());

  const twoWeeks = upcoming(events, today, LIST_DAYS);
  const rows = tab === 'mine' ? twoWeeks.filter((e) => e.joined)
    : tab === 'open' ? twoWeeks.filter((e) => !e.joined && !full(e))
    : twoWeeks;
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  /* 참여하면 "자리 있음" 에서 빠져 목록이 줄 수 있다 — 쪽 번호는 그리면서 맞춘다 */
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const tabInfo = TABS.find((t) => t.id === tab)!;

  /* 미니 달력 — 날짜별 동호회 일정 수 */
  const perDay = new Map<string, number>();
  for (const e of events) perDay.set(e.date, (perDay.get(e.date) ?? 0) + 1);
  const cells = monthGrid(month.y, month.m);

  const initial = [...nickname][0] ?? '?';

  return (
    <div className="home-grid">
      <div className="home-col">
        <section className="home-card home-me" aria-label="내 정보">
          <div className="home-avatar" aria-hidden="true">{initial}</div>
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
                  aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일${n ? `, 동호회 일정 ${n}개` : ''}`}
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
                return (
                  <li key={ev.id} className="home-row">
                    <div className="home-row-main">
                      <div className="home-row-t">
                        <span className={'chip-st ' + st}>{STATUS_LABEL[st]}</span>
                        {/* 제목 단추의 ::after 가 줄 전체를 덮어 줄 어디를 눌러도 연다. 참여 단추는 그 위에 따로 있다 */}
                        <button type="button" className="home-row-open" onClick={() => onOpenEvent(ev)}>{eventTitle(ev)}</button>
                      </div>
                      <span className="home-row-m">
                        <span className={dowClass(weekday(ev.date))}>{dayLabel(ev.date)}</span>
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
              <div className="home-next-date">{longDayLabel(next.date)} · {relDay(next.date, today)}</div>
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
          <div className="home-tiles">
            <button type="button" className="home-tile" onClick={onNewEvent}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></svg>
              일정 만들기
            </button>
            <button type="button" className="home-tile" onClick={onCalc}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2" /></svg>
              조합 계산
            </button>
            <button type="button" className="home-tile" onClick={onWatches}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              빈자리 알림
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
