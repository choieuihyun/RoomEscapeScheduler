import { pairKey } from '../core';
import type { Scheduler } from '../scheduler/useScheduler';

export function MoveTimeGrid({ s }: { s: Scheduler }) {
  const ps = s.placeList;
  if (ps.length < 2) return null;
  const def = parseInt(s.options.oMove) || 0;

  return (
    <div className="pairs">
      <div className="pairhead">매장 간 이동시간 <span>안 고친 칸은 기본값({def}분)으로 계산해요</span></div>
      {ps.flatMap((pa, i) => ps.slice(i + 1).map((pb) => {
        const key = pairKey(pa, pb);
        const v = s.moveMap[key];
        const set = v != null;
        return (
          <div key={key} className={'pair' + (set ? ' set' : '')}>
            <span className="pn">{pa}</span><span className="parr">↔</span><span className="pn">{pb}</span>
            <input
              className="mono pv" inputMode="numeric" value={set ? v : def}
              onChange={e => s.setMoveMapValue(pa, pb, parseInt(e.target.value) || 0)}
            />
            <span className="unit">분</span>
          </div>
        );
      }))}
    </div>
  );
}

export function moveHint(s: Scheduler): { className: string; content: React.ReactNode } {
  const named = s.themes.filter(t => (t.place || '').trim());
  const places = new Set(named.map(t => t.place.trim()));
  const m = parseInt(s.options.oMove) || 0;

  if (!named.length) {
    return { className: 'movehint', content: <>테마에 <b>매장</b>을 적으면 매장을 옮길 때 이동시간을 넣어 계산해요. 지금은 안 넣고 있어요.</> };
  }
  if (places.size < 2) {
    return { className: 'movehint', content: <>매장이 <b>{[...places][0]}</b> 한 곳이라 이동시간은 없어요.</> };
  }
  if (!m) {
    return { className: 'movehint', content: <>매장 <b>{places.size}곳</b> — 이동시간을 <b>0분</b>으로 해 둬서 안 넣어요.</> };
  }
  const blank = s.themes.length - named.length;
  const ps = s.placeList;
  let n = 0, set = 0;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      n++;
      if (s.moveMap[pairKey(ps[i], ps[j])] != null) set++;
    }
  }
  return {
    className: 'movehint on',
    content: (
      <>
        매장 <b>{places.size}곳</b> · 구간 <b>{n}개</b>
        {set ? <> (<b>{set}개</b>는 직접 정함)</> : <> · 전부 <b>{m}분</b></>}
        {blank ? <span className="dimhint">· 매장을 안 적은 테마 {blank}개는 빼고 계산</span> : null}
      </>
    ),
  };
}
