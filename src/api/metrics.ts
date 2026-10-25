// Inspector 지표 (api-spec 15번 GET /metrics/series · 25번 GET /metrics/names, VIEWER+)
import { api } from './client'

/** 서버가 시간 범위에 맞춰 고른 원본 표. 짧으면 원본, 길면 1분 · 1시간 롤업 */
export type MetricSource = 'metrics_raw' | 'metrics_1m' | 'metrics_1h'

export type MetricPoint = { ts_min: string; avg_v: number; min_v: number; max_v: number; last_v: number }

/** 같은 지표라도 속성(예: jvm.memory.pool.name) 조합마다 줄이 따로 온다 */
export type MetricSeriesLine = { agent_key: string; attributes: Record<string, string>; points: MetricPoint[] }

export type MetricSeries = { metric_name: string; source_table: MetricSource; step: number; series: MetricSeriesLine[] }

export type MetricSeriesQuery = { serviceName: string; metricName: string; from: string; to: string; agentKey?: string; step?: number }

export function getMetricSeries(q: MetricSeriesQuery, signal?: AbortSignal): Promise<MetricSeries> {
  return api.get<MetricSeries>('/metrics/series', {
    query: { service_name: q.serviceName, metric_name: q.metricName, from: q.from, to: q.to, agent_key: q.agentKey, step: q.step },
    signal,
  })
}

/** 실제로 들어온 지표 이름과 붙는 속성 키 (지표 추가 드롭다운) */
export type MetricName = { metric_name: string; attribute_keys: string[] }

export async function listMetricNames(q: { serviceName: string; from?: string; to?: string }, signal?: AbortSignal): Promise<MetricName[]> {
  // 명세 25번은 목록 봉투(page)가 없는 배열로 본다
  return api.get<MetricName[]>('/metrics/names', { query: { service_name: q.serviceName, from: q.from, to: q.to }, signal })
}
