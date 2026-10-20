import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { cpLen, dayLabel, eventStatus, eventTitle, STATUS_LABEL, todayKst, weekday } from '../clubEvents';
import { coolLeft, coolUntil, startCool, testLabel } from '../pushCool';
import { isPlayableName, searchThemes, sourceLabel } from '../played';
import { PLAYED_MIN, checkPlayedOn, fullDay, groupByYear, matchPlayed, playedSummary, sortPlayed, type PlayedSort } from '../playedView';
import type { EventDto, MeDto, PlayedDto, ThemeRef } from '../server';
import { Avatar } from './Avatar';
import { ProfileFacts } from './MemberViews';
import { showToast } from '../toast';
import { pageRows, withoutPending, type UseProfileReturn } from '../useProfile';
import type { UsePushDeviceReturn } from '../usePushDevice';
import { PayCard, useClubStore, WishToggle } from '../clubStore';

/* 내 정보 — 계획 Task 7, 작업명세서 §4.9 "화면 쪽 약속". 홈과 같은 세 칸 카드:
   ① 프로필(닉네임·역할·로그인 수단·숫자 둘)과 그 아래 이 기기 알림(5단계, Task 11),
   ② 해 본 테마(찾아서 기록·직접 적기·탭·지우기), ③ 지난 동호회 일정. */

/* 해 본 테마 목록은 처음 50개, "더 보기"마다 50개씩 더 — 400개를 한 번에 그리지 않는다 */
const LIST_STEP = 50;

/* 여러 개 한꺼번에 넣기 창 — 처음 열 때 받는다(지연 청크). 안 받아지면 한 번 더.
   lazyRetry·LazyBoundary 를 쓰지 않는 까닭: 그 둘을 이 청크로 끌어오면 진입 청크의 내보내기가 늘어난다(진입 크기 한도) */
type BulkComp = typeof import('./BulkModal').BulkModal;
const loadBulk = () => import('./BulkModal')
  .catch(() => new Promise((r) => setTimeout(r, 400)).then(() => import('./BulkModal')));

type Tab = 'all' | 'manual' | 'auto';
const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'all', label: '전체', empty: '아직 기록한 테마가 없어요. 위에서 찾아 "해 봤어요"를 눌러 보세요.' },
  { id: 'manual', label: '직접 적은 것', empty: '직접 기록한 테마가 없어요.' },
  { id: 'auto', label: '일정에서 온 것', empty: '일정에서 들어온 기록이 없어요. 예약 완료한 일정이 지나면 다음 날 새벽에 저절로 들어와요.' },
];
/* "일정에서 온 것" 탭에는 개인 "다녀온 일정"에서 온 것(PLAN)도 같이 둔다 — 둘 다 손으로 적지 않은 기록이다 */
const inTab = (p: PlayedDto, tab: Tab) => tab === 'all' || (tab === 'manual' ? p.source === 'MANUAL' : p.source !== 'MANUAL');

const NAME_MAX = 40;
const FUTURE_ERR = '오늘까지의 날짜만 넣을 수 있어요.';
const BAD_DATE_ERR = '날짜를 확인해 주세요.';
/* 기록한 뒤 토스트. 같은 테마가 이미 있으면 서버가 있던 행을 그대로 줘서 적은 날짜가 들어가지 않는다 — 그걸 같이 알린다 */
function addedText(r: { existed: boolean; row: PlayedDto }, playedOn: string | null): string {
  const kept = playedOn !== null && r.row.playedOn !== playedOn;
  return (r.existed ? '이미 기록돼 있어요.' : '기록했어요.') + (kept ? ' 날짜는 원래 기록 그대로예요.' : '');
}
const dowClass = (dow: number) => (dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');

export function ProfilePage({
  profile, member, photo, providerIds, isAdmin, pendingCount, onMembers, onOpenEvent, push, onEditProfile, onBack,
}: {
  profile: UseProfileReturn;
  /* 구글 사진 주소 — 없으면 이름 첫 글자 */
  photo?: string;
  push: UsePushDeviceReturn;
  member: MeDto | null;
  providerIds: string[];
  isAdmin: boolean;
  /* 운영진의 멤버 관리 길(§4.59) — 좁은 화면의 아래 탭엔 멤버 관리가 없어서 여기 맨 위에 둔다 */
  pendingCount: number;
  onMembers: () => void;
  onOpenEvent: (ev: EventDto) => void;
  /* 프로필 고치기(§4.11) — 서버가 고치기를 모르면 없다 */
  onEditProfile?: () => void;
  /* 좁은 화면의 "‹ 더보기" — 머리말은 이 청크에 둔다(진입 청크 크기) */
  onBack: () => void;
}) {
  const { played } = profile;
  const club7 = useClubStore();
  const kept = played === null ? null : withoutPending(played, profile.pendingIds);
  const nickname = member?.nickname?.trim() || '';

  /* 로그인 수단 — 카카오는 서버가 붙인 것이라 member.kakaoLinked 로, 구글은 Firebase 로그인 수단으로 안다 */
  const linked = [
    ...(member?.kakaoLinked ? ['카카오'] : []),
    ...(providerIds.includes('google.com') ? ['구글'] : []),
  ];
  const linkLine = linked.length > 0 ? `${linked.join(' · ')} 연결됨`
    : providerIds.includes('password') ? '아이디로 로그인해요' : '';

  /* 지난 일정 수 — 서버가 주는 전체 수(받은 쪽 수와 상관없이) */
  const pastCount = profile.pastTotal ?? '–';

  return (<>
    <header className="page-head">
      <button type="button" className="page-back" onClick={onBack}><span aria-hidden="true">‹</span> 더보기</button>
      <h1>내 정보</h1>
    </header>
    <div className={'pf-grid' + (isAdmin ? ' admin' : '')}>
      <div className="pf-col">
        {isAdmin && (
          <section className="home-card pf-admin" aria-label="운영진">
            <button type="button" className="pf-admin-row" onClick={onMembers}>
              <b>멤버 관리</b>
              {pendingCount > 0 && <span>승인 대기 {pendingCount}명</span>}
              <i aria-hidden="true">›</i>
            </button>
          </section>
        )}
        <section className="home-card home-me pf-me" aria-label="내 프로필">
          <Avatar name={nickname} photo={photo} className="home-avatar" />
          <b className="home-name">{nickname} 님</b>
          <span className={'chip-info pf-role' + (isAdmin ? ' role' : '')}>{isAdmin ? '운영진' : '멤버'}</span>
          {linkLine && <span className="pf-link">{linkLine}</span>}
          <ProfileFacts p={member?.profile} onEdit={onEditProfile} />
          <div className="pf-stats">
            <div><b>{kept === null ? '–' : kept.length}</b><span>해 본 테마</span></div>
            <div><b>{pastCount}</b><span>지난 일정</span></div>
          </div>
        </section>
        <PushCard push={push} />
        {/* 송금 정보(§4.13) — 서버가 정산을 알 때 */}
        {club7.settleApi === 'on' && <PayCard />}
      </div>

      <PlayedCard profile={profile} />

      <PastCard profile={profile} onOpenEvent={onOpenEvent} />
    </div>
  </>);
}

/* 지난 동호회 일정 카드 — 내 정보 세 번째 칸, 좁은 화면 더보기의 하위 화면(§4.60)이 같이 쓴다 */
export function PastCard({ profile, onOpenEvent }: { profile: UseProfileReturn; onOpenEvent: (ev: EventDto) => void }) {
  const { past } = profile;
  return (
    <section className="home-card pf-past" aria-label="지난 일정">
      <h2 className="home-h">지난 일정</h2>
      {past === null ? (
        profile.pastError ? (
          <div className="home-empty">
            <p>{profile.pastError}</p>
            <button type="button" className="btn" onClick={() => void profile.retryPast()}>다시 시도</button>
          </div>
        ) : <p className="home-empty-p pf-loading">불러오는 중…</p>
      ) : past.length === 0 ? (
        <p className="home-empty-p pf-loading">지난 일정이 아직 없어요.</p>
      ) : (
        <>
          <ul className="home-list">
            {past.map((ev) => {
              const st = eventStatus(ev);
              return (
                <li key={ev.id} className="home-row pf-past-row">
                  <div className="home-row-main">
                    <div className="home-row-t">
                      <span className={'chip-st ' + st}>{STATUS_LABEL[st]}</span>
                      {/* 제목 단추의 ::after 가 줄 전체를 덮어 줄 어디를 눌러도 캘린더 상세로 간다 */}
                      <button type="button" className="home-row-open" onClick={() => onOpenEvent(ev)}>{eventTitle(ev)}</button>
                    </div>
                    <span className="home-row-m">
                      {ev.date && <span className={dowClass(weekday(ev.date))}>{dayLabel(ev.date)}</span>}
                      {' · '}{ev.count}명 · {ev.createdBy.nickname}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {profile.pastError && <p className="merr" role="alert">{profile.pastError}</p>}
          {profile.hasMorePast && (
            <button type="button" className="pf-more" disabled={profile.pastBusy} onClick={() => void profile.morePast()}>
              {profile.pastBusy ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* 이 기기 알림(§4.10, 목업 ③ 왼쪽 아래) — 상태 칩 · 받는 알림 세 줄 · 상태별 단추나 안내 */
const CARD_CHIP: Record<NonNullable<UsePushDeviceReturn['card']>, { text: string; cls: string }> = {
  '켜짐': { text: '켜짐', cls: 'ok' },
  '꺼짐': { text: '꺼짐', cls: 'muted' },
  '거부됨': { text: '거부됨', cls: 'warn' },
  'ios-install': { text: '이 브라우저에선 불가', cls: 'muted' },
  'kakao-inapp': { text: '이 브라우저에선 불가', cls: 'muted' },
  'unsupported': { text: '이 브라우저에선 불가', cls: 'muted' },
};
const CARD_NOTE: Partial<Record<NonNullable<UsePushDeviceReturn['card']>, string>> = {
  '거부됨': '브라우저 설정에서 이 사이트 알림을 허용해 주세요.',
  'ios-install': '아이폰은 홈 화면에 추가한 앱에서만 알림이 와요.',
  'kakao-inapp': '카카오톡 안에서는 알림을 받을 수 없어요. 다른 브라우저로 열어 주세요.',
  'unsupported': '이 브라우저에선 알림을 받을 수 없어요. 크롬이나 사파리로 열어 주세요.',
};

export function PushCard({ push }: { push: UsePushDeviceReturn }) {
  const { card, busy } = push;
  /* 테스트 알림 쉬는 시간 — 1초마다 남은 시간을 다시 센다(끝나면 멈춘다) */
  const [now, setNow] = useState(() => Date.now());
  const [until, setUntil] = useState(coolUntil);
  const sendTest = async () => { if (await push.test()) { startCool(); setUntil(coolUntil()); setNow(Date.now()); } };
  useEffect(() => {
    if (coolLeft(until, Date.now()) === 0) return;
    /* 남은 시간이 0 이 되면 스스로 멈춘다 — 안 그러면 쉬는 시간이 끝난 뒤에도 1초마다 다시 그린다 */
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (coolLeft(until, Date.now()) === 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [until]);
  const left = coolLeft(until, now);
  const chip = card === null ? { text: '확인 중', cls: 'muted' } : CARD_CHIP[card];
  const note = card === null ? undefined : CARD_NOTE[card];
  const unable = card === 'ios-install' || card === 'kakao-inapp' || card === 'unsupported';
  return (
    <section className="home-card pf-push" aria-label="이 기기 알림">
      <div className="pf-push-h">
        <h2 className="home-h">이 기기 알림</h2>
        <span className={'chip-info ' + chip.cls}>{chip.text}</span>
      </div>
      <ul className="pf-push-list">
        <li>일정 전날 저녁 8시</li>
        <li>내 일정 자리가 다 찼을 때 · 예약이 끝났을 때</li>
        <li>걸어 둔 빈자리가 났을 때</li>
      </ul>
      {note && <p className="pf-push-note">{note}</p>}
      {card === '꺼짐' && (
        <button type="button" className="pf-push-btn on" disabled={busy !== null} onClick={() => void push.enable()}>
          {busy === 'enable' ? '켜는 중…' : '알림 켜기'}
        </button>
      )}
      {/* 5단계 전 서버(404)면 테스트 알림은 숨긴다 */}
      {card === '켜짐' && push.api === 'on' && (
        <button type="button" className="pf-push-btn" disabled={busy !== null || left > 0} onClick={() => void sendTest()}>
          {testLabel(busy === 'test', left)}
        </button>
      )}
      {unable && <button type="button" className="pf-manual-link pf-push-more" onClick={() => push.openGuide()}>자세히 →</button>}
      {/* 이 기기(컴퓨터·안드로이드)는 켜졌는데 아이폰에선 안 오는 사람용 — 아이폰은 홈 화면 앱이어야 해서 따로 안내한다.
          아이폰에서 켜짐이면 이미 홈 화면 앱이라 띄우지 않는다 */}
      {card === '켜짐' && !push.ios && (
        <button type="button" className="pf-manual-link pf-push-more" onClick={() => push.openGuide('ios')}>아이폰에서 알림이 안 오나요? →</button>
      )}
    </section>
  );
}

/* 해 본 테마 카드 — 찾기(서버 테마 목록) · 직접 적기 · 탭 · 쪽 넘김 */
export function PlayedCard({ profile }: { profile: UseProfileReturn }) {
  const { played, pendingIds } = profile;
  /* 지운 줄(되돌리기 자리)은 수·찾기 판정에서 뺀다 — 찾기에서 다시 "해 봤어요"를 누르면 지우기를 거둔다 */
  const kept = useMemo(() => (played === null ? null : withoutPending(played, pendingIds)), [played, pendingIds]);
  /* 더보기 하위 화면과 내 정보가 같이 마운트될 수 있어 id 가 겹치지 않게 한다 */
  const uid = useId();
  const qId = uid + 'q';
  const resId = uid + 'res';
  const whenId = uid + 'when';
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<PlayedSort>('recent');
  const [limit, setLimit] = useState(LIST_STEP);
  /* 언제 했나 — 찾기의 "해 봤어요"와 직접 적기가 같이 쓴다. 누를 때마다 그대로 남아 같은 날 여러 테마를 넣기 쉽다 */
  const [when, setWhen] = useState('');
  const [whenErr, setWhenErr] = useState('');
  const today = todayKst();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mBranch, setMBranch] = useState('');
  const [mErr, setMErr] = useState('');
  const [mBusy, setMBusy] = useState(false);
  const [Bulk, setBulk] = useState<BulkComp | null>(null);
  const [bulkOn, setBulkOn] = useState(false);
  const openBulk = async () => {
    try {
      const m = await loadBulk();
      setBulk(() => m.BulkModal);
      setBulkOn(true);
    } catch {
      showToast('새 버전이 나왔거나 연결이 끊겼어요. 새로 고침해 주세요.');
    }
  };

  const needle = q.trim();
  /* 찾기는 타자가 멈추고 150ms 뒤에 — 테마 목록이 수백 개라 글자마다 다시 거르지 않는다 */
  const [dq, setDq] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDq(needle), 150);
    return () => clearTimeout(t);
  }, [needle]);
  const { themes } = profile;
  const results = useMemo(
    () => (dq && themes ? searchThemes(themes, dq, kept ?? []) : []),
    [dq, themes, kept],
  );

  /* 출처 탭·찾기 글자로 거르고 정렬한 뒤 앞에서 limit 개. 지운 줄은 수에 넣지 않고 그 자리에 "지웠어요 · 되돌리기"로 남긴다(pageRows).
     최근 순이면 연도별로 묶고, 묶음 머리의 수는 보이는 줄과 상관없이 (거른 것 중) 그 해 전체.
     탭·정렬·찾기 글자가 바뀌면 다시 처음 50개부터 */
  const rows = useMemo(
    () => sortPlayed((played ?? []).filter((p) => inTab(p, tab) && matchPlayed(p, dq)), sort),
    [played, tab, sort, dq],
  );
  const listKey = `${tab}|${sort}|${dq}`;
  const [shownKey, setShownKey] = useState(listKey);
  if (shownKey !== listKey) { setShownKey(listKey); setLimit(LIST_STEP); }
  const { shown, count } = pageRows(rows, pendingIds, 0, limit);
  const groups = useMemo(
    () => (sort === 'recent' ? groupByYear(shown, rows.filter((p) => !pendingIds.has(p.id))) : [{ key: 'all', label: '', count, rows: shown }]),
    [sort, shown, rows, pendingIds, count],
  );
  const left = count - Math.min(limit, count);
  const sum = kept && playedSummary(kept, today);
  const tabInfo = TABS.find((t) => t.id === tab)!;

  /* 포커스 — × 를 누르면 그 자리의 "되돌리기"로, 되돌리면 그 줄 × 로, 시간이 다 돼 줄이 사라지면 그 자리에 온 줄로
     (없으면 앞 줄, 그것도 없으면 고른 탭). 사용자가 이미 다른 곳으로 옮겼으면 건드리지 않는다. */
  const listRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lost = () => { const a = document.activeElement; return !a || a === document.body; };
  const fallback = () => tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
  const focusIn = (sel: string) => listRef.current?.querySelector<HTMLButtonElement>(sel);
  const del = async (p: PlayedDto) => {
    const idx = shown.indexOf(p);   // 연도 묶음이 나뉘어도 줄(li)은 shown 순서 그대로 그려진다
    await profile.remove(p, () => requestAnimationFrame(() => {
      if (!lost()) return;
      const items = listRef.current?.querySelectorAll<HTMLLIElement>('li');
      const at = items?.[idx] ?? items?.[idx - 1];
      (at?.querySelector<HTMLButtonElement>('button') ?? fallback())?.focus();
    }));
    requestAnimationFrame(() => focusIn(`[data-undo="${p.id}"]`)?.focus());
  };
  const undoRow = (p: PlayedDto) => {
    if (profile.undo(p.id)) requestAnimationFrame(() => focusIn(`[data-pid="${p.id}"]`)?.focus());
  };

  const picking = useRef(false); // 단추가 꺼지기 전에 빠르게 또 눌러도 한 번만 보낸다
  const pick = async (ref: ThemeRef) => {
    if (picking.current) return;
    const w = checkPlayedOn(when, today);
    if (!w.ok) { setWhenErr(w.why === 'future' ? FUTURE_ERR : BAD_DATE_ERR); return; }
    picking.current = true;
    setAddingKey(ref.themeKey);
    try {
      const r = await profile.add({ themeKey: ref.themeKey, themeName: ref.themeName, branchName: ref.branchName, playedOn: w.playedOn });
      showToast(addedText(r, w.playedOn));
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      picking.current = false;
      setAddingKey(null);
    }
  };

  const openManual = () => {
    setManualOpen(true);
    if (!mName && needle) setMName(needle.slice(0, NAME_MAX));
    setMErr('');
  };

  const submitManual = async (e: FormEvent) => {
    e.preventDefault();
    const name = mName.trim(), branch = mBranch.trim();
    /* 서버는 글자·숫자가 하나도 없는 이름('!!!' 같은)을 거절한다 — 보내기 전에 막는다 */
    if (!isPlayableName(name)) { setMErr('테마 이름을 글자로 적어 주세요.'); return; }
    if (cpLen(name) > NAME_MAX) { setMErr(`테마 이름은 ${NAME_MAX}자까지예요.`); return; }
    if (cpLen(branch) > NAME_MAX) { setMErr(`매장·지점은 ${NAME_MAX}자까지예요.`); return; }
    const w = checkPlayedOn(when, today);
    if (!w.ok) { setMErr(w.why === 'future' ? FUTURE_ERR : BAD_DATE_ERR); return; }
    if (picking.current) return;
    picking.current = true;
    setMBusy(true);
    setMErr('');
    try {
      const r = await profile.add({ themeName: name, branchName: branch || null, playedOn: w.playedOn });
      showToast(addedText(r, w.playedOn));
      setMName('');
      setMBranch('');
      setManualOpen(false);
    } catch (err) {
      setMErr((err as Error).message);
    } finally {
      picking.current = false;
      setMBusy(false);
    }
  };

  return (
    <section className="home-card pf-played" aria-label="해 본 테마">
      <div className="pf-h">
        <h2 className="home-h">해 본 테마</h2>
        {kept && <span className="pf-n">{kept.length}개</span>}
      </div>

      <div className="pf-search">
        <label htmlFor={qId} className="sr-only">테마 찾기</label>
        <input
          id={qId} className="pf-q" type="search" autoComplete="off" placeholder="테마나 매장 이름으로 찾기"
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => void profile.loadThemes()}
        />
        <svg className="pf-q-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        {dq && (
          <section className="pf-results" aria-labelledby={resId}>
            <h3 id={resId} className="sr-only">찾은 테마</h3>
            {/* 언제 했나 — 아래 "해 봤어요"가 이 날짜로 기록한다(직접 적기 칸과 같은 값) */}
            {profile.themes !== null && results.length > 0 && whenField('search')}
            {profile.themes === null ? (
              <p className="pf-res-note">{profile.themesError || '테마 목록을 불러오는 중…'}</p>
            ) : results.length === 0 ? (
              <p className="pf-res-note">찾는 테마가 없어요. 아래에서 직접 적어 주세요.</p>
            ) : results.map(({ ref, recorded }) => (
              <div key={ref.themeKey} className={'pf-res' + (recorded ? ' done' : '')}>
                <span className="pf-res-n">{ref.themeName}</span>
                <span className="pf-res-b">{ref.storeName} · {ref.branchName}</span>
                <WishToggle theme={{ themeKey: ref.themeKey, themeName: ref.themeName, branchName: ref.branchName }} />
                {recorded ? <span className="pf-res-a">기록됨</span> : (
                  <button type="button" className="pf-res-btn" disabled={addingKey !== null || mBusy}
                    onClick={() => void pick(ref)}>{addingKey === ref.themeKey ? '기록 중…' : '해 봤어요'}</button>
                )}
              </div>
            ))}
          </section>
        )}
        {manualOpen && (
          <form className="pf-manual" onSubmit={(e) => void submitManual(e)} noValidate>
            <label className="pf-field">
              <span>테마 이름</span>
              <input value={mName} onChange={(e) => { setMName(e.target.value); setMErr(''); }} maxLength={NAME_MAX * 2}
                placeholder="예: 비밀의 화원" aria-invalid={mErr ? true : undefined} />
            </label>
            <label className="pf-field">
              <span>매장·지점 <em>(없어도 돼요)</em></span>
              <input value={mBranch} onChange={(e) => { setMBranch(e.target.value); setMErr(''); }} maxLength={NAME_MAX * 2}
                placeholder="예: 제로월드 강남점" />
            </label>
            {whenField('manual')}
            {mErr && <p className="merr" role="alert">{mErr}</p>}
            <div className="pf-manual-btns">
              <button type="button" className="btn" onClick={() => { setManualOpen(false); setMErr(''); }}>닫기</button>
              <button type="submit" className="btn pf-save" disabled={mBusy || addingKey !== null}>{mBusy ? '기록 중…' : '기록하기'}</button>
            </div>
          </form>
        )}
        {/* 한 개는 직접 적기, 여러 개(수백 개)는 한꺼번에 넣기 창으로 */}
        <div className="pf-links">
          {!manualOpen && <button type="button" className="pf-manual-link" onClick={openManual}>찾는 테마가 없으면 직접 적기</button>}
          <button type="button" className="pf-manual-link" onClick={() => void openBulk()}>여러 개 한꺼번에 넣기</button>
        </div>
      </div>
      {bulkOn && Bulk && <Bulk profile={profile} onClose={() => setBulkOn(false)} />}

      <div role="tablist" className="home-tabs pf-tabs" ref={tabsRef}>
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={'chip-pick' + (tab === t.id ? ' on' : '')}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>
      {sum && sum.total > 0 && (
        <div className="pf-sumrow">
          <span className="pf-sum">모두 {sum.total}개 · 올해 {sum.thisYear}개{dq && ` · 찾은 기록 ${count}개`}</span>
          <div className="pf-sort" role="group" aria-label="정렬">
            {(['recent', 'name'] as const).map((k) => (
              <button key={k} type="button" className="chip-pick" aria-pressed={sort === k}
                onClick={() => setSort(k)}>{k === 'recent' ? '최근 순' : '이름 순'}</button>
            ))}
          </div>
        </div>
      )}

      {played === null ? (
        profile.error ? (
          <div className="home-empty">
            <p>{profile.error}</p>
            <button type="button" className="btn" onClick={() => void profile.reloadPlayed()}>다시 시도</button>
          </div>
        ) : <p className="home-empty-p pf-loading">불러오는 중…</p>
      ) : count === 0 && shown.length === 0 ? (
        <p className="home-empty-p pf-loading">{dq ? `'${dq}' 들어간 기록이 없어요.` : tabInfo.empty}</p>
      ) : (
        /* 넓은 화면에선 카드가 끝없이 길어지지 않게 이 상자 안에서 굴린다(floduler.css) */
        <div className="pf-listbox" ref={listRef}>
          {groups.map((g) => g.label ? (
            <section key={g.key} className="pf-yr" aria-label={`${g.label} ${g.count}개`}>
              <h3 className="pf-yr-h" aria-hidden="true">{g.label}<span> · {g.count}개</span></h3>
              <ul className="pf-list">{g.rows.map(rowOf)}</ul>
            </section>
          ) : <ul key={g.key} className="pf-list">{g.rows.map(rowOf)}</ul>)}
          {left > 0 && (
            <button type="button" className="pf-more" onClick={() => setLimit((n) => n + LIST_STEP)}>
              더 보기 <span>· {left}개 남음</span>
            </button>
          )}
        </div>
      )}
    </section>
  );

  /* 언제 했나 칸 — 찾기 결과 위와 직접 적기 폼 안 두 곳. 값은 하나(when), 두 곳이 같이 보일 수 있어 id 는 나눈다.
     찾기 쪽 잘못은 칸 아래(whenErr), 직접 적기 쪽은 폼의 오류 줄(mErr)에 */
  function whenField(at: 'search' | 'manual') {
    const id = whenId + at;
    return (
      <div className={at === 'search' ? 'pf-when' : 'pf-field pf-when-f'}>
        <label htmlFor={id}>언제 했나요?</label>
        <span className="pf-when-row">
          <input id={id} type="date" min={PLAYED_MIN} max={today} value={when} aria-invalid={whenErr ? true : undefined}
            aria-describedby={whenErr ? id + 'e' : undefined}
            onChange={(e) => { setWhen(e.target.value); setWhenErr(''); setMErr(''); }} />
          {when
            ? <button type="button" className="pf-when-x" onClick={() => { setWhen(''); setWhenErr(''); setMErr(''); }}>날짜 빼기</button>
            : <em>몰라도 돼요</em>}
        </span>
        {whenErr && at === 'search' && <p id={id + 'e'} className="merr" role="alert">{whenErr}</p>}
      </div>
    );
  }

  function rowOf(p: PlayedDto) {
    if (pendingIds.has(p.id)) {
      /* 지운 줄 — 6초 뒤 보낸다. 마우스·포커스가 이 줄에 있는 동안은 기다린다.
         마우스는 enter 대신 move 로 본다 — × 를 누른 그 자리에서 줄이 바뀌면 포인터가 이미 안에 있어 enter 가 오지 않는다 */
      return (
        <li key={p.id} className="pf-row pf-gone"
          onMouseMove={() => profile.hold(p.id, 'hover')} onMouseLeave={() => profile.release(p.id, 'hover')}
          onFocus={() => profile.hold(p.id, 'focus')} onBlur={() => profile.release(p.id, 'focus')}>
          <span className="pf-gone-t">지웠어요<span className="pf-gone-n"> · {p.themeName}</span></span>
          <button type="button" className="pf-undo" data-undo={p.id} aria-label={`${p.themeName} 되돌리기`}
            onClick={() => undoRow(p)}>되돌리기</button>
        </li>
      );
    }
    const src = sourceLabel(p);
    /* 최근 순은 연도 머리가 있어 "3/15 (금)", 이름 순은 연도까지 */
    const day = p.playedOn && (sort === 'recent' ? dayLabel(p.playedOn) : fullDay(p.playedOn));
    const meta = [p.storeName, p.branchName, day].filter(Boolean).join(' · ');
    return (
      <li key={p.id} className="pf-row">
        <div className="pf-row-main">
          <div className="pf-row-n">{p.themeName}</div>
          {meta && <div className="pf-row-m">{meta}</div>}
        </div>
        <span className={'chip-info pf-src' + (p.source === 'MANUAL' ? '' : ' muted')}>{src}</span>
        <button type="button" className="pf-del" data-pid={p.id} aria-label={`${p.themeName} 기록 지우기`} title="지우기"
          onClick={() => void del(p)}>×</button>
      </li>
    );
  }
}
