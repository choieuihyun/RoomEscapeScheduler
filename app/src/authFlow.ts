import { readKakaoReturn, stripKakaoParams } from './kakao'
import type { KakaoMode } from './kakaoTrip'
import { sayClub } from './server'
import { readEventHash } from './eventLink'

/**
 * 카카오에서 돌아온 주소 처리 — React 밖의 순수 흐름이라 의존성을 전부 받는다(테스트하려고 분리).
 * 어떤 경우든 카카오 파라미터(code·state)는 먼저 주소에서 지운다: 새로고침해도 같은 코드를 다시 쓰지 않게.
 */
export type KakaoReturnResult =
  | { kind: 'none' }
  | { kind: 'signedIn' }
  /* view: 연결(link) 왕복을 떠날 때 보던 화면 — 성공·실패 모두 그 화면으로 되살린다. 로그인 왕복은 싣지 않는다 */
  | { kind: 'linked'; view?: string }
  /* mode: 왕복을 연 뒤의 오류면 그 왕복의 종류. 만료·취소처럼 왕복을 못 연 경우는 없다 */
  | { kind: 'error'; message: string; mode?: KakaoMode; view?: string }

export interface KakaoReturnDeps {
  search: string
  href: string
  replaceUrl: (url: string) => void
  endTrip: (state: string) => { mode: KakaoMode; hash: string; view?: string } | null
  kakaoLogin: (code: string, redirectUri: string) => Promise<{ customToken: string }>
  kakaoLink: (code: string, redirectUri: string, token: string) => Promise<{ linked: boolean }>
  signInWithCustom: (token: string) => Promise<unknown>
  idToken: () => Promise<string | null>
  redirectUri: string
  /** Firebase 설정이 있는가. 없으면 주소만 정리하고 교환은 시도하지 않는다 */
  cloudOn: boolean
}

const NOT_SET = '로그인이 아직 설정되지 않았어요.'
const EXPIRED = '카카오 로그인이 만료됐어요. 다시 눌러 주세요.'

/** 맡겨 둔 해시는 공유 링크 모양(#s=·#z=)이나 일정 링크(#e=<id>)일 때만 되살린다. 그 밖의 값은 버린다.
 *  일정 링크는 로그아웃 상태로 들어와 카카오로 로그인하는 흐름에서 가장 많이 쓰인다. */
function safeHash(h: string): string {
  return h === '' || h.startsWith('#s=') || h.startsWith('#z=') || readEventHash(h) !== null ? h : ''
}

/** 연결 왕복이 맡겨 둔 화면만 되살린다. 로그인 왕복의 첫 화면 결정(#s=·#z=·#e=)은 건드리지 않는다. */
const linkView = (t: { mode: KakaoMode; view?: string } | null) => (t?.mode === 'link' ? t.view : undefined)

export async function handleKakaoReturn(d: KakaoReturnDeps): Promise<KakaoReturnResult> {
  const r = readKakaoReturn(d.search)
  const hasCode = new URLSearchParams(d.search).has('code')
  if (!r && !hasCode) return { kind: 'none' }

  if (r && 'error' in r) {
    d.replaceUrl(stripKakaoParams(d.href))
    /* 취소에도 카카오가 state 를 돌려준다 — 맞으면 연결 왕복이던 화면을 되살린다(로그인 왕복이면 아무것도 안 싣는다) */
    const st = new URLSearchParams(d.search).get('state')
    const t = st ? d.endTrip(st) : null
    return { kind: 'error', message: '카카오 로그인을 취소했어요.', view: linkView(t) }
  }
  // state 가 비었으면 endTrip 을 부르지 않는다 — 빈 값으로 맡긴 분을 건드리지 않고 바로 만료 처리.
  if (!r) {
    d.replaceUrl(stripKakaoParams(d.href))
    return { kind: 'error', message: EXPIRED }
  }

  const trip = d.endTrip(r.state)
  const clean = new URL(stripKakaoParams(d.href))
  if (trip) clean.hash = safeHash(trip.hash)
  d.replaceUrl(clean.toString())
  // 이 확인이 link-CSRF 의 유일한 방어다(서버는 state 를 모른다). 맡긴 왕복이 없거나 state 가 다르면 어떤 교환도 하지 않는다.
  if (!trip) return { kind: 'error', message: EXPIRED }
  if (!d.cloudOn) return { kind: 'error', message: NOT_SET, mode: trip.mode, view: linkView(trip) }

  try {
    if (trip.mode === 'login') {
      const { customToken } = await d.kakaoLogin(r.code, d.redirectUri)
      await d.signInWithCustom(customToken)
      return { kind: 'signedIn' }
    }
    const token = await d.idToken()
    if (!token) return { kind: 'error', message: '로그인해 주세요.', mode: trip.mode, view: linkView(trip) }
    await d.kakaoLink(r.code, d.redirectUri, token)
    return { kind: 'linked', view: linkView(trip) }
  } catch (e) {
    return { kind: 'error', message: sayClub(e), mode: trip.mode, view: linkView(trip) }
  }
}
