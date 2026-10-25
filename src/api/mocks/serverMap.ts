// Service map 가짜 응답 (GET /server-map). 숫자는 시안(ServerMap.dc.html) 의 1시간 값이고, 시간 범위 길이에 비례해 늘리거나 줄인다
import { http } from 'msw'
import { API_BASE } from '../client'
import type { ServerMap } from '../serverMap'
import { ok, timeRange, unauthenticated } from './common'

/** 시안의 1시간 값. 다른 가짜 응답(스캐터 등)도 서비스별 호출 수를 여기서 맞춘다 */
export const HOUR: ServerMap = {
  nodes: [
    { service_name: 'shop-gateway', cnt: 12540, err_cnt: 404 },
    { service_name: 'shop-order', cnt: 12480, err_cnt: 402 },
    { service_name: 'shop-payment', cnt: 9610, err_cnt: 402 },
    { service_name: 'shop-inventory', cnt: 9220, err_cnt: 14 },
  ],
  edges: [
    { caller_service: 'shop-gateway', callee_service: 'shop-order', callee_kind: 'SERVICE', cnt: 12410, err_cnt: 12, avg_duration_ms: 214 },
    { caller_service: 'shop-order', callee_service: 'shop-payment', callee_kind: 'SERVICE', cnt: 9580, err_cnt: 402, avg_duration_ms: 386 },
    { caller_service: 'shop-order', callee_service: 'shop-inventory', callee_kind: 'SERVICE', cnt: 9200, err_cnt: 14, avg_duration_ms: 63 },
    { caller_service: 'shop-order', callee_service: 'orders-db', callee_kind: 'DB', cnt: 24860, err_cnt: 5, avg_duration_ms: 11 },
    { caller_service: 'shop-payment', callee_service: 'pg-gateway.example.com', callee_kind: 'EXTERNAL', cnt: 9450, err_cnt: 388, avg_duration_ms: 341 },
  ],
}

export const serverMapHandlers = [
  // 실제 서버는 service_name 이 오면 그 서비스와 이어진 부분만 줄 수 있다. 가짜 응답은 4개가 모두 이어져 있어 전체를 준다
  http.get(`${API_BASE}/server-map`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const range = timeRange(new URL(request.url))
    if (range instanceof Response) return range
    const scale = (n: number) => Math.round(n * range.hours)
    return ok({
      nodes: HOUR.nodes.map((n) => ({ ...n, cnt: scale(n.cnt), err_cnt: scale(n.err_cnt) })),
      edges: HOUR.edges.map((e) => ({ ...e, cnt: scale(e.cnt), err_cnt: scale(e.err_cnt) })),
    })
  }),
]
