import { useState } from 'react';
import type { UseAuthReturn } from '../useAuth';
import { ProfileForm } from './MemberViews';

/* 로그인 창 안에서 이어지는 동호회 단계 — 가입 신청 / 승인 대기 / 나간 계정.
   어느 것을 보일지는 AuthModal 이 member.status 로 가른다. */

/* 가입 신청 — 오픈채팅 닉네임과 프로필 전부(§4.11, 전부 필수). 거절된 뒤 다시 신청하면 지난 값으로 채워 둔다.
   옛 서버는 profile 을 모르고 무시하므로 그대로 보낸다. */
export function JoinPanel({ auth }: { auth: UseAuthReturn }) {
  const rejected = auth.member?.status === 'REJECTED';

  return (
    <>
      <h3>동호회 가입 신청</h3>
      {rejected && <p className="auth-box warn">지난 신청이 거절됐어요. 운영진과 이야기한 뒤 다시 신청해 주세요.</p>}
      <p className="msub">
        로그인됐어요. 오픈채팅방에서 쓰는 닉네임과 프로필을 적어 주세요. 운영진이 닉네임을 보고 승인하면
        동호회 일정과 빈자리 알림을 쓸 수 있어요. 프로필은 승인된 멤버들에게 보여요.
      </p>
      <ProfileForm
        seed={{ nickname: auth.member?.nickname ?? null, profile: auth.member?.profile }} nickLabel="오픈채팅 닉네임" nickHint="운영진이 알아볼 수 있게 채팅방 닉네임 그대로"
        submitLabel="가입 신청" playedCount={null} autoFocus
        onSubmit={(nickname, profile) => auth.join(nickname, profile)} onCancel={auth.closeAuth} cancelLabel="나중에 할게요"
      />
    </>
  );
}

export function PendingPanel({ auth }: { auth: UseAuthReturn }) {
  const nick = auth.member?.nickname ?? null;
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  /* 승인되면 member 가 바뀌어 이 패널이 사라진다. 여전히 대기면 짧게 알려 준다 */
  async function recheck() {
    setChecking(true); setNote('');
    try {
      const m = await auth.recheckMember();
      if (!m) setNote('확인하지 못했어요. 잠시 뒤에 다시 해 주세요.');
      else if (m.status === 'PENDING') setNote('아직 승인 전이에요.');
    } finally { setChecking(false); }
  }
  return (
    <>
      <h3>승인을 기다리고 있어요</h3>
      <p className="msub">
        운영진에게 카톡으로 "가입 신청했어요"라고 알려 주세요. 승인되면 캘린더와 빈자리 알림이 열려요.
      </p>
      {nick && <p className="auth-hint">신청한 닉네임: {nick}</p>}
      {note && !checking && <p className="auth-hint" role="status">{note}</p>}
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
