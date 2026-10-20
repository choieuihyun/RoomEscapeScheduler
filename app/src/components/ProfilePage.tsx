import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { cpLen, dayLabel, eventStatus, eventTitle, STATUS_LABEL, weekday } from '../clubEvents';
import { coolLeft, coolUntil, startCool, testLabel } from '../pushCool';
import { isPlayableName, searchThemes, sourceLabel } from '../played';
import type { EventDto, MeDto, PlayedDto, ThemeRef } from '../server';
import { showToast } from '../toast';
import { pageRows, withoutPending, type UseProfileReturn } from '../useProfile';
import type { UsePushDeviceReturn } from '../usePushDevice';

/* 내 정보 — 계획 Task 7, 작업명세서 §4.9 "화면 쪽 약속". 홈과 같은 세 칸 카드:
   ① 프로필(닉네임·역할·로그인 수단·숫자 둘)과 그 아래 이 기기 알림(5단계, Task 11),
   ② 해 본 테마(찾아서 기록·직접 적기·탭·지우기), ③ 지난 동호회 일정. */

const PER_PAGE = 10;

type Tab = 'all' | 'manual' | 'auto';
const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'all', label: '전체', empty: '아직 기록한 테마가 없어요. 위에서 찾아 "해 봤어요"를 눌러 보세요.' },
  { id: 'manual', label: '직접 적은 것', empty: '직접 기록한 테마가 없어요.' },
  { id: 'auto', label: '일정에서 자동', empty: '일정에서 들어온 기록이 없어요. 예약 완료한 동호회 일정이 지나면 다음 날 새벽에 저절로 들어와요.' },
];
/* "일정에서 자동" 탭에는 개인 "다녀온 일정"에서 온 것(PLAN)도 같이 둔다 — 둘 다 손으로 적지 않은 기록이다 */
const inTab = (p: PlayedDto, tab: Tab) => tab === 'all' || (tab === 'manual' ? p.source === 'MANUAL' : p.source !== 'MANUAL');

const NAME_MAX = 40;
const dowClass = (dow: number) => (dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');

export function ProfilePage({
  profile, member, providerIds, isAdmin, pendingCount, onMembers, onOpenEvent, push,
}: {
  profile: UseProfileReturn;
  push: UsePushDeviceReturn;
  member: MeDto | null;
  providerIds: string[];
  isAdmin: boolean;
  /* 운영진의 멤버 관리 길(§4.59) — 좁은 화면의 아래 탭엔 멤버 관리가 없어서 여기 맨 위에 둔다 */
  pendingCount: number;
  onMembers: () => void;
  onOpenEvent: (ev: EventDto) => void;
}) {
  const { played } = profile;
  const kept = played === null ? null : withoutPending(played, profile.pendingIds);
  const nickname = member?.nickname?.trim() || '';
  const initial = [...nickname][0] ?? '?';

  /* 로그인 수단 — 카카오는 서버가 붙인 것이라 member.kakaoLinked 로, 구글은 Firebase 로그인 수단으로 안다 */
  const linked = [
    ...(member?.kakaoLinked ? ['카카오'] : []),
    ...(providerIds.includes('google.com') ? ['구글'] : []),
  ];
  const linkLine = linked.length > 0 ? `${linked.join(' · ')} 연결됨`
    : providerIds.includes('password') ? '아이디로 로그인해요' : '';

  /* 지난 일정 수 — 서버가 주는 전체 수(받은 쪽 수와 상관없이) */
  const pastCount = profile.pastTotal ?? '–';

  return (
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
          <div className="home-avatar" aria-hidden="true">{initial}</div>
          <b className="home-name">{nickname} 님</b>
          <span className={'chip-info pf-role' + (isAdmin ? ' role' : '')}>{isAdmin ? '운영진' : '멤버'}</span>
          {linkLine && <span className="pf-link">{linkLine}</span>}
          <div className="pf-stats">
            <div><b>{kept === null ? '–' : kept.length}</b><span>해 본 테마</span></div>
            <div><b>{pastCount}</b><span>동호회 일정</span></div>
          </div>
        </section>
        <PushCard push={push} />
      </div>

      <PlayedCard profile={profile} />

      <PastCard profile={profile} onOpenEvent={onOpenEvent} />
    </div>
  );
}

/* 지난 동호회 일정 카드 — 내 정보 세 번째 칸, 좁은 화면 더보기의 하위 화면(§4.60)이 같이 쓴다 */
export function PastCard({ profile, onOpenEvent }: { profile: UseProfileReturn; onOpenEvent: (ev: EventDto) => void }) {
  const { past } = profile;
  return (
    <section className="home-card pf-past" aria-label="지난 동호회 일정">
      <h2 className="home-h">지난 동호회 일정</h2>
      {past === null ? (
        profile.pastError ? (
          <div className="home-empty">
            <p>{profile.pastError}</p>
            <button type="button" className="btn" onClick={() => void profile.retryPast()}>다시 시도</button>
          </div>
        ) : <p className="home-empty-p pf-loading">불러오는 중…</p>
      ) : past.length === 0 ? (
        <p className="home-empty-p pf-loading">지난 동호회 일정이 아직 없어요.</p>
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
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(0);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mBranch, setMBranch] = useState('');
  const [mErr, setMErr] = useState('');
  const [mBusy, setMBusy] = useState(false);

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

  /* 지운 줄은 쪽 넘김·수에 넣지 않고 그 자리에 "지웠어요 · 되돌리기"로 남긴다(pageRows).
     지우면 마지막 쪽이 비어 없어질 수 있다 — 쪽 번호는 그리면서 맞춘다 */
  const rows = (played ?? []).filter((p) => inTab(p, tab));
  const { shown, pages, count, cur } = pageRows(rows, pendingIds, page, PER_PAGE);
  const tabInfo = TABS.find((t) => t.id === tab)!;

  /* 포커스 — × 를 누르면 그 자리의 "되돌리기"로, 되돌리면 그 줄 × 로, 시간이 다 돼 줄이 사라지면 그 자리에 온 줄로
     (없으면 앞 줄, 그것도 없으면 고른 탭). 사용자가 이미 다른 곳으로 옮겼으면 건드리지 않는다. */
  const listRef = useRef<HTMLUListElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lost = () => { const a = document.activeElement; return !a || a === document.body; };
  const fallback = () => tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
  const focusIn = (sel: string) => listRef.current?.querySelector<HTMLButtonElement>(sel);
  const del = async (p: PlayedDto, idx: number) => {
    await profile.remove(p, () => requestAnimationFrame(() => {
      if (!lost()) return;
      const items = listRef.current?.querySelectorAll<HTMLLIElement>(':scope > li');
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
    picking.current = true;
    setAddingKey(ref.themeKey);
    try {
      const r = await profile.add({ themeKey: ref.themeKey, themeName: ref.themeName, branchName: ref.branchName });
      showToast(r.existed ? '이미 기록돼 있어요.' : '기록했어요.');
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
    if (picking.current) return;
    picking.current = true;
    setMBusy(true);
    setMErr('');
    try {
      const r = await profile.add({ themeName: name, branchName: branch || null });
      showToast(r.existed ? '이미 기록돼 있어요.' : '기록했어요.');
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
        <label htmlFor="pf-q" className="sr-only">테마 찾기</label>
        <input
          id="pf-q" className="pf-q" type="search" autoComplete="off" placeholder="테마나 매장 이름으로 찾기"
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => void profile.loadThemes()}
        />
        <svg className="pf-q-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        {dq && (
          <section className="pf-results" aria-labelledby="pf-res-h">
            <h3 id="pf-res-h" className="sr-only">찾은 테마</h3>
            {profile.themes === null ? (
              <p className="pf-res-note">{profile.themesError || '테마 목록을 불러오는 중…'}</p>
            ) : results.length === 0 ? (
              <p className="pf-res-note">찾는 테마가 없어요. 아래에서 직접 적어 주세요.</p>
            ) : results.map(({ ref, recorded }) => (
              <div key={ref.themeKey} className={'pf-res' + (recorded ? ' done' : '')}>
                <span className="pf-res-n">{ref.themeName}</span>
                <span className="pf-res-b">{ref.storeName} · {ref.branchName}</span>
                {recorded ? <span className="pf-res-a">기록됨</span> : (
                  <button type="button" className="pf-res-btn" disabled={addingKey !== null || mBusy}
                    onClick={() => void pick(ref)}>{addingKey === ref.themeKey ? '기록 중…' : '해 봤어요'}</button>
                )}
              </div>
            ))}
          </section>
        )}
        {!manualOpen ? (
          <button type="button" className="pf-manual-link" onClick={openManual}>찾는 테마가 없으면 직접 적기</button>
        ) : (
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
            {mErr && <p className="merr" role="alert">{mErr}</p>}
            <div className="pf-manual-btns">
              <button type="button" className="btn" onClick={() => { setManualOpen(false); setMErr(''); }}>닫기</button>
              <button type="submit" className="btn pf-save" disabled={mBusy || addingKey !== null}>{mBusy ? '기록 중…' : '기록하기'}</button>
            </div>
          </form>
        )}
      </div>

      <div role="tablist" className="home-tabs pf-tabs" ref={tabsRef}>
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={'chip-pick' + (tab === t.id ? ' on' : '')}
            onClick={() => { setTab(t.id); setPage(0); }}
          >{t.label}</button>
        ))}
      </div>

      {played === null ? (
        profile.error ? (
          <div className="home-empty">
            <p>{profile.error}</p>
            <button type="button" className="btn" onClick={() => void profile.reloadPlayed()}>다시 시도</button>
          </div>
        ) : <p className="home-empty-p pf-loading">불러오는 중…</p>
      ) : count === 0 && shown.length === 0 ? (
        <p className="home-empty-p pf-loading">{tabInfo.empty}</p>
      ) : (
        <ul className="pf-list" ref={listRef}>
          {shown.map((p, i) => {
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
            const meta = [p.storeName, p.branchName, p.playedOn && dayLabel(p.playedOn)].filter(Boolean).join(' · ');
            return (
              <li key={p.id} className="pf-row">
                <div className="pf-row-main">
                  <div className="pf-row-n">{p.themeName}</div>
                  {meta && <div className="pf-row-m">{meta}</div>}
                </div>
                <span className={'chip-info pf-src' + (p.source === 'MANUAL' ? '' : ' muted')}>{src}</span>
                <button type="button" className="pf-del" data-pid={p.id} aria-label={`${p.themeName} 기록 지우기`} title="지우기"
                  onClick={() => void del(p, i)}>×</button>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <div className="home-pager">
          <button type="button" aria-label="이전" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹</button>
          <span>{cur + 1}/{pages}</span>
          <button type="button" aria-label="다음" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>›</button>
        </div>
      )}
    </section>
  );
}
