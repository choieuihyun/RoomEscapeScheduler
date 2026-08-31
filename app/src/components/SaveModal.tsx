import { fmt } from '../core';
import type { UseSaveModalReturn } from '../useSaveModal';

/* 일정 저장 모달 — index.html의 #saveModal + openSave()/submitSave() 이식. */
export function SaveModal({ m }: { m: UseSaveModalReturn }) {
  const r = m.pending;
  return (
    <div
      className={'modal' + (m.open ? ' on' : '')}
      onClick={e => { if (e.target === e.currentTarget) m.close(); }}
    >
      <div className="mbox">
        <h3>일정 저장</h3>
        <p className="msub">{r ? `${r.count}연방 · ${fmt(r.start)} → ${fmt(r.end)} · 공백 ${r.total}분` : ''}</p>
        <div className="mrow">
          <label>날짜</label>
          <input type="date" value={m.date} onChange={e => m.setDate(e.target.value)} />
        </div>
        <div className="mrow">
          <label>구분</label>
          <div className="mseg">
            <button type="button" className={m.status === 'wish' ? 'on' : ''} onClick={() => m.setStatus('wish')}>하고 싶은 일정</button>
            <button type="button" className={m.status === 'done' ? 'on' : ''} onClick={() => m.setStatus('done')}>했던 일정</button>
          </div>
        </div>
        <div className="mrow">
          <label>메모 <span className="dim">(선택)</span></label>
          <input placeholder="메모를 입력하세요" value={m.memo} onChange={e => m.setMemo(e.target.value)} />
        </div>
        <p className="merr">{m.err}</p>
        <div className="mbtns">
          <button className="btn-go" type="button" disabled={m.busy} onClick={m.submit}>{m.busy ? '저장 중…' : '저장'}</button>
          <button className="btn" type="button" onClick={m.close}>닫기</button>
        </div>
      </div>
    </div>
  );
}
