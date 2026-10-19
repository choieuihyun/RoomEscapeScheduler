import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { recordPlanPlayed } from './played';
import { useScheduler } from './scheduler/useScheduler';
import { useTheme } from './useTheme';
import { useTour } from './useTour';
import { useLoadModal, type AddedTheme } from './useLoadModal';
import { useAuth } from './useAuth';
import { usePlans } from './usePlans';
import { useSaveModal } from './useSaveModal';
import { useWatches, buildWatchControl } from './useWatches';
import { useCalendar } from './useCalendar';
import { useView, decideFirstScreen, type View } from './useView';
import { useClubEvents } from './useClubEvents';
import { useProfile } from './useProfile';
import { addDays, sortKeyDate, todayKst, windowLabel, windowToCalc } from './clubEvents';
import { monthGrid, toISO, type SearchResultRow } from './core';
import { readEventHash } from './eventLink';
import { bannerOf, swOpenId } from './swLink';
import { listenForegroundPush, PUSH_READY_EVT } from './notify';
import { usePushDevice } from './usePushDevice';
import { errorCode, getEvent, isMissingApi, sayClub, type EventDto } from './server';
import { isClubAdmin, memberName, useMembers } from './useMembers';
import { ThemeList } from './components/ThemeList';
import { ConditionsPanel } from './components/ConditionsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { useEventFormModal } from './useEventFormModal';
import { PlanSection } from './components/PlanSection';
import { SideNav } from './components/SideNav';
import { CalendarSide } from './components/CalendarSide';
import { Toaster } from './components/Toaster';
import { PushBanner } from './components/PushBanner';
import { showPushBanner, showToast } from './toast';

/* 동호회·캘린더·내 정보 화면은 처음 쓸 때 받는다 — 로그인 전 첫 화면(조합 계산)이 이 코드를 받지 않게 한다 */
const MembersPage = lazy(() => import('./components/MembersPage').then(m => ({ default: m.MembersPage })));
const HomePage = lazy(() => import('./components/HomePage').then(m => ({ default: m.HomePage })));
const ProfilePage = lazy(() => import('./components/ProfilePage').then(m => ({ default: m.ProfilePage })));
const EventForm = lazy(() => import('./components/EventForm').then(m => ({ default: m.EventForm })));
const CalendarPage = lazy(() => import('./components/CalendarPage').then(m => ({ default: m.CalendarPage })));
const LoadModal = lazy(() => import('./components/LoadModal').then(m => ({ default: m.LoadModal })));
const AuthModal = lazy(() => import('./components/AuthModal').then(m => ({ default: m.AuthModal })));
const SaveModal = lazy(() => import('./components/SaveModal').then(m => ({ default: m.SaveModal })));
const WatchListModal = lazy(() => import('./components/WatchListModal').then(m => ({ default: m.WatchListModal })));
const PushGuide = lazy(() => import('./components/PushGuide').then(m => ({ default: m.PushGuide })));

/* 한 번이라도 참이었으면 계속 참 — 화면을 처음 열 때 코드를 받고, 이후엔 지우지 않고 숨기기만 해 안의 상태를 지킨다 */
function useEver(on: boolean): boolean {
  const [ever, setEver] = useState(on);
  if (on && !ever) setEver(true);
  return ever || on;
}

/* 일정 링크 `#e=<id>` 로 연다 — 아래 hashchange 경로가 받는다. 이미 같은 해시면 바꿔도 이벤트가 없어 직접 알린다.
   알림을 눌렀는데 서비스 워커가 창을 못 옮긴 경우와 앱 안 알림 띠의 "열기"가 쓴다. */
function openEventHash(id: number) {
  if (readEventHash(location.hash) === id) dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = `e=${id}`;
}

export function SchedulerPage() {
  const s = useScheduler();
  const theme = useTheme();
  const tour = useTour();
  const loadModal = useLoadModal(s.addServerThemes);
  const auth = useAuth();
  /* 동호회 API 가 켜진 승인 멤버일 때만 다녀온 일정을 해 본 테마로 잇는다(homeOn 은 아래에서 정해진다) */
  const planDoneRef = useRef<((steps: { name: string }[], date: string) => void) | undefined>(undefined);
  const onPlanDone = useCallback((steps: { name: string }[], date: string) => planDoneRef.current?.(steps, date), []);
  const plans = usePlans(auth.me, onPlanDone);
  const saveModal = useSaveModal(auth, () => s.lastSnapshot.current || s.serializeNow(), () => {
    plans.reload();
    showToast('일정을 저장했어요.');
  }, onPlanDone);
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
  /* 동호회 쪽 '오늘'은 한국 날짜(§4.7) — 홈 범위·홈 화면이 이 값을 쓴다 */
  const today = todayKst();
  /* 캘린더 범위 — 월 보기는 보이는 달 칸(최대 42일), 주·일 보기는 고른 날이 든 달 칸. 홈 범위와 겹쳐도 병합이 중복을 없앤다. */
  const calMonth = cal.mode === 'month' ? cal.cursor : { y: +cal.selected.slice(0, 4), m: +cal.selected.slice(5, 7) - 1 };
  const calGrid = monthGrid(calMonth.y, calMonth.m);
  /* 홈 미니 달력이 보이는 달 — 그 달 칸도 범위에 넣어 다른 달로 넘겨도 일정 수가 보이게 한다(캘린더 범위와 같으면 뺀다) */
  const [homeMonth, setHomeMonth] = useState(() => { const t = todayKst(); return { y: +t.slice(0, 4), m: +t.slice(5, 7) - 1 }; });
  const homeGrid = monthGrid(homeMonth.y, homeMonth.m);
  const calRange = { from: toISO(calGrid[0]), to: toISO(calGrid[calGrid.length - 1]) };
  const homeCalRange = { from: toISO(homeGrid[0]), to: toISO(homeGrid[homeGrid.length - 1]) };
  const club = useClubEvents(clubOn, [
    { from: today, to: addDays(today, 61) },
    calRange,
    ...(homeCalRange.from === calRange.from ? [] : [homeCalRange]),
  ]);
  const stepHomeMonth = (dir: 1 | -1) => setHomeMonth(c => {
    const d = new Date(c.y, c.m + dir, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  /* 새 API 가 아직 없는 서버(404)면 홈 메뉴·홈 화면을 숨기고 나머지는 그대로 돈다 */
  const homeOn = clubOn && club.api === 'on';
  useEffect(() => {
    planDoneRef.current = homeOn ? (steps, date) => { void recordPlanPlayed(steps, date); } : undefined;
  }, [homeOn]);
  /* 일정 만들기·수정 창 — 캘린더(E6)·홈(E7)·결과 카드(E8)가 이 하나를 연다 */
  const eventForm = useEventFormModal();
  /* 결과 카드 → 일정 창. 날짜는 첫 스텝 테마를 불러올 때 고른 날짜, 없으면 오늘 */
  const postToClub = (r: SearchResultRow) => {
    const id = s.themesReady[r.steps[0]?.i]?.id;
    const date = s.themes.find((t) => t.id === id)?.date;
    eventForm.openFromSteps(date ?? todayKst(), r.steps);
  };
  /* 첫 화면은 로그인 복원·승인 확인·일정 API 확인이 끝나야 정한다 — 그 전엔 화면을 비워 두어
     calc → 홈(또는 홈 → calc)으로 손 밑에서 바뀌지 않게 한다. */
  const decided = decideFirstScreen({
    cloudOn: auth.cloudOn, authLoading: auth.authLoading, loggedIn: !!auth.me, memberChecked: auth.memberChecked,
    member: auth.member, clubApi: club.api, clubError: club.error,
  });
  /* 내 정보(§4.9) — 해 본 테마 API 는 4단계라 일정 API 와 따로 본다. 승인 멤버면 바로 목록을 한 번 받아
     서버가 모르면(본문 없는 404) 메뉴·화면을 숨긴다. 화면 안 데이터는 그 화면에 들어올 때 받는다. */
  const [profileActive, setProfileActive] = useState(false);
  const profile = useProfile(homeOn, profileActive, today);
  const profileOn = homeOn && profile.api === 'on';
  const nav = useView({ calendarOn: auth.cloudOn, isAdmin, homeOn, profileOn, decided });
  if (profileActive !== (nav.view === 'profile')) setProfileActive(nav.view === 'profile');
  const members = useMembers(isAdmin, nav.view === 'members', auth.refreshMember);
  /* 이 기기 알림(§4.10) — 내 정보 카드와 알림 켜기 안내가 같이 쓴다 */
  const push = usePushDevice(clubOn, nav.view === 'profile');

  /* ── 일정 상세 패널과 `#e=<id>` 링크 (계획 Task E6) ── */
  const { setOpenEvent, select: calSelect } = cal;
  /* 주소의 #e= 만 지운다(경로·?view= 는 그대로, 다른 해시는 건드리지 않는다). 패널이 링크 일정을 떠나면 부른다 —
     남겨 두면 새로고침했을 때 처음 링크 일정이 다시 열린다. */
  const dropLink = useCallback(() => {
    if (readEventHash(location.hash) !== null) history.replaceState(history.state, '', location.pathname + location.search);
  }, []);
  const closeEvent = useCallback(() => { setOpenEvent(null); dropLink(); }, [setOpenEvent, dropLink]);
  /* 칩·줄을 눌러 일정을 연다. 링크로 연 일정과 다른 일정이면 #e= 를 지운다.
     날짜 미정 일정은 누른 후보 날짜(date)를, 없으면(홈·링크) 오늘 이후 가장 이른 후보를 고른다 */
  const openEvent = useCallback((ev: EventDto, date?: string) => {
    if (readEventHash(location.hash) !== ev.id) dropLink();
    calSelect(date ?? sortKeyDate(ev, todayKst()));
    setOpenEvent(ev.id);
  }, [dropLink, calSelect, setOpenEvent]);
  /* 캘린더 밖 화면으로 옮길 때는 #e= 를 지운다 — 남으면 `?view=calc#e=12` 를 새로고침(iOS 탭 되살림)했을 때 캘린더로 끌려간다 */
  const { go } = nav;
  const goView = useCallback((v: View) => { if (v !== 'calendar') dropLink(); go(v); }, [dropLink, go]);
  /* 홈에서 줄·"일정 자세히 보기"를 누르면 캘린더 화면으로 넘어가 그 일정 상세를 연다 */
  const openFromHome = (ev: EventDto) => { goView('calendar'); openEvent(ev); };
  /* 내 정보의 지난 일정 → 캘린더 상세. 지난 일정은 받아 둔 목록 범위 밖일 수 있어 먼저 목록에 넣는다
     (없으면 '연 일정이 목록에서 사라짐' 처리가 패널을 바로 닫는다) */
  const openFromProfile = (ev: EventDto) => { club.adopt(ev); goView('calendar'); openEvent(ev); };
  /* 홈 미니 달력의 날짜 → 캘린더 화면에서 그날을 고른다. 열려 있던 일정 상세는 닫는다(캘린더의 날짜 고르기와 같게) */
  const pickFromHome = (iso: string) => {
    goView('calendar');
    calSelect(iso);
    if (cal.openEvent !== null) closeEvent();
  };
  /* 상세의 "이 시간대로 조합 계산" — 다 같이 되는 시간을 계산 조건(가장 이른 시작·가장 늦은 종료)에 넣고 계산 화면으로 */
  const calcWindow = (w: { start: number; end: number }) => {
    const o = windowToCalc(w);
    s.setOption('oStart', o.oStart);
    s.setOption('oEnd', o.oEnd);
    goView('calc');
    showToast(`시간대(${windowLabel(w)})를 조건에 넣었어요. 테마를 불러와 계산해 보세요.`);
  };
  /* 상세의 협의 도우미 "고른 테마 n개로 조합 계산" — 회차 불러오기처럼 카드로 넣고 계산 화면으로 */
  const calcThemes = (items: AddedTheme[]) => {
    s.addServerThemes(items);
    goView('calc');
    showToast(`테마 ${items.length}개를 넣었어요.`);
  };
  const pendingCount = members.list?.filter(m => m.status === 'PENDING').length ?? 0;
  /* 연 일정이 목록에서 사라지면(지움·로그아웃) 패널도 닫는다 */
  const openGone = cal.openEvent !== null && !club.events.some(e => e.id === cal.openEvent);
  useEffect(() => { if (openGone) closeEvent(); }, [openGone, closeEvent]);

  /* 링크로 열 일정 id. 로그인 복원·멤버 확인이 끝난 뒤에 해시를 읽는다 — 그 전에 읽으면 저장된 로그인이
     복원되기도 전에 로그인 창이 뜬다. 카카오 왕복은 돌아온 뒤 replaceState 로 해시를 되살려(hashchange 없음)
     로그인한 사람이 바뀔 때도 다시 읽는다. */
  const [linkId, setLinkId] = useState<number | null>(null);
  const authSettled = !auth.authLoading && (!auth.me || auth.memberChecked);
  const meUid = auth.me?.uid ?? '';
  useEffect(() => {
    if (!auth.cloudOn || !authSettled) return;
    const read = () => { const id = readEventHash(location.hash); if (id !== null) setLinkId(id); };
    void Promise.resolve().then(read); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, [auth.cloudOn, authSettled, meUid]);

  /* 알림을 눌렀는데 서비스 워커가 이 창을 옮기지 못하면(관할 밖 창) `{ type: 'open', link }` 를 보낸다 —
     주소를 #e= 로 바꿔 위의 hashchange 경로로 연다. 로그인 확인 전이면 해시만 남고, 확인이 끝나면 위 effect 가 읽는다. */
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMsg = (e: MessageEvent) => {
      const id = swOpenId(e.data);
      if (id !== null) openEventHash(id);
    };
    sw.addEventListener('message', onMsg);
    return () => sw.removeEventListener('message', onMsg);
  }, []);

  /* 앱 탭이 보이는 동안 온 푸시는 서비스 워커가 띄우지 않는다 — onMessage 로 받아 화면 위 띠로 보인다(§4.10).
     로그인했고 알림이 허용됐을 때만 메시징 SDK 를 받는다. 권한은 바뀌어도 알려 주지 않아서, 이 기기가 등록될 때마다
     (알림 켜기·로그인 때 조용한 등록) 다시 건다. */
  const [pushReady, setPushReady] = useState(0);
  useEffect(() => {
    const on = () => setPushReady(n => n + 1);
    addEventListener(PUSH_READY_EVT, on);
    return () => removeEventListener(PUSH_READY_EVT, on);
  }, []);
  useEffect(() => {
    if (!meUid) return;
    let dead = false, off: (() => void) | null = null;
    listenForegroundPush(p => { const b = bannerOf(p); if (b) showPushBanner(b); })
      .then(u => { if (dead) u?.(); else off = u; })
      .catch(e => console.warn('앱 안 알림 받기 실패:', e));
    return () => { dead = true; off?.(); };
  }, [meUid, pushReady]);

  const askedFor = useRef<number | null>(null); // 로그인 창을 이미 띄운 링크 — 한 번만 띄운다
  const linkBusy = useRef(false);
  const { openAuth } = auth;
  const { adopt } = club;
  const memberStatus = auth.member?.status ?? null;
  useEffect(() => {
    if (linkId === null || !authSettled) return;
    if (!auth.me || (memberStatus !== null && memberStatus !== 'APPROVED')) {
      /* 로그아웃·승인 전 — 로그인 창(승인 전이면 그 안에서 가입 신청·승인 대기)을 연다. 승인되면 이어서 연다 */
      if (askedFor.current !== linkId) { askedFor.current = linkId; openAuth(); }
      return;
    }
    if (!clubOn) { // 서버가 동호회 기능을 모른다(멤버 확인 404) — 링크는 버린다
      void Promise.resolve().then(() => setLinkId(null));
      return;
    }
    if (linkBusy.current) return;
    linkBusy.current = true;
    const id = linkId;
    void (async () => {
      try {
        const t = await (await import('./cloud')).idToken();
        if (!t) return;
        const ev = await getEvent(id, t);
        adopt(ev);
        go('calendar');
        calSelect(sortKeyDate(ev, todayKst()));
        setOpenEvent(ev.id);
      } catch (e) {
        if (errorCode(e) === 'NO_SUCH_EVENT') {
          showToast('일정을 찾을 수 없어요. 지워졌을 수 있어요.');
          if (readEventHash(location.hash) === id) history.replaceState(history.state, '', location.pathname + location.search);
        } else if (!isMissingApi(e)) {
          showToast(sayClub(e));
        }
      } finally {
        linkBusy.current = false;
        setLinkId(cur => (cur === id ? null : cur));
      }
    })();
  }, [linkId, authSettled, auth.me, memberStatus, clubOn, openAuth, adopt, go, calSelect, setOpenEvent]);

  /* 알림 켜기 안내 — 승인된 멤버에게 이 기기에서 한 번. 첫 화면이 정해지고, 로그인 창·일정 창·링크로 여는 일정과 겹치지 않을 때 */
  const { maybeAutoGuide } = push;
  const guideFree = clubOn && decided && !auth.open && !eventForm.open && !loadModal.open && !saveModal.open && linkId === null
    && readEventHash(location.hash) === null;
  useEffect(() => { if (guideFree) maybeAutoGuide(); }, [guideFree, maybeAutoGuide]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (loadModal.open) loadModal.close();
      if (auth.open) auth.closeAuth();
      if (saveModal.open) saveModal.close();
      if (eventForm.open) eventForm.close();
      if (watches.open) watches.close();
      if (push.guide !== null) push.closeGuide();
      tour.end();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [loadModal, auth, saveModal, eventForm, watches, tour, push]);

  /* 화면을 바꾸면 새 화면의 맨 위부터 보여준다. */
  useEffect(() => { window.scrollTo({ top: 0 }); }, [nav.view]);

  /* 투어는 계산 화면의 요소를 가리킨다 — 캘린더에서 누르면 계산 화면으로 먼저
     넘어간 뒤(다음 틱, 요소가 다시 보인 다음) 시작한다. */
  const startTour = () => {
    if (nav.view === 'calc') tour.start();
    else { goView('calc'); setTimeout(tour.start, 60); }
  };

  const onCalc = nav.view === 'calc';
  /* 큰 화면은 처음 들어갈 때 받는다(홈은 승인 멤버 첫 화면이라 homeOn 이면 바로) */
  const calMounted = useEver(nav.view === 'calendar');
  const profileMounted = useEver(nav.view === 'profile');
  const membersMounted = useEver(nav.view === 'members');
  const formMounted = useEver(eventForm.open);
  const authMounted = useEver(auth.open);
  const loadMounted = useEver(loadModal.open);
  const saveMounted = useEver(saveModal.open);
  const watchMounted = useEver(watches.open);
  const guideMounted = useEver(push.guide !== null);
  const [retrying, setRetrying] = useState(false);
  /* 첫 목록을 못 받아 빈 채로 열린 승인 멤버 — 계산·캘린더 위에 띠로 알린다(성공하면 error 가 비어 사라진다) */
  const listFailed = clubOn && club.error !== '' && club.events.length === 0;
  const failStrip = listFailed && (
    <div className="listfail" role="status">
      <span>동호회 일정을 불러오지 못했어요.</span>
      <button type="button" className="btn" disabled={retrying} onClick={() => {
        setRetrying(true);
        void club.reload().finally(() => setRetrying(false));
      }}>{retrying ? '불러오는 중…' : '다시 시도'}</button>
    </div>
  );
  return (
    <div className="shell">
      <SideNav
        view={nav.view} onView={goView} auth={auth} homeOn={homeOn} profileOn={profileOn}
        watchCount={watches.watches.length} watchLimit={watches.limit} onWatches={watches.openModal}
        onTour={startTour} dark={theme.dark} onToggleTheme={theme.toggle}
        isAdmin={isAdmin} pendingCount={pendingCount}
      >
        {nav.view === 'calendar' && <CalendarSide ctl={cal} clubOn={homeOn} />}
      </SideNav>

      <main className="main">
        {/* 계산 화면은 캘린더로 넘어가도 지우지 않고 숨기기만 한다 — 입력·결과·"더 보기"
            같은 컴포넌트 안 상태가 그대로 남아 돌아왔을 때 이어서 볼 수 있다. */}
        <div className={'view' + (onCalc ? '' : ' off')}>
          {failStrip}
          <header className="page-head">
            <h1>조합 계산</h1>
            <p>테마별 예약 시간을 넣으면 겹치지 않게 이어서 갈 수 있는 조합을 다 찾아 드려요. 중간에 비는 시간도 같이 보여요.</p>
          </header>
          <ThemeList s={s} onOpenLoad={loadModal.openModal} watchCtl={watchCtl} />
          <ConditionsPanel s={s} />
          <ResultsPanel s={s} onSave={auth.cloudOn ? saveModal.openSave : undefined} onClubPost={homeOn ? postToClub : undefined} watchCtl={watchCtl} />
          <PlanSection auth={auth} plans={plans} s={s} />
        </div>

        {homeOn && (
          <div className={'view home-view' + (nav.view === 'home' ? '' : ' off')}>
            <header className="page-head">
              <h1>홈</h1>
            </header>
            <Suspense fallback={null}><HomePage
              club={club} today={today} nickname={auth.member ? memberName(auth.member) : ''} isAdmin={isAdmin}
              watchCount={watches.watches.length} watchLimit={watches.limit} pendingCount={pendingCount}
              month={homeMonth} onMonth={stepHomeMonth}
              onWatches={watches.openModal} onMembers={() => goView('members')}
              onNewEvent={() => eventForm.openNew()} onCalc={() => goView('calc')}
              onOpenEvent={openFromHome} onPickDay={pickFromHome}
            /></Suspense>
          </div>
        )}

        {auth.cloudOn && calMounted && (
          <div className={'view' + (nav.view === 'calendar' ? '' : ' off')}>
            {failStrip}
            <header className="page-head">
              <h1>캘린더</h1>
              <p>{homeOn ? '동호회 일정과 저장한 일정, 빈자리 알림을' : '저장한 일정과 빈자리 알림을'} 날짜별로 모아 봐요. 날짜를 누르면 그날 예약할 수 있는 회차도 볼 수 있어요.</p>
            </header>
            <Suspense fallback={null}><CalendarPage
              ctl={cal} active={nav.view === 'calendar'} plans={plans} watches={watches} auth={auth} s={s}
              onLoaded={() => { goView('calc'); showToast('일정을 불러왔어요.'); }}
              club={club} clubOn={homeOn}
              onNewEvent={eventForm.openNew} onEditEvent={eventForm.openEdit} onCloseEvent={closeEvent} onOpenEvent={openEvent}
              onCalcWindow={calcWindow} onCalcThemes={calcThemes}
            /></Suspense>
          </div>
        )}

        {profileOn && profileMounted && (
          <div className={'view home-view' + (nav.view === 'profile' ? '' : ' off')}>
            <header className="page-head">
              <h1>내 정보</h1>
            </header>
            <Suspense fallback={null}><ProfilePage
              profile={profile} member={auth.member} providerIds={auth.providerIds} isAdmin={isAdmin}
              onOpenEvent={openFromProfile} push={push}
            /></Suspense>
          </div>
        )}

        {isAdmin && membersMounted && (
          <div className={'view' + (nav.view === 'members' ? '' : ' off')}>
            <header className="page-head">
              <h1>멤버 관리</h1>
              <p>가입 신청을 오픈채팅 닉네임과 맞춰 보고 승인해 주세요. 한 사람이 계정을 여러 개 만들었으면 하나만 승인하면 돼요.</p>
            </header>
            <Suspense fallback={null}><MembersPage ctl={members} meUid={auth.member?.uid ?? ''} /></Suspense>
          </div>
        )}
      </main>

      {authMounted && <Suspense fallback={null}><AuthModal auth={auth} /></Suspense>}
      {loadMounted && <Suspense fallback={null}><LoadModal m={loadModal} /></Suspense>}
      {saveMounted && <Suspense fallback={null}><SaveModal m={saveModal} /></Suspense>}
      {clubOn && formMounted && <Suspense fallback={null}><EventForm m={eventForm} create={club.create} update={club.update} adopt={club.adopt} /></Suspense>}
      {auth.cloudOn && watchMounted && <Suspense fallback={null}><WatchListModal w={watches} /></Suspense>}
      {clubOn && guideMounted && <Suspense fallback={null}><PushGuide push={push} /></Suspense>}
      <PushBanner onOpen={openEventHash} />
      <Toaster />
    </div>
  );
}
