/* 서버에서 회차 불러오기 (F-15) — 네트워크만.

   cloud.js 와 같은 자리다: 이 파일은 fetch 와 말투만 맡고, 화면과 상태는 index.html 이 다룬다.
   `불러오기` 를 눌러야 처음 내려온다 (동적 import) — 안 누르면 한 바이트도 안 받는다.

   **서버는 선택이다.** 여기가 통째로 실패해도 직접 입력(F-06)과 사진(F-05)은 그대로 동작한다.
   계약은 서버 저장소 `작업명세서.md` §4.4 와 짝이다 — 바꾸려면 양쪽을 같이 본다. */

/* 배포된 서버. 다른 주소를 보게 하려면 콘솔에서:
   localStorage.setItem('flod.server', 'http://127.0.0.1:8083')   ← 로컬 개발용 */
const DEFAULT_BASE = 'https://floduler.duckdns.org';

/* 서버가 지원 매장을 알려주기 전(또는 못 받았을 때) 쓸 문구. 실제 목록은 /api/branches 가 준다 */
export const STORE_LABEL = '예약 사이트';

export function base(){
  try{ return (localStorage.getItem('flod.server')||'').trim() || DEFAULT_BASE; }
  catch{ return DEFAULT_BASE; }   /* 시크릿 창 등에서 localStorage 가 막혀 있어도 동작한다 */
}

async function get(path){
  const res = await fetch(base()+path, {headers:{'Accept':'application/json'}});
  if(!res.ok){ const e=new Error('HTTP '+res.status); e.status=res.status; throw e; }
  return res.json();
}

/* 지점 목록 — 고를 수 있는 날짜(dates)까지 함께 온다. 날짜 선택에 호출이 더 들지 않는다. */
export const branches = () => get('/api/branches');

export const schedule = (branchId, date) =>
  get(`/api/schedule?branch=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`);

/* 사용자에게 보일 말로 바꾼다. "서버가 없다" 가 이 도구의 고장이 아니라는 걸 분명히 한다. */
export function say(err){
  if(err && err.status===404) return '그 날짜는 아직 수집되지 않았습니다. 다른 날짜를 골라 보세요.';
  if(err instanceof TypeError)                       /* fetch 가 못 닿으면 TypeError 다 */
    return `서버에 닿지 못했습니다 (${base()}). 꺼져 있거나 주소가 다를 수 있어요 — 직접 입력과 사진은 그대로 쓸 수 있습니다.`;
  return '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

/* "3분 전 기준" 같은 말. 취소표는 시간에 민감해서 언제 기준인지가 곧 신뢰다. */
export function ago(iso){
  if(!iso) return '';
  const s = Math.max(0, (Date.now()-Date.parse(iso))/1000);
  if(s<90) return '방금 기준';
  const m = Math.round(s/60);   if(m<60) return `${m}분 전 기준`;
  const h = Math.round(m/60);   if(h<24) return `${h}시간 전 기준`;
  return `${Math.round(h/24)}일 전 기준`;
}
