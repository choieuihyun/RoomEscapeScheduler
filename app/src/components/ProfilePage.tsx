import { useState, type FormEvent } from 'react';
import { cpLen, dayLabel, eventStatus, eventTitle, STATUS_LABEL, weekday } from '../clubEvents';
import { isPlayableName, searchThemes, sourceLabel } from '../played';
import type { EventDto, MeDto, PlayedDto, ThemeRef } from '../server';
import { showToast } from '../toast';
import type { UseProfileReturn } from '../useProfile';

/* 내 정보 — 계획 Task 7, 작업명세서 §4.9 "화면 쪽 약속". 홈과 같은 세 칸 카드:
   ① 프로필(닉네임·역할·로그인 수단·숫자 둘), ② 해 본 테마(찾아서 기록·직접 적기·탭·지우기), ③ 지난 동호회 일정.
   ① 아래 "이 기기 알림" 카드는 5단계(Task 11)가 붙인다. */

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
  profile, member, providerIds, isAdmin, onOpenEvent,
}: {
  profile: UseProfileReturn;
  member: MeDto | null;
  providerIds: string[];
  isAdmin: boolean;
  onOpenEvent: (ev: EventDto) => void;
}) {
  const { played, past } = profile;
  const nickname = member?.nickname?.trim() || '';
  const initial = [...nickname][0] ?? '?';

  /* 로그인 수단 — 카카오는 서버가 붙인 것이라 member.kakaoLinked 로, 구글은 Firebase 로그인 수단으로 안다 */
  const linked = [
    ...(member?.kakaoLinked ? ['카카오'] : []),
    ...(providerIds.includes('google.com') ? ['구글'] : []),
  ];
  const linkLine = linked.length > 0 ? `${linked.join(' · ')} 연결됨`
    : providerIds.includes('password') ? '아이디로 로그인해요' : '';

  /* 지난 일정 수 — 서버가 총수를 주지 않아 받은 만큼 세고, 더 있으면 "+" */
  const pastCount = past === null ? '–' : `${past.length}${profile.hasMorePast ? '+' : ''}`;

  return (
    <div className="pf-grid">
      <div className="pf-col">
        <section className="home-card home-me pf-me" aria-label="내 프로필">
          <div className="home-avatar" aria-hidden="true">{initial}</div>
          <b className="home-name">{nickname} 님</b>
          <span className={'chip-info pf-role' + (isAdmin ? ' role' : '')}>{isAdmin ? '운영진' : '멤버'}</span>
          {linkLine && <span className="pf-link">{linkLine}</span>}
          <div className="pf-stats">
            <div><b>{played === null ? '–' : played.length}</b><span>해 본 테마</span></div>
            <div><b>{pastCount}</b><span>동호회 일정</span></div>
          </div>
        </section>
      </div>

      <PlayedCard profile={profile} />

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
    </div>
  );
}

/* 해 본 테마 카드 — 찾기(서버 테마 목록) · 직접 적기 · 탭 · 쪽 넘김 */
function PlayedCard({ profile }: { profile: UseProfileReturn }) {
  const { played } = profile;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(0);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mBranch, setMBranch] = useState('');
  const [mErr, setMErr] = useState('');
  const [mBusy, setMBusy] = useState(false);

  const mine = played ?? [];
  const needle = q.trim();
  const results = needle && profile.themes ? searchThemes(profile.themes, needle, mine) : [];

  const rows = mine.filter((p) => inTab(p, tab));
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  /* 지우면 마지막 쪽이 비어 없어질 수 있다 — 쪽 번호는 그리면서 맞춘다 */
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const tabInfo = TABS.find((t) => t.id === tab)!;

  const pick = async (ref: ThemeRef) => {
    setAddingKey(ref.themeKey);
    try {
      const r = await profile.add({ themeKey: ref.themeKey, themeName: ref.themeName, branchName: ref.branchName });
      showToast(r.existed ? '이미 기록돼 있어요.' : '기록했어요.');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
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
      setMBusy(false);
    }
  };

  return (
    <section className="home-card pf-played" aria-label="해 본 테마">
      <div className="pf-h">
        <h2 className="home-h">해 본 테마</h2>
        {played && <span className="pf-n">{played.length}개</span>}
      </div>

      <div className="pf-search">
        <label htmlFor="pf-q" className="sr-only">테마 찾기</label>
        <input
          id="pf-q" className="pf-q" type="search" autoComplete="off" placeholder="테마나 매장 이름으로 찾기"
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => void profile.loadThemes()}
        />
        <svg className="pf-q-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        {needle && (
          <div className="pf-results" aria-label="찾은 테마">
            {profile.themes === null ? (
              <p className="pf-res-note">{profile.themesError || '테마 목록을 불러오는 중…'}</p>
            ) : results.length === 0 ? (
              <p className="pf-res-note">찾는 테마가 없어요. 아래에서 직접 적어 주세요.</p>
            ) : results.map(({ ref, recorded }) => (
              <div key={ref.themeKey} className={'pf-res' + (recorded ? ' done' : '')}>
                <span className="pf-res-n">{ref.themeName}</span>
                <span className="pf-res-b">{ref.storeName} · {ref.branchName}</span>
                {recorded ? <span className="pf-res-a">기록됨</span> : (
                  <button type="button" className="pf-res-btn" disabled={addingKey !== null}
                    onClick={() => void pick(ref)}>{addingKey === ref.themeKey ? '기록 중…' : '해 봤어요'}</button>
                )}
              </div>
            ))}
          </div>
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
              <button type="submit" className="btn pf-save" disabled={mBusy}>{mBusy ? '기록 중…' : '기록하기'}</button>
            </div>
          </form>
        )}
      </div>

      <div role="tablist" className="home-tabs pf-tabs">
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
      ) : shown.length === 0 ? (
        <p className="home-empty-p pf-loading">{tabInfo.empty}</p>
      ) : (
        <ul className="pf-list">
          {shown.map((p) => {
            const src = sourceLabel(p);
            const meta = [p.branchName, p.playedOn && dayLabel(p.playedOn)].filter(Boolean).join(' · ');
            return (
              <li key={p.id} className="pf-row">
                <div className="pf-row-main">
                  <div className="pf-row-n">{p.themeName}</div>
                  {meta && <div className="pf-row-m">{meta}</div>}
                </div>
                <span className={'chip-info pf-src' + (p.source === 'MANUAL' ? '' : ' muted')}>{src}</span>
                <button type="button" className="pf-del" aria-label={`${p.themeName} 기록 지우기`} title="지우기"
                  disabled={profile.busyIds.has(p.id)} onClick={() => void profile.remove(p)}>×</button>
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
