import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { addWishFor, removeWishFor, reloadWishes, useClubStore, WishToggle } from '../clubStore';
import { cpLen } from '../clubEvents';
import type { FormState } from '../eventForm';
import { isPlayableName, searchThemes } from '../played';
import { regionCounts, type RegionPick } from '../regions';
import { listClubWishes, listThemes, sayClub, type EventDto, type PlayedDto, type ThemeRef, type WishGroupDto } from '../server';
import {
  filterGroups, inPick, isMine, placeLabel, upcomingWith, wanterChips, wishForm, wishKey, WISH_PICKS, type WishPick,
} from '../wish';

/* 같이 가요(§4.12) — 하고 싶은 테마를 올려 두면 같은 테마를 원하는 멤버가 보인다. 알림은 없다.
   위: 내가 하고 싶은 테마(칩, × 로 내리기) + 테마 더하기(해 본 테마 찾기와 같은 찾기, 없으면 직접 적기).
   아래: 멤버들이 하고 싶은 테마 카드(서버 순서 — 원하는 사람 많은 순). 화면에 들어올 때마다 묶음을 새로 받는다. */

/* 테마 목록(공개 API)은 이 화면을 여러 번 열어도 한 번만 받는다 */
let themeCache: ThemeRef[] | null = null;
const NAME_MAX = 40;

export function TogetherPage({ active, meUid, today, events, played, onBack, onMakeEvent, onOpenEvent }: {
  active: boolean; meUid: string; today: string;
  /* 앱이 받아 둔 동호회 일정 — 카드의 "10/24 일정 있음" */
  events: EventDto[];
  /* 내 해 본 테마 — 찾기 결과의 "해 봄". 모르면 표시만 빠진다 */
  played: PlayedDto[] | null;
  onBack: () => void;
  onMakeEvent: (form: FormState) => void;
  onOpenEvent: (ev: EventDto) => void;
}) {
  const id = useId();
  const s = useClubStore();
  const [groups, setGroups] = useState<WishGroupDto[] | null>(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<WishPick>('all');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState<RegionPick>('전체');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const t = await (await import('../cloud')).idToken();
      if (!t) throw new Error('로그인해 주세요.');
      const r = await listClubWishes(t);
      if (my === seq.current) { setGroups(r); setErr(''); }
    } catch (e) {
      if (my === seq.current) setErr(sayClub(e));
    }
  }, []);
  /* 들어올 때마다 — 내 목록도 같이(다른 기기에서 고쳤을 수 있다) */
  useEffect(() => {
    if (!active) return;
    void Promise.resolve().then(() => { void load(); void reloadWishes(); }); // 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다
  }, [active, load]);

  const regions = useMemo(() => regionCounts((groups ?? []).map((g) => ({ storeName: g.storeName ?? '', branchName: g.branchName ?? '' }))), [groups]);
  const shownRegion: RegionPick = regions.some((r) => r.region === region) ? region : '전체';
  const shown = useMemo(() => (groups ? filterGroups(groups, { pick, q, region: shownRegion, meUid }) : []), [groups, pick, q, shownRegion, meUid]);

  const toggleMine = async (g: WishGroupDto) => {
    const ok = isMine(g, meUid) ? await removeWishFor(g) : await addWishFor(g);
    if (ok) void load();
  };

  return (<>
    <header className="page-head">
      <button type="button" className="page-back" onClick={onBack}><span aria-hidden="true">‹</span> 더보기</button>
      <h1>같이 가요</h1>
      <p>하고 싶은 테마를 올려 두면 같은 테마를 원하는 멤버가 보여요.</p>
    </header>
    <div className="tg">
      <MineCard played={played} onChanged={() => void load()} />

      <section className="tg-sec" aria-labelledby={id + 'h'}>
        <div className="tg-sec-h">
          <h2 id={id + 'h'} className="tg-h">멤버들이 하고 싶은 테마</h2>
          {groups && groups.length > 0 && <span className="tg-n">{groups.length}개</span>}
        </div>
        {groups && groups.length > 0 && (
          <div className="tg-bar">
            <div className="tg-picks" role="group" aria-label="거르기">
              {WISH_PICKS.map((p) => (
                <button key={p.id} type="button" className="chip-pick" aria-pressed={pick === p.id} onClick={() => setPick(p.id)}>
                  {p.label} <span className="tg-pick-n">{groups.filter((g) => inPick(g, p.id, meUid)).length}</span>
                </button>
              ))}
            </div>
            <div className="ppl-q tg-q">
              <label htmlFor={id + 'q'} className="sr-only">테마 찾기</label>
              <input id={id + 'q'} type="search" autoComplete="off" placeholder="테마·매장·멤버로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
              <svg className="pf-q-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </div>
            {regions.length > 1 && (
              <div className="tg-regions" role="group" aria-label="지역">
                <span className="tg-rl" aria-hidden="true">지역</span>
                {(['전체', ...regions.map((r) => r.region)] as RegionPick[]).map((r) => (
                  <button key={r} type="button" className="chip-pick sm" aria-pressed={shownRegion === r} onClick={() => setRegion(r)}>{r}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {err && <div className="home-empty"><p>{err}</p><button type="button" className="btn" onClick={() => void load()}>다시 시도</button></div>}
        {!err && groups === null && <p className="mem-empty">불러오는 중이에요…</p>}
        {groups && groups.length === 0 && (
          <div className="tg-empty">
            <p>아직 아무도 올리지 않았어요.<br />하고 싶은 테마를 먼저 올려 보세요.</p>
          </div>
        )}
        {groups && groups.length > 0 && shown.length === 0 && (
          <p className="mem-empty">{q.trim() ? `'${q.trim()}' 와 맞는 테마가 없어요.` : '조건에 맞는 테마가 없어요.'}</p>
        )}
        {shown.length > 0 && (
          <ul className="tg-grid">
            {shown.map((g) => {
              const mine = isMine(g, meUid);
              const n = g.wanters.length;
              const up = upcomingWith(g, events, today);
              const place = placeLabel(g);
              const busy = s.busy.has(wishKey(g)) || s.wishApi !== 'on';
              return (
                <li key={wishKey(g) + '|' + g.wanters[0]?.since} className={'tg-card' + (mine ? ' mine' : '')}>
                  <div className="tg-top">
                    <b className="tg-name">{g.themeName}</b>
                    {place && <span className="tg-place">{place}</span>}
                  </div>
                  <p className="tg-want"><b>{n}명</b>이 하고 싶어해요</p>
                  <ul className="tg-who" aria-label="하고 싶은 사람">
                    {wanterChips(g, meUid).map((w) => <li key={w.uid} className={'tg-p' + (w.me ? ' me' : '')}>{w.name}</li>)}
                  </ul>
                  {(g.playedBy.length > 0 || up) && (
                    <p className="tg-meta">
                      {g.playedBy.length > 0 && <span>해 본 멤버 {g.playedBy.length}명</span>}
                      {up && (
                        <button type="button" className="tg-ev" onClick={() => onOpenEvent(up.ev)}>
                          {+up.date.slice(5, 7)}/{+up.date.slice(8, 10)} 일정 있음 · 보기 <span aria-hidden="true">›</span>
                        </button>
                      )}
                    </p>
                  )}
                  <div className="tg-acts">
                    <button type="button" className="chip-pick tg-me" aria-pressed={mine} disabled={busy} onClick={() => void toggleMine(g)}>
                      {mine ? '나도 ✓' : '나도'}
                    </button>
                    <button type="button" className={(n >= 2 ? 'btn-go' : 'btn') + ' tg-make'} onClick={() => onMakeEvent(wishForm(g, today))}>
                      {n >= 2 ? '이 사람들과 일정 만들기' : '일정 만들기'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  </>);
}

/* 내가 하고 싶은 테마 — 칩(× 로 내리기) + 테마 더하기 */
function MineCard({ played, onChanged }: { played: PlayedDto[] | null; onChanged: () => void }) {
  const id = useId();
  const s = useClubStore();
  const [adding, setAdding] = useState(false);
  const [themes, setThemes] = useState<ThemeRef[] | null>(themeCache);
  const [themesErr, setThemesErr] = useState('');
  const [q, setQ] = useState('');
  const [manual, setManual] = useState(false);
  const [mName, setMName] = useState('');
  const [mBranch, setMBranch] = useState('');
  const [mErr, setMErr] = useState('');
  const qRef = useRef<HTMLInputElement>(null);

  const openAdd = () => {
    setAdding(true);
    requestAnimationFrame(() => qRef.current?.focus());
    if (themes) return;
    listThemes().then((l) => { themeCache = l; setThemes(l); setThemesErr(''); }, (e) => setThemesErr(sayClub(e)));
  };
  /* 찾기는 타자가 멈추고 150ms 뒤에 — 테마 목록이 수백 개다(해 본 테마 찾기와 같게) */
  const [dq, setDq] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);
  const results = useMemo(() => (dq && themes ? searchThemes(themes, dq, played ?? []) : []), [dq, themes, played]);

  const submitManual = async (e: FormEvent) => {
    e.preventDefault();
    const name = mName.trim(), branch = mBranch.trim();
    if (!isPlayableName(name)) { setMErr('테마 이름을 글자로 적어 주세요.'); return; }
    if (cpLen(name) > NAME_MAX) { setMErr(`테마 이름은 ${NAME_MAX}자까지예요.`); return; }
    if (cpLen(branch) > NAME_MAX) { setMErr(`매장·지점은 ${NAME_MAX}자까지예요.`); return; }
    setMErr('');
    if (await addWishFor({ themeKey: null, themeName: name, branchName: branch || null })) {
      setMName(''); setMBranch(''); setManual(false);
      onChanged();
    }
  };

  const mine = s.wishes ?? [];
  return (
    <section className="home-card tg-mine" aria-labelledby={id + 'h'}>
      <div className="tg-sec-h">
        <h2 id={id + 'h'} className="tg-h">내가 하고 싶은 테마</h2>
        {s.wishes && <span className="tg-n">{mine.length}개</span>}
        {!adding && <button type="button" className="btn tg-add" onClick={openAdd}>＋ 테마 더하기</button>}
      </div>
      {s.wishes === null ? (
        <p className="tg-note">{s.wishErr || '불러오는 중이에요…'}</p>
      ) : mine.length === 0 ? (
        <p className="tg-note">아직 올린 테마가 없어요. 하고 싶은 테마를 더해 보세요.</p>
      ) : (
        <ul className="tg-chips" aria-label="내가 올린 테마">
          {mine.map((w) => {
            const place = placeLabel(w);
            return (
              <li key={w.id} className="tg-chip">
                <span className="tg-chip-n">{w.themeName}</span>
                {place && <span className="tg-chip-b">{place}</span>}
                <button type="button" aria-label={`${w.themeName} 내리기`} disabled={s.busy.has(wishKey(w))}
                  onClick={() => void removeWishFor(w).then((ok) => { if (ok) onChanged(); })}>×</button>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="tg-addbox">
          <div className="tg-addbar">
            <div className="ppl-q tg-q">
              <label htmlFor={id + 'q'} className="sr-only">테마 찾기</label>
              <input id={id + 'q'} ref={qRef} type="search" autoComplete="off" placeholder="테마나 매장 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); setAdding(false); } }} />
              <svg className="pf-q-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </div>
            <button type="button" className="btn" onClick={() => { setAdding(false); setQ(''); setManual(false); }}>닫기</button>
          </div>
          {dq && (
            <div className="tg-res" role="region" aria-label="찾은 테마">
              {themes === null ? <p className="tg-note">{themesErr || '테마 목록을 불러오는 중…'}</p>
                : results.length === 0 ? <p className="tg-note">찾는 테마가 없어요. 아래에서 직접 적어 주세요.</p>
                : results.map(({ ref, recorded }) => (
                  <div key={ref.themeKey} className={'tg-res-row' + (recorded ? ' done' : '')}>
                    <span className="tg-res-n">{ref.themeName}{recorded && <em>해 봄</em>}</span>
                    <span className="tg-res-b">{ref.storeName} {ref.branchName}</span>
                    <WishToggle theme={{ themeKey: ref.themeKey, themeName: ref.themeName, branchName: ref.branchName }} onDone={onChanged} />
                  </div>
                ))}
            </div>
          )}
          {manual ? (
            <form className="tg-manual" onSubmit={(e) => void submitManual(e)} noValidate>
              <label className="pf-field">
                <span>테마 이름</span>
                <input value={mName} onChange={(e) => { setMName(e.target.value); setMErr(''); }} placeholder="예: 비밀의 화원" aria-invalid={mErr ? true : undefined} />
              </label>
              <label className="pf-field">
                <span>매장·지점 <em>(없어도 돼요)</em></span>
                <input value={mBranch} onChange={(e) => { setMBranch(e.target.value); setMErr(''); }} placeholder="예: 제로월드 강남점" />
              </label>
              {mErr && <p className="merr" role="alert">{mErr}</p>}
              <div className="pf-manual-btns">
                <button type="button" className="btn" onClick={() => { setManual(false); setMErr(''); }}>닫기</button>
                <button type="submit" className="btn pf-save">올리기</button>
              </div>
            </form>
          ) : (
            <button type="button" className="pf-manual-link" onClick={() => { setManual(true); if (!mName && q.trim()) setMName(q.trim().slice(0, NAME_MAX)); }}>
              찾는 테마가 없으면 직접 적기
            </button>
          )}
        </div>
      )}
    </section>
  );
}
