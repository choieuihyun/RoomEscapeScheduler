import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Cake, isBirthday, keepMembers, MemberLink } from '../clubStore';
import { todayKst } from '../clubEvents';
import { birthYears, bornIn, lifeLabel, matchPerson, personLine, roomRanks, sortLabel, sortPeople, type PeopleSort } from '../memberProfile';
import { listClubMembers, sayClub, type ClubMemberDto } from '../server';
import { Avatar } from './Avatar';
import { Medal } from './Medal';

/* 정렬 단추 — 안 고른 단추는 기준 이름만, 고른 단추는 방향까지(sortLabel) + 화살표. 고른 단추를 다시 누르면 방향이 바뀐다 */
const SORT_BASE: Record<PeopleSort, string> = { name: '이름순', rooms: '방 수순' };
/* 1997 → "97년생" */
const yearChip = (y: number) => `${String(y).slice(2)}년생`;

/* 멤버 목록(§4.11) — 승인 멤버 누구나. 운영진의 멤버 관리(승인·역할)와는 따로다.
   화면에 들어올 때마다 GET /api/club/members 를 새로 받는다(프로필을 고친 사람이 바로 보이게 — 멤버 카드도 이것을 쓴다).
   카드 어디를 눌러도 그 사람의 멤버 카드(별명 단추의 ::after 가 카드를 덮는다). 내 카드는 내 프로필 화면으로. */
export function PeoplePage({ active, meUid, onBack }: { active: boolean; meUid: string; onBack: () => void }) {
  const id = useId();
  const [list, setList] = useState<ClubMemberDto[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<PeopleSort>('name');
  const [rev, setRev] = useState(false);
  const pickSort = (k: PeopleSort) => { if (k === sort) setRev(!rev); else { setSort(k); setRev(false); } };
  /* 나이(태어난 해) 고르기 — null 이면 전체. 같은 해를 다시 누르면 전체로 */
  const [year, setYear] = useState<number | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const t = await (await import('../cloud')).idToken();
      if (!t) throw new Error('로그인해 주세요.');
      const r = await listClubMembers(t);
      if (my === seq.current) { setList(r); setErr(''); keepMembers(r); }
    } catch (e) {
      if (my === seq.current) setErr(sayClub(e));
    }
  }, []);
  useEffect(() => { if (active) void Promise.resolve().then(load); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */ }, [active, load]);

  const today = todayKst();
  const shown = useMemo(() => (list ? sortPeople(list.filter((m) => matchPerson(m, q) && bornIn(m, year)), sort, meUid, rev) : []), [list, q, year, sort, rev, meUid]);
  const years = useMemo(() => birthYears(list ?? []), [list]);
  const narrowed = !!q.trim() || year !== null;
  /* 방 많은 순일 때만 1~3등 메달 — 순위는 찾기와 상관없이 전체 멤버 기준 */
  const medals = useMemo(() => (list && sort === 'rooms' && !rev ? roomRanks(list) : null), [list, sort, rev]);

  return (<>
    <header className="page-head">
      <button type="button" className="page-back" onClick={onBack}><span aria-hidden="true">‹</span> 더보기</button>
      <h1>멤버</h1>
      <p>승인된 멤버예요. 서로의 프로필을 볼 수 있어요.</p>
    </header>
    <div className="ppl">
      <div className="ppl-bar">
        <div className="ppl-q">
          <label htmlFor={id + 'q'} className="sr-only">멤버 찾기</label>
          <input id={id + 'q'} type="search" autoComplete="off" placeholder="별명이나 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
          <svg className="pf-q-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </div>
        <div className="ppl-sort" role="group" aria-label="정렬">
          {(['name', 'rooms'] as const).map((k) => (
            <button key={k} type="button" className="chip-pick" aria-pressed={sort === k} onClick={() => pickSort(k)}
              title={sort === k ? '한 번 더 누르면 반대로' : undefined}>
              {sort === k ? sortLabel(k, rev) : SORT_BASE[k]}
              {sort === k && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 4v16M3 16l4 4 4-4" /><path d="M17 20V4M13 8l4-4 4 4" />
                </svg>
              )}
            </button>
          ))}
        </div>
        {list && <span className="ppl-n">{narrowed ? `찾은 멤버 ${shown.length}명 · ` : ''}모두 {list.length}명</span>}
      </div>
      {/* 나이 고르기(2026-10-22) — 전체 + 90~02년생(그 밖에 태어난 멤버가 있으면 그 해도). 좁은 화면은 옆으로 밀어 본다 */}
      {list && (
        <div className="ppl-years" role="group" aria-label="나이">
          <button type="button" className="chip-pick" aria-pressed={year === null} onClick={() => setYear(null)}>전체</button>
          {years.map((y) => (
            <button key={y} type="button" className="chip-pick" aria-pressed={year === y} onClick={() => setYear(year === y ? null : y)}>{yearChip(y)}</button>
          ))}
        </div>
      )}

      {err && <div className="home-empty"><p>{err}</p><button type="button" className="btn" onClick={() => void load()}>다시 시도</button></div>}
      {!err && list === null && <p className="mem-empty">불러오는 중이에요…</p>}
      {list && shown.length === 0 && (
        <p className="mem-empty">
          {q.trim() ? `'${q.trim()}' 와 맞는 ${year !== null ? yearChip(year) + ' ' : ''}멤버가 없어요.` : year !== null ? `${yearChip(year)} 멤버가 없어요.` : '아직 멤버가 없어요.'}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="ppl-grid">
          {shown.map((m) => {
            const p = m.profile;
            const me = m.uid === meUid;
            return (
              <li key={m.uid} className={'ppl-card' + (me ? ' me' : '')}>
                <div className="ppl-top">
                  <Avatar name={m.nickname} className="ppl-ava" />
                  <div className="ppl-who">
                    <div className="ppl-n1">
                      {medals?.has(m.uid) && <Medal rank={medals.get(m.uid) as number} />}
                      <b><MemberLink uid={m.uid} name={m.nickname} className="ppl-open" /></b>
                      {isBirthday(p?.birthDate, today) && <><Cake /><span className="sr-only">오늘 생일</span></>}
                      {m.role === 'ADMIN' && <span className="chip-info role">운영진</span>}
                      {me && <span className="chip-info">나</span>}
                    </div>
                    {p && <span className="ppl-real">{p.realName}</span>}
                  </div>
                </div>
                {p ? (<>
                  <p className="ppl-line">{personLine(p)}</p>
                  <div className="ppl-genres">{p.genres.map((g) => <span key={g} className="pfx-g">{g}</span>)}</div>
                  <p className="ppl-life"><span>인생 테마</span> {lifeLabel(p.lifeTheme)}</p>
                </>) : <p className="ppl-none">아직 프로필이 없어요</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </>);
}
