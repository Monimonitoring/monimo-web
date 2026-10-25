// 에러 타임라인 응답 → 막대 차트 · 합계. React 와 무관한 계산만 둔다
import type { ErrorTimeline, HttpStatusClass } from '@/api'

export const CLASSES: HttpStatusClass[] = ['5xx', '4xx', 'other']

export type TimelineView = {
  /** 가로 칸 시각(ms) */
  xs: number[]
  /** 대역별 칸마다 건수 */
  byClass: Record<HttpStatusClass, number[]>
  total: number
  classTotal: Record<HttpStatusClass, number>
  /** 예외 타입별 합계 (많은 순) */
  types: { type: string; cnt: number }[]
}

/** 막대가 90개를 넘지 않게 step(초)을 고른다. 1시간이면 60초. 항상 60의 배수(Collector 집계 단위) */
export function errorStepSec(from: string, to: string): number {
  const sec = (Date.parse(to) - Date.parse(from)) / 1000
  return Math.max(60, Math.ceil(sec / 90 / 60) * 60)
}

export function toView(t: ErrorTimeline, from: string, to: string): TimelineView {
  const stepMs = t.step * 1000
  const start = Math.floor(Date.parse(from) / stepMs) * stepMs
  const xs: number[] = []
  for (let x = start; x < Date.parse(to); x += stepMs) xs.push(x)
  const byClass = { '5xx': xs.map(() => 0), '4xx': xs.map(() => 0), other: xs.map(() => 0) } as Record<HttpStatusClass, number[]>
  const classTotal: Record<HttpStatusClass, number> = { '5xx': 0, '4xx': 0, other: 0 }
  const types = new Map<string, number>()
  let total = 0
  for (const p of t.series) {
    const i = Math.floor((Date.parse(p.ts_min) - start) / stepMs)
    if (i < 0 || i >= xs.length) continue
    byClass[p.http_status_class][i] += p.cnt
    classTotal[p.http_status_class] += p.cnt
    const type = p.exception_type ?? '(예외 없음)'
    types.set(type, (types.get(type) ?? 0) + p.cnt)
    total += p.cnt
  }
  return { xs, byClass, total, classTotal, types: [...types].map(([type, cnt]) => ({ type, cnt })).sort((a, b) => b.cnt - a.cnt) }
}
