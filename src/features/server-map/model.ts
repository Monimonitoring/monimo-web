// Service map 응답(nodes · edges) → 그래프에 그릴 노드 · 간선 값. React 와 무관한 계산만 둔다
import { Graph, layout } from '@dagrejs/dagre'
import type { CalleeKind, ServerMap, ServerMapEdge } from '@/api'

export type Health = 'ok' | 'warn' | 'crit'

/**
 * 에러율 기준. 1% 이상 경고 · 4% 이상 에러.
 * 명세에 정해진 값이 없어 시안(4.18% → 에러, 3.2% → 경고, 0.15% → 정상)에 맞춘 값이다. 경보 규칙과 맞출 때 여기만 바꾼다
 */
export const ERROR_RATE = { warn: 0.01, crit: 0.04 } as const

export const errorRate = (cnt: number, errCnt: number) => (cnt > 0 ? errCnt / cnt : 0)

export function health(cnt: number, errCnt: number): Health {
  const r = errorRate(cnt, errCnt)
  return r >= ERROR_RATE.crit ? 'crit' : r >= ERROR_RATE.warn ? 'warn' : 'ok'
}

export type MapNodeData = {
  name: string
  kind: CalleeKind
  cnt: number
  errCnt: number
  health: Health
  /** 서비스 팔레트 순번(이름 정렬 순). SERVICE 만 있다 */
  colorIndex?: number
  selected?: boolean
  /** 검색어와 맞지 않아 흐리게 */
  dimmed?: boolean
}

/** 노드 크기 (자동 배치용 · 그리는 CSS 와 같은 값) */
export const NODE_SIZE: Record<CalleeKind, { width: number; height: number }> = {
  SERVICE: { width: 168, height: 64 },
  DB: { width: 184, height: 80 },
  EXTERNAL: { width: 208, height: 58 },
  MESSAGING: { width: 176, height: 72 },
}

export type MapGraph = { nodes: MapNodeData[]; edges: ServerMapEdge[]; key: string }

/**
 * 응답을 그릴 노드 목록으로 바꾼다. DB · 외부 노드는 nodes 에 없으므로 들어오는 간선의 합으로 만든다.
 * key 는 노드 · 간선 구성이 같으면 같은 글자 — 숫자만 바뀐 새로고침에서는 배치를 다시 하지 않는 기준이다
 */
export function toGraph(map: ServerMap): MapGraph {
  const edges = mergeEdges(map.edges)
  const byName = new Map<string, MapNodeData>()
  const add = (name: string, kind: CalleeKind, cnt: number, errCnt: number) => {
    const prev = byName.get(name)
    if (prev) {
      prev.cnt += cnt
      prev.errCnt += errCnt
    } else byName.set(name, { name, kind, cnt, errCnt, health: 'ok' })
  }
  for (const n of map.nodes) add(n.service_name, 'SERVICE', n.cnt, n.err_cnt)
  for (const e of edges) {
    // 부른 쪽이 응답의 nodes 에 없으면 간선에서 만든다. 비동기는 부른 쪽이 큐(kafka)라 SERVICE 로 두면
    // 서비스 카드로 그려진다 (backend `#259` : 큐 → 읽은 서비스 간선의 caller 가 큐 이름이다)
    if (!byName.has(e.caller_service)) add(e.caller_service, e.callee_kind === 'MESSAGING' ? 'MESSAGING' : 'SERVICE', 0, 0)
    // 서비스 노드는 서버가 준 합계를 쓴다. 응답에 없는 서비스 · DB · 외부만 간선에서 더한다
    const known = map.nodes.some((n) => n.service_name === e.callee_service)
    if (!known) add(e.callee_service, e.callee_kind, e.cnt, e.err_cnt)
  }
  const nodes = [...byName.values()]
  const services = nodes.filter((n) => n.kind === 'SERVICE').map((n) => n.name).sort()
  for (const n of nodes) {
    n.health = health(n.cnt, n.errCnt)
    if (n.kind === 'SERVICE') n.colorIndex = services.indexOf(n.name)
  }
  const key = [...nodes.map((n) => `${n.kind}:${n.name}`).sort(), ...edges.map(edgeId).sort()].join('|')
  return { nodes, edges, key }
}

export const edgeId = (e: ServerMapEdge) => `${e.caller_service}->${e.callee_service}`

/** 같은 호출 쌍이 여러 줄로 오면 한 간선으로 합친다 (cnt · err_cnt 는 더하고, avg 는 호출 수로 가중 평균). 그래프 간선 id 가 겹치지 않게 */
function mergeEdges(edges: ServerMapEdge[]): ServerMapEdge[] {
  const byId = new Map<string, ServerMapEdge>()
  for (const e of edges) {
    const prev = byId.get(edgeId(e))
    if (!prev) {
      byId.set(edgeId(e), { ...e })
      continue
    }
    const cnt = prev.cnt + e.cnt
    prev.avg_duration_ms = cnt > 0 ? (prev.avg_duration_ms * prev.cnt + e.avg_duration_ms * e.cnt) / cnt : 0
    prev.cnt = cnt
    prev.err_cnt += e.err_cnt
  }
  return [...byId.values()]
}

let lastLayout: { key: string; pos: Record<string, { x: number; y: number }> } | null = null

/**
 * dagre 로 왼쪽(부르는 쪽) → 오른쪽(불리는 쪽) 배치. 반환은 노드 왼쪽 위 좌표.
 * 자리는 구성(key)으로만 정해지므로, 숫자만 바뀐 새로고침에서는 직전 결과를 그대로 돌려준다
 */
export function autoLayout(graph: MapGraph): Record<string, { x: number; y: number }> {
  if (lastLayout?.key === graph.key) return lastLayout.pos
  const g = new Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 170, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))
  // dagre 는 넘긴 객체에 x · y 를 써 넣는다. 같은 크기 객체를 나눠 쓰면 좌표가 겹치므로 복사해서 넘긴다
  for (const n of graph.nodes) g.setNode(n.name, { ...NODE_SIZE[n.kind] })
  for (const e of graph.edges) g.setEdge(e.caller_service, e.callee_service)
  layout(g)
  const out: Record<string, { x: number; y: number }> = {}
  for (const n of graph.nodes) {
    const p = g.node(n.name)
    const { width, height } = NODE_SIZE[n.kind]
    out[n.name] = { x: p.x - width / 2, y: p.y - height / 2 }
  }
  lastLayout = { key: graph.key, pos: out }
  return out
}

/**
 * 선택한 노드의 평균 소요시간 = 들어오는 간선들의 avg_duration_ms 를 호출 수로 가중 평균.
 * 들어오는 간선이 없으면(가장 앞 서비스) null
 */
export function incomingAvg(graph: MapGraph, name: string): { avgMs: number; edges: ServerMapEdge[] } | null {
  const edges = graph.edges.filter((e) => e.callee_service === name)
  const total = edges.reduce((s, e) => s + e.cnt, 0)
  if (!edges.length || total === 0) return null
  return { avgMs: edges.reduce((s, e) => s + e.avg_duration_ms * e.cnt, 0) / total, edges }
}

/** 12,480 */
export const fmtCount = (n: number) => n.toLocaleString('en-US')

/** 간선 라벨용 짧은 수: 940 · 9.6k · 1.2M */
export function fmtCompact(n: number): string {
  if (n < 1000) return String(n)
  const short = (v: number, unit: string) => `${v.toFixed(1).replace(/\.0$/, '')}${unit}`
  // 반올림한 뒤에 단위를 고른다 (999,950 이 1000k 가 되지 않게)
  const k = Math.round(n / 100) / 10
  return k < 1000 ? short(k, 'k') : short(n / 1_000_000, 'M')
}
