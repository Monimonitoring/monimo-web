import { useSearchParams } from 'react-router'
import type { AgentStatus } from '@/api'

const STATUSES: AgentStatus[] = ['UP', 'DOWN', 'UNKNOWN']

export type InspectorTab = 'metrics' | 'dumps'
/** 덤프 목록 기간. 덤프는 드물게 찍으므로 상단바 시간 범위(기본 1시간) 대신 따로 고른다. 93일은 보관 한도(TTL) */
export type DumpPeriod = '24h' | '7d' | '93d'
const PERIODS: DumpPeriod[] = ['24h', '7d', '93d']

/**
 * Inspector 주소 쿼리 — agent(고른 파드 uuid) · status(파드 목록 상태 칩) · m(지표 추가로 붙인 차트, 쉼표로 여러 개)
 * · tab(metrics · dumps) · dump(열린 덤프 uuid) · dagent(덤프 목록 파드 필터) · period(덤프 목록 기간).
 * 새로고침 · 링크 공유해도 같은 파드 · 같은 차트가 열린다. 바꿀 때 기록은 남기지 않는다(replace)
 */
export function useInspectorParams() {
  const [params, setParams] = useSearchParams()
  const agentId = params.get('agent')
  const status = STATUSES.find((s) => s === params.get('status')) ?? null
  const metrics = (params.get('m') ?? '').split(',').filter(Boolean)
  const tab: InspectorTab = params.get('tab') === 'dumps' ? 'dumps' : 'metrics'
  const dumpId = params.get('dump')
  const dumpAgent = params.get('dagent')
  const period = PERIODS.find((p) => p === params.get('period')) ?? '7d'

  const set = (next: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v)
          else p.delete(k)
        }
        return p
      },
      { replace: true },
    )

  return {
    agentId,
    status,
    metrics,
    tab,
    dumpId,
    dumpAgent,
    period,
    setTab: (t: InspectorTab) => set({ tab: t === 'metrics' ? null : t }),
    openDump: (id: string | null) => set({ dump: id }),
    setDumpAgent: (key: string | null) => set({ dagent: key, dump: null }),
    setPeriod: (p: DumpPeriod) => set({ period: p === '7d' ? null : p, dump: null }),
    /** 파드 머리의 「덤프 이력」 — 덤프 탭을 그 파드로 좁혀 연다 */
    showDumpsOf: (agentKey: string) => set({ tab: 'dumps', dagent: agentKey, dump: null }),
    /** 덤프 요청이 끝나면 덤프 탭에서 그 덤프를 연다 (목록 필터는 풀어 새 덤프가 보이게) */
    showNewDump: (id: string) => set({ tab: 'dumps', dump: id, dagent: null, period: null }),
    selectAgent: (id: string) => set({ agent: id }),
    setStatus: (s: AgentStatus | null) => set({ status: s }),
    addMetric: (name: string) => set({ m: [...metrics.filter((x) => x !== name), name].join(',') }),
    removeMetric: (name: string) => set({ m: metrics.filter((x) => x !== name).join(',') || null }),
  }
}
