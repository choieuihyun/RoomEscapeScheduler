import { useRef, useState } from 'react';
import { dayLabel, parseKakaoTitle, todayKst } from '../clubEvents';
import { monthGrid } from '../core';
import { applyPaste, emptySeg, formFromEvent, MAX_CANDIDATES, MAX_SEGS, segTimeText, shouldApplyOnBlur, switchDateMode, toggleCandidate, toInput, type FormSeg, type FormState } from '../eventForm';
import { conflictOf, sayClub, type EventDto, type EventInput } from '../server';
import { showToast } from '../toast';
import type { UseEventFormModal } from '../useEventFormModal';

interface Props {
  m: UseEventFormModal;
  /* useClubEvents 의 create / update — 실패하면 던지므로 입력을 그대로 둘 수 있다 */
  create: (input: EventInput) => Promise<EventDto>;
  update: (id: number, input: EventInput, version: number) => Promise<EventDto>;
  /* 충돌로 받은 최신 일정을 공유 목록에 넣는다(useClubEvents.adopt) — 상세 패널이 낡은 채로 남지 않게 */
  adopt: (ev: EventDto) => void;
}

/* 일정 만들기·수정 창 (계획 Task E5). 열릴 때마다 안쪽 본문이 새로 시작한다. */
export function EventForm({ m, create, update, adopt }: Props) {
  return (
    <div className={'modal evf-modal' + (m.open ? ' on' : '')}>
      {m.open && <Body key={m.seq} m={m} create={create} update={update} adopt={adopt} />}
    </div>
  );
}

function Body({ m, create, update, adopt }: Props) {
  const editing = m.editing;
  const [f, setF] = useState<FormState>(m.initial);
  /* 고치는 기준 판 — 충돌 뒤 "새로 불러온 내용 보기"를 누르면 최신 판으로 바뀐다 */
  const [version, setVersion] = useState(editing?.version ?? 0);
  const [conflict, setConflict] = useState<EventDto | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /* 날짜 칸을 직접 고쳤나 — 안 고쳤으면 미정에서 넘어올 때 채운 가장 이른 후보 안내를 보인다 */
  const [dateEdited, setDateEdited] = useState(false);

  const set = (patch: Partial<FormState>) => setF((cur) => ({ ...cur, ...patch }));
  const setSeg = (i: number, patch: Partial<FormSeg>) =>
    setF((cur) => ({ ...cur, segs: cur.segs.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  /* 제목에 카톡 제목이 들어오면 구간으로 바꾼다 */
  const fill = (title: string): boolean => {
    if (parseKakaoTitle(title).segments.length === 0) return false;
    const r = applyPaste(f, title);
    setF(r.form);
    setNote(r.note);
    return true;
  };

  const hasSegs = f.segs.length > 0;
  const timeText = segTimeText(f.segs);
  /* 지난 날짜(한국 날짜 기준)는 막지 않고 알려만 준다 — 기록으로 남기는 일정도 있다 */
  const today = todayKst();
  const candMode = f.dateMode === 'candidates';
  const past = candMode ? f.candidates.some((d) => d < today) : !!f.date && f.date < today;
  /* 테마(구간)가 있으면 날짜 하나만 — 이미 후보 모드인 일정은 되돌릴 수 있게 고르는 칩을 남긴다 */
  const canPickMode = !hasSegs || candMode || editing?.date === null;
  const setMode = (mode: FormState['dateMode']) => setF((cur) => switchDateMode(cur, mode, todayKst()));
  /* 후보 목록의 최신 값 — 빠르게 연달아 눌러도 앞의 선택 위에 쌓이게 한다 */
  const candRef = useRef(f.candidates);
  const [capHit, setCapHit] = useState(false);
  const toggleCand = (iso: string) => {
    const r = toggleCandidate(candRef.current, iso);
    setCapHit(r.error !== '');
    if (r.list === candRef.current) return;
    candRef.current = r.list;
    setF((cur) => ({ ...cur, candidatesTouched: true, candidates: r.list }));
  };

  async function submit() {
    const r = toInput(f);
    if ('error' in r) { setErr(r.error); return; }
    setBusy(true); setErr('');
    try {
      if (editing) await update(editing.id, r.input, version);
      else await create(r.input);
      showToast(editing ? '일정을 저장했어요.' : '일정을 만들었어요.');
      m.close();
    } catch (e) {
      const latest = conflictOf(e);
      if (latest) { adopt(latest); setConflict(latest); setErr(''); }
      else setErr(sayClub(e));
    } finally {
      setBusy(false);
    }
  }

  function showLatest() {
    if (!conflict) return;
    const latest = formFromEvent(conflict);
    candRef.current = latest.candidates;
    setCapHit(false);
    setF(latest);
    setVersion(conflict.version);
    setConflict(null);
    setNote('');
    setErr('');
  }

  return (
    <div className="mbox mbox-wide evf" role="dialog" aria-modal="true" aria-label={editing ? '일정 고치기' : '일정 만들기'}>
      <h3>{editing ? '일정 고치기' : '일정 만들기'}</h3>
      <p className="msub">카톡에 올린 제목을 그대로 붙여넣으면 테마와 시각을 채워 드려요.</p>

      {conflict && (
        <div className="evf-conflict" role="alert">
          <span>다른 사람이 먼저 고쳤어요.</span>
          <button type="button" className="btn" onClick={showLatest}>새로 불러온 내용 보기</button>
        </div>
      )}

      <div className="mrow">
        <label htmlFor="evf-title">제목</label>
        <input
          id="evf-title"
          value={f.title}
          placeholder="예: [예약O] 비밀의 화원 13:40 + 셜록의 서재 15:20"
          onChange={(e) => set({ title: e.target.value })}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (parseKakaoTitle(text).segments.length > 0) { e.preventDefault(); fill(text); }
          }}
          onBlur={() => { if (shouldApplyOnBlur(f)) fill(f.title); }}
        />
        {note && <p className="evf-note">{note}</p>}
      </div>

      <div className="mrow2">
        <div className="mrow">
          <label htmlFor={candMode ? undefined : 'evf-date'} id="evf-date-l">날짜</label>
          {canPickMode && (
            <div className="evf-chips" role="group" aria-labelledby="evf-date-l">
              <button type="button" className={'chip-pick' + (candMode ? '' : ' on')} aria-pressed={!candMode} onClick={() => setMode('fixed')}>날짜 정하기</button>
              <button type="button" className={'chip-pick' + (candMode ? ' on' : '')} aria-pressed={candMode} onClick={() => setMode('candidates')}>후보 여러 개</button>
            </div>
          )}
          {candMode ? (
            <CandidatePicker picked={f.candidates} full={f.candidates.length >= MAX_CANDIDATES} capHit={capHit} onToggle={toggleCand} today={today} />
          ) : (
            <input id="evf-date" type="date" value={f.date} onChange={(e) => { setDateEdited(true); set({ date: e.target.value, dateMoved: false }); }} />
          )}
          {!candMode && !dateEdited && editing?.date === null && !f.dateMoved && f.candidates.length > 0 && f.date === f.candidates[0] && (
            <p className="evf-past">가장 이른 후보 {+f.date.slice(5, 7)}/{+f.date.slice(8, 10)} 로 채웠어요.</p>
          )}
          {!candMode && f.dateMoved && <p className="evf-past">자정이 지난 시각이라 날짜를 다음날로 옮겼어요.</p>}
          {past && <p className="evf-past">지난 날짜예요. 기록으로 남기려면 그대로 만들어도 돼요.</p>}
        </div>
        <div className="mrow">
          <label>시간</label>
          {hasSegs ? (
            <div className="evf-time-ro">{timeText}</div>
          ) : (
            <div className="evf-time">
              <label className="evf-check">
                <input type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
                하루 종일
              </label>
              {!f.allDay && (
                <>
                  <input aria-label="시작 시각" inputMode="numeric" placeholder="13:40" value={f.start}
                    onChange={(e) => set({ start: e.target.value })} />
                  <span>–</span>
                  <input aria-label="끝 시각" inputMode="numeric" placeholder="끝(선택)" value={f.end}
                    onChange={(e) => set({ end: e.target.value })} />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mrow">
        <label>테마 <span className="dim">(선택 · 최대 {MAX_SEGS}개)</span></label>
        {f.segs.map((g, i) => (
          <div className="evf-seg" key={i}>
            <input className="evf-s-time" aria-label={`테마 ${i + 1} 시작`} inputMode="numeric" placeholder="13:40"
              value={g.start} onChange={(e) => setSeg(i, { start: e.target.value })} />
            <input className="evf-s-name" aria-label={`테마 ${i + 1} 이름`} placeholder="테마 이름"
              value={g.themeName} onChange={(e) => setSeg(i, { themeName: e.target.value })} />
            <input className="evf-s-branch" aria-label={`테마 ${i + 1} 지점`} placeholder="지점"
              value={g.branchName} onChange={(e) => setSeg(i, { branchName: e.target.value })} />
            <input className="evf-s-time" aria-label={`테마 ${i + 1} 끝`} inputMode="numeric" placeholder="끝"
              value={g.end} onChange={(e) => setSeg(i, { end: e.target.value })} />
            <button type="button" className="btn evf-s-del" aria-label={`테마 ${i + 1} 빼기`}
              onClick={() => setF((cur) => ({ ...cur, segs: cur.segs.filter((_, j) => j !== i) }))}>×</button>
          </div>
        ))}
        {f.segs.length < MAX_SEGS && (
          <button type="button" className="btn evf-add" onClick={() => setF((cur) => ({ ...cur, segs: [...cur.segs, emptySeg()] }))}>
            + 테마 추가
          </button>
        )}
      </div>

      <div className="mrow">
        <label>인원</label>
        <div className="evf-chips" role="group" aria-label="인원">
          {[null, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n ?? 'none'} type="button" className={'chip-pick' + (f.capacity === n ? ' on' : '')}
              aria-pressed={f.capacity === n} onClick={() => set({ capacity: n })}>
              {n === null ? '제한 없음' : `${n}명`}
            </button>
          ))}
        </div>
      </div>

      {hasSegs && (
        <div className="mrow">
          <label>예약</label>
          <div className="mseg">
            <button type="button" className={'chip-pick' + (f.booked ? '' : ' on')} aria-pressed={!f.booked} onClick={() => set({ booked: false })}>예약 전</button>
            <button type="button" className={'chip-pick' + (f.booked ? ' on' : '')} aria-pressed={f.booked} onClick={() => set({ booked: true })}>예약 완료</button>
          </div>
        </div>
      )}

      <div className="mrow">
        <label htmlFor="evf-loc">위치 <span className="dim">(선택)</span></label>
        <input id="evf-loc" placeholder="예: 강남역 10번 출구" value={f.location} onChange={(e) => set({ location: e.target.value })} />
      </div>
      <div className="mrow">
        <label htmlFor="evf-memo">메모 <span className="dim">(선택)</span></label>
        <textarea id="evf-memo" rows={3} value={f.memo} onChange={(e) => set({ memo: e.target.value })} />
      </div>

      <p className="merr">{err}</p>
      <div className="mbtns">
        <button className="btn-go" type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? '저장 중…' : editing ? '저장' : '만들기'}
        </button>
        <button className="btn" type="button" onClick={m.close}>취소</button>
      </div>
    </div>
  );
}

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/* 후보 날짜 고르기 — 미니 달력에서 여러 날을 찍고, 고른 날은 칩(× 로 빼기)으로 보인다. 지난 날은 흐리지만 고를 수 있다. */
function CandidatePicker({ picked, full, capHit, onToggle, today }: { picked: string[]; full: boolean; capHit: boolean; onToggle: (iso: string) => void; today: string }) {
  const [y0, m0] = (picked[0] ?? today).split('-').map(Number);
  const [ym, setYm] = useState({ y: y0, m: m0 - 1 });
  const go = (n: number) => setYm((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return (
    <div className="evf-cand">
      <div className="evf-cal">
        <div className="evf-cal-head">
          <button type="button" aria-label="이전 달" onClick={() => go(-1)}>‹</button>
          <b>{ym.y}.{String(ym.m + 1).padStart(2, '0')}</b>
          <button type="button" aria-label="다음 달" onClick={() => go(1)}>›</button>
        </div>
        <div className="evf-cal-grid">
          {DOW.map((d, i) => <span key={d} className={'evf-cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{d}</span>)}
          {monthGrid(ym.y, ym.m).map((d) => {
            const k = iso(d);
            const on = picked.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} aria-disabled={full && !on ? true : undefined} aria-label={dayLabel(k)}
                className={'evf-cal-day' + (d.getMonth() !== ym.m ? ' out' : '') + (k < today ? ' past' : '') + (d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : '')}
                onClick={() => onToggle(k)}>{d.getDate()}</button>
            );
          })}
        </div>
      </div>
      {picked.length > 0 && (
        <div className="evf-cand-chips">
          {picked.map((k) => (
            <span key={k} className="chip-info talk evf-cand-chip">{dayLabel(k)}
              <button type="button" aria-label={`${dayLabel(k)} 빼기`} onClick={() => onToggle(k)}>×</button>
            </span>
          ))}
        </div>
      )}
      <span className={'evf-cand-count' + (capHit && full ? ' hit' : '')} aria-live="polite">
        {capHit && full ? `후보 날짜는 ${MAX_CANDIDATES}개까지예요. 하나를 빼고 골라 주세요.` : <>후보 {picked.length}개 · 최대 {MAX_CANDIDATES}개. 참여한 사람들이 날짜마다 되는 시간을 고르면 다 같이 되는 날이 보여요.</>}
      </span>
    </div>
  );
}
