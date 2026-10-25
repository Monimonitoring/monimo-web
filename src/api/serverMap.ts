// Service map (api-spec 41번 GET /server-map, VIEWER+). server_map_1m 을 시간 범위로 더한 값
import { api } from './client'

/** 불린 쪽 종류 — 우리 서비스 · DB · 바깥 API. Service map 에서 노드 모양을 가르는 기준 */
export type CalleeKind = 'SERVICE' | 'DB' | 'EXTERNAL'

export type ServerMapNode = {
  service_name: string
  cnt: number
  err_cnt: number
}

export type ServerMapEdge = {
  caller_service: string
  /** SERVICE 면 서비스 이름, DB · EXTERNAL 이면 주소(예: orders-db · pg-gateway.example.com) */
  callee_service: string
  callee_kind: CalleeKind
  cnt: number
  err_cnt: number
  avg_duration_ms: number
}

export type ServerMap = { nodes: ServerMapNode[]; edges: ServerMapEdge[] }

export type ServerMapQuery = { serviceName: string | null; from: string; to: string }

export function getServerMap({ serviceName, from, to }: ServerMapQuery, signal?: AbortSignal): Promise<ServerMap> {
  return api.get<ServerMap>('/server-map', { query: { service_name: serviceName, from, to }, signal })
}
