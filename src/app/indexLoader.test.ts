import { describe, expect, it } from 'vitest'
import { indexLoader } from './indexLoader'

const load = (url: string) => indexLoader({ request: new Request(url), params: {}, context: {} } as never) as Response

describe('indexLoader', () => {
  it('/ 는 Service map 으로 보내고 쿼리를 그대로 들고 간다', () => {
    const res = load('http://localhost/?range=1h&refresh=30&service=shop-order')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/server-map?range=1h&refresh=30&service=shop-order')
  })

  it('쿼리가 없으면 /server-map 그대로', () => {
    expect(load('http://localhost/').headers.get('Location')).toBe('/server-map')
  })
})
