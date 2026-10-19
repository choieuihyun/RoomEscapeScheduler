/**
 * 카카오 로그인 주소 도우미 — 순수 함수만 둔다.
 * React·Firebase 를 import 하지 않는다: 로그인 전에는 이 모듈 말고 아무것도 내려받지 않는 게 원칙이라
 * 나중에 정적 import 되어도 번들이 커지지 않아야 한다.
 */

const KAKAO_PARAMS = ['code', 'state', 'error', 'error_description']

/** 카카오 인가 주소. 값은 encodeURIComponent 로 직접 인코딩한다(공백이 + 가 아니라 %20). */
export function kakaoAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const q = [
    ['response_type', 'code'],
    ['client_id', clientId],
    ['redirect_uri', redirectUri],
    ['state', state],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return `https://kauth.kakao.com/oauth/authorize?${q}`
}

/** 카카오에서 돌아온 주소의 쿼리를 읽는다. 카카오 흐름이 아니면 null. */
export function readKakaoReturn(search: string): { code: string; state: string } | { error: string } | null {
  const p = new URLSearchParams(search)
  const error = p.get('error')
  if (error) return { error }
  const code = p.get('code')
  const state = p.get('state')
  if (code && state) return { code, state }
  return null
}

/** 돌아온 주소에서 카카오 파라미터만 지운다. 나머지 쿼리(view=)와 해시는 그대로, 쿼리가 비면 ? 도 없앤다. */
export function stripKakaoParams(href: string): string {
  const u = new URL(href)
  for (const k of KAKAO_PARAMS) u.searchParams.delete(k)
  return u.toString()
}

/** 카카오톡 안의 브라우저인가 (구글 로그인이 막히는 환경). */
export function isKakaoInApp(ua: string): boolean {
  return /KAKAOTALK/i.test(ua)
}

/** 카카오에 등록할 돌아올 주소 — 쿼리·해시 없이 origin + pathname. */
export function appRedirectUri(loc: { origin: string; pathname: string }): string {
  return loc.origin + loc.pathname
}
