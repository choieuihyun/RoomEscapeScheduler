import { useEffect, useRef } from 'react';
import type { UseAuthReturn } from '../useAuth';
import { GoogleMark, KakaoMark } from './SsoMarks';
import { JoinPanel, PendingPanel, RemovedPanel } from './JoinPanel';

/* 로그인 모달. 로그인 전에는 카카오·구글·(접힌) 기존 아이디 로그인,
   로그인 뒤 동호회 승인이 안 났으면 같은 창에서 가입 신청·승인 대기로 이어진다(§4.54). */
export function AuthModal({ auth }: { auth: UseAuthReturn }) {
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  /* 기존 아이디 칸을 펼쳤을 때만 아이디 칸으로 커서를 보낸다 — 열자마자 키보드가 올라오지 않게 */
  useEffect(() => {
    if (auth.open && auth.legacyOpen && !auth.me) setTimeout(() => idRef.current?.focus(), 30);
  }, [auth.open, auth.legacyOpen, auth.me]);

  const status = auth.member?.status;
  let body;
  if (auth.me && auth.memberLoading) {
    body = <><h3>확인하는 중…</h3><p className="msub">동호회 가입 상태를 불러오고 있어요.</p></>;
  } else if (auth.me && (status === 'NONE' || status === 'REJECTED')) {
    body = <JoinPanel key={status} auth={auth} />;
  } else if (auth.me && status === 'PENDING') {
    body = <PendingPanel auth={auth} />;
  } else if (auth.me && status === 'REMOVED') {
    body = <RemovedPanel auth={auth} />;
  } else if (auth.me) {
    body = (
      <>
        <h3>로그인됐어요</h3>
        <div className="mbtns"><button className="btn" type="button" onClick={auth.closeAuth}>닫기</button></div>
      </>
    );
  } else {
    body = (
      <>
        <h3>로그인</h3>
        <p className="msub">
          {auth.inKakaoApp
            ? '카카오톡 안에서 열었어요. 카카오 로그인은 여기서 바로 돼요.'
            : '동호회 일정과 빈자리 알림은 로그인하고 운영진 승인을 받은 뒤에 쓸 수 있어요.'}
        </p>
        <p className="auth-box warn">
          <b>아이디로 쓰던 계정이 있으면</b> 먼저 '기존 아이디로 로그인'으로 들어온 뒤 카카오·구글을 연결하세요.
          카카오로 바로 들어오면 새 계정이 따로 만들어져요.
        </p>
        <div className="sso">
          <button className="sso-btn sso-kakao" type="button" disabled={auth.busy} onClick={auth.loginKakao}>
            <KakaoMark />카카오 로그인
          </button>
          {auth.inKakaoApp ? (
            <p className="auth-box">
              구글 로그인은 카카오톡 안에서는 안 돼요 — 오른쪽 위 <b>⋮</b> → <b>다른 브라우저로 열기</b>를 누른 뒤
              거기서 구글로 로그인해 주세요.
            </p>
          ) : (
            <button className="sso-btn sso-google" type="button" disabled={auth.busy} onClick={auth.loginGoogle}>
              <GoogleMark />Google 계정으로 로그인
            </button>
          )}
        </div>
        <p className="merr" role="alert">{auth.err}</p>
        <details className="legacy" open={auth.legacyOpen} onToggle={e => auth.setLegacyOpen(e.currentTarget.open)}>
          <summary>기존 아이디로 로그인</summary>
          <div className="mrow">
            <label htmlFor="auth-id">아이디</label>
            <input
              id="auth-id" ref={idRef}
              autoComplete="username" autoCapitalize="off" spellCheck={false} placeholder="englishman"
              value={auth.id} onChange={e => auth.setId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') pwRef.current?.focus(); }}
            />
          </div>
          <div className="mrow">
            <label htmlFor="auth-pw">비밀번호 <span className="dim">(6자 이상)</span></label>
            <input
              id="auth-pw" ref={pwRef}
              type="password" autoComplete="current-password" placeholder="••••••"
              value={auth.pw} onChange={e => auth.setPw(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') auth.submit(); }}
            />
          </div>
          <button className="btn legacy-go" type="button" disabled={auth.busy} onClick={auth.submit}>
            {auth.busy ? '잠시만…' : '아이디로 로그인'}
          </button>
          <p className="auth-hint">새 가입은 카카오·구글로만 받아요. 아이디 계정은 로그인한 뒤 카카오·구글을 연결해 두세요.</p>
          <p className="mnote"><b>비밀번호를 잊어버리면 찾을 방법이 없어요.</b> 다른 곳에서 쓰는 비밀번호는 쓰지 마세요.</p>
        </details>
        <div className="mbtns end">
          <button className="btn" type="button" onClick={auth.closeAuth}>닫기</button>
        </div>
      </>
    );
  }

  return (
    <div
      className={'modal auth-modal' + (auth.open ? ' on' : '')}
      onClick={e => { if (e.target === e.currentTarget) auth.closeAuth(); }}
    >
      <div className="mbox">{body}</div>
    </div>
  );
}
