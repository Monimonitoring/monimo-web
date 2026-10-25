import { useSearchParams } from 'react-router'
import { LOG_LEVELS, type LogLevel } from '@/api'

/** 로그 필터 (주소 쿼리에 둔다 — 새로고침 · 링크 공유해도 유지) */
export type LogFilters = { agentKey: string; levels: (LogLevel | '')[]; logger: string; traceId: string; q: string }

export const EMPTY: LogFilters = { agentKey: '', levels: [], logger: '', traceId: '', q: '' }

// trace 는 트레이스 드로어가 쓰는 이름이라, 로그의 trace_id 필터는 trace_id 로 둔다
const KEYS = { agentKey: 'agent', levels: 'level', logger: 'logger', traceId: 'trace_id', q: 'q' } as const

// severity 모름('')은 주소에 빈 글자로 두면 쉼표 목록에서 사라져 보여, 토큰 NONE 으로 바꿔 둔다 (level=ERROR,NONE ↔ levels=['ERROR',''])
const NONE_TOKEN = 'NONE'
const toToken = (lv: LogLevel | '') => lv || NONE_TOKEN
const fromToken = (t: string): LogLevel | '' | null => {
  if (t === NONE_TOKEN) return ''
  return (LOG_LEVELS as readonly string[]).includes(t) ? (t as LogLevel) : null
}

export function useLogFilters() {
  const [params, setParams] = useSearchParams()
  const levels = (params.get(KEYS.levels) ?? '')
    .split(',')
    .filter(Boolean)
    .map(fromToken)
    .filter((v): v is LogLevel | '' => v !== null)
  const filters: LogFilters = {
    agentKey: params.get(KEYS.agentKey) ?? '',
    levels,
    logger: params.get(KEYS.logger) ?? '',
    traceId: params.get(KEYS.traceId) ?? '',
    q: params.get(KEYS.q) ?? '',
  }
  // 기록은 남기지 않는다(replace) — 뒤로가기가 필터를 하나씩 되돌리지 않게
  const setFilters = (next: LogFilters) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        const values: Record<keyof LogFilters, string> = { ...next, levels: next.levels.map(toToken).join(',') }
        for (const k of Object.keys(KEYS) as (keyof LogFilters)[]) {
          if (values[k]) p.set(KEYS[k], values[k])
          else p.delete(KEYS[k])
        }
        return p
      },
      { replace: true },
    )
  return { filters, setFilters }
}
