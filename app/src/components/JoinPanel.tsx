import { useState } from 'react';
import type { UseAuthReturn } from '../useAuth';
import { sayClub } from '../server';

/* 로그인 창 안에서 이어지는 동호회 단계 — 가입 신청 / 승인 대기 / 나간 계정.
   어느 것을 보일지는 AuthModal 이 member.status 로 가른다. */

/* 서버(§4.6)와 같은 셈법: 앞뒤 공백을 떼고 코드 포인트로 1~20자 */
const NICK_MAX = 20;
const nickLength = (s: string) => [...s.trim()].length;

export function JoinPanel({ auth }: { auth: UseAuthReturn }) {
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const len = nickLength(nick);
  const rejected = auth.member?.status === 'REJECTED';
  const over = len > NICK_MAX;
  const ok = len >= 1 && !over;

  async function submit() {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    try { await auth.join(nick.trim()); }
    catch (e) { setErr(sayClub(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h3>동호회 가입 신청</h3>
      {rejected && <p className="auth-box warn">지난 신청이 거절됐어요. 운영진과 이야기한 뒤 다시 신청해 주세요.</p>}
      <p className="msub">
        로그인됐어요. 오픈채팅방에서 쓰는 닉네임을 적어 주세요. 운영진이 닉네임을 보고 승인하면
        동호회 일정과 빈자리 알림을 쓸 수 있어요.
      </p>
      <div className="mrow">
        <label htmlFor="join-nick">오픈채팅 닉네임</label>
        <input
          id="join-nick" autoFocus autoComplete="off" spellCheck={false} placeholder="채팅방 닉네임"
          value={nick} onChange={e => setNick(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <span className={'auth-hint' + (over ? ' bad' : '')}>
          {over ? `닉네임은 ${NICK_MAX}자까지 쓸 수 있어요 (지금 ${len}자)`
            : len === 0 ? '1~20자 · 운영진이 알아볼 수 있게 채팅방 닉네임 그대로'
            : `${len}/${NICK_MAX}자`}
        </span>
      </div>
      <p className="merr">{err}</p>
      <div className="mbtns col">
        <button className="btn-go" type="button" disabled={!ok || busy} onClick={submit}>
          {busy ? '잠시만…' : '가입 신청'}
        </button>
        <button className="btn" type="button" onClick={auth.closeAuth}>나중에 할게요</button>
      </div>
    </>
  );
}

export function PendingPanel({ auth }: { auth: UseAuthReturn }) {
  const nick = auth.member?.nickname ?? null;
  const [checking, setChecking] = useState(false);
  const [still, setStill] = useState(false);
  /* 승인되면 member 가 바뀌어 이 패널이 사라진다. 여전히 대기면 짧게 알려 준다 */
  async function recheck() {
    setChecking(true); setStill(false);
    try { await auth.refreshMember(); setStill(true); }
    finally { setChecking(false); }
  }
  return (
    <>
      <h3>승인을 기다리고 있어요</h3>
      <p className="msub">
        운영진에게 카톡으로 "가입 신청했어요"라고 알려 주세요. 승인되면 캘린더와 빈자리 알림이 열려요.
      </p>
      {nick && <p className="auth-hint">신청한 닉네임: {nick}</p>}
      {still && !checking && <p className="auth-hint" role="status">아직 승인 전이에요.</p>}
      <div className="mbtns">
        <button className="btn" type="button" disabled={checking} onClick={recheck}>
          {checking ? '확인 중…' : '다시 확인'}
        </button>
        <button className="btn" type="button" onClick={auth.closeAuth}>닫기</button>
      </div>
    </>
  );
}

export function RemovedPanel({ auth }: { auth: UseAuthReturn }) {
  return (
    <>
      <h3>동호회 계정</h3>
      <p className="msub">동호회에서 나간 계정이에요.</p>
      <div className="mbtns"><button className="btn" type="button" onClick={auth.closeAuth}>닫기</button></div>
    </>
  );
}
