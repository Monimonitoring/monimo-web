// 트레이스 (api-spec 5번 GET /traces/scatter · 9번 GET /traces/heatmap · 14번 GET /traces/{traceId} · 26번 GET /traces/transactions, VIEWER+). 트랜잭션 화면 · Service map 미니 스캐터가 쓴다
import { api, type Page } from './client'

export type ScatterPoint = {
  trace_id: string
  start_time: string
  duration_ms: number
  is_error: boolean
  http_status: number | null
  span_name: string
  agent_key: string
}

/** raw = 점 하나가 요청 하나. bucketed = 점이 limit 을 넘어 서버가 격자로 접은 결과 (서버가 정한다) */
export type Scatter = { mode: 'raw' | 'bucketed'; total_count: number; points: ScatterPoint[] }

export type ScatterQuery = { serviceName: string; from: string; to: string; agentKey?: string; limit?: number }

export function getScatter({ serviceName, from, to, agentKey, limit }: ScatterQuery, signal?: AbortSignal): Promise<Scatter> {
  return api.get<Scatter>('/traces/scatter', { query: { service_name: serviceName, from, to, agent_key: agentKey, limit }, signal })
}

/** 드래그한 사각형(시각 × 응답시간) 안의 요청 한 건 */
export type Transaction = {
  trace_id: string
  start_time: string
  duration_ms: number
  service_name: string
  agent_key: string
  span_name: string
  is_error: boolean
  http_status: number | null
}

export type TransactionsQuery = {
  serviceName: string
  from: string
  to: string
  agentKey?: string
  minDurationMs?: number
  maxDurationMs?: number
  isError?: boolean
  cursor?: string | null
  limit?: number
}

export function listTransactions(q: TransactionsQuery, signal?: AbortSignal): Promise<Page<Transaction>> {
  return api.getPage<Transaction>('/traces/transactions', {
    query: {
      service_name: q.serviceName,
      from: q.from,
      to: q.to,
      agent_key: q.agentKey,
      min_duration_ms: q.minDurationMs,
      max_duration_ms: q.maxDurationMs,
      is_error: q.isError,
      cursor: q.cursor,
      limit: q.limit,
    },
    signal,
  })
}

/** 히트맵 한 칸: 시각(step 단위) × 지연 구간 × 성공/실패 의 건수 */
export type HeatmapCell = {
  ts_min: string
  /** 지연 구간 번호 = floor(응답시간 / bucket_width_ms) */
  latency_bucket: number
  is_error: boolean
  cnt: number
}

export type Heatmap = { bucket_width_ms: number; step: number; cells: HeatmapCell[] }

export type HeatmapQuery = { serviceName: string; from: string; to: string; step?: number }

export function getHeatmap({ serviceName, from, to, step }: HeatmapQuery, signal?: AbortSignal): Promise<Heatmap> {
  return api.get<Heatmap>('/traces/heatmap', { query: { service_name: serviceName, from, to, step }, signal })
}

/** 스팬 종류 — 요청을 받은 쪽(SERVER) · 남을 부른 쪽(CLIENT) · 서비스 안(INTERNAL) 등 */
export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER'
export type SpanStatus = 'UNSET' | 'OK' | 'ERROR'

/** 스팬 안에서 벌어진 일 (예외 등) */
export type SpanEvent = { ts: string; name: string; attributes: Record<string, string> }

/** 트레이스를 이루는 구간 하나. children 으로 부모-자식 나무를 이룬다 (erd spans) */
export type Span = {
  span_id: string
  parent_span_id: string | null
  service_name: string
  agent_key: string
  span_name: string
  span_kind: SpanKind
  start_time: string
  duration_ns: number
  status_code: SpanStatus
  http_status: number | null
  attributes: Record<string, string>
  events: SpanEvent[]
  children: Span[]
}

export type Trace = {
  trace_id: string
  span_count: number
  /** 지나간 서비스 (처음 나온 순) */
  services: string[]
  root: Span
}

/** 트레이스 하나를 부모-자식 나무로. 보관 기간(93일)이 지났으면 404 SIGNAL_EXPIRED */
export function getTrace(traceId: string, signal?: AbortSignal): Promise<Trace> {
  return api.get<Trace>(`/traces/${encodeURIComponent(traceId)}`, { signal })
}
