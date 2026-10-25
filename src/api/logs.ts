// 로그 검색 (api-spec 35번 GET /logs, VIEWER+). 로그 화면 · 트레이스 드로어 연결 로그가 쓴다
import { api, type Page } from './client'

export const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export type LogLine = {
  /** 기록 시각 (밀리초까지) */
  ts: string
  service_name: string
  agent_key: string
  /** 닫힌 집합 TRACE~FATAL. severity 를 알 수 없으면 빈 글자 (ADR #59) */
  level: LogLevel | ''
  /** 기록한 클래스 */
  logger: string
  thread: string
  message: string
  /** 요청과 이어지지 않은 로그(배치 등)는 빈 글자 */
  trace_id: string
  span_id: string
  /** MDC Attribute */
  attributes: Record<string, string>
}

export type LogsQuery = {
  serviceName?: string | null
  from: string
  to: string
  agentKey?: string
  /** 여러 개면 쉼표로 이어 보낸다. 대소문자 무관, 닫힌 집합(TRACE~FATAL) 밖이면 400, severity 모름은 '' (ADR #59) */
  levels?: (LogLevel | '')[]
  logger?: string
  traceId?: string
  /** 본문 검색어 */
  q?: string
  cursor?: string | null
  limit?: number
}

/** 로그 검색 (시각 역순, 커서 페이징). 보관 기간(97일)이 지난 범위는 404 SIGNAL_EXPIRED */
export function listLogs(q: LogsQuery, signal?: AbortSignal): Promise<Page<LogLine>> {
  return api.getPage<LogLine>('/logs', {
    query: {
      service_name: q.serviceName,
      from: q.from,
      to: q.to,
      agent_key: q.agentKey,
      level: q.levels?.length ? q.levels.join(',') : undefined,
      logger: q.logger,
      trace_id: q.traceId,
      q: q.q,
      cursor: q.cursor,
      limit: q.limit,
    },
    signal,
  })
}
