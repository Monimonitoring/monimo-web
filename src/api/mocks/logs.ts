// 로그 가짜 응답 (GET /logs).
// 트랜잭션 가짜 요청(traces.ts)마다 로그 몇 줄을 만든다 — 그래서 로그의 trace_id 를 누르면 같은 요청의 트레이스가 열린다.
//   INFO  컨트롤러 처리 끝 (모든 요청) · DEBUG 저장소 조회 (절반)
//   WARN  느린 요청의 timeout 경고 · 실패 요청의 재시도
//   ERROR 실패 요청 — 예외 타입 · 메시지는 failures.ts (에러 분석 표 · 트레이스 상세와 같은 값)
// 요청과 이어지지 않은 배치 로그(trace_id 없음)도 5분마다 한 줄씩 섞는다
import { http } from 'msw'
import { API_BASE } from '../client'
import type { LogLevel, LogLine } from '../logs'
import type { Transaction } from '../traces'
import { agentKeysOf } from './agents'
import { fail, okPage, seeded, timeRange, unauthenticated } from './common'
import { failureOf } from './failures'
import { HOUR } from './serverMap'
import { requestsIn } from './traces'

const MIN = 60_000
/** 로그 보관 기간 (디스크 7일 + S3 90일) */
const RETENTION_MS = 97 * 24 * 60 * MIN

const pkg = (service: string) => service.replace(/^shop-/, '')
const pascal = (s: string) => s.replace(/^./, (c) => c.toUpperCase())
const hex = (r: () => number, len: number) => Array.from({ length: len }, () => Math.floor(r() * 16).toString(16)).join('')

function requestLogs(req: Transaction): LogLine[] {
  const r = seeded(`log|${req.trace_id}`)
  const svc = pkg(req.service_name)
  const end = Date.parse(req.start_time) + req.duration_ms
  const thread = `http-nio-8080-exec-${1 + Math.floor(r() * 8)}`
  const spanId = hex(r, 16)
  const [method, route] = req.span_name.split(' ')
  const attrs = { 'http.method': method, 'http.route': route ?? '/', 'order.id': String(10000 + Math.floor(r() * 90000)) }
  const line = (level: LogLevel, at: number, logger: string, message: string, extra: Record<string, string> = {}): LogLine => ({
    ts: new Date(Math.round(at)).toISOString(),
    service_name: req.service_name,
    agent_key: req.agent_key,
    level,
    logger,
    thread,
    message,
    trace_id: req.trace_id,
    span_id: spanId,
    attributes: { ...attrs, ...extra },
  })

  const out: LogLine[] = []
  if (r() < 0.5) {
    out.push(line('DEBUG', Date.parse(req.start_time) + 3, `com.shop.${svc}.repo.${pascal(svc)}Repository`, `select took ${1 + Math.floor(r() * 12)}ms`))
  }
  if (req.is_error) {
    const f = failureOf(req.service_name, req.trace_id)
    out.push(line('WARN', end - req.duration_ms * 0.4, `com.shop.${svc}.client.UpstreamClient`, `retry 1/3 after timeout, ${req.span_name}`, { 'retry.count': '1' }))
    out.push(line('ERROR', end - 2, `com.shop.${svc}.service.${pascal(svc)}Service`, `${f.exception_type}: ${f.exception_message}`, { 'error.type': f.exception_type }))
  } else if (req.duration_ms > 600) {
    out.push(line('WARN', end - 5, `com.shop.${svc}.client.UpstreamClient`, `slow call ${req.duration_ms}ms (timeout budget 800ms)`))
  }
  out.push(line(req.is_error ? 'WARN' : 'INFO', end, `com.shop.${svc}.api.${pascal(svc)}Controller`, `${req.span_name} → ${req.http_status} (${req.duration_ms}ms)`))
  return out
}

/** 5분마다 배치 로그 한 줄 (trace_id 없음) */
function batchLogs(service: string, from: number, to: number): LogLine[] {
  const out: LogLine[] = []
  const step = 5 * MIN
  const pods = agentKeysOf(service)
  for (let t = Math.ceil(from / step) * step; t < to; t += step) {
    const r = seeded(`batch|${service}|${t}`)
    out.push({
      ts: new Date(t + Math.floor(r() * 1000)).toISOString(),
      service_name: service,
      agent_key: pods[0] ?? `${service}-unknown`,
      // 10분에 한 줄은 severity 가 없는 옛 로거라 severity 가 빈 글자로 들어온다 (ADR #59)
      level: (t / step) % 2 === 0 ? 'INFO' : '',
      logger: `com.shop.${pkg(service)}.batch.SyncJob`,
      thread: 'scheduling-1',
      message: `sync finished: ${10 + Math.floor(r() * 90)} items`,
      trace_id: '',
      span_id: '',
      attributes: { job: 'sync' },
    })
  }
  return out
}

export const logsHandlers = [
  http.get(`${API_BASE}/logs`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const url = new URL(request.url)
    const range = timeRange(url)
    if (range instanceof Response) return range
    if (range.from < Date.now() - RETENTION_MS) return fail(404, 'SIGNAL_EXPIRED', '보관 기간(97일)이 지난 범위의 로그는 지워졌습니다.')
    const q = url.searchParams
    const service = q.get('service_name')
    const services = service ? [service] : HOUR.nodes.map((n) => n.service_name)
    const agent = q.get('agent_key')
    // 빈 글자('') 도 값이다 — severity 를 모르는 줄(ADR #59). 대소문자는 가리지 않는다
    const levelParam = q.get('level')
    const levels = levelParam === null ? [] : levelParam.split(',').map((l) => l.trim().toUpperCase())
    const logger = q.get('logger') ?? ''
    const traceId = q.get('trace_id') ?? ''
    const needle = (q.get('q') ?? '').toLowerCase()

    const rows = services
      .flatMap((s) => [
        ...requestsIn(s, range.from, range.to, agent).flatMap(requestLogs),
        // 배치 로그도 파드 필터를 따른다 (배치는 서비스의 첫 파드에서 돈다)
        ...batchLogs(s, range.from, range.to).filter((l) => !agent || l.agent_key === agent),
      ])
      .filter(
        (l) =>
          (!levels.length || levels.includes(l.level)) &&
          l.logger.startsWith(logger) &&
          (!traceId || l.trace_id === traceId) &&
          (!needle || l.message.toLowerCase().includes(needle)),
      )
      .sort((a, b) => b.ts.localeCompare(a.ts))
    const limit = Math.min(Number(q.get('limit')) || 50, 500)
    const offset = Number(q.get('cursor')) || 0
    return okPage(rows.slice(offset, offset + limit), limit, offset + limit < rows.length ? String(offset + limit) : null)
  }),
]
