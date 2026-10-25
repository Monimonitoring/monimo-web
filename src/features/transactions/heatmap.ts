// 히트맵 응답(50ms 구간) → 화면 격자(시각 × 지연 띠 5개). React 와 무관한 계산만 둔다
import type { Heatmap } from '@/api'
import { heatmapStep } from '@/shared'
import { toIso } from '@/stores'
import type { Selection } from './selection'

/** 세로축 지연 띠. 스캐터의 로그 눈금처럼 빠른 쪽을 촘촘히 본다 (시안의 5단) */
export const BANDS = [
  { label: '0–100', min: 0, max: 99 },
  { label: '100–300', min: 100, max: 299 },
  { label: '300–1000', min: 300, max: 999 },
  { label: '1000–3000', min: 1000, max: 2999 },
  { label: '3000+', min: 3000, max: 3_600_000 },
] as const

/** 응답시간이 드는 띠 번호. 마지막 띠(3000+)보다 길면 마지막 띠 */
function bandOf(ms: number): number {
  const i = BANDS.findIndex((b) => ms <= b.max)
  return i === -1 ? BANDS.length - 1 : i
}

/** 히트맵 한 칸 [가로 번호, 세로 번호, 건수, 색 단계, 실패 건수] */
export type GridCell = [number, number, number, number, number]

export type Grid = { xs: number[]; stepMs: number; cells: GridCell[] }

/**
 * 응답 → 격자. 가로는 [from, to) 를 step 간격으로 빈 칸 없이 채우고, 세로는 구간 최솟값이 드는 띠로 모은다.
 * 실패가 한 건이라도 있는 칸은 에러 칸(crit)으로 칠한다 (06 P5)
 */
export function toGrid(h: Heatmap, from: string, to: string): Grid {
  const stepMs = h.step * 1000
  const start = Math.floor(Date.parse(from) / stepMs) * stepMs
  const xs: number[] = []
  for (let t = start; t < Date.parse(to); t += stepMs) xs.push(t)
  const sum = new Map<string, { cnt: number; err: number }>()
  for (const c of h.cells) {
    // 서버가 step 보다 잘게(1분) 줘도 제 칸에 들어가도록 내림
    const x = Math.floor((Date.parse(c.ts_min) - start) / stepMs)
    if (x < 0 || x >= xs.length) continue
    const key = `${x}|${bandOf(c.latency_bucket * h.bucket_width_ms)}`
    const v = sum.get(key) ?? { cnt: 0, err: 0 }
    v.cnt += c.cnt
    if (c.is_error) v.err += c.cnt
    sum.set(key, v)
  }
  let max = 1
  for (const v of sum.values()) max = Math.max(max, v.cnt)
  const cells = [...sum.entries()].map(([key, v]): GridCell => {
    const [x, y] = key.split('|').map(Number)
    return [x, y, v.cnt, heatmapStep(v.cnt, max, v.err > 0), v.err]
  })
  return { xs, stepMs, cells }
}

/** 히트맵에서 드래그한 칸 범위(번호) → 요청 목록 조건. 칸 경계에 맞춘다 */
export function gridToSelection(g: Grid, [[x0, x1], [y0, y1]]: [[number, number], [number, number]]): Selection {
  const clampX = (i: number) => Math.min(g.xs.length - 1, Math.max(0, Math.round(i)))
  const clampY = (i: number) => Math.min(BANDS.length - 1, Math.max(0, Math.round(i)))
  const [a, b] = [clampX(Math.min(x0, x1)), clampX(Math.max(x0, x1))]
  const [c, d] = [clampY(Math.min(y0, y1)), clampY(Math.max(y0, y1))]
  return { from: toIso(g.xs[a]), to: toIso(g.xs[b] + g.stepMs), minMs: BANDS[c].min, maxMs: BANDS[d].max }
}

/** 요청 목록 조건 → 히트맵에 다시 그릴 칸 범위 (스캐터에서 고른 선택이면 그 범위를 덮는 칸) */
export function selectionToGrid(g: Grid, s: Selection): [[number, number], [number, number]] | null {
  if (!g.xs.length) return null
  const x = (t: number) => Math.min(g.xs.length - 1, Math.max(0, Math.floor((t - g.xs[0]) / g.stepMs)))
  return [
    [x(Date.parse(s.from)), x(Date.parse(s.to) - 1)],
    [bandOf(s.minMs), bandOf(s.maxMs)],
  ]
}

/** 가로 칸이 360개를 넘지 않게 step(초)을 고른다. 1분 미만은 없다 */
export function heatmapStepSec(from: string, to: string): number {
  const sec = (Date.parse(to) - Date.parse(from)) / 1000
  return Math.max(60, Math.ceil(sec / 360 / 60) * 60)
}
