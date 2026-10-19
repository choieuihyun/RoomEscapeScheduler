import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { beginKakaoTrip, endKakaoTrip } from './kakaoTrip'

/** 메모리 sessionStorage 대역. */
function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', fakeStorage())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('카카오 왕복 보관', () => {
  it('나갈 때 해시를 맡기고 돌아와서 되찾는다', () => {
    const state = beginKakaoTrip('login', '#s=AAA')
    expect(endKakaoTrip(state)).toEqual({ mode: 'login', hash: '#s=AAA' })
  })
  it('state 를 rand 로 정할 수 있다', () => {
    expect(beginKakaoTrip('link', '', () => 'fixed')).toBe('fixed')
  })
  it('기본 state 는 16바이트 hex 이고 매번 다르다', () => {
    const a = beginKakaoTrip('login', '')
    const b = beginKakaoTrip('login', '')
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })
  it('state 가 다르면 null (CSRF)', () => {
    beginKakaoTrip('login', '#s=AAA', () => 'real')
    expect(endKakaoTrip('forged')).toBeNull()
  })
  it('틀린 state 로 시도해도 맡긴 것은 남는다', () => {
    beginKakaoTrip('login', '#s=AAA', () => 'real')
    endKakaoTrip('forged')
    expect(endKakaoTrip('real')).toEqual({ mode: 'login', hash: '#s=AAA' })
  })
  it('한 번 쓰면 다시는 null', () => {
    const state = beginKakaoTrip('link', '#z=B')
    expect(endKakaoTrip(state)).not.toBeNull()
    expect(endKakaoTrip(state)).toBeNull()
  })
  it('10분 지나면 null', () => {
    const t = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(t)
    const state = beginKakaoTrip('login', '#s=AAA')
    expect(endKakaoTrip(state, t + 600_001)).toBeNull()
  })
  it('10분 안이면 돌려준다', () => {
    const t = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(t)
    const state = beginKakaoTrip('login', '#s=AAA')
    expect(endKakaoTrip(state, t + 600_000)).toEqual({ mode: 'login', hash: '#s=AAA' })
  })
  it('맡긴 게 없으면 null', () => {
    expect(endKakaoTrip('x')).toBeNull()
  })
  it('깨진 JSON 이면 null', () => {
    sessionStorage.setItem('flod.kakao.trip', '{oops')
    expect(endKakaoTrip('x')).toBeNull()
  })
})

describe('저장이 막힌 환경', () => {
  beforeEach(() => {
    const boom = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('sessionStorage', { getItem: boom, setItem: boom, removeItem: boom })
  })
  it('begin 은 state 를 그대로 돌려준다', () => {
    expect(beginKakaoTrip('login', '#s=AAA', () => 'st')).toBe('st')
  })
  it('end 는 null (왕복을 증명할 수 없다)', () => {
    expect(endKakaoTrip('st')).toBeNull()
  })
})
