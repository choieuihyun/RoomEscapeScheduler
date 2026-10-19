import { describe, expect, it, vi } from 'vitest'
import { handleKakaoReturn, type KakaoReturnDeps } from './authFlow'

const R = 'https://x.test/R/'
function deps(o: Partial<KakaoReturnDeps> = {}): KakaoReturnDeps {
  return {
    search: '?code=C&state=S&view=calendar',
    href: R + '?code=C&state=S&view=calendar',
    replaceUrl: vi.fn(),
    endTrip: vi.fn(() => ({ mode: 'login' as const, hash: '#s=AAA' })),
    kakaoLogin: vi.fn(async () => ({ customToken: 'tok' })),
    kakaoLink: vi.fn(async () => ({ linked: true })),
    signInWithCustom: vi.fn(async () => ({ uid: 'u', id: '' })),
    idToken: vi.fn(async () => 'idtok'),
    redirectUri: R,
    ...o,
  }
}

describe('handleKakaoReturn', () => {
  it('코드가 없으면 아무것도 안 한다', async () => {
    const d = deps({ search: '?view=calendar', href: R + '?view=calendar' })
    expect(await handleKakaoReturn(d)).toEqual({ kind: 'none' })
    expect(d.replaceUrl).not.toHaveBeenCalled()
    expect(d.endTrip).not.toHaveBeenCalled()
  })

  it('login 왕복이면 커스텀 토큰으로 들어간다', async () => {
    const d = deps()
    expect(await handleKakaoReturn(d)).toEqual({ kind: 'signedIn' })
    expect(d.kakaoLogin).toHaveBeenCalledWith('C', R)
    expect(d.signInWithCustom).toHaveBeenCalledWith('tok')
  })

  it('해시를 되살리고 code 를 지운다', async () => {
    const d = deps()
    await handleKakaoReturn(d)
    expect(d.replaceUrl).toHaveBeenCalledWith(R + '?view=calendar#s=AAA')
  })

  it('같은 코드로 두 번 오면 한 번만 에러, 주소는 정리', async () => {
    const d = deps({ endTrip: vi.fn(() => null) })
    expect(await handleKakaoReturn(d)).toEqual({ kind: 'error', message: '카카오 로그인이 만료됐어요. 다시 눌러 주세요.' })
    expect(d.kakaoLogin).not.toHaveBeenCalled()
    expect(d.replaceUrl).toHaveBeenCalledWith(R + '?view=calendar')
  })

  it('?error=access_denied 면 취소 문구', async () => {
    const d = deps({ search: '?error=access_denied', href: R + '?error=access_denied' })
    expect(await handleKakaoReturn(d)).toEqual({ kind: 'error', message: '카카오 로그인을 취소했어요.' })
    expect(d.replaceUrl).toHaveBeenCalledWith(R)
    expect(d.endTrip).not.toHaveBeenCalled()
  })

  it('link 왕복이면 idToken 을 실어 kakaoLink', async () => {
    const d = deps({ endTrip: vi.fn(() => ({ mode: 'link' as const, hash: '' })) })
    expect(await handleKakaoReturn(d)).toEqual({ kind: 'linked' })
    expect(d.kakaoLink).toHaveBeenCalledWith('C', R, 'idtok')
    expect(d.kakaoLogin).not.toHaveBeenCalled()
  })

  it('state 가 비어 있으면 endTrip 을 부르지 않고 만료 처리', async () => {
    const d = deps({ search: '?code=C&state=', href: R + '?code=C&state=' })
    expect(await handleKakaoReturn(d)).toEqual({ kind: 'error', message: '카카오 로그인이 만료됐어요. 다시 눌러 주세요.' })
    expect(d.endTrip).not.toHaveBeenCalled()
    expect(d.kakaoLogin).not.toHaveBeenCalled()
    expect(d.replaceUrl).toHaveBeenCalledWith(R)
  })

  it('이상한 hash 는 버리고 해시 없이 정리한다', async () => {
    const d = deps({ endTrip: vi.fn(() => ({ mode: 'login' as const, hash: '#javascript:alert(1)' })) })
    await handleKakaoReturn(d)
    expect(d.replaceUrl).toHaveBeenCalledWith(R + '?view=calendar')
  })

  it('#z= 해시도 되살린다', async () => {
    const d = deps({ endTrip: vi.fn(() => ({ mode: 'login' as const, hash: '#z=BBB' })) })
    await handleKakaoReturn(d)
    expect(d.replaceUrl).toHaveBeenCalledWith(R + '?view=calendar#z=BBB')
  })
})
