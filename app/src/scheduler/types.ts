import type { Session } from '../core';

/* index.html의 blank()/theme 객체를 그대로 옮긴 것 — 화면용 필드(busy/err/fresh 등)까지
   포함한다. 저장·공유용 축약 형태는 serialize.ts의 ThemeState. */
export interface Theme {
  id: number;
  name: string;
  place: string;
  dur: number;
  raw: string;
  sessions: Session[];
  busy: string;
  err: string;
  source: string;
  imgCount: number;
  mergeMode: boolean;
  fresh?: string;
  /* 서버에서 불러온 회차가 어느 캘린더 날짜 것인지("YYYY-MM-DD") — 수동 입력·
     이미지 인식은 날짜 개념이 없어 undefined. 테마 카드끼리 날짜가 섞이면
     "같은 날 3연방"이 실제로는 불가능한 조합이 계산될 수 있어(§4.41) 경고에 쓴다. */
  date?: string;
  /* 서버 테마 키(/api/schedule 의 테마 id — 매장·지점이 들어 있다). 서버에서 불러온 카드만 있다.
     같은 날짜·같은 키 카드를 또 넣으면 새로 더하지 않고 그 카드를 바꾼다(eventFlow.mergeServerThemes) */
  themeKey?: string;
  /* 어느 일정 문맥(일정 id)에서 넣은 카드인가 — 협의 도우미로 넣은 카드만. 다른 일정 문맥으로 들어오면 이 카드는 뺀다
     (날짜가 섞이지 않게). 화면 상태로만 들고 자동 저장·링크에는 싣지 않는다 */
  ctx?: number;
  /* 새 카드를 어떻게 열지(2026-10-21 개편) — 'edit': 이름·매장·분 칸과 시간 칸을 연 채(직접 넣기).
     화면 상태로만 들고 자동 저장·링크에는 싣지 않는다. 시간 칸만 여는 'paste'(카톡 붙여넣기)는 2026-10-22 사용자 요청으로 뺐다 */
  ui?: 'edit';
  /* 테마 사진(서버 테마의 posterUrl) — 불러온 카드만. 화면 상태로만 들고 자동 저장·링크(serialize.ts)에는 싣지 않는다
     (그 바이트는 옛 링크와 같아야 한다). 그래서 새로 고치거나 링크로 열면 사진 대신 이름 첫 글자 자리 */
  posterUrl?: string;
}

/* 예약 사이트에서 불러온 테마 하나 — 테마 고르기 창(테마째)·협의 도우미가 계산 카드로 넣는다(useScheduler.addServerThemes) */
export interface AddedTheme {
  name: string;
  place: string;
  dur: number;
  sessions: Session[];
  fresh: string;
  date?: string;
  /* 서버 테마 키 — 같은 테마를 또 넣으면 카드를 바꾸는 데 쓴다 */
  themeKey?: string;
  /* 테마 사진 주소(없을 수 있다) */
  posterUrl?: string;
}

export function blankTheme(id: number, name = ''): Theme {
  return {
    id, name, place: '', dur: 70, raw: '', sessions: [],
    busy: '', err: '', source: '', imgCount: 0, mergeMode: true,
  };
}
