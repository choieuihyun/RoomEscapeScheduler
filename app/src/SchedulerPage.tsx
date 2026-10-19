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
  const watchCtl = auth.cloudOn ? buildWatchControl(watches, !!auth.me) : undefined;
  const cal = useCalendar();
  const nav = useView(auth.cloudOn);

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
        view={nav.view} onView={nav.go} auth={auth}
        watchCount={watches.watches.length} watchLimit={watches.limit} onWatches={watches.openModal}
        onTour={startTour} dark={theme.dark} onToggleTheme={theme.toggle}
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

        {auth.cloudOn && (
          <div className={'view' + (onCalc ? ' off' : '')}>
            <header className="page-head">
              <h1>캘린더</h1>
              <p>저장한 일정과 빈자리 알림을 날짜별로 모아 봐요. 날짜를 누르면 그날 예약할 수 있는 회차도 볼 수 있어요.</p>
            </header>
            <CalendarPage
              ctl={cal} active={!onCalc} plans={plans} watches={watches} auth={auth} s={s}
              onLoaded={() => { nav.go('calc'); showToast('일정을 불러왔어요.'); }}
            />
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
