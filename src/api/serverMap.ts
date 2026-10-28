// 서버맵 (api-spec 41번 GET /server-map, VIEWER+). server_map_1m 을 시간 범위로 더한 값
import { api } from './client'

/**
 * 불린 쪽 종류 : 우리 서비스 · DB · 바깥 API · 메시징(비동기). 서버맵에서 노드 모양을 가르는 기준
 *
 * MESSAGING 은 비동기 구간이다 (backend `#259`). 동기 호출은 스팬 하나에 부른 쪽과 받는 쪽이 같이 있어서
 * 간선 하나가 되는데, 비동기는 보낸 쪽 스팬과 읽은 쪽 스팬이 끊겨 있어 어느 쪽도 상대를 모른다.
 * 그래서 서버가 간선을 **둘로 쪼개** 보낸다 : 보낸 서비스 → 큐 · 큐 → 읽은 서비스
 */
export type CalleeKind = 'SERVICE' | 'DB' | 'EXTERNAL' | 'MESSAGING'

export type ServerMapNode = {
  service_name: string
  cnt: number
  err_cnt: number
}

export type ServerMapEdge = {
  caller_service: string
  /** SERVICE 면 서비스 이름, DB · EXTERNAL 이면 주소(예: orders-db · pg-gateway.example.com), MESSAGING 이면 큐 이름(예: kafka) */
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
