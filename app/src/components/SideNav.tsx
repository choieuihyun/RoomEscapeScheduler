import { useRef, useState, type ReactNode } from 'react';
import { bottomTabs, type BottomTabId } from '../bottomTabs';
import type { UseAuthReturn } from '../useAuth';
import type { View } from '../useView';
import { AcctWidget } from './AcctWidget';
import { Avatar } from './Avatar';

/* 왼쪽 메뉴(§4.49) — 그룹웨어식 LNB. 위는 로고와 화면 메뉴, 아래는 도구(사용법·
   다크 모드·계정). 좁은 화면에선 CSS 가 위쪽 가로 막대로 접고, 화면 메뉴는 아래 탭(§4.59)으로
   옮긴다 — 두 마크업을 같이 그리고 폭에 따라 CSS 가 한쪽을 display:none 한다.
   좁은 화면 위쪽 막대엔 로고와 내 이름 단추(아바타 + "○○ 님", 누르면 더보기)만 남고
   도구(사용법·다크 모드·연결·로그아웃)는 더보기 안으로 옮긴다(§4.60). 아이콘은 직접 그린
   24px 선 아이콘이다(참고 사이트의 아이콘은 가져오지 않는다). */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="lnb-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcHome = () => <Icon><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10M10 20v-5.5h4V20" /></Icon>;
const IcCalc = () => <Icon><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2" /></Icon>;
const IcCal = () => <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>;
const IcPeople = () => <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.4c1.9.8 3 2.7 3 5.6" /></Icon>;
const IcMe = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5" /></Icon>;
const IcBell = () => <Icon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Icon>;
const IcHelp = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></Icon>;
const IcMoon = () => <Icon><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Icon>;
const IcFold = ({ open }: { open: boolean }) => <Icon>{open ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}</Icon>;
const IcMore = () => <Icon><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></Icon>;
const IcSun = () => <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;

/* 접기(§4.50) — 아이콘만 남는 좁은 막대. 이 기기에서만 기억하는 편의 설정이다. */
const FOLD_KEY = 'flod.lnb.folded';
const readFold = () => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } };

export function SideNav({
  view, onView, auth, homeOn, profileOn, watchCount, watchLimit, onWatches, onTour, dark, onToggleTheme, isAdmin, pendingCount, children,
}: {
  view: View | null; onView: (v: View) => void; auth: UseAuthReturn;
  /* 승인 멤버(이고 일정 API 가 있을 때)만 "홈" 메뉴 */
  homeOn: boolean;
  /* 승인 멤버이고 서버가 해 본 테마 API 를 알 때만 "내 정보" 메뉴 */
  profileOn: boolean;
  watchCount: number; watchLimit: number; onWatches: () => void;
  onTour: () => void; dark: boolean; onToggleTheme: () => void;
  /* 운영진에게만 "멤버 관리" 메뉴와 승인 대기 숫자 */
  isAdmin: boolean; pendingCount: number;
  /* 화면별로 메뉴 아래에 붙는 것 — 캘린더 화면의 미니 달력·내 캘린더(§4.50) */
  children?: ReactNode;
}) {
  const [folded, setFolded] = useState(readFold);
  /* 접기·펴기를 누른 직후 잠깐만 .anim — 전환은 이 클래스가 있을 때만 돈다(첫 화면의 접힘 복원·화면 이동엔 안 돈다) */
  const [anim, setAnim] = useState(false);
  const animT = useRef(0);
  const toggleFold = () => {
    setAnim(true);
    clearTimeout(animT.current);
    animT.current = window.setTimeout(() => setAnim(false), 500);
    setFolded(f => {
      try { localStorage.setItem(FOLD_KEY, f ? '0' : '1'); } catch { /* 기억 못 해도 접기는 된다 */ }
      return !f;
    });
  };
  /* 로그인했지만 아직 승인 전이면 동호회 메뉴에 "승인 후" 꼬리표를 단다 */
  const gated = !!auth.me && auth.member !== null && auth.member.status !== 'APPROVED';
  const item = (v: View) => 'lnb-item' + (view === v ? ' on' : '');
  const tabs = bottomTabs({ homeOn, cloudOn: auth.cloudOn, isAdmin, gated, pendingCount, watchCount, view });
  const tabIcon: Partial<Record<BottomTabId, ReactNode>> = {
    home: <IcHome />, calc: <IcCalc />, calendar: <IcCal />, watches: <IcBell />, more: <IcMore />,
  };
  /* 좁은 화면 위쪽 막대 오른쪽 — 로그인 복원 중엔 "로그인"을 잠깐 보였다 되돌리지 않는다(AcctWidget 과 같게) */
  const m = auth.member;
  const myName = m?.nickname || auth.me?.id || '가입 전';
  const myChip = m?.status === 'PENDING' ? { cls: 'warn', text: '승인 대기' }
    : m?.status === 'APPROVED' && m.role === 'ADMIN' ? { cls: 'role', text: '운영진' } : null;
  const meSlot = !auth.cloudOn ? null
    : auth.authLoading ? <span className="lnb-me-wait">확인 중…</span>
    : !auth.me ? <button className="btn lnb-login" type="button" onClick={() => auth.openAuth()}>로그인</button>
    : (
      <button className={'lnb-me' + (view === 'more' ? ' on' : '')} type="button" onClick={() => onView('more')} title="더보기"
        aria-label={`${myName}${m?.nickname || auth.me.id ? ' 님' : ''}${myChip ? ' ' + myChip.text : ''}, 더보기 열기`}
        aria-current={view === 'more' ? 'page' : undefined}>
        <Avatar name={myName} photo={auth.me.photo} />
        <span className="lnb-me-n">{myName}{m?.nickname || auth.me.id ? ' 님' : ''}</span>
        {myChip && <span className={'chip-info lnb-me-chip ' + myChip.cls}>{myChip.text}</span>}
      </button>
    );
  return (<>
    <aside className={'lnb' + (folded ? ' folded' : '') + (anim ? ' anim' : '') + (tabs.length ? ' has-bnav' : '')}>
      <div className="lnb-top">
        {/* 로고 = 홈으로(홈을 못 쓰면 시간표 계산) — 겉모양은 글자 그대로, 포커스 고리만 */}
        <button type="button" className="lnb-logo" aria-label="홈으로" onClick={() => onView(homeOn ? 'home' : 'calc')}>
          {folded ? <span className="dim">F</span> : <>Flo<span className="dim">duler</span></>}
        </button>
        <button className="lnb-fold" type="button" onClick={toggleFold}
          aria-label={folded ? '메뉴 펼치기' : '메뉴 접기'} title={folded ? '메뉴 펼치기' : '메뉴 접기'}>
          <IcFold open={!folded} />
        </button>
      </div>
      {meSlot && <div className="lnb-me-slot">{meSlot}</div>}
      <nav className="lnb-menu" aria-label="메뉴">
        {homeOn && (
          <button className={item('home')} type="button" onClick={() => onView('home')} title="홈"
            aria-current={view === 'home' ? 'page' : undefined}>
            <IcHome /><span className="lnb-txt">홈</span>
          </button>
        )}
        <button className={item('calc')} type="button" onClick={() => onView('calc')} title="시간표 계산"
          aria-current={view === 'calc' ? 'page' : undefined}>
          <IcCalc /><span className="lnb-txt">시간표 계산</span>
        </button>
        {auth.cloudOn && (
          <button className={item('calendar')} type="button" onClick={() => onView('calendar')} title="캘린더"
            aria-current={view === 'calendar' ? 'page' : undefined}>
            <IcCal /><span className="lnb-txt">캘린더</span>
            {gated && <span className="chip-info muted lnb-tag">승인 후</span>}
          </button>
        )}
        {auth.cloudOn && (
          <button className="lnb-item" type="button" onClick={onWatches} title="빈자리 알림">
            <IcBell /><span className="lnb-txt">빈자리 알림</span>
            {gated ? <span className="chip-info muted lnb-tag">승인 후</span> : <span className="badge-n muted lnb-count">{watchCount}/{watchLimit}</span>}
          </button>
        )}
        {profileOn && (
          <button className={item('profile')} type="button" onClick={() => onView('profile')} title="내 정보"
            aria-current={view === 'profile' ? 'page' : undefined}>
            <IcMe /><span className="lnb-txt">내 정보</span>
          </button>
        )}
        {isAdmin && (
          <button className={item('members')} type="button" onClick={() => onView('members')} title="멤버 관리"
            aria-current={view === 'members' ? 'page' : undefined}>
            <IcPeople /><span className="lnb-txt">멤버 관리</span>
            {pendingCount > 0 && <span className="badge-n lnb-badge" aria-label={`승인 대기 ${pendingCount}명`}>{pendingCount}</span>}
          </button>
        )}
      </nav>
      {!folded && children}
      <div className="lnb-foot">
        <button className="lnb-item lnb-tool" type="button" onClick={onTour} title="사용법 보기">
          <IcHelp /><span className="lnb-txt">사용법 보기</span>
        </button>
        <button className="lnb-item lnb-tool" type="button" onClick={onToggleTheme} title={dark ? '라이트 모드' : '다크 모드'}>
          {dark ? <IcSun /> : <IcMoon />}<span className="lnb-txt">{dark ? '라이트 모드' : '다크 모드'}</span>
        </button>
        <div className="lnb-acct acct"><AcctWidget auth={auth} /></div>
      </div>
    </aside>
    {tabs.length > 0 && (
      <nav className="bnav" aria-label="메뉴">
        {tabs.map(t => (
          <button key={t.id} type="button" className={'bnav-i' + (t.on ? ' on' : '') + (t.gated ? ' gated' : '')}
            onClick={t.id === 'watches' ? onWatches : () => onView(t.id as View)} aria-current={t.on ? 'page' : undefined}>
            {tabIcon[t.id]}<span className="bnav-t">{t.label}</span>
            {t.gated && <span className="sr-only">승인 후</span>}
            {!t.gated && !!t.count && <span className="badge-n muted bnav-n">{t.count}</span>}
            {t.pending && <span className="bnav-dot" role="img" aria-label={`승인 대기 ${t.pending}명`} />}
          </button>
        ))}
      </nav>
    )}
  </>);
}
