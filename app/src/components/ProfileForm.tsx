import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from 'react';
import { cpLen, todayKst } from '../clubEvents';
import {
  FIELDS, GENRES, GENRE_MAX, MBTI_ROWS, NAME_MAX, RESIDENCE_MAX, THEME_MAX, cleanRooms, draftFrom, draftIssues, lifeFromRef, lifeLabel, lifeManual, maskBirth,
  searchLife, toProfile, toggleGenre, type Draft, type Field,
} from '../memberProfile';
import { listThemes, sayClub, type ProfileDto, type ThemeRef } from '../server';

/* 멤버 프로필 폼(§4.11) — 가입 신청(로그인 창)·처음 채우기·고치기(프로필 창)가 같이 쓴다.
   전부 필수(사용자 결정): 덜 채우면 저장 단추가 흐리고, 눌러 보면 빈 칸 아래에 짧은 안내가 뜨고 첫 빈 칸으로 간다.
   서버가 거절하면(BAD_PROFILE 등) 서버 문구를 폼 맨 위에 그대로. */

/* 테마 목록(공개 API) — 창을 여러 번 열어도 한 번만 받는다. 실패하면 다음에 다시 */
let themesP: Promise<ThemeRef[]> | null = null;
const loadThemes = () => (themesP ??= listThemes().catch((e) => { themesP = null; throw e; }));

const LABEL: Record<Field, string> = {
  nickname: '별명', realName: '이름', birth: '생일', residence: '거주지역', mbti: 'MBTI', rooms: '지금까지 한 방 수', genres: '좋아하는 장르', life: '인생 테마',
};

export function ProfileForm({
  seed, nickLabel, nickHint, submitLabel, onSubmit, onCancel, cancelLabel = '닫기', playedCount, dirtyRef, autoFocus, lead,
}: {
  /* 처음 채울 값 — 이미 있는 프로필(고치기·거절 뒤 다시 신청)이나 별명만. 처음 그릴 때 한 번만 읽는다 */
  seed: { nickname: string | null; profile: ProfileDto | null | undefined };
  /* 가입 신청은 "오픈채팅 닉네임", 고치기는 "별명" */
  nickLabel: string; nickHint?: string;
  submitLabel: string;
  /* 실패는 던진다 — 폼이 sayClub 문구로 맨 위에 보인다 */
  onSubmit: (nickname: string, profile: ProfileDto) => Promise<void>;
  onCancel?: () => void; cancelLabel?: string;
  /* 앱에 기록한 해 본 테마 수 — 방 수 칸 옆 참고(모르면 null) */
  playedCount: number | null;
  /* 처음과 달라졌는지 — 창을 닫을 때 물을지 */
  dirtyRef?: MutableRefObject<boolean>;
  autoFocus?: boolean;
  /* 칸 위 안내 — 프로필 창에선 칸과 같이 굴러가게 폼 안에 둔다 */
  lead?: ReactNode;
}) {
  const id = useId();
  const [initial] = useState<Draft>(() => draftFrom(seed.nickname, seed.profile));
  const [d, setD] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [genreFull, setGenreFull] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const today = todayKst();
  const issues = useMemo(() => draftIssues(d, today), [d, today]);
  const ready = Object.keys(issues).length === 0;
  useEffect(() => { if (dirtyRef) dirtyRef.current = JSON.stringify(d) !== JSON.stringify(initial); }, [d, initial, dirtyRef]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  /* 인생 테마 — 찾기(서버 테마 목록) 또는 직접 적기. 직접 적기는 적는 대로 바로 고른 것이 된다 */
  const [manual, setManual] = useState(() => !!initial.life && initial.life.themeKey === null);
  const [mName, setMName] = useState(() => (initial.life && initial.life.themeKey === null ? initial.life.themeName : ''));
  const [mBranch, setMBranch] = useState(() => (initial.life && initial.life.themeKey === null ? initial.life.branchName ?? '' : ''));
  const [q, setQ] = useState('');
  const [themes, setThemes] = useState<ThemeRef[] | null>(null);
  const [themesErr, setThemesErr] = useState('');
  const wantThemes = () => {
    if (themes) return;
    loadThemes().then((t) => { setThemes(t); setThemesErr(''); })
      .catch(() => setThemesErr('테마 목록을 불러오지 못했어요. 아래에서 직접 적어 주세요.'));
  };
  const results = useMemo(() => (themes && q.trim() ? searchLife(themes, q) : []), [themes, q]);
  const pickRef = (ref: ThemeRef) => { set('life', lifeFromRef(ref)); setQ(''); };
  const setManualLife = (name: string, branch: string) => { setMName(name); setMBranch(branch); set('life', name.trim() ? lifeManual(name, branch) : null); };

  /* 안내는 눌러 본 뒤에. 글자 수 넘침은 치는 동안 바로 */
  /* 가입 신청 칸은 "오픈채팅 닉네임"이라 안내도 그 말로 */
  const word = (t: string | undefined) => (t && nickLabel !== '별명' ? t.replace('별명', '닉네임') : t);
  const hint = (f: Field) => (tried || (f === 'nickname' && cpLen(d.nickname.trim()) > NAME_MAX) || (f === 'realName' && cpLen(d.realName.trim()) > NAME_MAX)
    || (f === 'residence' && cpLen(d.residence.trim()) > RESIDENCE_MAX)
    ? word(issues[f]) : undefined);
  const hintP = (f: Field) => {
    const h = hint(f);
    return h ? <p className="pfm-bad" id={id + f + 'e'}>{h}</p> : null;
  };
  const described = (f: Field) => (hint(f) ? id + f + 'e' : undefined);

  const focusFirstBad = () => requestAnimationFrame(() => {
    const f = FIELDS.find((k) => issues[k]);
    if (!f) return;
    const box = formRef.current?.querySelector<HTMLElement>(`[data-f="${f}"]`);
    const el = box?.matches('input,button') ? box : box?.querySelector<HTMLElement>('input,button');
    el?.focus();
    box?.scrollIntoView({ block: 'center' });
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const out = toProfile(d, today);
    if (!out) { setTried(true); focusFirstBad(); return; }
    setBusy(true); setErr('');
    try {
      await onSubmit(out.nickname, out.profile);
    } catch (x) {
      setErr(sayClub(x));
      requestAnimationFrame(() => formRef.current?.querySelector('.pfm-err')?.scrollIntoView({ block: 'nearest' }));
    } finally {
      setBusy(false);
    }
  }

  /* 한글 조합 중 Enter 는 글자만 확정한다. 테마 찾기 칸의 Enter 는 저장이 아니라 첫 결과 고르기 */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) { e.preventDefault(); return; }
    if ((e.target as HTMLElement).dataset.find !== undefined) {
      e.preventDefault();
      if (results[0]) pickRef(results[0]);
    }
  };

  const nickLen = cpLen(d.nickname.trim());

  return (
    <form className="pfm" ref={formRef} onSubmit={(e) => void submit(e)} onKeyDown={onKeyDown} noValidate>
      <div className="pfm-body">
        {lead}
        {err && <p className="merr pfm-err" role="alert">{err}</p>}

        <div className="pfm-row">
          <label htmlFor={id + 'nickname'}>{nickLabel}</label>
          <input id={id + 'nickname'} data-f="nickname" autoComplete="off" spellCheck={false} autoFocus={autoFocus}
            value={d.nickname} onChange={(e) => set('nickname', e.target.value)} aria-invalid={hint('nickname') ? true : undefined}
            aria-describedby={described('nickname') ?? id + 'nickh'} />
          {hintP('nickname') ?? <span className="pfm-note" id={id + 'nickh'}>{nickLen > 0 ? `${nickLen}/${NAME_MAX}자` : nickHint ?? `1~${NAME_MAX}자`}</span>}
        </div>

        <div className="pfm-row">
          <label htmlFor={id + 'realName'}>이름</label>
          <input id={id + 'realName'} data-f="realName" autoComplete="name" value={d.realName}
            onChange={(e) => set('realName', e.target.value)} aria-invalid={hint('realName') ? true : undefined} aria-describedby={described('realName')} />
          {hintP('realName') ?? <span className="pfm-note">멤버 목록에서 별명 옆에 작게 보여요</span>}
        </div>

        <div className="pfm-row">
          <label htmlFor={id + 'birth'}>생일</label>
          <input id={id + 'birth'} data-f="birth" inputMode="numeric" autoComplete="bday" placeholder="1997.06.28" maxLength={10}
            value={d.birth} onChange={(e) => set('birth', maskBirth(e.target.value))}
            aria-invalid={hint('birth') ? true : undefined} aria-describedby={described('birth') ?? id + 'birthh'} />
          {hintP('birth') ?? <span className="pfm-note" id={id + 'birthh'}>숫자만 쳐도 돼요. 나이는 '97년생'처럼 보여요</span>}
        </div>

        <div className="pfm-row">
          <label htmlFor={id + 'residence'}>거주지역</label>
          <input id={id + 'residence'} data-f="residence" autoComplete="off" placeholder="예: 서울 마포구" value={d.residence}
            onChange={(e) => set('residence', e.target.value)} aria-invalid={hint('residence') ? true : undefined}
            aria-describedby={described('residence') ?? id + 'resh'} />
          {hintP('residence') ?? <span className="pfm-note" id={id + 'resh'}>시·구까지만 적어도 돼요. 멤버 목록과 멤버 카드에 보여요</span>}
        </div>

        <fieldset className="pfm-set" data-f="mbti" aria-describedby={described('mbti')}>
          <legend>MBTI</legend>
          <div className="pfm-mbti">
            {MBTI_ROWS.flat().map((m) => (
              <button key={m} type="button" className="chip-pick" aria-pressed={d.mbti === m} onClick={() => set('mbti', m)}>{m}</button>
            ))}
          </div>
          <button type="button" className="chip-pick pfm-unknown" aria-pressed={d.mbti === 'UNKNOWN'} onClick={() => set('mbti', 'UNKNOWN')}>잘 몰라요</button>
          {hintP('mbti')}
        </fieldset>

        <div className="pfm-row">
          <label htmlFor={id + 'rooms'}>지금까지 한 방 수</label>
          <span className="pfm-rooms">
            <input id={id + 'rooms'} data-f="rooms" inputMode="numeric" autoComplete="off" placeholder="0" value={d.rooms}
              onChange={(e) => set('rooms', cleanRooms(e.target.value))} aria-invalid={hint('rooms') ? true : undefined}
              aria-describedby={described('rooms') ?? (playedCount !== null ? id + 'roomsh' : undefined)} />
            <span>개</span>
            {playedCount !== null && <em id={id + 'roomsh'}>앱 기록 {playedCount}개</em>}
          </span>
          {hintP('rooms') ?? <span className="pfm-note">앱 기록과 상관없이 본인이 센 수를 적어 주세요</span>}
        </div>

        <fieldset className="pfm-set" data-f="genres" aria-describedby={described('genres')}>
          <legend>좋아하는 장르 <span className="pfm-n">{d.genres.length}/{GENRE_MAX}</span></legend>
          <div className="pfm-chips">
            {GENRES.map((g) => (
              <button key={g} type="button" className="chip-pick" aria-pressed={d.genres.includes(g)}
                onClick={() => { const r = toggleGenre(d.genres, g); set('genres', r.list); setGenreFull(r.blocked); }}>{g}</button>
            ))}
          </div>
          {genreFull && <p className="pfm-note" role="status">{GENRE_MAX}개까지 고를 수 있어요. 하나를 빼고 골라 주세요.</p>}
          {hintP('genres')}
        </fieldset>

        <fieldset className="pfm-set" data-f="life" aria-describedby={described('life')}>
          <legend>인생 테마</legend>
          {d.life && !manual ? (
            <div className="pfm-picked">
              <span className="pfm-picked-n">{lifeLabel(d.life)}</span>
              <button type="button" className="pfm-link" onClick={() => { set('life', null); requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[data-find]')?.focus()); }}>바꾸기</button>
            </div>
          ) : manual ? (
            <div className="pfm-manual">
              <label className="pfm-sub">
                <span>테마 이름</span>
                <input value={mName} maxLength={THEME_MAX * 2} placeholder="예: 비밀의 화원" onChange={(e) => setManualLife(e.target.value, mBranch)}
                  aria-invalid={hint('life') ? true : undefined} />
              </label>
              <label className="pfm-sub">
                <span>매장·지점 <em>(없어도 돼요)</em></span>
                <input value={mBranch} maxLength={THEME_MAX * 2} placeholder="예: 제로월드 강남점" onChange={(e) => setManualLife(mName, e.target.value)} />
              </label>
              <button type="button" className="pfm-link" onClick={() => { setManual(false); set('life', null); }}>목록에서 찾기</button>
            </div>
          ) : (
            <div className="pfm-find">
              <input type="search" data-find="" autoComplete="off" placeholder="테마나 매장 이름으로 찾기" aria-label="인생 테마 찾기"
                value={q} onChange={(e) => setQ(e.target.value)} onFocus={wantThemes} aria-invalid={hint('life') ? true : undefined} />
              {q.trim() && (
                themes === null ? <p className="pfm-note">{themesErr || '테마 목록을 불러오는 중…'}</p>
                  : results.length === 0 ? <p className="pfm-note">찾는 테마가 없어요. 아래에서 직접 적어 주세요.</p>
                  : (
                    <ul className="pfm-results" aria-label="찾은 테마">
                      {results.map((r) => (
                        <li key={r.themeKey}>
                          <button type="button" onClick={() => pickRef(r)}>
                            <b>{r.themeName}</b><span>{r.storeName} · {r.branchName}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
              )}
              {!q.trim() && themesErr && <p className="pfm-note">{themesErr}</p>}
              <button type="button" className="pfm-link" onClick={() => { setManual(true); setManualLife(mName || q.trim().slice(0, THEME_MAX), mBranch); }}>
                찾는 테마가 없으면 직접 적기
              </button>
            </div>
          )}
          {hintP('life')}
        </fieldset>
      </div>

      <div className="pfm-foot">
        {onCancel && <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>}
        <button type="submit" className={'btn-go' + (ready ? '' : ' off')} aria-disabled={!ready || busy ? true : undefined}>
          {busy ? '저장하는 중…' : submitLabel}
        </button>
      </div>
      {tried && !ready && <p className="pfm-left" role="status">아직 안 채운 칸: {FIELDS.filter((f) => issues[f]).map((f) => (f === 'nickname' ? nickLabel : LABEL[f])).join(', ')}</p>}
    </form>
  );
}
