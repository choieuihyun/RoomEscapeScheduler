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
}

export function blankTheme(id: number, name = ''): Theme {
  return {
    id, name, place: '', dur: 70, raw: '', sessions: [],
    busy: '', err: '', source: '', imgCount: 0, mergeMode: true,
  };
}
