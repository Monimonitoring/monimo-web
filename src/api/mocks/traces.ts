// 트레이스 가짜 응답 (GET /traces/scatter · GET /traces/heatmap · GET /traces/transactions).
// 요청은 "분 단위 고정 씨앗" 으로 만든다: 같은 서비스 · 같은 분이면 언제 불러도 같은 요청이 나온다.
// 그래서 스캐터(넓은 범위)에서 드래그한 사각형으로 목록(좁은 범위)을 불러도 같은 요청을 가리킨다.
// 1분에 평균 1.2건. 10분 버킷 중 일부는 "나쁜 구간" 이라 실패 · 느린 요청이 몰린다 (시안처럼)
import { http } from 'msw'
import { API_BASE } from '../client'
import type { HeatmapCell, ScatterPoint, Transaction } from '../traces'
import { agentKeysOf } from './agents'
import { ok, okPage, seeded, timeRange, unauthenticated } from './common'
import { failureOf } from './failures'
import { HOUR } from './serverMap'

const MIN = 60_000
const SPANS: Record<string, string[]> = {
  'shop-gateway': ['GET /orders/**', 'POST /orders/**', 'POST /payments/**'],
  'shop-order': [
    'POST /api/v1/orders/{orderId}/pay',
    'POST /api/v1/orders',
    'GET /api/v1/orders',
    'GET /api/v1/orders/{orderId}',
    'GET /api/v1/orders/{orderId}/items',
    'POST /api/v1/orders/{orderId}/cancel',
  ],
  'shop-payment': ['POST /api/v1/payments', 'GET /api/v1/payments/{paymentId}'],
  'shop-inventory': ['GET /api/v1/stock/{sku}', 'POST /api/v1/stock/reserve'],
}

const hex = (r: () => number, len: number) => Array.from({ length: len }, () => Math.floor(r() * 16).toString(16)).join('')

// 같은 (서비스, 분) 은 늘 같은 결과라 한 번 만든 것은 담아 둔다. 긴 범위(7일 = 10,080분)를 새로고침마다 다시 만들지 않게
const cache = new Map<string, Transaction[]>()

/** 스캐터 · 목록에서 한 번 내보낸 요청을 trace_id 로 찾는다 (트레이스 상세 가짜 응답이 그 요청에 맞는 나무를 만들게) */
export const findRequest = (traceId: string): Transaction | undefined => byTraceId.get(traceId)
const byTraceId = new Map<string, Transaction>()

function minutePoints(service: string, minute: number): Transaction[] {
  const key = `${service}|${minute}`
  let hit = cache.get(key)
  if (!hit) {
    if (cache.size > 50_000) {
      cache.clear()
      byTraceId.clear()
    }
    cache.set(key, (hit = makeMinute(service, minute)))
    for (const p of hit) byTraceId.set(p.trace_id, p)
  }
  return hit
}

function makeMinute(service: string, minute: number): Transaction[] {
  const node = HOUR.nodes.find((n) => n.service_name === service)
  if (!node) return []
  const r = seeded(`${service}|${minute}`)
  // 10분 버킷 중 "나쁜 구간": 매시 30~40분은 항상, 나머지는 30% 확률
  const block = Math.floor(minute / (10 * MIN))
  const bad = block % 6 === 3 || seeded(`${service}|bad|${block}`)() < 0.3
  const failRate = bad ? Math.min(0.5, (node.err_cnt / node.cnt) * 8) : 0.002
  const base = HOUR.edges.find((e) => e.callee_service === service)?.avg_duration_ms ?? 120
  const spans = SPANS[service] ?? ['GET /']
  const pods = agentKeysOf(service)
  const n = r() < 0.2 ? 2 : 1
  return Array.from({ length: n }, () => {
    const isError = r() < failRate
    const slow = bad && r() < 0.25
    const ms = isError ? 900 + r() * 1800 : slow ? base * 2 + r() * base * 6 : base * (0.15 + r() * 0.6)
    const traceId = hex(r, 32)
    return {
      trace_id: traceId,
      start_time: new Date(minute + Math.floor(r() * MIN)).toISOString(),
      duration_ms: Math.max(1, Math.round(ms)),
      service_name: service,
      agent_key: pods[Math.floor(r() * pods.length)] ?? `${service}-unknown`,
      span_name: spans[Math.floor(r() * spans.length)],
      is_error: isError,
      // 실패의 상태코드는 failures.ts 가 정한다 (에러 분석 · 트레이스 상세와 같은 값)
      http_status: isError ? failureOf(service, traceId).http_status : 200,
    }
  })
}

/** [from, to) 안의 요청 전부 (시각 순). 에러 분석 가짜 응답도 쓴다 */
export function requestsIn(service: string, from: number, to: number, agentKey: string | null): Transaction[] {
  const out: Transaction[] = []
  for (let m = Math.floor(from / MIN) * MIN; m < to; m += MIN) {
    for (const p of minutePoints(service, m)) {
      const t = Date.parse(p.start_time)
      if (t >= from && t < to && (!agentKey || p.agent_key === agentKey)) out.push(p)
    }
  }
  return out
}

export const tracesHandlers = [
  http.get(`${API_BASE}/traces/scatter`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const url = new URL(request.url)
    const range = timeRange(url)
    if (range instanceof Response) return range
    const service = url.searchParams.get('service_name') ?? ''
    const node = HOUR.nodes.find((n) => n.service_name === service)
    if (!node) return ok({ mode: 'raw', total_count: 0, points: [] })
    const all = requestsIn(service, range.from, range.to, url.searchParams.get('agent_key'))
    const limit = Math.min(Number(url.searchParams.get('limit')) || 5000, 5000)
    // 점이 limit 을 넘으면 서버가 격자로 접는다. 가짜 응답은 고르게 솎아서 흉내만 낸다
    const step = all.length / limit
    const shown = all.length > limit ? Array.from({ length: limit }, (_, i) => all[Math.floor(i * step)]) : all
    const points: ScatterPoint[] = shown.map(({ service_name: _s, ...p }) => p)
    return ok({ mode: all.length > limit ? 'bucketed' : 'raw', total_count: Math.round(node.cnt * range.hours), points })
  }),

  // 히트맵 = 같은 요청을 (step 초 × 50ms 구간 × 성공/실패) 칸으로 센 것. heatmap_1m 의 구간 폭(50ms)을 따른다
  http.get(`${API_BASE}/traces/heatmap`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const url = new URL(request.url)
    const range = timeRange(url)
    if (range instanceof Response) return range
    const step = Math.max(60, Math.round(Number(url.searchParams.get('step')) / 60) * 60 || 60)
    const width = 50
    const cells = new Map<string, HeatmapCell>()
    for (const p of requestsIn(url.searchParams.get('service_name') ?? '', range.from, range.to, null)) {
      const ts = Math.floor(Date.parse(p.start_time) / (step * 1000)) * step * 1000
      const bucket = Math.floor(p.duration_ms / width)
      const key = `${ts}|${bucket}|${p.is_error}`
      const cell = cells.get(key)
      if (cell) cell.cnt += 1
      else cells.set(key, { ts_min: new Date(ts).toISOString(), latency_bucket: bucket, is_error: p.is_error, cnt: 1 })
    }
    return ok({ bucket_width_ms: width, step, cells: [...cells.values()] })
  }),

  // 드래그한 사각형 안의 요청. 느린 순, 커서는 건너뛸 건수
  http.get(`${API_BASE}/traces/transactions`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const url = new URL(request.url)
    const range = timeRange(url)
    if (range instanceof Response) return range
    const q = url.searchParams
    const min = q.has('min_duration_ms') ? Number(q.get('min_duration_ms')) : -Infinity
    const max = q.has('max_duration_ms') ? Number(q.get('max_duration_ms')) : Infinity
    const isError = q.get('is_error')
    const rows = requestsIn(q.get('service_name') ?? '', range.from, range.to, q.get('agent_key'))
      .filter((p) => p.duration_ms >= min && p.duration_ms <= max && (isError === null || String(p.is_error) === isError))
      .sort((a, b) => b.duration_ms - a.duration_ms)
    const limit = Math.min(Number(q.get('limit')) || 50, 500)
    const offset = Number(q.get('cursor')) || 0
    const next = offset + limit < rows.length ? String(offset + limit) : null
    return okPage(rows.slice(offset, offset + limit), limit, next)
  }),
]
