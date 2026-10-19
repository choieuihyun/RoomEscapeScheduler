import { useMemo } from 'react';
import { monthGrid, toISO, WEEKDAYS } from '../core';
import type { CalKind, UseCalendarReturn } from '../useCalendar';

/* 캘린더 화면일 때 왼쪽 메뉴 아래에 붙는 것(§4.50) — 그룹웨어처럼 미니 달력과
   "내 캘린더"(종류별 보이기). 미니 달력은 큰 달력과 따로 넘길 수 있고, 날짜를 누르면
   큰 달력이 그 날로 간다. 좁은 화면(위쪽 막대)에선 CSS 가 숨긴다. */
const KINDS: [CalKind, string][] = [['wish', '하고 싶은 일정'], ['done', '다녀온 일정'], ['watch', '빈자리 알림']];

export function CalendarSide({ ctl }: { ctl: UseCalendarReturn }) {
  const grid = useMemo(() => monthGrid(ctl.mini.y, ctl.mini.m), [ctl.mini.y, ctl.mini.m]);
  const today = useMemo(() => toISO(new Date()), []);
  return (
    <div className="lnb-cal">
      <div className="mini-head">
        <b>{ctl.mini.y}.{String(ctl.mini.m + 1).padStart(2, '0')}</b>
        <span>
          <button type="button" className="mini-nav" onClick={ctl.miniPrev} aria-label="미니 달력 이전 달">‹</button>
          <button type="button" className="mini-nav" onClick={ctl.miniNext} aria-label="미니 달력 다음 달">›</button>
        </span>
      </div>
      <div className="mini-grid">
        {WEEKDAYS.map((w, i) => <span key={w} className={'mini-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</span>)}
        {grid.map(d => {
          const iso = toISO(d);
          const cls = ['mini-d', d.getMonth() !== ctl.mini.m && 'out', iso === today && 'today',
            iso === ctl.selected && 'on', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat'].filter(Boolean).join(' ');
          return <button key={iso} type="button" className={cls} onClick={() => ctl.select(iso)}>{d.getDate()}</button>;
        })}
      </div>

      <p className="lnb-sub">내 캘린더</p>
      {KINDS.map(([k, label]) => (
        <label key={k} className="lnb-check">
          <input type="checkbox" checked={ctl.filter[k]} onChange={() => ctl.toggleKind(k)} />
          <i className={'cal-key ' + k} />{label}
        </label>
      ))}
    </div>
  );
}
