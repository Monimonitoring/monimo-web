// Service map 노드 모양 4가지 — callee_kind 로 가른다. 서비스(카드) · DB(원통) · 외부(점선) · 메시징(육각형)
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { serviceColor } from '@/design-system'
import { fmtCount, type MapNodeData } from './model'

export type MapNode = Node<MapNodeData, 'SERVICE' | 'DB' | 'EXTERNAL' | 'MESSAGING'>

const cls = (d: MapNodeData, kind: string) =>
  ['sm-node', `sm-node--${kind}`, `sm-node--${d.health}`, d.selected && 'is-selected', d.dimmed && 'is-dimmed'].filter(Boolean).join(' ')

// 간선이 붙는 점. 끌어서 새 간선을 만드는 기능은 쓰지 않으므로 보이지 않게 둔다
function Ports() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="sm-port" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="sm-port" isConnectable={false} />
    </>
  )
}

const Err = ({ d }: { d: MapNodeData }) => <span className={`sm-node__err sm-err--${d.health}`}>err {fmtCount(d.errCnt)}</span>

export function ServiceNode({ data: d }: NodeProps<MapNode>) {
  return (
    <div className={cls(d, 'service')}>
      <Ports />
      <div className="sm-node__name text-body-13-strong">
        <span className="sm-node__dot" style={{ background: serviceColor(d.colorIndex ?? 0) }} aria-hidden />
        {d.name}
      </div>
      <div className="sm-node__stats text-mono-11">
        <span>cnt {fmtCount(d.cnt)}</span>
        <Err d={d} />
      </div>
    </div>
  )
}

export function DbNode({ data: d }: NodeProps<MapNode>) {
  return (
    <div className={cls(d, 'db')}>
      <Ports />
      <svg className="sm-node__cylinder" viewBox="0 0 184 80" preserveAspectRatio="none" aria-hidden>
        <path d="M1 12 v56 a91 11 0 0 0 182 0 v-56" />
        <ellipse cx="92" cy="12" rx="91" ry="11" />
      </svg>
      <div className="sm-node__name text-body-13-strong">{d.name}</div>
      <div className="sm-node__stats text-mono-11">
        <span>DB · cnt {fmtCount(d.cnt)}</span>
        <Err d={d} />
      </div>
    </div>
  )
}

/**
 * 메시징(비동기) 노드. 육각형으로 둬서 서비스 카드 · DB 원통 · 외부 점선과 한눈에 갈린다 (backend `#259`)
 *
 * 이 노드는 고른 모양이 아니라 **남는 자리**다 : 보낸 쪽 스팬은 받는 쪽을 모르고 읽은 쪽 스팬은 보낸 쪽을
 * 모르기 때문에 간선이 큐를 거쳐 둘로 쪼개진다. 테두리를 SVG 로 그리는 것은 DB 원통과 같은 이유다
 * (clip-path 로 자르면 테두리가 안 그려진다)
 */
export function MessagingNode({ data: d }: NodeProps<MapNode>) {
  return (
    <div className={cls(d, 'messaging')}>
      <Ports />
      <svg className="sm-node__hex" viewBox="0 0 176 72" preserveAspectRatio="none" aria-hidden>
        <path d="M22 1 H154 L175 36 L154 71 H22 L1 36 Z" />
      </svg>
      <div className="sm-node__name text-body-13-strong">{d.name}</div>
      <div className="sm-node__stats text-mono-11">
        <span>비동기 · cnt {fmtCount(d.cnt)}</span>
        <Err d={d} />
      </div>
    </div>
  )
}

export function ExternalNode({ data: d }: NodeProps<MapNode>) {
  return (
    <div className={cls(d, 'external')}>
      <Ports />
      <div className="sm-node__name text-mono-12-strong">{d.name}</div>
      <div className="sm-node__stats text-mono-11">
        <span>cnt {fmtCount(d.cnt)}</span>
        <Err d={d} />
      </div>
    </div>
  )
}
