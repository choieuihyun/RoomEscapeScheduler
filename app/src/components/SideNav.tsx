import { useState, type ReactNode } from 'react';
import type { UseAuthReturn } from '../useAuth';
import type { View } from '../useView';
import { AcctWidget } from './AcctWidget';

/* 왼쪽 메뉴(§4.49) — 그룹웨어식 LNB. 위는 로고와 화면 메뉴, 아래는 도구(사용법·
   다크 모드·계정). 좁은 화면에선 CSS 가 위쪽 가로 막대로 접는다. 아이콘은 직접 그린
   24px 선 아이콘이다(참고 사이트의 아이콘은 가져오지 않는다). */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="lnb-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcHome = () => <Icon><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10M10 20v-5.5h4V20" /></Icon>;
const IcCalc = () => <Icon><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2" /></Icon>;
const IcCal = () => <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>;
const IcPeople = () => <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.4c1.9.8 3 2.7 3 5.6" /></Icon>;
const IcBell = () => <Icon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Icon>;
const IcHelp = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></Icon>;
const IcMoon = () => <Icon><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Icon>;
const IcFold = ({ open }: { open: boolean }) => <Icon>{open ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}</Icon>;
const IcSun = () => <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;

/* 접기(§4.50) — 아이콘만 남는 좁은 막대. 이 기기에서만 기억하는 편의 설정이다. */
const FOLD_KEY = 'flod.lnb.folded';
const readFold = () => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } };

export function SideNav({
  view, onView, auth, homeOn, watchCount, watchLimit, onWatches, onTour, dark, onToggleTheme, isAdmin, pendingCount, children,
}: {
  view: View | null; onView: (v: View) => void; auth: UseAuthReturn;
  /* 승인 멤버(이고 일정 API 가 있을 때)만 "홈" 메뉴 */
  homeOn: boolean;
  watchCount: number; watchLimit: number; onWatches: () => void;
  onTour: () => void; dark: boolean; onToggleTheme: () => void;
  /* 운영진에게만 "멤버 관리" 메뉴와 승인 대기 숫자 */
  isAdmin: boolean; pendingCount: number;
  /* 화면별로 메뉴 아래에 붙는 것 — 캘린더 화면의 미니 달력·내 캘린더(§4.50) */
  children?: ReactNode;
}) {
  const [folded, setFolded] = useState(readFold);
  const toggleFold = () => setFolded(f => {
    try { localStorage.setItem(FOLD_KEY, f ? '0' : '1'); } catch { /* 기억 못 해도 접기는 된다 */ }
    return !f;
  });
  /* 로그인했지만 아직 승인 전이면 동호회 메뉴에 "승인 후" 꼬리표를 단다 */
  const gated = !!auth.me && auth.member !== null && auth.member.status !== 'APPROVED';
  const item = (v: View) => 'lnb-item' + (view === v ? ' on' : '');
  return (
    <aside className={'lnb' + (folded ? ' folded' : '')}>
      <div className="lnb-top">
        <div className="lnb-logo">{folded ? <span className="dim">F</span> : <>Flo<span className="dim">duler</span></>}</div>
        <button className="lnb-fold" type="button" onClick={toggleFold}
          aria-label={folded ? '메뉴 펼치기' : '메뉴 접기'} title={folded ? '메뉴 펼치기' : '메뉴 접기'}>
          <IcFold open={!folded} />
        </button>
      </div>
      <nav className="lnb-menu" aria-label="메뉴">
        {homeOn && (
          <button className={item('home')} type="button" onClick={() => onView('home')} title="홈"
            aria-current={view === 'home' ? 'page' : undefined}>
            <IcHome /><span className="lnb-txt">홈</span>
          </button>
        )}
        <button className={item('calc')} type="button" onClick={() => onView('calc')} title="조합 계산"
          aria-current={view === 'calc' ? 'page' : undefined}>
          <IcCalc /><span className="lnb-txt">조합 계산</span>
        </button>
        {auth.cloudOn && (
          <button className={item('calendar')} type="button" onClick={() => onView('calendar')} title="캘린더"
            aria-current={view === 'calendar' ? 'page' : undefined}>
            <IcCal /><span className="lnb-txt">캘린더</span>
            {gated && <span className="lnb-tag">승인 후</span>}
          </button>
        )}
        {auth.cloudOn && (
          <button className="lnb-item" type="button" onClick={onWatches} title="빈자리 알림">
            <IcBell /><span className="lnb-txt">빈자리 알림</span>
            {gated ? <span className="lnb-tag">승인 후</span> : <span className="lnb-count">{watchCount}/{watchLimit}</span>}
          </button>
        )}
        {isAdmin && (
          <button className={item('members')} type="button" onClick={() => onView('members')} title="멤버 관리"
            aria-current={view === 'members' ? 'page' : undefined}>
            <IcPeople /><span className="lnb-txt">멤버 관리</span>
            {pendingCount > 0 && <span className="lnb-badge" aria-label={`승인 대기 ${pendingCount}명`}>{pendingCount}</span>}
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
  );
}
