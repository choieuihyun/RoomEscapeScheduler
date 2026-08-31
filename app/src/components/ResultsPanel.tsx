import { useLayoutEffect, useMemo, useRef } from 'react';
import { SORTS } from '../core';
import type { Scheduler } from '../scheduler/useScheduler';
import { ResultCard } from './ResultCard';

function setKey(r: { steps: { i: number }[] }) {
  return r.steps.map(s => s.i).sort((a, b) => a - b).join(',');
}
function setLabel(key: string, themesReady: Scheduler['themesReady']) {
  return key.split(',').map(i => (themesReady[+i] || {}).name || ('테마 ' + (+i + 1))).join(' + ');
}

function ResultTabs({ s }: { s: Scheduler }) {
  if (!s.found.length) return null;
  const counts = [...new Set(s.found.map(r => r.count))].sort((a, b) => b - a);
  const maxC = counts[0];
  const tabCount = s.tabCount == null || !counts.includes(s.tabCount) ? maxC : s.tabCount;

  const inTab = s.found.filter(r => r.count === tabCount);
  const sets = new Map<string, number>();
  inTab.forEach(r => { const k = setKey(r); sets.set(k, (sets.get(k) || 0) + 1); });
  const tabSet = s.tabSet != null && sets.has(s.tabSet) ? s.tabSet : null;

  return (
    <div>
      {counts.length > 1 && (
        <div className="tabrow">
          {counts.map(c => (
            <button
              key={c} className={'tab' + (c === tabCount ? ' on' : '')} type="button"
              onClick={() => s.selectTab(c)}
            >
              테마 {c}개{c === maxC ? ' 전부' : ''}<b>{s.found.filter(r => r.count === c).length.toLocaleString()}</b>
            </button>
          ))}
        </div>
      )}
      {tabCount < maxC && (
        <div className="tabrow sets">
          <button className={'tab' + (tabSet == null ? ' on' : '')} type="button" onClick={() => s.selectTabSet(null)}>
            전체<b>{inTab.length.toLocaleString()}</b>
          </button>
          {[...sets.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <button key={k} className={'tab' + (k === tabSet ? ' on' : '')} type="button" onClick={() => s.selectTabSet(k)}>
              {setLabel(k, s.themesReady)}<b>{n.toLocaleString()}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortBar({ s }: { s: Scheduler }) {
  return (
    <div className="sorts">
      {SORTS.map(sort => (
        <button
          key={sort.k} className={'sortbtn' + (sort.k === s.sortKey ? ' on' : '')} type="button"
          onClick={() => s.selectSort(sort.k)}
        >{sort.label}</button>
      ))}
    </div>
  );
}

export function ResultsPanel({ s }: { s: Scheduler }) {
  const resRef = useRef<HTMLDivElement>(null);

  const pool = s.currentList;
  const list = useMemo(
    () => [...pool].sort(SORTS.find(d => d.k === s.sortKey)!.f).slice(0, s.showCount),
    [pool, s.sortKey, s.showCount],
  );
  const lo = list.length ? Math.min(...list.map(r => r.start)) : 0;
  const hi = list.length ? Math.max(...list.map(r => r.end)) : 0;
  const span = Math.max(hi - lo, 60);

  /* 이름이 넘치는 블록에만 타임라인을 넓히거나 훑기를 건다 — index.html의
     renderResults() 후반부(appendChild 뒤 DOM 측정)를 그대로 옮긴 것. */
  useLayoutEffect(() => {
    const root = resRef.current;
    if (!root) return;
    /* React는 텍스트가 "이전에 렌더한 값과 같으면" DOM을 안 건드린다 — 그런데 아래
       단계들이 textContent를 직접 잘라내므로, React의 "안 바뀜" 판단과 실제 DOM이
       어긋난다. 매 패스마다 data-full로 되돌려 원본처럼 "항상 새로 그리고 필요할
       때만 자른다"를 유지한다. */
    root.querySelectorAll<HTMLElement>('.blk .rng').forEach(el => {
      el.textContent = el.dataset.full || '';
    });
    root.querySelectorAll<HTMLElement>('.tlinner').forEach(inner => {
      let factor = 1;
      inner.querySelectorAll<HTMLElement>('.blk').forEach(b => {
        const nm = b.querySelector<HTMLElement>('.nm i'), rng = b.querySelector<HTMLElement>('.rng');
        const cs = getComputedStyle(b);
        const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2;
        const need = Math.max(nm?.scrollWidth || 0, rng?.scrollWidth || 0) + pad;
        const cur = b.clientWidth;
        if (cur > 0 && need > cur) factor = Math.max(factor, need / cur);
      });
      factor = Math.min(factor, 4);
      inner.style.width = factor > 1.01 ? (factor * 100) + '%' : '';
    });
    // React가 이미 "시작 – 종료" 전체 텍스트를 렌더해 뒀다 — 원본처럼 처음부터 채워 두고
    // 여기서는 넘칠 때만 자르는 판정만 한다 (원본 renderResults() 2단계).
    root.querySelectorAll<HTMLElement>('.blk .rng').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 1) {
        el.textContent = el.dataset.s || '';
        if (el.scrollWidth > el.clientWidth + 1) el.textContent = '';
      }
    });
    root.querySelectorAll<HTMLElement>('.blk .nm').forEach(el => {
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) return;
      const over = inner.scrollWidth - el.clientWidth;
      if (over > 1) {
        el.classList.add('roll');
        el.style.setProperty('--shift', (-over - 2) + 'px');
      } else {
        el.classList.remove('roll');
      }
    });
  }, [list]);

  if (!s.found.length) {
    const teamStuck = s.options.oTeam && s.teams.length;
    return (
      <section className="sec">
        <div className="sec-head"><h2>결과</h2><span /></div>
        <div id="results">
          <div className="empty">
            {teamStuck
              ? <>이 조건으로는 남은 회차만으로 조합을 만들 수 없습니다. 앞선 팀이 너무 많은 회차를 가져갔을 수 있어요 — <b className="hi">마지막 팀 취소</b> 또는 <b className="hi">전체 초기화</b> 를 눌러보세요.</>
              : '조건을 만족하는 조합이 없습니다. 최소 공백을 줄이거나 시간 범위를 넓혀보거나, 테마 순서를 바꿔보세요.'}
          </div>
        </div>
      </section>
    );
  }

  if (!pool.length) {
    return (
      <section className="sec">
        <div className="sec-head"><h2>결과</h2><span /></div>
        <div id="tabs"><ResultTabs s={s} /></div>
        <SortBar s={s} />
        <div id="results"><div className="empty">이 묶음에는 조합이 없습니다.</div></div>
      </section>
    );
  }

  const capped = s.searchCapped ? ' (탐색 한도 도달)' : '';
  const countText = list.length < pool.length
    ? `상위 ${list.length.toLocaleString()}개만 표시됩니다 · 전체 ${pool.length.toLocaleString()}개 중${capped}`
    : `${pool.length.toLocaleString()}개${capped}`;

  return (
    <section className="sec">
      <div className="sec-head"><h2>결과</h2><span id="resCount">{countText}</span></div>
      <div id="tabs"><ResultTabs s={s} /></div>
      <SortBar s={s} />
      <div id="results" ref={resRef}>
        {list.map((r, ri) => (
          <ResultCard
            key={ri} r={r} rank={ri} lo={lo} hi={hi} span={span}
            themeCount={s.themesReady.length} teamModeOn={s.options.oTeam}
            onConfirmTeam={s.confirmTeam}
          />
        ))}
        {pool.length > list.length && (
          <div className="showmore">
            <button className="btn morebtn" type="button" onClick={s.showMore}>
              더 보기 ({Math.min(12, pool.length - list.length).toLocaleString()}개 더)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
