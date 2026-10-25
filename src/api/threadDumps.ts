// 스레드 덤프 (api-spec 1번 요청 · 34번 목록 · 46번 본문). 요청은 ADMIN, 보기는 VIEWER+
// 요청은 동기다 — API server 가 Collector 전체에 물어(팬아웃, 49번) 그 파드를 든 Collector 가 덤프를 떠 올 때까지 기다린다
import { api, type Page } from './client'

export type ThreadDumpMeta = {
  dump_uuid: string
  agent_key: string
  service_name: string
  /** 요청한 사람 메일 */
  requested_by: string
  requested_at: string
  thread_count: number
}

/** 덤프 한 건 — 메타 + jstack 형식 본문 전체 */
export type ThreadDump = ThreadDumpMeta & { dump: string }

export type ThreadDumpsQuery = { serviceName?: string | null; agentKey?: string | null; from?: string; to?: string; cursor?: string | null; limit?: number }

export function listThreadDumps(q: ThreadDumpsQuery = {}, signal?: AbortSignal): Promise<Page<ThreadDumpMeta>> {
  return api.getPage<ThreadDumpMeta>('/thread-dumps', {
    query: { service_name: q.serviceName, agent_key: q.agentKey, from: q.from, to: q.to, cursor: q.cursor, limit: q.limit },
    signal,
  })
}

export function getThreadDump(uuid: string, signal?: AbortSignal): Promise<ThreadDump> {
  return api.get<ThreadDump>(`/thread-dumps/${encodeURIComponent(uuid)}`, { signal })
}

/**
 * 지금 이 파드의 덤프를 뜬다. timeout_ms 안에 답이 없으면 503 THREAD_DUMP_TIMEOUT,
 * 그 파드를 든 Collector 가 없으면 503 AGENT_NOT_REACHABLE
 */
export function requestThreadDump(agentUuid: string, timeoutMs: number, signal?: AbortSignal): Promise<ThreadDump & { agent_uuid: string }> {
  return api.post(`/agents/${encodeURIComponent(agentUuid)}/thread-dumps`, { timeout_ms: timeoutMs }, { signal })
}
