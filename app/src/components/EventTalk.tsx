import { useState, type ReactNode } from 'react';
import {
  availText, candidateSummary, dayLabel, parseAvailText, windowLabel, type AvailTime, type CandidateRow,
} from '../clubEvents';
import { formFromEvent, toInput, type FormState } from '../eventForm';
import { errorCode, sayClub, type EventDto } from '../server';
import { showToast } from '../toast';
import type { UseClubEventsReturn } from '../useClubEvents';

/* 일정 상세의 시간 협의(§4.8, 계획 Task 5, 목업 ② 왼쪽 위 두 묶음).
   날짜 미정이면 "언제 될까요?"(후보 날짜별 요약)와 "내 응답", 날짜가 정해졌는데 후보 기록이 있으면
   다 같이 되는 시간으로 조합 계산하기와 접힌 "후보였던 날짜". */

type Win = { start: number; end: number };

/* 정하기·다시 미정으로 — 수정 창과 같은 길(formFromEvent → toInput)로 EventInput 을 만든다.
   candidatesTouched 는 false 그대로라 정하기는 candidates 를 보내지 않고(서버가 후보·응답을 그대로 둔다),
   다시 미정으로(후보 모드)는 있던 목록을 그대로 보낸다(서버가 같은 날짜의 응답을 지킨다). */
async function save(ev: EventDto, club: UseClubEventsReturn, patch: Partial<FormState>, done: string) {
  const r = toInput({ ...formFromEvent(ev), ...patch });
  if ('error' in r) { showToast(r.error); return; }
  try {
    await club.update(ev.id, r.input, ev.version);
    showToast(done);
  } catch (e) {
    /* update 는 입력 창용이라 토스트를 안 띄운다 — 여기서 서버 문구를 그대로. 충돌이면 최신 일정을 받아 다시 보게 한다 */
    showToast(sayClub(e));
    if (errorCode(e) === 'EVENT_CONFLICT') void club.refreshOne(ev.id);
  }
}

function names(ev: EventDto, uids: string[]): string {
  const by = new Map(ev.participants.map((p) => [p.uid, p.nickname]));
  return uids.map((u) => by.get(u) ?? '알 수 없음').join(', ');
}

/* 후보 날짜 한 줄: 날짜·모두 돼요·m/n명, 막대, 다 같이 되는 시간, 안 돼요·응답 안 함 이름 */
function CandRow({ ev, row, action }: { ev: EventDto; row: CandidateRow; action?: ReactNode }) {
  const pct = row.total === 0 ? 0 : Math.round((row.yes / row.total) * 100);
  const time = row.window ? null
    : row.yes === 0 ? ''
    : row.all ? '모두 되지만 겹치는 시간이 없어요' : '겹치는 시간 없음';
  const who = [
    row.noUids.length > 0 && `안 돼요: ${names(ev, row.noUids)}`,
    row.noneUids.length > 0 && `응답 안 함: ${names(ev, row.noneUids)}`,
  ].filter(Boolean).join(' · ');
  return (
    <div className={'evt-cand' + (row.all && row.window ? ' all' : '')}>
      <div className="evt-cand-h">
        <b>{dayLabel(row.date)}</b>
        {row.all && row.window && <span className="chip-info talk">모두 돼요</span>}
        <span className="evt-cand-n"><b>{row.yes}</b>/{row.total}명</span>
      </div>
      <div className="evt-bar" role="img" aria-label={`${row.total}명 중 ${row.yes}명 돼요`}>
        <i className={row.all ? 'all' : ''} style={{ width: pct + '%' }} />
      </div>
      {(row.window || time || who || action) && (
        <div className="evt-cand-f">
          <span className="evt-cand-t">
            {row.window ? <>다 같이 되는 시간 <b>{windowLabel(row.window)}</b></> : time}
            {who && <>{(row.window || time) && ' · '}{who}</>}
          </span>
          {action}
        </div>
      )}
    </div>
  );
}

/* 내 응답 한 줄 — 안 돼요 / 돼요(다시 누르면 응답 지우기), 돼요면 시간 칸(빈칸 = 종일).
   시간 칸은 칸을 벗어나거나 Enter 일 때 보낸다. 받은 응답이 바뀌면 부르는 쪽이 key 로 새로 그린다. */
function MyRow({ ev, date, mine, club }: {
  ev: EventDto; date: string; mine: { available: boolean } & AvailTime | null; club: UseClubEventsReturn;
}) {
  const busy = club.busyIds.has(ev.id);
  const saved = mine?.available ? availText(mine) : '';
  const [text, setText] = useState(saved);
  const [err, setErr] = useState('');
  const label = dayLabel(date);

  function pick(available: boolean) {
    setErr('');
    if (mine && mine.available === available) { void club.unanswer(ev.id, date); return; }
    void club.answer(ev.id, date, available, null, null); // 돼요는 우선 종일 — 시간은 칸에 적는다
  }
  function commit() {
    const r = parseAvailText(text);
    if ('error' in r) { setErr(r.error); return; }
    setErr('');
    if (mine?.available && mine.startMin === r.startMin && mine.endMin === r.endMin) return; // 그대로면 안 보낸다
    void club.answer(ev.id, date, true, r.startMin, r.endMin);
  }

  return (
    <div className="evt-my">
      <span className="evt-my-d">{label}</span>
      <div className="evt-my-row">
        {/* 시간을 적다가 바로 누를 때 칸의 blur 가 먼저 시간 응답을 보내 단추가 잠기고 누른 것이 사라지지 않게,
            누르는 동안 포커스를 옮기지 않는다(적던 시간은 버리고 누른 쪽을 보낸다) */}
        <span className="evt-my-pick" role="group" aria-label={`${label} 되는지`} onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className="chip-pick" aria-pressed={mine?.available === false} disabled={busy}
            onClick={() => pick(false)}>안 돼요</button>
          <button type="button" className="chip-pick" aria-pressed={mine?.available === true} disabled={busy}
            onClick={() => pick(true)}>돼요</button>
        </span>
        {mine?.available && (
          <input
            className="evt-my-time" aria-label={`${label} 되는 시간`} placeholder="종일" value={text}
            aria-invalid={err ? true : undefined}
            onChange={(e) => { setText(e.target.value); if (err) setErr(''); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          />
        )}
      </div>
      {err && <p className="evt-my-err" role="alert">{err}</p>}
    </div>
  );
}

/* 날짜 미정 일정 — 언제 될까요? + 내 응답 */
export function EventTalk({ ev, club, meUid }: { ev: EventDto; club: UseClubEventsReturn; meUid: string }) {
  const busy = club.busyIds.has(ev.id);
  const rows = candidateSummary(ev);
  const decide = (date: string) => {
    if (!confirm(`${dayLabel(date)}에 하기로 정할까요? 참여한 사람들 화면에서도 날짜가 정해져요.`)) return;
    void save(ev, club, { dateMode: 'fixed', date }, `${dayLabel(date)}에 하기로 정했어요.`);
  };
  return (
    <>
      <section className="evt" aria-label="언제 될까요?">
        <div className="evt-h">
          <h3>언제 될까요?</h3>
          <span>참여 {ev.participants.length}명 기준</span>
        </div>
        {ev.participants.length === 0 && <p className="evp-hint">아직 참여한 사람이 없어요. 참여하면 되는 날짜를 고를 수 있어요.</p>}
        {rows.map((row) => (
          <CandRow
            key={row.date} ev={ev} row={row}
            action={ev.canManage && (
              <button type="button" className="btn-go evt-decide" disabled={busy} onClick={() => decide(row.date)}>이 날짜로 정하기</button>
            )}
          />
        ))}
      </section>
      {ev.joined && (
        <section className="evt-mine" aria-label="내 응답">
          <h3>내 응답</h3>
          {ev.candidates.map((c) => {
            const r = c.responses.find((x) => x.uid === meUid) ?? null;
            return (
              <MyRow
                key={`${c.date}|${r ? `${r.available}|${r.startMin}|${r.endMin}` : '-'}`}
                ev={ev} date={c.date} mine={r} club={club}
              />
            );
          })}
        </section>
      )}
    </>
  );
}

/* 날짜가 정해진 일정의 후보 기록 — 그 날짜에 다 같이 되는 시간이 있으면 조합 계산으로, 나머지는 접어 둔다 */
export function EventTalkDone({ ev, club, onCalcWindow }: {
  ev: EventDto; club: UseClubEventsReturn; onCalcWindow?: (w: Win) => void;
}) {
  const busy = club.busyIds.has(ev.id);
  const rows = candidateSummary(ev);
  const here = rows.find((r) => r.date === ev.date)?.window ?? null;
  const reopen = () => {
    if (!confirm('다시 날짜 미정으로 돌릴까요? 후보 날짜와 응답은 그대로 남아요.')) return;
    void save(ev, club, { dateMode: 'candidates' }, '다시 날짜 미정으로 돌렸어요.');
  };
  return (
    <div className="evt-done">
      {here && onCalcWindow && (
        <div className="evt-calc">
          <span>다 같이 되는 시간 <b>{windowLabel(here)}</b></span>
          <button type="button" className="btn evt-calc-btn" onClick={() => onCalcWindow(here)}>이 시간대로 조합 계산</button>
        </div>
      )}
      <details className="evt-was">
        <summary>후보였던 날짜 {rows.length}개</summary>
        <div className="evt-was-b">
          {rows.map((row) => <CandRow key={row.date} ev={ev} row={row} />)}
          {ev.canManage && (
            <button type="button" className="btn evt-reopen" disabled={busy} onClick={reopen}>다시 미정으로</button>
          )}
        </div>
      </details>
    </div>
  );
}
