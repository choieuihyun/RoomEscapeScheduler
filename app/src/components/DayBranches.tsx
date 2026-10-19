import { useMemo, useState } from 'react';
import { fmt } from '../core';
import { toSessions, type Branch, type ServerTheme } from '../server';
import type { UseDayScheduleReturn } from '../useDaySchedule';

/* "그날 열려 있는 회차" — 지점을 골라서 본다(§4.51).
   §4.40 은 그날 데이터가 있는 지점을 전부(하루 30곳 넘게) 펼쳐 6곳씩 "더 보기" 로
   늘렸는데, 양이 많아 읽기 어렵다는 피드백을 받았다. 이제는 [지점 선택] 에서 고른
   지점만 보여주고 서버에도 그 지점만 묻는다. 고른 지점은 기억해 두어(useCalendar)
   다른 날짜를 눌러도 같은 지점으로 바로 보인다. 지점 목록은 매장별로 묶고 검색할 수
   있다. 그날 데이터가 없는 지점은 목록에 안 나오고, 이미 고른 지점이면 칩에 "이날 없음". */
/* 테마 한 줄(§4.52) — 회차 칩을 처음부터 다 펼치면 지점 하나에도 칩이 수십 개라 읽기
   어려웠다. 접힌 줄엔 이름·빈자리 수·가장 이른 빈 시각 3개만, 누르면 그 테마 회차만
   칩으로 펼친다. "빈자리만" 이 켜져 있으면 펼쳐도 매진 회차는 숨긴다. */
const PREVIEW = 3;
function ThemeRow({ theme, availOnly, open, onToggle }: {
  theme: ServerTheme; availOnly: boolean; open: boolean; onToggle: () => void;
}) {
  const sess = toSessions(theme.sessions);
  const avail = sess.filter(x => !x.soldout);
  const chips = availOnly ? avail : sess;
  const none = avail.length === 0;
  return (
    <div className={'db-theme' + (open ? ' open' : '') + (none ? ' none' : '')}>
      <button type="button" className="db-trow" aria-expanded={open} onClick={onToggle}>
        <span className="db-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="db-tname" title={theme.name}>{theme.name}</span>
        <span className="db-avail">{none ? '매진' : `빈자리 ${avail.length}`}</span>
        {!open && !none && (
          <span className="db-preview">
            {avail.slice(0, PREVIEW).map(x => fmt(x.t)).join(' · ')}{avail.length > PREVIEW && ' …'}
          </span>
        )}
      </button>
      {open && (
        <div className="parsed db-sessions">
          {chips.length === 0
            ? <span className="li-m">빈자리가 없어요{availOnly && sess.length > 0 ? ' — "빈자리만"을 끄면 매진 회차도 보여요' : ''}.</span>
            : chips.map((x, i) => <span key={i} className={'t' + (x.soldout ? ' so' : '')}>{fmt(x.t)}</span>)}
        </div>
      )}
    </div>
  );
}

const AVAIL_KEY = 'flod.cal.availOnly';

export function DayBranches({
  iso, day, picked, onToggle, onClear,
}: {
  iso: string; day: UseDayScheduleReturn; picked: string[];
  onToggle: (id: string) => void; onClear: () => void;
}) {
  const on = day.branchesOn(iso);
  const [openRaw, setOpen] = useState<boolean | null>(null);
  const open = openRaw ?? picked.length === 0;   // 아직 아무것도 안 골랐으면 펼친 채로 시작
  const [q, setQ] = useState('');
  /* 빈자리만(기본 켬) — 이 기기에서 기억한다. 펼친 테마는 지점·테마 id 로 기억한다. */
  const [availOnly, setAvailOnly] = useState(() => {
    try { return localStorage.getItem(AVAIL_KEY) !== '0'; } catch { return true; }
  });
  const toggleAvail = () => setAvailOnly(v => {
    try { localStorage.setItem(AVAIL_KEY, v ? '0' : '1'); } catch { /* 기억 못 해도 토글은 된다 */ }
    return !v;
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const flip = (k: string) => setExpanded(e => { const n = new Set(e); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const byId = useMemo(() => new Map((day.branchList ?? []).map(b => [b.id, b])), [day.branchList]);
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase();
    const m = new Map<string, Branch[]>();
    for (const b of on) {
      if (k && !(b.store + ' ' + b.branch).toLowerCase().includes(k)) continue;
      m.set(b.store, [...(m.get(b.store) ?? []), b]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [on, q]);

  if (day.branchList == null) return <div className="cal-daysched"><div className="lmsg">지점 목록을 불러오는 중…</div></div>;

  const shown = picked.map(id => byId.get(id)).filter((b): b is Branch => !!b);

  return (
    <div className="cal-daysched">
      <div className="db-head">
        <p className="cal-side-h">그날 열려 있는 회차</p>
        <button type="button" className={'btn db-toggle' + (open ? ' on' : '')} aria-expanded={open}
          onClick={() => setOpen(!open)}>
          지점 선택{picked.length > 0 && <b>{picked.length}</b>}
        </button>
      </div>
      {day.listErr && <p className="mnote">{day.listErr}</p>}

      {shown.length > 0 && (
        <div className="db-chips">
          {shown.map(b => {
            const has = b.dates.includes(iso);
            return (
              <span key={b.id} className={'db-chip' + (has ? '' : ' none')} title={has ? undefined : '이날은 회차 정보가 없어요'}>
                {b.store} {b.branch}{!has && <i>이날 없음</i>}
                <button type="button" aria-label={`${b.store} ${b.branch} 빼기`} onClick={() => onToggle(b.id)}>×</button>
              </span>
            );
          })}
          {shown.length > 1 && <button type="button" className="db-clear" onClick={onClear}>모두 빼기</button>}
        </div>
      )}

      {open && (
        <div className="db-picker">
          <input
            type="search" className="db-search" placeholder="지점 검색 (예: 강남, 키이스케이프)"
            value={q} onChange={e => setQ(e.target.value)} aria-label="지점 검색"
          />
          <p className="db-count">이날 회차가 있는 지점 {on.length}곳{picked.length > 0 && ` · ${picked.length}곳 고름`}</p>
          <div className="db-list">
            {groups.length === 0 && <div className="lmsg">{on.length ? '찾는 지점이 없어요.' : '이날은 회차 정보가 없어요.'}</div>}
            {groups.map(([store, bs]) => (
              <div key={store} className="db-group">
                <p className="db-store">{store}</p>
                {bs.map(b => (
                  <label key={b.id} className="lnb-check db-opt">
                    <input type="checkbox" checked={picked.includes(b.id)} onChange={() => { if (openRaw == null) setOpen(true); onToggle(b.id); }} />
                    {b.branch}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {picked.length > 0 && (
            <button type="button" className="btn db-done" onClick={() => setOpen(false)}>선택 완료</button>
          )}
        </div>
      )}

      {shown.length === 0 && !open && <div className="lmsg">[지점 선택]에서 보고 싶은 지점을 골라 주세요.</div>}
      {shown.length === 0 && open && on.length > 0 && <div className="lmsg">보고 싶은 지점을 골라 주세요. 고른 지점은 다음에도 기억해요.</div>}

      {shown.some(b => b.dates.includes(iso)) && (
        <label className="chk mini db-availonly">
          <input type="checkbox" checked={availOnly} onChange={toggleAvail} /> 빈자리만
        </label>
      )}

      {shown.map(b => {
        if (!b.dates.includes(iso)) return null;
        const d = day.get(iso, b.id);
        const themes = Array.isArray(d)
          ? (availOnly ? d.filter(t => toSessions(t.sessions).some(x => !x.soldout)) : d)
          : [];
        const total = Array.isArray(d) ? d.reduce((n, t) => n + toSessions(t.sessions).filter(x => !x.soldout).length, 0) : 0;
        const hidden = Array.isArray(d) ? d.length - themes.length : 0;
        return (
          <div key={b.id} className="db-branch">
            <p className="branch-h db-bhead">
              <span>{b.store} {b.branch}</span>
              {Array.isArray(d) && <span className="db-btotal">빈자리 {total}</span>}
            </p>
            {(d === undefined || d === 'loading') && <div className="lmsg">회차 확인 중…</div>}
            {d === 'error' && <div className="lmsg">이 지점 회차를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</div>}
            {Array.isArray(d) && d.length === 0 && <div className="lmsg">이날 열린 테마가 없어요.</div>}
            {themes.map(theme => {
              const k = b.id + '|' + theme.id;
              return <ThemeRow key={k} theme={theme} availOnly={availOnly} open={expanded.has(k)} onToggle={() => flip(k)} />;
            })}
            {hidden > 0 && <p className="db-hidden">매진된 테마 {hidden}개는 숨겼어요.</p>}
          </div>
        );
      })}
    </div>
  );
}
