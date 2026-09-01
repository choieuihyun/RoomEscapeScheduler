import { useEffect, useMemo, useState } from 'react';
import { fmt, monthGrid, toISO, WEEKDAYS } from '../core';
import type { Plan } from '../cloud';
import { toSessions, type WatchDto } from '../server';
import type { UseAuthReturn } from '../useAuth';
import type { UsePlansReturn } from '../usePlans';
import type { UseWatchesReturn } from '../useWatches';
import type { UseCalendarModalReturn } from '../useCalendarModal';
import { useDaySchedule } from '../useDaySchedule';
import type { Scheduler } from '../scheduler/useScheduler';

interface DayEntry { plans: Plan[]; watches: WatchDto[] }

function DayCell({
  d, cursor, iso, today, entry, selected, onSelect,
}: {
  d: Date; cursor: { y: number; m: number }; iso: string; today: string;
  entry?: DayEntry; selected: boolean; onSelect: (iso: string) => void;
}) {
  const out = d.getMonth() !== cursor.m;
  const cls = ['cal-day', out && 'out', iso === today && 'today', selected && 'on'].filter(Boolean).join(' ');
  return (
    <button className={cls} type="button" onClick={() => onSelect(iso)}>
      <span className="cal-daynum">{d.getDate()}</span>
      {entry && (
        <span className="dots">
          {entry.plans.length > 0 && <span className={'dot ' + (entry.plans.some(p => p.status === 'wish') ? 'wish' : 'done')} />}
          {entry.watches.length > 0 && (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="cal-bell">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            </svg>
          )}
        </span>
      )}
    </button>
  );
}

function PlanDetailRow({ p, s, plans, onLoaded }: { p: Plan; s: Scheduler; plans: UsePlansReturn; onLoaded: () => void }) {
  const wish = p.status === 'wish';
  const busy = p.id != null && plans.busyIds.has(p.id);
  return (
    <div className="loaditem">
      <div className="li-t">
        <strong>{fmt(p.start)} → {fmt(p.end)}</strong>
        <span className="li-m">{p.count}연방 · 공백 {p.total}분</span>
        <span className={'tag ' + (wish ? 'wish' : 'done')}>{wish ? '하고 싶음' : '했음'}</span>
      </div>
      <span className="pbtns">
        <button
          className="btn" type="button"
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
        className="btn-x" type="button" title="감시 해제" disabled={busy}
        onClick={() => { if (confirm(`${w.theme} ${fmt(w.t)} 감시를 해제할까요?`)) watches.remove(w.id); }}
      >×</button>
    </div>
  );
}

const DAYSCHED_SHOW = 6;

/* 서버가 수집해 둔 지점이 30곳을 넘어가는 날도 있어(2026-09-01 실측 34곳),
   전부 한 번에 펼치면 상세 패널이 끝없이 길어진다. ResultsPanel.tsx의
   "더 보기"(showMore/.showmore/.morebtn)와 같은 패턴 — 네트워크는 이미
   한 번에 다 받아 왔으니(day.load) 여기선 화면에 보여줄 개수만 늘린다. */
function DaySchedSection({ iso, day }: { iso: string; day: ReturnType<typeof useDaySchedule> }) {
  const [show, setShow] = useState(DAYSCHED_SHOW);
  const entry = day.cache.get(iso);
  if (entry === undefined || entry === 'loading') {
    return entry === 'loading' ? <div className="lmsg">회차 확인 중…</div> : null;
  }
  if (entry.length === 0) return null;
  const visible = entry.slice(0, show);
  return (
    <div className="cal-daysched">
      {day.listErr && <p className="mnote">{day.listErr}</p>}
      {visible.map(({ branch, themes }) => (
        <div key={branch.id}>
          <p className="branch-h">{branch.store} {branch.branch}</p>
          {themes.map(theme => (
            <div key={theme.id} className="parsed">
              <span className="li-m">{theme.name}</span>
              {toSessions(theme.sessions).map((sess, i) => (
                <span key={i} className={'t' + (sess.soldout ? ' so' : '')}>{fmt(sess.t)}</span>
              ))}
            </div>
          ))}
        </div>
      ))}
      {entry.length > visible.length && (
        <div className="showmore">
          <button className="btn morebtn" type="button" onClick={() => setShow(n => n + DAYSCHED_SHOW)}>
            더 보기 ({Math.min(DAYSCHED_SHOW, entry.length - visible.length)}개 지점 더 · 전체 {entry.length}곳)
          </button>
        </div>
      )}
    </div>
  );
}

export function CalendarModal({
  ctl, plans, watches, auth, s,
}: {
  ctl: UseCalendarModalReturn; plans: UsePlansReturn; watches: UseWatchesReturn; auth: UseAuthReturn; s: Scheduler;
}) {
  const grid = useMemo(() => monthGrid(ctl.cursor.y, ctl.cursor.m), [ctl.cursor.y, ctl.cursor.m]);
  const today = useMemo(() => toISO(new Date()), []);
  const day = useDaySchedule(ctl.open);
  useEffect(() => {
    if (ctl.open && ctl.selected) day.load(ctl.selected);
  }, [ctl.open, ctl.selected, day.load]);
  const byDate = useMemo(() => {
    const m = new Map<string, DayEntry>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { plans: [], watches: [] }), m.get(k)!);
    for (const p of plans.plans) if (p.date) get(p.date).plans.push(p);
    for (const w of watches.watches) if (w.date) get(w.date).watches.push(w);
    return m;
  }, [plans.plans, watches.watches]);

  const selEntry = ctl.selected ? byDate.get(ctl.selected) : undefined;

  return (
    <div
      className={'modal' + (ctl.open ? ' on' : '')}
      onClick={e => { if (e.target === e.currentTarget) ctl.close(); }}
    >
      <div className="mbox mbox-wide">
        <h3>캘린더</h3>
        <p className="msub">저장한 일정과 감시 중인 자리를 날짜별로 모아 봅니다.</p>
        {!auth.me && <p className="mnote">로그인하면 저장한 일정과 감시 중인 자리가 여기 표시됩니다.</p>}

        <div className="cal-head">
          <button className="cal-nav" type="button" onClick={ctl.prevMonth} aria-label="이전 달">‹</button>
          <span className="cal-title">{ctl.cursor.y}년 {ctl.cursor.m + 1}월</span>
          <button className="cal-nav" type="button" onClick={ctl.nextMonth} aria-label="다음 달">›</button>
          <button className="btn cal-today" type="button" onClick={ctl.goToday}>오늘</button>
        </div>

        <div className="cal-weekday">
          {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
        </div>
        <div className="cal-grid">
          {grid.map(d => {
            const iso = toISO(d);
            return (
              <DayCell
                key={iso} d={d} cursor={ctl.cursor} iso={iso} today={today}
                entry={byDate.get(iso)} selected={iso === ctl.selected} onSelect={ctl.select}
              />
            );
          })}
        </div>

        <div className="cal-detail">
          {!selEntry || (selEntry.plans.length === 0 && selEntry.watches.length === 0) ? (
            <div className="lmsg">이 날짜엔 저장한 일정도 감시 중인 자리도 없어요.</div>
          ) : (
            <>
              {selEntry.plans.map(p => (
                <PlanDetailRow
                  key={p.id} p={p} s={s} plans={plans}
                  onLoaded={() => { ctl.close(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              ))}
              {selEntry.watches.map(w => <WatchDetailRow key={w.id} w={w} watches={watches} />)}
            </>
          )}
          {ctl.selected && <DaySchedSection key={ctl.selected} iso={ctl.selected} day={day} />}
        </div>

        <div className="mbtns">
          <button className="btn" type="button" onClick={ctl.close}>닫기</button>
        </div>
      </div>
    </div>
  );
}
