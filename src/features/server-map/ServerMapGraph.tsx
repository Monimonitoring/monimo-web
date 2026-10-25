// Service map 그래프 (React Flow). 배치는 dagre 로 자동, 사용자가 끌어 옮긴 위치는 「레이아웃 재정렬」 전까지 유지한다
import { useMemo, useState } from 'react'
import { Controls, ReactFlow, type Edge, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { autoLayout, edgeId, fmtCompact, fmtCount, health, type MapGraph } from './model'
import { DbNode, ExternalNode, ServiceNode, type MapNode } from './nodes'

/** React Flow 에 넘기는 노드 종류 표. 컴포넌트 밖 상수여야 매 렌더마다 노드를 다시 만들지 않는다 */
const nodeTypes = { SERVICE: ServiceNode, DB: DbNode, EXTERNAL: ExternalNode }

type Point = { x: number; y: number }
type Size = { width: number; height: number }

/** 검색어가 있고 이름에 들어 있지 않으면 흐리게 */
const isDimmed = (q: string, name: string) => q !== '' && !name.toLowerCase().includes(q)

type Props = {
  graph: MapGraph
  selected: string | null
  onSelect: (name: string) => void
  /** 검색어. 이름에 들어 있지 않은 노드와 그 간선을 흐리게 한다 */
  query: string
  /** 바뀔 때마다 자동 배치를 새로 한다 (레이아웃 재정렬 버튼) */
  layoutNonce: number
}

export function ServerMapGraph({ graph, selected, onSelect, query, layoutNonce }: Props) {
  // dagre 배치는 같은 구성이면 늘 같은 자리라, 숫자만 바뀐 새로고침에서도 노드가 움직이지 않는다.
  // 끌어 옮긴 위치는 구성(graph.key)이 바뀌거나 재정렬을 누르면 버린다
  const layoutKey = `${graph.key}#${layoutNonce}`
  const auto = useMemo(() => autoLayout(graph), [graph]) // 구성이 같으면 autoLayout 이 직전 결과를 돌려준다
  const [dragged, setDragged] = useState<{ key: string; pos: Record<string, Point> }>({ key: '', pos: {} })
  // React Flow 가 잰 노드 크기. 넘겨주지 않으면 매 렌더마다 다시 재느라 간선이 잠깐 사라진다
  const [sizes, setSizes] = useState<Record<string, Size>>({})

  const q = query.trim().toLowerCase()

  const nodes = useMemo<MapNode[]>(
    () =>
      graph.nodes.map((d) => ({
        id: d.name,
        type: d.kind,
        position: (dragged.key === layoutKey && dragged.pos[d.name]) || auto[d.name],
        measured: sizes[d.name],
        selected: d.name === selected,
        ariaLabel: `${d.name}, 호출 ${fmtCount(d.cnt)}건, 에러 ${fmtCount(d.errCnt)}건`,
        data: { ...d, selected: d.name === selected, dimmed: isDimmed(q, d.name) },
      })),
    [graph, auto, dragged, layoutKey, sizes, selected, q],
  )

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => {
        const h = health(e.cnt, e.err_cnt)
        const color = h === 'crit' ? 'var(--color-status-crit)' : 'var(--color-status-muted)'
        const faded = isDimmed(q, e.caller_service) && isDimmed(q, e.callee_service)
        return {
          id: edgeId(e),
          source: e.caller_service,
          target: e.callee_service,
          markerEnd: h === 'crit' ? 'sm-arrow-crit' : 'sm-arrow',
          style: {
            stroke: color,
            strokeWidth: h === 'crit' ? 2 : 1.6,
            strokeDasharray: e.callee_kind === 'EXTERNAL' ? '5 3' : undefined,
            opacity: faded ? 0.25 : 1,
          },
          label: [fmtCompact(e.cnt), h !== 'ok' && `err ${fmtCount(e.err_cnt)}`, `${Math.round(e.avg_duration_ms)}ms`].filter(Boolean).join(' · '),
          labelStyle: { fontFamily: 'var(--font-mono)', fontSize: 10, fill: h === 'crit' ? 'var(--color-status-crit-text)' : 'var(--color-text-tertiary)', opacity: faded ? 0.25 : 1 },
          labelBgStyle: { fill: 'var(--color-bg-surface)' },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          focusable: false,
        }
      }),
    [graph, q],
  )

  const onNodesChange = (changes: NodeChange<MapNode>[]) => {
    const pos: Record<string, Point> = {}
    const size: Record<string, Size> = {}
    for (const c of changes) {
      if (c.type === 'position' && c.position) pos[c.id] = c.position
      else if (c.type === 'dimensions' && c.dimensions) size[c.id] = c.dimensions
      else if (c.type === 'select' && c.selected) onSelect(c.id)
    }
    if (Object.keys(pos).length) setDragged((d) => ({ key: layoutKey, pos: { ...(d.key === layoutKey ? d.pos : {}), ...pos } }))
    if (Object.keys(size).length) setSizes((s) => ({ ...s, ...size }))
  }

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <marker id="sm-arrow" viewBox="0 0 9 9" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0 1.2 L8 4.5 L0 7.8 Z" style={{ fill: 'var(--color-status-muted)' }} />
          </marker>
          <marker id="sm-arrow-crit" viewBox="0 0 9 9" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0 1.2 L8 4.5 L0 7.8 Z" style={{ fill: 'var(--color-status-crit)' }} />
          </marker>
        </defs>
      </svg>
      <ReactFlow
        // 재정렬 · 구성 변경 때 화면에 맞춰 다시 보이도록 key 로 새로 그린다
        key={layoutKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }}
        minZoom={0.3}
        maxZoom={2}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        ariaLabelConfig={{ 'node.a11yDescription.default': '엔터 키로 선택하고, 방향키로 옮깁니다.' }}
        aria-label="서비스 호출 그래프"
      >
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </>
  )
}
