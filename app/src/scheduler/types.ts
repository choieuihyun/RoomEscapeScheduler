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
}

export function blankTheme(id: number, name = ''): Theme {
  return {
    id, name, place: '', dur: 70, raw: '', sessions: [],
    busy: '', err: '', source: '', imgCount: 0, mergeMode: true,
  };
}
