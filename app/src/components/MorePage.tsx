import { hist } from '../backStack';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PayCard, useClubStore } from '../clubStore';
import { moreGroups, type MoreRow, type MoreRowId } from '../moreRows';
import type { EventDto } from '../server';
import type { UseAuthReturn } from '../useAuth';
import { withoutPending, type UseProfileReturn } from '../useProfile';
import type { UsePushDeviceReturn } from '../usePushDevice';
import type { View } from '../useView';
import { Avatar } from './Avatar';
import { ProfileFacts } from './MemberViews';
import { PastCard, PlayedCard, PushCard } from './ProfilePage';
import { GoogleMark, KakaoMark } from './SsoMarks';

/* 좁은 화면(≤900px)의 더보기(§4.60) — 설정 앱 같은 목록. 위는 프로필 카드, 아래는 그룹별 행.
   해 본 테마·지난 일정·이 기기 알림은 하위 화면으로 들어가고(내 정보의 카드를 그대로 쓴다),
   하위 화면마다 기록을 하나 쌓아(history.state.moreSub) 폰의 뒤로 가기가 목록으로 돌아오게 한다. */

type Sub = 'played' | 'past' | 'push' | 'pay';
const SUB_TITLE: Record<Sub, string> = { played: '해 본 테마', past: '지난 일정', push: '이 기기 알림', pay: '송금 정보' };
const readSub = (): Sub | null => {
  const v = (history.state as { moreSub?: string } | null)?.moreSub;
  return v === 'played' || v === 'past' || v === 'push' || v === 'pay' ? v : null;
};

const Ic = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON: Partial<Record<MoreRowId, ReactNode>> = {
  played: <Ic><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.8" /></Ic>,
  past: <Ic><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 3.5v5h5M12 7.5V12l3 2" /></Ic>,
  push: <Ic><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Ic>,
  pay: <Ic><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10.5h18M7 15h4" /></Ic>,
  together: <Ic><path d="M5 21V4h11l-1.6 4L16 12H5" /></Ic>,
  people: <Ic><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.4c1.9.8 3 2.7 3 5.6" /></Ic>,
  ranking: <Ic><path d="M5 20v-8M12 20V5M19 20v-5" /></Ic>,
  members: <Ic><circle cx="10" cy="8" r="4" /><path d="M3 21c0-4 3-7 7-7 1.4 0 2.7.4 3.8 1M15 18.5l2 2 4-4" /></Ic>,
  dark: <Ic><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Ic>,
  tour: <Ic><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></Ic>,
  kakao: <span className="more-kakao"><KakaoMark /></span>,
  google: <GoogleMark />,
  join: <Ic><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M19 8v6M16 11h6" /></Ic>,
};

const Chev = (
  <svg className="more-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
);

/* 이 기기 알림 행의 상태 칩 — 내 정보 카드의 칩을 짧게 */
const PUSH_CHIP: Record<NonNullable<UsePushDeviceReturn['card']>, { text: string; cls: string }> = {
  '켜짐': { text: '켜짐', cls: 'ok' },
  '꺼짐': { text: '꺼짐', cls: 'muted' },
  '거부됨': { text: '거부됨', cls: 'warn' },
  'ios-install': { text: '추가 필요', cls: 'muted' },
  'kakao-inapp': { text: '지원 안 함', cls: 'muted' },
  'unsupported': { text: '지원 안 함', cls: 'muted' },
};

export function MorePage({
  active, auth, profile, profileOn, clubOn, isAdmin, pendingCount, push, dark, onToggleTheme, onTour, onMembers, onOpenEvent,
  peopleOn, rankOn, onView, onEditProfile,
}: {
  /* 지금 더보기 화면인지 — 아래 탭으로 다시 들어오면 목록부터 보인다 */
  active: boolean;
  auth: UseAuthReturn; profile: UseProfileReturn; profileOn: boolean; clubOn: boolean;
  isAdmin: boolean; pendingCount: number; push: UsePushDeviceReturn;
  dark: boolean; onToggleTheme: () => void; onTour: () => void;
  onMembers: () => void; onOpenEvent: (ev: EventDto) => void;
  peopleOn: boolean; rankOn: boolean; onView: (v: View) => void;
  /* 프로필 고치기(§4.11) — 서버가 고치기를 모르거나 가입 신청 전이면 없다 */
  onEditProfile?: () => void;
}) {
  const [sub, setSub] = useState<Sub | null>(readSub);
  useEffect(() => {
    const on = () => setSub(readSub());
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  /* 아래 탭·위쪽 이름 단추로 들어오면 기록에 moreSub 가 없어 목록, 뒤로 가기로 오면 그 하위 화면 */
  if (active && sub !== readSub()) setSub(readSub());

  /* 하위 화면에 들어가면 제목으로, 나오면 누른 행으로 포커스 — 맨 위부터 보이게 */
  const listRef = useRef<HTMLDivElement>(null);
  const subH = useRef<HTMLHeadingElement>(null);
  const prevSub = useRef<Sub | null>(sub);
  useEffect(() => {
    const prev = prevSub.current;
    prevSub.current = sub;
    if (!active || prev === sub) return;
    window.scrollTo({ top: 0 });
    if (sub) subH.current?.focus();
    else if (prev) listRef.current?.querySelector<HTMLElement>(`[data-row="${prev}"]`)?.focus();
  }, [sub, active]);

  const openSub = (s: Sub) => { hist.push({ moreSub: s }, location.href); setSub(s); };
  const back = () => { if (readSub()) hist.back(); else setSub(null); };

  const m = auth.member;
  const loggedIn = !!auth.me;
  /* 같이 가요(§4.12)·송금 정보(§4.13) — 서버가 그 API 를 아는지는 공유 상태가 안다 */
  const club7 = useClubStore();
  const groups = moreGroups({ loggedIn, profileOn, clubOn, isAdmin, member: m, providerIds: auth.providerIds, peopleOn, rankOn,
    togetherOn: clubOn && club7.wishApi === 'on', payOn: clubOn && club7.settleApi === 'on' });
  /* 하위 화면은 그 그룹이 보일 때만 — 로그아웃했으면 목록으로 */
  const subOk = sub !== null && (sub === 'push' ? loggedIn && clubOn : sub === 'pay' ? loggedIn && clubOn && club7.settleApi === 'on' : loggedIn && profileOn);

  if (subOk) {
    return (
      <div className="more more-sub">
        <header className="more-sub-h">
          <button type="button" className="page-back more-back" onClick={back}>
            <span aria-hidden="true">‹</span> 더보기
          </button>
          <h1 ref={subH} tabIndex={-1}>
            {SUB_TITLE[sub]}
            {sub === 'played' && profile.played !== null && (
              <span className="more-sub-n">{withoutPending(profile.played, profile.pendingIds).length}개</span>
            )}
          </h1>
        </header>
        {sub === 'played' && <PlayedCard profile={profile} />}
        {sub === 'past' && <PastCard profile={profile} onOpenEvent={onOpenEvent} />}
        {sub === 'push' && <PushCard push={push} />}
        {sub === 'pay' && <PayCard />}
      </div>
    );
  }

  const name = m?.nickname || auth.me?.id || '가입 전';
  const chip = m?.status === 'PENDING' ? { cls: 'warn', text: '승인 대기' }
    : m?.status === 'APPROVED' ? (m.role === 'ADMIN' ? { cls: 'role', text: '운영진' } : { cls: '', text: '멤버' })
    : null;
  /* 로그인 수단 줄 — 내 정보 카드와 같은 규칙 */
  const linked = [...(m?.kakaoLinked ? ['카카오'] : []), ...(auth.providerIds.includes('google.com') ? ['구글'] : [])];
  const linkLine = linked.length > 0 ? `${linked.join(' · ')} 연결됨`
    : auth.providerIds.includes('password') ? '아이디로 로그인해요' : '';
  const kept = profile.played === null ? null : withoutPending(profile.played, profile.pendingIds);
  const playedN = kept === null ? '–' : String(kept.length);
  const pastN = profile.pastTotal === null ? '–' : String(profile.pastTotal);
  const pushChip = push.card === null ? { text: '확인 중', cls: 'muted' } : PUSH_CHIP[push.card];

  const act: Partial<Record<MoreRowId, () => void>> = {
    played: () => openSub('played'), past: () => openSub('past'), push: () => openSub('push'), pay: () => openSub('pay'),
    together: () => onView('together'), people: () => onView('people'), ranking: () => onView('ranking'),
    members: onMembers, dark: onToggleTheme, tour: onTour,
    kakao: auth.linkKakao, google: () => void auth.linkGoogle(), join: () => auth.openAuth(), logout: () => void auth.logout(),
  };
  const right = (r: MoreRow): ReactNode => {
    if (r.link === 'done') return <span className="more-v">연결됨</span>;
    switch (r.id) {
      case 'played': return <span className="more-v num">{playedN}</span>;
      case 'past': return <span className="more-v num">{pastN}</span>;
      case 'push': return <span className={'chip-info ' + pushChip.cls}>{pushChip.text}</span>;
      case 'pay': return <span className="more-v more-pay">{club7.pay?.bankText || (club7.pay?.kakaopayUrl ? '카카오페이' : '비어 있음')}</span>;
      case 'members': return pendingCount > 0 ? <span className="more-v strong">승인 대기 {pendingCount}명</span> : null;
      case 'dark': return <span className={'more-switch' + (dark ? ' on' : '')} aria-hidden="true" />;
      default: return null;
    }
  };
  const row = (r: MoreRow) => {
    if (r.id === 'logout') {
      return <button key={r.id} type="button" className="more-row more-out" data-row={r.id} onClick={act.logout}>{r.label}</button>;
    }
    const inner = (<>
      <span className="more-ic">{ICON[r.id]}</span>
      <span className="more-l">{r.label}</span>
      <span className="more-r">{right(r)}</span>
      {r.id !== 'dark' && r.link !== 'done' && Chev}
    </>);
    if (r.link === 'done') return <div key={r.id} className="more-row static" data-row={r.id}>{inner}</div>;
    if (r.id === 'dark') {
      return <button key={r.id} type="button" className="more-row" data-row={r.id} role="switch" aria-checked={dark} onClick={act.dark}>{inner}</button>;
    }
    return <button key={r.id} type="button" className="more-row" data-row={r.id} onClick={act[r.id]}>{inner}</button>;
  };

  return (
    <div className="more more-list" ref={listRef}>
      <header className="page-head more-head"><h1>더보기</h1></header>
      {auth.cloudOn && (auth.authLoading ? (
        <section className="more-card more-login" aria-label="로그인"><p>확인 중…</p></section>
      ) : !loggedIn ? (
        <section className="more-card more-login" aria-label="로그인">
          <p>로그인하면 일정과 기록을 저장할 수 있어요</p>
          <button type="button" className="btn btn-go" onClick={() => auth.openAuth()}>로그인</button>
        </section>
      ) : (
        <section className="more-card more-me" aria-label="내 프로필">
          <div className="more-me-top">
            <Avatar name={name} photo={auth.me?.photo} className="ava-lg" />
            <div className="more-me-who">
              <div className="more-me-n">
                <b>{name}{m?.nickname || auth.me?.id ? ' 님' : ''}</b>
                {chip && <span className={'chip-info ' + chip.cls}>{chip.text}</span>}
              </div>
              {linkLine && <span className="more-me-sub">{linkLine}</span>}
            </div>
          </div>
          {/* 내 프로필(§4.11) — 가입 신청한 사람·승인 멤버이고 서버가 프로필을 알 때 */}
          {(m?.status === 'PENDING' || m?.status === 'APPROVED') && <ProfileFacts p={m.profile} onEdit={onEditProfile} residenceOn={m.residenceOn} />}
          {profileOn && (
            <div className="more-stats">
              <div><b>{playedN}</b><span>해 본 테마</span></div>
              <div><b>{pastN}</b><span>지난 일정</span></div>
            </div>
          )}
        </section>
      ))}
      {groups.map((g) => (
        <section key={g.id} className={'more-group' + (g.id === 'out' ? ' out' : '')} aria-label={g.title || undefined}>
          {g.title && <h2 className="more-gt">{g.title}</h2>}
          <div className="more-card more-rows">{g.rows.map(row)}</div>
          {g.id === 'account' && auth.linkErr && <p className="merr more-err" role="alert">{auth.linkErr}</p>}
        </section>
      ))}
    </div>
  );
}
