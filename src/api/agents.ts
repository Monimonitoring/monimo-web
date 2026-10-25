// 파드 (api-spec 47번 GET /agents, VIEWER+). 트랜잭션 파드 필터 · Inspector 파드 목록이 쓴다
import { api, type Page } from './client'

export type AgentStatus = 'UP' | 'DOWN' | 'UNKNOWN'

export type Agent = {
  agent_uuid: string
  service_name: string
  /** 파드 이름. 신호 조회의 agent_key 와 같은 글자 */
  agent_key: string
  /** 아래 넷은 에이전트가 안 보냈으면 null */
  hostname: string | null
  ip: string | null
  jvm_version: string | null
  agent_version: string | null
  status: AgentStatus
}

export type AgentsQuery = { serviceName?: string | null; status?: AgentStatus; cursor?: string | null; limit?: number }

export function listAgents({ serviceName, status, cursor, limit }: AgentsQuery = {}, signal?: AbortSignal): Promise<Page<Agent>> {
  return api.getPage<Agent>('/agents', { query: { service_name: serviceName, status, cursor, limit }, signal })
}

/** 파드 하나의 상세 (27번) — 목록 필드 + 서비스 uuid · 처음 본 시각 · 마지막 갱신 */
export type AgentDetail = Agent & { application_uuid: string; first_seen_at: string | null; updated_at: string }

export function getAgent(uuid: string, signal?: AbortSignal): Promise<AgentDetail> {
  return api.get<AgentDetail>(`/agents/${encodeURIComponent(uuid)}`, { signal })
}

/** 지금 스레드 수 (21번) — jvm.thread.count 의 가장 최근 1분 값. 신호가 끊긴 파드면 ts_min 이 오래됐다 */
export type ActiveThreads = { agent_uuid: string; agent_key: string; service_name: string; metric_name: string; ts_min: string; last_v: number }

export function getActiveThreads(uuid: string, signal?: AbortSignal): Promise<ActiveThreads> {
  return api.get<ActiveThreads>(`/agents/${encodeURIComponent(uuid)}/active-threads`, { signal })
}
