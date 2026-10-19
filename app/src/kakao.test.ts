import { describe, it, expect } from 'vitest'
import { kakaoAuthUrl, readKakaoReturn, stripKakaoParams, isKakaoInApp, appRedirectUri } from './kakao'

describe('kakaoAuthUrl', () => {
  it('카카오 인가 주소를 만든다', () => {
    const u = new URL(kakaoAuthUrl('CID', 'https://x/R/', 'st1'))
    expect(u.origin + u.pathname).toBe('https://kauth.kakao.com/oauth/authorize')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('client_id')).toBe('CID')
    expect(u.searchParams.get('redirect_uri')).toBe('https://x/R/')
    expect(u.searchParams.get('state')).toBe('st1')
  })
  it('특수문자는 인코딩한다', () => {
    const s = kakaoAuthUrl('a b', 'https://x/R/?v=1&w=2', 's&t')
    expect(s).toContain('client_id=a%20b')
    expect(s).toContain('redirect_uri=https%3A%2F%2Fx%2FR%2F%3Fv%3D1%26w%3D2')
    expect(s).toContain('state=s%26t')
  })
})

describe('readKakaoReturn', () => {
  it('code 와 state 가 있으면 돌려준다', () => {
    expect(readKakaoReturn('?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' })
  })
  it('error 가 오면 카카오가 준 코드를 담는다', () => {
    expect(readKakaoReturn('?error=access_denied&error_description=x&state=xyz')).toEqual({ error: 'access_denied' })
  })
  it('아무것도 없으면 null', () => {
    expect(readKakaoReturn('')).toBeNull()
    expect(readKakaoReturn('?view=calendar')).toBeNull()
  })
  it('code 만 있고 state 가 없으면 null', () => {
    expect(readKakaoReturn('?code=abc')).toBeNull()
  })
})

describe('stripKakaoParams', () => {
  it('카카오 파라미터만 지우고 view 와 해시는 남긴다', () => {
    expect(stripKakaoParams('https://x/R/?view=calendar&code=a&state=b#s=AAA')).toBe('https://x/R/?view=calendar#s=AAA')
  })
  it('error 계열도 지운다', () => {
    expect(stripKakaoParams('https://x/R/?error=access_denied&error_description=d&state=b')).toBe('https://x/R/')
  })
  it('지울 게 없으면 그대로', () => {
    expect(stripKakaoParams('https://x/R/?view=calendar')).toBe('https://x/R/?view=calendar')
    expect(stripKakaoParams('https://x/R/')).toBe('https://x/R/')
  })
  it('쿼리가 비면 ? 도 남기지 않고 해시는 유지', () => {
    expect(stripKakaoParams('https://x/R/?code=a&state=b#s=AAA')).toBe('https://x/R/#s=AAA')
  })
})

describe('isKakaoInApp', () => {
  it('카톡 인앱 브라우저면 true', () => {
    expect(isKakaoInApp('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 KAKAOTALK 10.4.5')).toBe(true)
    expect(isKakaoInApp('... kakaotalk 10.4.5')).toBe(true)
  })
  it('일반 크롬이면 false', () => {
    expect(isKakaoInApp('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe(false)
  })
})

describe('appRedirectUri', () => {
  it('origin + pathname 만 쓴다', () => {
    expect(appRedirectUri({ origin: 'https://x.github.io', pathname: '/R/' })).toBe('https://x.github.io/R/')
  })
})
