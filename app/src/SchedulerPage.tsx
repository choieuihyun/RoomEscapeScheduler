import { useEffect } from 'react';
import { useScheduler } from './scheduler/useScheduler';
import { useTheme } from './useTheme';
import { useTour } from './useTour';
import { useLoadModal } from './useLoadModal';
import { useAuth } from './useAuth';
import { usePlans } from './usePlans';
import { useSaveModal } from './useSaveModal';
import { useWatches, buildWatchControl } from './useWatches';
import { useCalendarModal } from './useCalendarModal';
import { ThemeList } from './components/ThemeList';
import { ConditionsPanel } from './components/ConditionsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { LoadModal } from './components/LoadModal';
import { AcctWidget } from './components/AcctWidget';
import { AuthModal } from './components/AuthModal';
import { SaveModal } from './components/SaveModal';
import { PlanSection } from './components/PlanSection';
import { WatchListModal } from './components/WatchListModal';
import { CalendarModal } from './components/CalendarModal';

export function SchedulerPage() {
  const s = useScheduler();
  const theme = useTheme();
  const tour = useTour();
  const loadModal = useLoadModal(s.addServerThemes);
  const auth = useAuth();
  const plans = usePlans(auth.me);
  const saveModal = useSaveModal(auth, () => s.lastSnapshot.current || s.serializeNow(), plans.reload);
  const watches = useWatches(auth.me);
  const watchCtl = auth.cloudOn ? buildWatchControl(watches, !!auth.me) : undefined;
  const calModal = useCalendarModal();

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (loadModal.open) loadModal.close();
      if (auth.open) auth.closeAuth();
      if (saveModal.open) saveModal.close();
      if (watches.open) watches.close();
      if (calModal.open) calModal.close();
      tour.end();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [loadModal, auth, saveModal, watches, calModal, tour]);

  return (
    <div className="wrap">
      <header>
        <div className="hrow">
          <div className="hleft">
            <button className="btn tourbtn" type="button" onClick={tour.start}>사용법 보기</button>
            <button className="btn tourbtn" type="button" onClick={theme.toggle}>
              {theme.dark ? '라이트 모드' : '다크 모드'}
            </button>
          </div>
          <div className="acct">
            {auth.cloudOn && (
              <button className="nav-item" type="button" onClick={watches.openModal}>
                빈자리 알림 <span className="nav-soon">{watches.watches.length}/{watches.limit}</span>
              </button>
            )}
            {auth.cloudOn && (
              <button className="nav-item" type="button" onClick={calModal.openModal}>캘린더</button>
            )}
            <AcctWidget auth={auth} />
          </div>
        </div>
        <h1>Flo<span className="dim">duler</span></h1>
        <p>테마별 회차 시간을 넣으면 겹치지 않는 조합을 전부 계산해서, 공백이 어디에 얼마나 생기는지 보여줍니다.</p>
      </header>

      <ThemeList s={s} onOpenLoad={loadModal.openModal} watchCtl={watchCtl} />
      <ConditionsPanel s={s} />
      <ResultsPanel s={s} onSave={auth.cloudOn ? saveModal.openSave : undefined} watchCtl={watchCtl} />
      <PlanSection auth={auth} plans={plans} s={s} />

      <AuthModal auth={auth} />
      <LoadModal m={loadModal} />
      <SaveModal m={saveModal} />
      {auth.cloudOn && <WatchListModal w={watches} />}
      {auth.cloudOn && <CalendarModal ctl={calModal} plans={plans} watches={watches} auth={auth} s={s} />}
    </div>
  );
}
