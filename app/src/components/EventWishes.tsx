import { useEffect, useState } from 'react';
import { loadGroups, useClubStore } from '../clubStore';
import { playedDots } from '../playedWho';
import type { EventDto } from '../server';
import type { UseProfileReturn } from '../useProfile';
import { partyWishes, placeLabel, wishKey } from '../wish';
import { PlayedDots } from './PlayedDots';
import { PlayedMark, usePlayedMark } from './PlayedMark';

/* 일정 상세 "참여자가 하고 싶은 테마"(2026-10-27 사용자 요청: 시간표보다 참여자들이 하고 싶은 테마를 바로 보기 쉽게).
   멤버들의 위시 묶음(§4.12, 같이 가요와 같은 데이터 — 서버 작업 없음)에서 이 일정 참여자가 원하는 테마만 모은다.
   테마를 정하는 중(협의 중·예약 전)일 때만 — 예약 완료면 테마가 정해진 것이라 숨긴다. 위시 API 가 없으면 아무것도 없다.
   원하는 참여자 많은 순, 아래에 참여자마다 해 봤는지 점(코스와 같다)(하트·"하고 싶어요" 글자는 2026-10-27 사용자 요청으로 뺐다 — 원하는 사람 닉네임만 청록으로). 5개까지, 더 있으면 펼친다.
   내가 이 일정 참여자면 줄마다 "해 봤어요" — 눌러 내 해 본 테마(§4.9)에 넣거나 뺀다(2026-10-27 사용자 요청). */
const FIRST = 5;

export function EventWishes({ ev, meUid, profile }: { ev: EventDto; meUid: string; profile: UseProfileReturn | null }) {
  const club7 = useClubStore();
  const [all, setAll] = useState(false);
  const mark = usePlayedMark(profile);
  const on = !ev.booked && ev.participants.length > 0 && club7.wishApi !== 'missing';
  useEffect(() => { if (on) loadGroups().catch(() => { /* 못 받으면 칸을 안 보일 뿐 */ }); }, [on]);
  if (!on || !club7.groups) return null;

  const list = partyWishes(club7.groups.list, ev.participants);
  const shown = all ? list : list.slice(0, FIRST);
  /* "해 봤어요"는 이 일정에 참여한 나만, 내 해 본 테마를 쓸 수 있을 때만 */
  const canMark = ev.joined && !!profile && !!meUid;

  return (
    <section className="evw" aria-labelledby={`evw-h-${ev.id}`}>
      <h3 className="evp-h" id={`evw-h-${ev.id}`}>참여자가 하고 싶은 테마{list.length > 0 && <span className="evc-n"> {list.length}</span>}</h3>
      {list.length === 0 ? (
        <p className="fb-note">아직 없어요. 같이 가요나 테마 목록에서 '하고 싶어요'를 눌러 두면 여기 모여요.</p>
      ) : (
        <ul className="evw-list">
          {shown.map(({ group: g, want, played }) => {
            const mine = played.includes(meUid);
            const k = wishKey(g);
            return (
              <li key={(g.themeKey ?? '') + '|' + g.themeName} className="evw-row">
                <div className="evw-top">
                  <span className="evw-n">{g.themeName}{placeLabel(g) && <span className="evw-at"> · {placeLabel(g)}</span>}</span>
                  {canMark && <PlayedMark theme={g} played={mine} busy={mark.busy === k} onClick={() => void mark.toggle(g, mine)} />}
                </div>
                <span className="evw-who">
                  <span className="evw-want" title={`하고 싶어요: ${want.map((w) => w.nickname).join(', ')}`}>{want.map((w) => w.nickname).join(' · ')}</span>
                </span>
                {/* 참여자마다 이 테마를 해 봤는지(2026-10-27 사용자 요청) — 코스·도우미와 같은 점(빨강 해 봄 · 초록 안 해 봄) */}
                <PlayedDots dots={playedDots(played, ev.participants)} />
              </li>
            );
          })}
        </ul>
      )}
      {list.length > FIRST && (
        <button type="button" className="fb-more evw-more" onClick={() => setAll(!all)}>{all ? '접기' : `${list.length - FIRST}개 더 보기`}</button>
      )}
    </section>
  );
}
