import { useState } from 'react';
import { needJoin } from '../profileGate';
import type { UseAuthReturn } from '../useAuth';
import { Avatar } from './Avatar';
import { GoogleMark, KakaoMark } from './SsoMarks';

/* 왼쪽 메뉴 아래 계정 자리 — 닉네임·상태 칩·로그아웃, 아이디 계정이면 카카오·구글 연결 상자(§4.54).
   접힌 메뉴·좁은 화면에선 이름 대신 동그란 머리글자만 두고, 연결 상자는 눌러야 뜨는 작은 창이 된다. */
/* onEditProfile: 프로필을 고칠 수 있을 때(가입 신청한 사람·승인 멤버이고 서버가 프로필을 알 때) — 넓은 화면에서 승인 전에도 내 프로필을 볼 곳 */
export function AcctWidget({ auth, onEditProfile }: { auth: UseAuthReturn; onEditProfile?: () => void }) {
  const [linkOpen, setLinkOpen] = useState(false);
  /* 연결 실패 문구가 오면 팝업(접힌 메뉴·좁은 화면)을 저절로 펴서 보이게 한다. 사용자가 닫은 문구는 다시 안 편다 */
  const [closedErr, setClosedErr] = useState('');
  const popOpen = linkOpen || (!!auth.linkErr && closedErr !== auth.linkErr);

  if (!auth.cloudOn) {
    return (
      <span title="firebase-config.js가 비어 있습니다. README의 '계정 만들고 일정 저장하기' 참고">
        일정 저장 꺼짐
      </span>
    );
  }
  /* 로그인 상태를 아직 복원 중이면 "로그인" 버튼을 잠깐 보여줬다 되돌리지
     않는다 — 실제론 로그아웃된 적 없는데 로그아웃된 것처럼 보이는 깜빡임. */
  if (auth.authLoading) return <span>확인 중…</span>;

  if (!auth.me) {
    return (
      <>
        <span>일정을 저장해 두려면</span>
        <button className="btn" type="button" onClick={() => auth.openAuth()}>로그인</button>
      </>
    );
  }

  const m = auth.member;
  const nickname = m?.nickname ?? null;
  const name = nickname || auth.me.id || '가입 전';
  const role = m?.role ?? null;
  const chip = m?.status === 'PENDING' ? { cls: 'warn', text: '승인 대기' }
    : m?.status === 'APPROVED' && role === 'ADMIN' ? { cls: 'role', text: '운영진' }
    : null;

  const isPassword = auth.providerIds.includes('password');
  const googleLinked = auth.providerIds.includes('google.com');
  /* 카카오 연결은 서버 일이라 서버가 동호회 기능을 모르면(member null) 그 줄은 빼고 본다 */
  const kakaoDone = m === null ? true : m.kakaoLinked;
  const showLink = isPassword && !(googleLinked && kakaoDone);

  return (
    <div className={'acct-wrap' + (popOpen ? ' open' : '')}>
      <div className="acct-id">
        <Avatar name={name} photo={auth.me.photo} className="acct-ava" />
        <div className="acct-who">
          <b title={name}>{name}{nickname || auth.me.id ? ' 님' : ''}</b>
          {chip && <span className={'chip-info ' + chip.cls}>{chip.text}</span>}
          {nickname && auth.me.id && <span className="acct-sub">아이디: {auth.me.id}</span>}
        </div>
      </div>
      {onEditProfile && (
        <button className="acct-prof" type="button" onClick={onEditProfile}>{m?.profile ? '프로필 고치기' : '프로필 채우기'}</button>
      )}
      {needJoin(m?.status) && (
        <button className="btn acct-join" type="button" onClick={() => auth.openAuth()}>가입 신청</button>
      )}
      {showLink && (
        <>
          <button className="btn acct-linkbtn" type="button" aria-expanded={popOpen}
            onClick={() => { if (popOpen) { setLinkOpen(false); setClosedErr(auth.linkErr); } else setLinkOpen(true); }}>연결</button>
          <div className="acct-link">
            <b>카카오·구글을 연결해 두세요</b>
            <span>연결하면 다음부터 버튼 한 번으로 들어와요. 지금 일정과 빈자리 알림은 그대로 이어져요.</span>
            {m !== null && (m.kakaoLinked
              ? <div className="sso-done">✓ 카카오 연결됨</div>
              : <button className="sso-btn sso-kakao sm" type="button" onClick={auth.linkKakao}><KakaoMark />카카오 연결</button>)}
            {googleLinked
              ? <div className="sso-done">✓ 구글 연결됨</div>
              : <button className="sso-btn sso-google sm" type="button" onClick={auth.linkGoogle}><GoogleMark />구글 연결</button>}
            {auth.linkErr && <p className="merr" role="alert">{auth.linkErr}</p>}
          </div>
        </>
      )}
      <button className="btn acct-out" type="button" onClick={auth.logout}>로그아웃</button>
    </div>
  );
}
