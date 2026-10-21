import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseAuthReturn } from '../useAuth';
import { GoogleMark, KakaoMark } from './SsoMarks';
import { needJoin } from '../profileGate';
import { JoinPanel, PendingPanel } from './JoinPanel';
import { useBackClose } from '../backStack';

/* 로그인 화면. 다우오피스 로그인처럼 화면 전체를 덮고 가운데 한 줄로 놓는다(§4.55).
   로그인 전에는 카카오·구글·(접힌) 기존 아이디 로그인,
   로그인 뒤 동호회 승인이 안 났으면 같은 화면에서 가입 신청·승인 대기로 이어진다(§4.54). */
export function AuthModal({ auth }: { auth: UseAuthReturn }) {
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const { open, closeAuth } = auth;
  /* 가입 신청 칸에 적은 게 있나 — 있으면 ×·Esc·"나중에 할게요" 로 닫을 때 묻는다(프로필 창과 같게) */
  const joinDirty = useRef(false);
  /* 창은 닫혀도 그려 둔 채라 가입 칸도 남는다 — '예'로 닫으면 이 번호를 올려 칸을 새로 그린다(문구대로 지운다) */
  const [joinGen, setJoinGen] = useState(0);
  const close = useCallback(() => {
    if (joinDirty.current) {
      if (!confirm('적은 내용이 사라져요. 닫을까요?')) return false;
      setJoinGen((n) => n + 1);
    }
    closeAuth();
  }, [closeAuth]);
  /* 뒤로 가기도 같은 길 — 가입 칸에 적은 게 있으면 묻고, 취소하면 창을 둔다 */
  useBackClose(open, close);

  /* 기존 아이디 칸을 펼쳤을 때만 아이디 칸으로 커서를 보낸다 — 열자마자 키보드가 올라오지 않게 */
  useEffect(() => {
    if (auth.open && auth.legacyOpen && !auth.me) setTimeout(() => idRef.current?.focus(), 30);
  }, [auth.open, auth.legacyOpen, auth.me]);

  /* 화면 전체를 덮으니 바깥을 눌러 닫을 곳이 없다 — Esc 와 오른쪽 위 × 로 닫는다 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const status = auth.member?.status;
  let body;
  const joining = !!auth.me && !auth.memberLoading && needJoin(status);
  if (auth.me && auth.memberLoading) {
    body = <><h3>확인하는 중…</h3><p className="msub">가입 상태를 불러오고 있어요.</p>
      <div className="mbtns"><button className="btn" type="button" onClick={auth.closeAuth}>닫기</button></div></>;
  } else if (auth.me && needJoin(status)) {
    body = <JoinPanel key={`${status}${joinGen}`} auth={auth} dirtyRef={joinDirty} onClose={close} />;
  } else if (auth.me && status === 'PENDING') {
    body = <PendingPanel auth={auth} />;
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
        <h3 className="auth-title">로그인</h3>
        <p className="msub auth-intro">
          {auth.inKakaoApp
            ? '카카오톡 안에서 열었어요. 카카오 로그인은 여기서 바로 돼요.'
            : '일정과 빈자리 알림은 운영진 승인 뒤에 쓸 수 있어요.'}
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
        {/* 아이디로 쓰던 사람이 카카오로 바로 들어오면 새 계정이 따로 생긴다 — 질문으로 먼저 붙잡는다 */}
        <details className="legacy" open={auth.legacyOpen} onToggle={e => auth.setLegacyOpen(e.currentTarget.open)}>
          <summary>아이디로 쓰던 계정이 있나요? <b>기존 아이디로 로그인</b></summary>
          <p className="auth-box">
            카카오로 바로 들어오면 새 계정이 따로 만들어져요. <b>먼저 아이디로 들어온 뒤</b> 카카오·구글을 연결해 두세요.
          </p>
          <label className="sr-only" htmlFor="auth-id">아이디</label>
          <input
            id="auth-id" ref={idRef} className="auth-field"
            autoComplete="username" autoCapitalize="off" spellCheck={false} placeholder="아이디"
            value={auth.id} onChange={e => auth.setId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') pwRef.current?.focus(); }}
          />
          <label className="sr-only" htmlFor="auth-pw">비밀번호</label>
          <input
            id="auth-pw" ref={pwRef} className="auth-field"
            type="password" autoComplete="current-password" placeholder="비밀번호"
            value={auth.pw} onChange={e => auth.setPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') auth.submit(); }}
          />
          <button className="btn btn-go legacy-go" type="button" disabled={auth.busy} onClick={auth.submit}>
            {auth.busy ? '잠시만…' : '로그인'}
          </button>
          <p className="mnote"><b>비밀번호를 잊어버리면 찾을 방법이 없어요.</b> 다른 곳에서 쓰는 비밀번호는 쓰지 마세요.</p>
        </details>
      </>
    );
  }

  return (
    <div className={'modal auth-modal' + (open ? ' on' : '') + (joining ? ' auth-join' : '')} role="dialog" aria-modal="true" aria-label="로그인">
      <button className="auth-x" type="button" aria-label="닫기" onClick={close}>×</button>
      <div className="mbox">
        <div className="auth-logo" aria-hidden="true">Flo<span className="dim">duler</span></div>
        {body}
      </div>
    </div>
  );
}
