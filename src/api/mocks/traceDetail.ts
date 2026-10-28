// 트레이스 상세 가짜 응답 (GET /traces/:traceId).
// 트랜잭션 목록 · 스캐터에서 내보낸 trace_id 면 그 요청(서비스 · URL · 응답시간 · 실패)에 맞춰 나무를 만든다.
// 모르는 id 는 id 를 씨앗으로 shop-order 요청을 지어낸다. `expired` 로 시작하면 보관 기간이 지난 트레이스(404 SIGNAL_EXPIRED).
// 나무 모양: 서비스마다 SERVER → INTERNAL, 그 아래로 서버맵 간선(HOUR.edges)대로 DB · 외부 · 다른 서비스를 차례로 부른다.
// ⚠ handlers 배열에서 tracesHandlers(scatter · heatmap · transactions) 뒤에 둬야 한다 — 앞에 두면 :traceId 가 그 경로들을 가로챈다
import { http } from 'msw'
import { API_BASE } from '../client'
import type { Span, Trace, Transaction } from '../traces'
import { agentKeysOf } from './agents'
import { fail, ok, seeded, unauthenticated } from './common'
import { failureOf } from './failures'
import { HOUR } from './serverMap'
import { findRequest } from './traces'

const MS = 1_000_000 // ns

/** 다른 서비스를 부를 때 불린 쪽 SERVER 스팬 이름 (성공 · 실패 경로) */
const CALLEE_SPAN: Record<string, [ok: string, bad: string]> = {
  'shop-order': ['GET /api/v1/orders/{orderId}', 'POST /api/v1/orders'],
  'shop-payment': ['GET /api/v1/payments/{paymentId}', 'POST /api/v1/payments'],
  'shop-inventory': ['GET /api/v1/stock/{sku}', 'POST /api/v1/stock/reserve'],
}

const pascal = (service: string) => service.replace(/^shop-/, '').replace(/^./, (c) => c.toUpperCase())

type Ctx = { r: () => number; spans: number; errorLeaf: Span | null }

function makeSpan(ctx: Ctx, fields: Omit<Span, 'span_id' | 'parent_span_id' | 'children' | 'events' | 'status_code'> & { error?: boolean }): Span {
  ctx.spans += 1
  const { error, ...rest } = fields
  return {
    span_id: Array.from({ length: 16 }, () => Math.floor(ctx.r() * 16).toString(16)).join(''),
    parent_span_id: null,
    status_code: error ? 'ERROR' : 'OK',
    events: [],
    children: [],
    ...rest,
  }
}

const adopt = (parent: Span, child: Span) => {
  child.parent_span_id = parent.span_id
  parent.children.push(child)
}

/**
 * 서비스 하나가 요청을 받아 처리하는 부분 나무. startMs · durMs 안에 하위 호출을 차례로 배치한다.
 * failing 이면 가장 느린 하위 서비스 호출(없으면 자기 자신)에서 실패가 난 것으로 만든다
 */
function serviceTree(ctx: Ctx, service: string, spanName: string, startMs: number, durMs: number, failing: boolean, depth: number): Span {
  const pods = agentKeysOf(service)
  const agent = pods[Math.floor(ctx.r() * pods.length)] ?? `${service}-unknown`
  const [method, ...path] = spanName.split(' ')
  const server = makeSpan(ctx, {
    service_name: service,
    agent_key: agent,
    span_name: spanName,
    span_kind: 'SERVER',
    start_time: new Date(startMs).toISOString(),
    duration_ns: Math.round(durMs * MS),
    http_status: failing ? 500 : 200,
    attributes: { 'http.request.method': method, 'http.route': path.join(' ') || '/', 'http.response.status_code': failing ? '500' : '200' },
    error: failing,
  })
  const inner = makeSpan(ctx, {
    service_name: service,
    agent_key: agent,
    span_name: `${pascal(service)}Service.${method === 'GET' ? 'find' : 'handle'}`,
    span_kind: 'INTERNAL',
    start_time: new Date(startMs + durMs * 0.004).toISOString(),
    duration_ns: Math.round(durMs * 0.99 * MS),
    http_status: null,
    attributes: { 'code.function': method === 'GET' ? 'find' : 'handle' },
    error: failing,
  })
  adopt(server, inner)

  // 부르는 순서: DB 조회 → 빠른 서비스 → 느린 서비스(외부)
  const kindOrder = { DB: 0, SERVICE: 1, EXTERNAL: 2, MESSAGING: 3 } as const
  // 비동기 간선은 트레이스 나무에 안 넣는다. 보낸 쪽과 읽은 쪽이 다른 트레이스라 한 나무로 못 그린다.
  // 트레이스 상세의 비동기 표시는 backend `#259` 범위 밖(후속)이다
  const calls = (depth < 3 ? HOUR.edges.filter((e) => e.caller_service === service && e.callee_kind !== 'MESSAGING') : []).sort(
    (a, b) => kindOrder[a.callee_kind] - kindOrder[b.callee_kind] || a.avg_duration_ms - b.avg_duration_ms,
  )
  // 실패는 가장 느린 서비스 · 외부 호출에서 난 것으로
  const culprit = failing ? [...calls].filter((e) => e.callee_kind !== 'DB').sort((a, b) => b.avg_duration_ms - a.avg_duration_ms)[0] : undefined
  const weight = (e: (typeof calls)[number]) => (e === culprit ? e.avg_duration_ms * 6 : e.avg_duration_ms)
  const total = calls.reduce((s, e) => s + weight(e), 0)
  let t = startMs + durMs * 0.02
  const budget = durMs * 0.9
  for (const e of calls) {
    const d = total ? (budget * weight(e)) / total : 0
    const bad = e === culprit
    if (e.callee_kind === 'SERVICE') {
      const client = makeSpan(ctx, {
        service_name: service,
        agent_key: agent,
        span_name: `HTTP ${(CALLEE_SPAN[e.callee_service]?.[bad ? 1 : 0] ?? 'GET').split(' ')[0]} ${e.callee_service}`,
        span_kind: 'CLIENT',
        start_time: new Date(t).toISOString(),
        duration_ns: Math.round(d * MS),
        http_status: bad ? 500 : 200,
        attributes: { 'server.address': e.callee_service, 'http.request.method': (CALLEE_SPAN[e.callee_service]?.[bad ? 1 : 0] ?? 'GET').split(' ')[0] },
        error: bad,
      })
      adopt(inner, client)
      const calleeSpan = (CALLEE_SPAN[e.callee_service] ?? ['GET /', 'POST /'])[bad ? 1 : 0]
      adopt(client, serviceTree(ctx, e.callee_service, calleeSpan, t + d * 0.005, d * 0.99, bad, depth + 1))
    } else {
      const isDb = e.callee_kind === 'DB'
      const leaf = makeSpan(ctx, {
        service_name: service,
        agent_key: agent,
        span_name: isDb ? `JDBC SELECT ${e.callee_service.replace(/-db$/, '')}` : `HTTP POST ${e.callee_service}`,
        span_kind: 'CLIENT',
        start_time: new Date(t).toISOString(),
        duration_ns: Math.round(d * MS),
        http_status: isDb ? null : bad ? 402 : 200,
        attributes: isDb
          ? { 'db.system': 'postgresql', 'db.statement': `SELECT * FROM ${e.callee_service.replace(/-db$/, '').replace(/-/g, '_')} WHERE id = ?`, 'server.address': e.callee_service }
          : { 'server.address': e.callee_service, 'http.request.method': 'POST' },
        error: bad,
      })
      adopt(inner, leaf)
      if (bad) ctx.errorLeaf = leaf
    }
    t += d
  }
  if (failing && !culprit) ctx.errorLeaf = server
  return server
}

function buildTrace(traceId: string, req: Transaction | undefined): Trace {
  const r = seeded(traceId)
  const service = req?.service_name ?? 'shop-order'
  const spanName = req?.span_name ?? 'POST /api/v1/orders/{orderId}/pay'
  const durMs = req?.duration_ms ?? 400 + Math.round(r() * 2200)
  const failing = req?.is_error ?? r() < 0.4
  const start = req ? Date.parse(req.start_time) : Date.now() - 20 * 60_000
  const ctx: Ctx = { r, spans: 0, errorLeaf: null }
  const root = serviceTree(ctx, service, spanName, start, durMs, failing, 0)
  // 목록에 나온 실패 요청이면 상태코드 · 예외를 에러 분석 표와 같게 (failures.ts)
  const known = req?.is_error ? failureOf(req.service_name, traceId) : null
  if (known) {
    root.http_status = known.http_status
    root.attributes['http.response.status_code'] = String(known.http_status)
  }
  if (ctx.errorLeaf) {
    const leaf = ctx.errorLeaf
    const type = known?.exception_type ?? (leaf.span_name.includes('pg-gateway') ? 'PaymentDeclinedException' : 'UpstreamServerException')
    const message = known?.exception_message ?? (leaf.span_name.includes('pg-gateway') ? 'card issuer declined (code=51)' : `${leaf.service_name} returned 500`)
    leaf.attributes['error.type'] = type
    const at = Date.parse(leaf.start_time) + leaf.duration_ns / MS
    leaf.events.push(
      { ts: new Date(at - leaf.duration_ns / MS / 2).toISOString(), name: 'retry', attributes: { attempt: '2', backoff_ms: '200' } },
      { ts: new Date(at).toISOString(), name: 'exception', attributes: { 'exception.type': type, 'exception.message': message } },
    )
  }
  const services: string[] = []
  const walk = (s: Span) => {
    if (!services.includes(s.service_name)) services.push(s.service_name)
    s.children.forEach(walk)
  }
  walk(root)
  return { trace_id: traceId, span_count: ctx.spans, services, root }
}

export const traceDetailHandlers = [
  http.get(`${API_BASE}/traces/:traceId`, ({ request, params }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const traceId = String(params.traceId)
    if (traceId.startsWith('expired')) return fail(404, 'SIGNAL_EXPIRED', '보관 기간(93일)이 지나 트레이스가 지워졌습니다.')
    if (!/^[0-9a-z-]{8,64}$/i.test(traceId)) return fail(404, 'NOT_FOUND', '트레이스를 찾을 수 없습니다.')
    return ok(buildTrace(traceId, findRequest(traceId)))
  }),
]
