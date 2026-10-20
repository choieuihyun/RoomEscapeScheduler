import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { fmt, type SearchResultRow } from '../core';
import { barWidth, blockNeed, firstScroll } from '../timeline';
import type { WatchControl } from '../useWatches';
import { WatchBell } from './WatchBell';

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
    + (r.moveTotal ? `이동 ${r.moveTotal}분 · 대기 ${r.total - r.moveTotal}분)` : `공백 ${r.total}분)`);
  const body = r.steps.map((s, i) => {
    const line = `${fmt(s.start)}–${fmt(s.end)}  ${s.name}${s.place ? ` @${s.place}` : ''} (${s.dur}분)`;
    const nx = r.steps[i + 1];
    if (!nx) return line;
    const g = nx.start - s.end, mv = nx.move || 0;
    return line + (mv ? `\n     ↓ 이동 ${mv}분  대기 ${g - mv}분` : `\n     ↓ 공백 ${g}분`);
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
  onClubPost?: (r: SearchResultRow) => void;
  /* 일정 상세에서 시작한 계산 — "이 일정에 넣기". null 이면 그 일정을 고칠 수 없다(안내만), 없으면 일정 문맥이 없다 */
  onInsert?: ((r: SearchResultRow) => void) | null;
  watchCtl?: WatchControl;
  /* 팀 확정 박스용 — 타임라인 시각화 대신 "시각 테마명" 세로 목록만 보여준다.
     상단 통계·복사 버튼은 그대로 둔다(사용자 요청). */
  simple?: boolean;
}

/* 오른쪽에 더 넘길 게 있으면 옅게 사라지는 끝(.tl-more) */
const fade = (w: HTMLElement) => w.classList.toggle('tl-more', w.scrollLeft + w.clientWidth < w.scrollWidth - 1);

export function ResultCard({ r, rank, lo, hi, span, themeCount, teamModeOn, onConfirmTeam, onSave, onClubPost, onInsert, watchCtl, simple }: ResultCardProps) {
  const pct = (m: number) => ((m - lo) / span) * 100;
  const tight = r.minWait < 10;
  const wrapRef = useRef<HTMLDivElement>(null);
  /* 손으로 넘긴 결과 — 그 결과인 동안은 다시 끌어오지 않는다. 정렬·더 보기로 이 자리 카드의 결과가 바뀌면 다시 맞춘다 */
  const touched = useRef<SearchResultRow | null>(null);
  const touchAt = useRef(0);
  const mark = () => { touched.current = r; };

  /* 테마 이름·시각이 다 들어가게 막대를 넓히고(시간 비율 그대로, timeline.ts) 첫 테마 시작으로 넘긴다.
     이름은 한 줄 폭으로 재므로 두 줄 표시(.two)를 먼저 걷는다. 글꼴이 아직 오는 중이면 온 뒤 한 번 더 잰다 */
  useLayoutEffect(() => {
    const w = wrapRef.current;
    if (!w) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      const inner = w.firstElementChild as HTMLElement;
      const blks = [...inner.querySelectorAll<HTMLElement>('.blk')];
      /* 폭은 비우지 않고 잰다(이름·시각 폭은 막대 폭과 상관없다) — 비우면 스크롤이 0 으로 밀려 손으로 넘긴 자리를 잃는다 */
      blks.forEach((b) => b.classList.remove('two'));
      const cs = blks[0] && getComputedStyle(blks[0]);
      const pad = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2 : 0;
      const needs = blks.map((b, i) => ({
        dur: r.steps[i].end - r.steps[i].start,
        ...blockNeed((b.querySelector('.nm i') as HTMLElement).offsetWidth, (b.querySelector('.rng') as HTMLElement).scrollWidth,
          pad + (b.querySelector('.blk-watch') ? 18 : 0)), // 매진 벨 자리
      }));
      const cw = w.clientWidth;
      const width = barWidth(needs, span, cw);
      inner.style.width = width > cw ? width + 'px' : '';
      blks.forEach((b, i) => b.classList.toggle('two', needs[i].two));
      if (touched.current !== r) {
        w.scrollTo({ left: firstScroll(r.start, lo, span, width, cw), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      fade(w);
    };
    fit();
    if (document.fonts?.status === 'loading') void document.fonts.ready.then(fit);
    return () => { live = false; };
  }, [r, lo, span]);

  return (
    <div
      className={'res' + (rank === 0 ? ' best' : '')}
      /* 카드 등장 애니메이션(.res, resultIn)의 순차 딜레이 — 8개부터는 한꺼번에 (§4.43) */
      style={{ animationDelay: `${Math.min(rank, 8) * 30}ms` }}
    >
      <div className="res-head">
        <span className="rank">{String(rank + 1).padStart(2, '0')}</span>
        <span className="stat"><b className="mono">{fmt(r.start)} → {fmt(r.end)}</b></span>
        <span className="stat">총 <b className="mono">{Math.round((r.end - r.start) / 60 * 10) / 10}h</b></span>
        {r.moveTotal ? (
          <>
            <span className="stat mvstat">이동 <b className="mono">{r.moveTotal}분</b></span>
            <span className={'stat' + (r.total - r.moveTotal <= 30 ? ' good' : '')}>대기 <b className="mono">{r.total - r.moveTotal}분</b></span>
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
        {onInsert && <button className="btn-copy btn-ins" type="button" onClick={() => onInsert(r)}>이 일정에 넣기</button>}
        {onClubPost && <button className="btn-copy btn-save" type="button" onClick={() => onClubPost(r)}>{onInsert === undefined ? '일정 등록' : '새 일정으로 등록'}</button>}
        {teamModeOn && <button className="btn-copy btn-team" type="button" onClick={() => onConfirmTeam(r)}>팀 확정</button>}
      </div>
      <div className="res-body">
        {simple ? (
          <div className="seqcol">
            {r.steps.map((s, i) => (
              <div key={i} className="seqcolrow">
                <b className="mono">{fmt(s.start)}</b> {s.name}
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* 막대만 옆으로 넘긴다(시간 눈금 줄도 같이). 손으로 넘겼는지는 가로 휠·키·마우스·손가락으로 실제 움직인 것만 센다 —
                세로로 화면을 넘기다 스친 것은 아니다 */}
            <div
              className="tlwrap" ref={wrapRef} tabIndex={0} role="region" aria-label="타임라인, 옆으로 넘겨 보기"
              onScroll={(e) => fade(e.currentTarget)} onKeyDown={mark}
              onWheel={(e) => { if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) mark(); }}
              onPointerDown={(e) => { if (e.pointerType === 'mouse') mark(); }}
              onTouchStart={(e) => { touchAt.current = e.currentTarget.scrollLeft; }}
              onTouchEnd={(e) => { if (Math.abs(e.currentTarget.scrollLeft - touchAt.current) > 2) mark(); }}
            ><div className="tlinner">
              <div className="tl">
                {r.steps.map((s, i) => {
                  const l = pct(s.start), w = pct(s.end) - pct(s.start);
                  return (
                    <div key={i} className={'blk' + (s.soldout ? ' so' : '')}
                      style={{ left: l + '%', width: w + '%', '--accent': `var(--accent-${s.i % 6})` } as CSSProperties}
                      title={`${s.name} ${fmt(s.start)}→${fmt(s.end)} (${s.dur}분)`}>
                      <span className="nm"><i>{s.name}</i></span>
                      <span className="rng">{fmt(s.start)} – {fmt(s.end)}</span>
                      {s.soldout && s.sessionId != null && watchCtl && <WatchBell slotId={s.sessionId} ctl={watchCtl} block />}
                    </div>
                  );
                })}
                {r.steps.slice(1).map((s, k) => {
                  const p = r.steps[k], g = s.start - p.end;
                  if (g <= 0) return null;
                  const mv = s.move || 0, wait = g - mv;
                  const l = pct(p.end), w = pct(s.start) - pct(p.end);
                  const cls = wait < 10 ? ' tight' : (wait >= 40 ? ' big' : '');
                  const tip = mv ? `${p.place} → ${s.place} 이동 ${mv}분 · 대기 ${wait}분` : `공백 ${g}분`;
                  const mw = mv > 0 ? pct(p.end + mv) - pct(p.end) : 0;
                  return (
                    <div key={k}>
                      <div className={'gap' + cls} style={{ left: l + '%', width: w + '%' }} title={tip} />
                      {mv > 0 && <div className="mv" style={{ left: l + '%', width: mw + '%' }} title={tip} />}
                      <div className={'gaplab' + cls + (mv ? ' hasmv' : '')} style={{ left: l + '%', width: w + '%' }}>
                        {mv ? <em><b className="mvp">이동 {mv}분</b><b className="wtp">대기 {wait}분</b></em> : <em>{g}분</em>}
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
          </>
        )}
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
