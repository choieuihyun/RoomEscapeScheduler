import type { LoadModalState } from '../useLoadModal';

/* F-15 "회차 불러오기" 모달. index.html의 #loadModal 마크업 이식. */
export function LoadModal({ m }: { m: LoadModalState }) {
  const ppl = parseInt(m.people, 10);

  return (
    <div
      className={'modal' + (m.open ? ' on' : '')}
      onClick={e => { if (e.target === e.currentTarget) m.close(); }}
    >
      <div className="mbox mbox-wide">
        <h3>회차 불러오기</h3>
        <p className="msub">예약 사이트에서 회차와 <b>매진 여부</b>까지 가져옵니다.</p>
        <div className="mrow2">
          <div className="mrow">
            <label>지점</label>
            <select value={m.branchId} onChange={e => m.changeBranch(e.target.value)}>
              {m.branchList.map(b => (
                <option key={b.id} value={b.id}>{b.store ? b.store + ' ' + b.branch : b.branch}</option>
              ))}
            </select>
          </div>
          <div className="mrow">
            <label>날짜</label>
            <select value={m.date} onChange={e => m.changeDate(e.target.value)}>
              {m.dates.map(d => <option key={d} value={d}>{m.dateLabel(d)}</option>)}
            </select>
          </div>
        </div>
        <div className="mrow">
          <label>인원 <span className="dim">(비우면 전부 표시)</span></label>
          <input
            className="mono" inputMode="numeric"
            placeholder="예: 4  — 인원이 안 맞는 테마를 흐리게 표시합니다"
            value={m.people} onChange={e => m.setPeople(e.target.value)}
          />
        </div>
        <div className="loadlist">
          {m.listMsg ? (
            <div className="lmsg">{m.listMsg.split('\n').map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}</div>
          ) : m.themes.length === 0 ? (
            <div className="lmsg">이 날짜에는 테마가 없습니다.</div>
          ) : (
            m.themes.map((t, i) => {
              const avail = t.sessions.filter(s => !s.soldout).length;
              const sold = t.sessions.length - avail;
              const fits = !ppl || ((t.minPeople == null || ppl >= t.minPeople) && (t.maxPeople == null || ppl <= t.maxPeople));
              const meta = [t.genre, t.capacity, t.dur ? t.dur + '분' : null, m.stars(t.difficulty)]
                .filter(Boolean).join(' · ');
              return (
                <label key={i} className={'loaditem' + (fits ? '' : ' off')}>
                  <input
                    type="checkbox" checked={m.picked.has(i)}
                    onChange={e => m.togglePick(i, e.target.checked)}
                  />
                  <img src={t.posterUrl || ''} alt="" loading="lazy" />
                  <div className="li-t">
                    <strong>{t.name}</strong>
                    <span className="li-m">{meta}{fits ? '' : <> · <b>인원이 맞지 않습니다</b></>}</span>
                    <span className="li-c">예약 가능 {avail}{sold ? <> · 매진 <i>{sold}</i></> : null}</span>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div className="loadfoot">
          <span>{m.picked.size ? `${m.picked.size}개 선택됨` : ''}</span>
          <span className="fresh">{m.fresh}</span>
        </div>
        <p className="merr">{m.err}</p>
        <div className="mbtns">
          <button className="btn-go" type="button" disabled={!m.picked.size} onClick={m.addPicked}>카드로 추가</button>
          <button className="btn" type="button" onClick={m.close}>닫기</button>
        </div>
        <p className="mnote">불러온 뒤에도 회차를 <b>손으로 고칠 수 있습니다</b>. 매진 회차는 카드에 남지만 계산에서는 빠집니다.</p>
      </div>
    </div>
  );
}
