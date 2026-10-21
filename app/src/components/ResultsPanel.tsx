import { useMemo, useState } from 'react';
import { SORTS } from '../core';
import type { Scheduler } from '../scheduler/useScheduler';
import type { WatchControl } from '../useWatches';
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
    <div className="sorts" role="group" aria-label="정렬">
      {SORTS.map(sort => (
        <button
          key={sort.k} className={'sortbtn' + (sort.k === s.sortKey ? ' on' : '')} type="button" aria-pressed={sort.k === s.sortKey}
          onClick={() => s.selectSort(sort.k)}
        >{sort.label}</button>
      ))}
    </div>
  );
}

type Row = Scheduler['found'][number];
/* 결과 하나를 가리키는 키 — 정렬이 바뀌어도 펼친 줄이 그 결과를 따라간다 */
const rowKey = (r: Row) => r.steps.map(x => x.i + ':' + x.start).join('|');

/* 결과(2026-10-21 개편, 늦게 받는 청크) — 1위는 큰 카드(시작→끝 크게·대기·이동·타임라인·순서·단추),
   나머지는 짧은 줄(누르면 펼친다). 처음엔 2·3위만, "나머지 n개 보기" 뒤엔 보이는 만큼 전부, 그다음은 전처럼 "더 보기" */
export function ResultsPanel({ s, onSave, onClubPost, onInsert, watchCtl }: {
  s: Scheduler; onSave?: (r: Row) => void; onClubPost?: (r: Row) => void; onInsert?: ((r: Row) => void) | null; watchCtl?: WatchControl;
}) {
  const [allRows, setAllRows] = useState(false);
  /* 다시 계산하면(found 가 새 배열) "나머지 n개 보기"를 다시 접는다 — 정렬·탭·더 보기는 found 를 안 바꾼다 */
  const [seen, setSeen] = useState(s.found);
  if (seen !== s.found) { setSeen(s.found); setAllRows(false); }
  const pool = s.currentList;
  const list = useMemo(
    () => [...pool].sort((SORTS.find(d => d.k === s.sortKey) ?? SORTS[0]).f).slice(0, s.showCount),
    [pool, s.sortKey, s.showCount],
  );
  const lo = list.length ? Math.min(...list.map(r => r.start)) : 0;
  const hi = list.length ? Math.max(...list.map(r => r.end)) : 0;
  const span = Math.max(hi - lo, 60);

  /* 막대 폭·첫 테마로 넘기기는 카드마다(ResultCard) — 이름이 다 들어가게 넓히고 옆으로 넘긴다(2026-10-20 사용자 요청,
     좁은 화면도 넓힌다. 전에 좁은 화면에서 이름을 훑기 애니메이션으로 돌리던 것은 걷었다) */
  const head = (sub?: string) => (
    <div className="cz-step">
      <h2 id="czH3">결과{s.found.length > 0 && <span className="cz-cnt">{pool.length.toLocaleString()}개</span>}</h2>
      {sub && <span className="cz-step-r" id="resCount">{sub}</span>}
    </div>
  );

  if (!s.found.length) {
    const teamStuck = s.options.oTeam && s.teams.length;
    return (
      <section className="sec cz-sec cz-res" aria-labelledby="czH3">
        {head()}
        <div id="results">
          <div className="empty">
            {teamStuck
              ? <>남은 회차로는 조합이 안 나와요. 앞 팀이 회차를 많이 가져갔을 수 있어요 — <b className="hi">마지막 팀 취소</b>나 <b className="hi">전체 초기화</b>를 눌러 보세요.</>
              : s.options.oFixedOrder
                /* 순서가 고정된 동안에는 "이 순서에서만 안 나온다" 가 가장 흔한 원인이다 —
                   순서 자유로 두면 도구가 알아서 찾으므로 그쪽을 먼저 권한다(§4.46). */
                ? <>이 순서로는 조건에 맞는 조합이 없어요. <b className="hi">순서 그대로 계산</b>을 끄거나, 최소 대기를 줄이거나, 시간 범위를 넓혀 보세요.</>
                : '조건에 맞는 조합이 없어요. 최소 대기를 줄이거나 시간 범위를 넓혀 보세요.'}
          </div>
        </div>
      </section>
    );
  }

  if (!pool.length) {
    return (
      <section className="sec cz-sec cz-res" aria-labelledby="czH3">
        {head()}
        <div id="tabs"><ResultTabs s={s} /></div>
        <SortBar s={s} />
        <div id="results"><div className="empty">여기엔 조합이 없어요.</div></div>
      </section>
    );
  }

  const capped = s.searchCapped ? '너무 많아서 일부만 찾았어요' : '';
  const sub = [list.length < pool.length ? `상위 ${list.length.toLocaleString()}개만 보여요` : '', capped].filter(Boolean).join(' · ');
  const rest = list.slice(1);
  const rows = allRows ? rest : rest.slice(0, 2);
  const props = { lo, hi, span, themeCount: s.themesReady.length, teamModeOn: s.options.oTeam, onConfirmTeam: s.confirmTeam, onSave, onClubPost, onInsert, watchCtl };

  return (
    <section className="sec cz-sec cz-res" aria-labelledby="czH3">
      {head(sub)}
      <div id="tabs"><ResultTabs s={s} /></div>
      <SortBar s={s} />
      {/* 못 고치는 일정 문맥 — 카드마다 되풀이하지 않고 목록 위에 한 번 */}
      {onInsert === null && <p className="res-note">만든 사람이나 운영진만 이 일정의 테마를 바꿀 수 있어요. 결과는 새 일정으로 등록할 수 있어요.</p>}
      <div id="results">
        <ResultCard r={list[0]} rank={0} variant="best" {...props} />
        {rest.length > 0 && (
          <div className="cz-rows">
            <ul>{rows.map((r, k) => <ResultCard key={rowKey(r)} r={r} rank={k + 1} variant="row" {...props} />)}</ul>
            {!allRows && rest.length > 2 ? (
              <button className="cz-morerows" type="button" onClick={() => setAllRows(true)}>나머지 {(rest.length - 2).toLocaleString()}개 보기</button>
            ) : pool.length > list.length && (
              <button className="cz-morerows" type="button" onClick={s.showMore}>
                더 보기 ({Math.min(12, pool.length - list.length).toLocaleString()}개 더)
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
