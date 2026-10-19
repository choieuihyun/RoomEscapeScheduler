import { useEffect } from 'react';
import { useScheduler } from './scheduler/useScheduler';
import { useTheme } from './useTheme';
import { useTour } from './useTour';
import { useLoadModal } from './useLoadModal';
import { useAuth } from './useAuth';
import { usePlans } from './usePlans';
import { useSaveModal } from './useSaveModal';
import { useWatches, buildWatchControl } from './useWatches';
import { useCalendar } from './useCalendar';
import { useView } from './useView';
import { useClubEvents } from './useClubEvents';
import { addDays } from './clubEvents';
import { toISO } from './core';
import { isClubAdmin, useMembers } from './useMembers';
import { MembersPage } from './components/MembersPage';
import { ThemeList } from './components/ThemeList';
import { ConditionsPanel } from './components/ConditionsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { LoadModal } from './components/LoadModal';
import { AuthModal } from './components/AuthModal';
import { SaveModal } from './components/SaveModal';
import { PlanSection } from './components/PlanSection';
import { WatchListModal } from './components/WatchListModal';
import { CalendarPage } from './components/CalendarPage';
import { SideNav } from './components/SideNav';
import { CalendarSide } from './components/CalendarSide';
import { Toaster } from './components/Toaster';
import { showToast } from './toast';

export function SchedulerPage() {
  const s = useScheduler();
  const theme = useTheme();
  const tour = useTour();
  const loadModal = useLoadModal(s.addServerThemes);
  const auth = useAuth();
  const plans = usePlans(auth.me);
  const saveModal = useSaveModal(auth, () => s.lastSnapshot.current || s.serializeNow(), () => {
    plans.reload();
    showToast('일정을 저장했어요.');
  });
  const watches = useWatches(auth.me);
  /* 빈자리 알림은 승인 멤버만. 다만 member 가 null 이면 서버가 동호회 기능을 아직 모르거나
     못 불러온 것이라 지금처럼 로그인만으로 허용한다 — 서버가 실제로 막으면 403 NOT_MEMBER
     문구가 그대로 나오므로 안전하다. 불러오는 중에는 승인 전과 같이 막는다. */
  const approved: boolean | 'loading' = auth.memberLoading ? 'loading'
    : auth.member === null ? true
    : auth.member.status === 'APPROVED';
  const watchCtl = auth.cloudOn ? buildWatchControl(watches, !!auth.me, approved) : undefined;
  const cal = useCalendar();
  const isAdmin = isClubAdmin(auth.member);
  /* 동호회 일정 목록은 여기서 한 번만 만든다 — 홈(E7)과 캘린더(E6)가 같이 쓴다. 승인 멤버만 부른다. */
  const clubOn = auth.cloudOn && auth.member?.status === 'APPROVED';
  const today = toISO(new Date());
  const club = useClubEvents(clubOn, [{ from: today, to: addDays(today, 61) }]);
  /* 새 API 가 아직 없는 서버(404)면 홈 메뉴·홈 화면을 숨기고 나머지는 그대로 돈다 */
  const homeOn = clubOn && club.api !== 'missing';
  const nav = useView({ calendarOn: auth.cloudOn, isAdmin, homeOn });
  const members = useMembers(isAdmin, nav.view === 'members', auth.refreshMember);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (loadModal.open) loadModal.close();
      if (auth.open) auth.closeAuth();
      if (saveModal.open) saveModal.close();
      if (watches.open) watches.close();
      tour.end();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [loadModal, auth, saveModal, watches, tour]);

  /* 화면을 바꾸면 새 화면의 맨 위부터 보여준다. */
  useEffect(() => { window.scrollTo({ top: 0 }); }, [nav.view]);

  /* 투어는 계산 화면의 요소를 가리킨다 — 캘린더에서 누르면 계산 화면으로 먼저
     넘어간 뒤(다음 틱, 요소가 다시 보인 다음) 시작한다. */
  const startTour = () => {
    if (nav.view === 'calc') tour.start();
    else { nav.go('calc'); setTimeout(tour.start, 60); }
  };

  const onCalc = nav.view === 'calc';
  return (
    <div className="shell">
      <SideNav
        view={nav.view} onView={nav.go} auth={auth} homeOn={homeOn}
        watchCount={watches.watches.length} watchLimit={watches.limit} onWatches={watches.openModal}
        onTour={startTour} dark={theme.dark} onToggleTheme={theme.toggle}
        isAdmin={isAdmin} pendingCount={members.list?.filter(m => m.status === 'PENDING').length ?? 0}
      >
        {nav.view === 'calendar' && <CalendarSide ctl={cal} />}
      </SideNav>

      <main className="main">
        {/* 계산 화면은 캘린더로 넘어가도 지우지 않고 숨기기만 한다 — 입력·결과·"더 보기"
            같은 컴포넌트 안 상태가 그대로 남아 돌아왔을 때 이어서 볼 수 있다. */}
        <div className={'view' + (onCalc ? '' : ' off')}>
          <header className="page-head">
            <h1>조합 계산</h1>
            <p>테마별 예약 시간을 넣으면 겹치지 않게 이어서 갈 수 있는 조합을 다 찾아 드려요. 중간에 비는 시간도 같이 보여요.</p>
          </header>
          <ThemeList s={s} onOpenLoad={loadModal.openModal} watchCtl={watchCtl} />
          <ConditionsPanel s={s} />
          <ResultsPanel s={s} onSave={auth.cloudOn ? saveModal.openSave : undefined} watchCtl={watchCtl} />
          <PlanSection auth={auth} plans={plans} s={s} />
        </div>

        {homeOn && (
          <div className={'view' + (nav.view === 'home' ? '' : ' off')}>
            <header className="page-head">
              <h1>홈</h1>
            </header>
          </div>
        )}

        {auth.cloudOn && (
          <div className={'view' + (nav.view === 'calendar' ? '' : ' off')}>
            <header className="page-head">
              <h1>캘린더</h1>
              <p>저장한 일정과 빈자리 알림을 날짜별로 모아 봐요. 날짜를 누르면 그날 예약할 수 있는 회차도 볼 수 있어요.</p>
            </header>
            <CalendarPage
              ctl={cal} active={nav.view === 'calendar'} plans={plans} watches={watches} auth={auth} s={s}
              onLoaded={() => { nav.go('calc'); showToast('일정을 불러왔어요.'); }}
            />
          </div>
        )}

        {isAdmin && (
          <div className={'view' + (nav.view === 'members' ? '' : ' off')}>
            <header className="page-head">
              <h1>멤버 관리</h1>
              <p>가입 신청을 오픈채팅 닉네임과 맞춰 보고 승인해 주세요. 한 사람이 계정을 여러 개 만들었으면 하나만 승인하면 돼요.</p>
            </header>
            <MembersPage ctl={members} meUid={auth.member?.uid ?? ''} />
          </div>
        )}
      </main>

      <AuthModal auth={auth} />
      <LoadModal m={loadModal} />
      <SaveModal m={saveModal} />
      {auth.cloudOn && <WatchListModal w={watches} />}
      <Toaster />
    </div>
  );
}
