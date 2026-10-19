/**
 * 카카오로 나갔다 돌아오기 — state 와 공유 링크 해시를 localStorage 에 맡겨 둔다.
 * sessionStorage 가 아닌 이유: 휴대폰에서 "카카오톡으로 로그인"(앱 전환) 뒤 돌아올 때 새 탭으로 열리면
 * 탭별 sessionStorage 의 trip 이 없어 모든 첫 가입이 "만료됐어요"가 된다. 128비트 1회용·10분·불일치 시 유지·
 * 일치 시 즉시 삭제라 의미는 같고, 공격자는 피해자 저장소에 쓸 수 없어 CSRF 방어도 그대로다.
 * state 는 CSRF 방지용(돌아온 state 가 내가 보낸 것과 같은지 확인),
 * 해시(#s=·#z=)는 카카오 왕복 중 사라지니 돌아와서 되살리려고 맡긴다.
 * React·Firebase 를 import 하지 않는다(kakao.ts 와 같은 이유).
 */

export type KakaoMode = 'login' | 'link'

const KEY = 'flod.kakao.trip'
const TTL_MS = 10 * 60 * 1000

/** CSRF 방지 값이라 Math.random 을 쓰지 않는다. 16바이트 hex(32자). */
function defaultRand(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/** 나가기 직전에 부른다. state 를 만들어 맡기고 그 state 를 돌려준다. */
export function beginKakaoTrip(mode: KakaoMode, hash: string, rand: () => string = defaultRand): string {
  const state = rand()
  try {
    localStorage.setItem(KEY, JSON.stringify({ state, mode, hash, at: Date.now() }))
  } catch {
    // 저장이 막힌 환경(시크릿 창 등): 맡기지 못해도 나가는 건 막지 않는다. 돌아올 때 end 가 null 로 실패 처리한다.
  }
  return state
}

/**
 * 돌아왔을 때 부른다. 맡긴 state 와 같고 10분 안이면 mode·hash 를 돌려주고 지운다(한 번만).
 * 다르면 null — 이때는 지우지 않는다(위조 시도가 진짜 왕복을 깨뜨리지 못하게).
 */
export function endKakaoTrip(state: string, now: number = Date.now()): { mode: KakaoMode; hash: string } | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as { state?: unknown; mode?: unknown; hash?: unknown; at?: unknown }
    if (t.state !== state) return null
    localStorage.removeItem(KEY)
    if (typeof t.at !== 'number' || now - t.at > TTL_MS) return null
    if (t.mode !== 'login' && t.mode !== 'link') return null
    return { mode: t.mode, hash: typeof t.hash === 'string' ? t.hash : '' }
  } catch {
    return null
  }
}
