/* 동호회 일정 링크 `#e=<id>` (작업명세서 §4.7 "링크", 계획 Task E6).
   공유 링크(`#s=`·`#z=`)와 같은 해시 자리를 쓰지만 형식이 달라 섞이지 않는다 —
   `#e=` 뒤가 숫자만일 때만 일정 링크로 본다. */

export function readEventHash(hash: string): number | null {
  const m = /^#e=(\d{1,15})$/.exec(hash);
  if (!m) return null;
  const id = Number(m[1]);
  return id > 0 ? id : null;
}

/* "카톡에 올릴 글 복사"에 붙는 링크. 지금 열린 주소의 ?view= 같은 건 떼고 앱 첫 주소에 해시만 붙인다. */
export function eventLink(id: number, loc: { origin: string; pathname: string }): string {
  return `${loc.origin}${loc.pathname}#e=${id}`;
}
