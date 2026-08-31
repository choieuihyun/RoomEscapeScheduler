import type { CSSProperties } from 'react';
import { fmt, type SearchResultRow } from '../core';

function axisTicks(lo: number, hi: number, span: number) {
  const step = span > 420 ? 120 : span > 240 ? 60 : 30;
  const ticks: { t: number; left: number }[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    ticks.push({ t, left: ((t - lo) / span) * 100 });
  }
  return ticks;
}

export function resultToText(r: SearchResultRow): string {
  const dur = (m: number) => (m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60 ? (m % 60) + '분' : '') : m + '분').trim();
  const head = `${r.count}연방 · ${fmt(r.start)} → ${fmt(r.end)} (${dur(r.end - r.start)}, `
    + (r.moveTotal ? `이동 ${r.moveTotal}분 · 잔여 ${r.total - r.moveTotal}분)` : `공백 ${r.total}분)`);
  const body = r.steps.map((s, i) => {
    const line = `${fmt(s.start)}–${fmt(s.end)}  ${s.name}${s.place ? ` @${s.place}` : ''} (${s.dur}분)`;
    const nx = r.steps[i + 1];
    if (!nx) return line;
    const g = nx.start - s.end, mv = nx.move || 0;
    return line + (mv ? `\n     ↓ 이동 ${mv}분  잔여 ${g - mv}분` : `\n     ↓ 공백 ${g}분`);
  }).join('\n');
  return head + '\n\n' + body;
}

export interface ResultCardProps {
  r: SearchResultRow;
  rank: number;
  lo: number;
  hi: number;
  span: number;
  themeCount: number;
  teamModeOn: boolean;
  onConfirmTeam: (r: SearchResultRow) => void;
  onSave?: (r: SearchResultRow) => void;
}

export function ResultCard({ r, rank, lo, hi, span, themeCount, teamModeOn, onConfirmTeam, onSave }: ResultCardProps) {
  const pct = (m: number) => ((m - lo) / span) * 100;
  const tight = r.minWait < 10;

  return (
    <div className={'res' + (rank === 0 ? ' best' : '')}>
      <div className="res-head">
        <span className="rank">{String(rank + 1).padStart(2, '0')}</span>
        <span className="stat"><b className="mono">{fmt(r.start)} → {fmt(r.end)}</b></span>
        <span className="stat">총 <b className="mono">{Math.round((r.end - r.start) / 60 * 10) / 10}h</b></span>
        {r.moveTotal ? (
          <>
            <span className="stat mvstat">이동 <b className="mono">{r.moveTotal}분</b></span>
            <span className={'stat' + (r.total - r.moveTotal <= 30 ? ' good' : '')}>잔여 <b className="mono">{r.total - r.moveTotal}분</b></span>
          </>
        ) : (
          <span className={'stat' + (r.total <= 30 ? ' good' : '')}>공백 <b className="mono">{r.total}분</b></span>
        )}
        <span className={'stat' + (tight ? ' warn' : '')}>최소 <b className="mono">{r.minWait === Infinity ? '—' : r.minWait + '분'}</b></span>
        {r.count < themeCount && <span className="stat">테마 <b>{r.count}/{themeCount}</b></span>}
        <button className="btn-copy" type="button" onClick={async e => {
          const btn = e.currentTarget;
          const ok = await copyText(resultToText(r));
          btn.textContent = ok ? '복사됨' : '실패';
          setTimeout(() => { btn.textContent = '복사'; }, 1500);
        }}>복사</button>
        {onSave && <button className="btn-copy btn-save" type="button" onClick={() => onSave(r)}>저장</button>}
        {teamModeOn && <button className="btn-copy btn-team" type="button" onClick={() => onConfirmTeam(r)}>팀 확정</button>}
      </div>
      <div className="res-body">
        <div className="tlwrap"><div className="tlinner">
          <div className="tl">
            {r.steps.map((s, i) => {
              const l = pct(s.start), w = pct(s.end) - pct(s.start);
              return (
                <div key={i} className={'blk' + (s.soldout ? ' so' : '')}
                  style={{ left: l + '%', width: w + '%', '--accent': `var(--accent-${s.i % 6})` } as CSSProperties}
                  title={`${s.name} ${fmt(s.start)}→${fmt(s.end)} (${s.dur}분)`}>
                  <span className="nm"><i>{s.name}</i></span>
                  <span className="rng" data-s={fmt(s.start)} data-full={`${fmt(s.start)} – ${fmt(s.end)}`}>{fmt(s.start)} – {fmt(s.end)}</span>
                </div>
              );
            })}
            {r.steps.slice(1).map((s, k) => {
              const p = r.steps[k], g = s.start - p.end;
              if (g <= 0) return null;
              const mv = s.move || 0, wait = g - mv;
              const l = pct(p.end), w = pct(s.start) - pct(p.end);
              const cls = wait < 10 ? ' tight' : (wait >= 40 ? ' big' : '');
              const tip = mv ? `${p.place} → ${s.place} 이동 ${mv}분 · 잔여 ${wait}분` : `공백 ${g}분`;
              const mw = mv > 0 ? pct(p.end + mv) - pct(p.end) : 0;
              return (
                <div key={k}>
                  <div className={'gap' + cls} style={{ left: l + '%', width: w + '%' }} title={tip} />
                  {mv > 0 && <div className="mv" style={{ left: l + '%', width: mw + '%' }} title={tip} />}
                  <div className={'gaplab' + cls + (mv ? ' hasmv' : '')} style={{ left: l + '%', width: w + '%' }}>
                    {mv ? <em><b className="mvp">이동 {mv}분</b><b className="wtp">잔여 {wait}분</b></em> : <em>{g}분</em>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="axis">
            {axisTicks(lo, hi, span).map(({ t, left }) => (
              <span key={t} className="tick" style={{ left: left + '%' }}>{fmt(t)}</span>
            ))}
          </div>
        </div></div>
        <div className="seq">
          {seqSegments(r).map((seg, i) => (
            <span key={i}>{i > 0 && '  →  '}{seg}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function seqSegments(r: SearchResultRow): React.ReactNode[] {
  const segs: React.ReactNode[] = [];
  r.steps.forEach((s, i) => {
    if (i && s.move) segs.push(<i key={`mv${i}`} className="mvtag">이동 {s.move}분</i>);
    segs.push(<span key={`s${i}`}><b>{fmt(s.start)}</b> {s.name}</span>);
  });
  segs.push(<span key="end"><b>{fmt(r.end)}</b> 종료</span>);
  return segs;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* noop */ }
    ta.remove();
    return ok;
  }
}
