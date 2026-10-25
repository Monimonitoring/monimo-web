// URL 통계 (api-spec 12번 GET /stats/urls, VIEWER+). 트랜잭션 URL 통계 탭 · Service map 상위 URL 이 쓴다
import { api, type Page } from './client'

export type UrlStat = {
  /** 요청 이름. 예: GET /api/v1/orders/{orderId} */
  span_name: string
  cnt: number
  err_cnt: number
  /** 0~1 */
  error_rate: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
}

export type UrlStatsQuery = { serviceName: string; from: string; to: string; agentKey?: string; cursor?: string | null; limit?: number }

export function listUrlStats({ serviceName, from, to, agentKey, cursor, limit }: UrlStatsQuery, signal?: AbortSignal): Promise<Page<UrlStat>> {
  return api.getPage<UrlStat>('/stats/urls', { query: { service_name: serviceName, from, to, agent_key: agentKey, cursor, limit }, signal })
}
