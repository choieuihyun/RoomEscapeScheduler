import { useEffect, useState } from 'react';
import { loadGroups, useClubStore } from '../clubStore';
import type { EventDto } from '../server';
import { partyWishes, placeLabel } from '../wish';

/* 일정 상세 "참여자가 하고 싶은 테마"(2026-10-27 사용자 요청: 시간표보다 참여자들이 하고 싶은 테마를 바로 보기 쉽게).
   멤버들의 위시 묶음(§4.12, 같이 가요와 같은 데이터 — 서버 작업 없음)에서 이 일정 참여자가 원하는 테마만 모은다.
   테마를 정하는 중(협의 중·예약 전)일 때만 — 예약 완료면 테마가 정해진 것이라 숨긴다. 위시 API 가 없으면 아무것도 없다.
   원하는 참여자 많은 순, 해 본 참여자는 빨간 글자로 따로. 5개까지, 더 있으면 펼친다. */
const FIRST = 5;

export function EventWishes({ ev }: { ev: EventDto }) {
  const club7 = useClubStore();
  const [all, setAll] = useState(false);
  const on = !ev.booked && ev.participants.length > 0 && club7.wishApi !== 'missing';
  useEffect(() => { if (on) loadGroups().catch(() => { /* 못 받으면 칸을 안 보일 뿐 */ }); }, [on]);
  if (!on || !club7.groups) return null;

  const list = partyWishes(club7.groups.list, ev.participants);
  const shown = all ? list : list.slice(0, FIRST);
  const nameOf = (uid: string) => ev.participants.find((p) => p.uid === uid)?.nickname ?? '';

  return (
    <section className="evw" aria-labelledby={`evw-h-${ev.id}`}>
      <h3 className="evp-h" id={`evw-h-${ev.id}`}>참여자가 하고 싶은 테마{list.length > 0 && <span className="evc-n"> {list.length}</span>}</h3>
      {list.length === 0 ? (
        <p className="fb-note">아직 없어요. 같이 가요나 테마 목록에서 ♡ 하고 싶어요를 눌러 두면 여기 모여요.</p>
      ) : (
        <ul className="evw-list">
          {shown.map(({ group: g, want, played }) => (
            <li key={(g.themeKey ?? '') + '|' + g.themeName} className="evw-row">
              <span className="evw-n">{g.themeName}{placeLabel(g) && <span className="evw-at"> · {placeLabel(g)}</span>}</span>
              <span className="evw-who">
                <span className="evw-want" title={want.map((w) => w.nickname).join(', ')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
                  {want.map((w) => w.nickname).join(' · ')}
                </span>
                {played.length > 0 && <span className="evw-played">해 봄 {played.map(nameOf).filter(Boolean).join(' · ')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {list.length > FIRST && (
        <button type="button" className="fb-more evw-more" onClick={() => setAll(!all)}>{all ? '접기' : `${list.length - FIRST}개 더 보기`}</button>
      )}
    </section>
  );
}
