import { describe, expect, it } from 'vitest'
import type { CalleeKind, ServerMap, ServerMapEdge } from '@/api'
import { NODE_SIZE, autoLayout, health, incomingAvg, toGraph } from './model'

/**
 * 응답 → 그릴 노드 계산. 실서버에서 받은 모양을 그대로 줄여 쓴다 (실측 2026-10-29, 5분 창).
 * 눈으로 확인하기 어려운 것을 여기서 본다 : **큐 노드가 서비스 카드로 그려지지 않는지**
 */
const edge = (caller: string, callee: string, kind: CalleeKind, cnt: number, errCnt = 0, avg = 1): ServerMapEdge => ({
  caller_service: caller,
  callee_service: callee,
  callee_kind: kind,
  cnt,
  err_cnt: errCnt,
  avg_duration_ms: avg,
})

const map: ServerMap = {
  // 서버는 요청을 받은 우리 서비스만 nodes 로 준다. 큐 · DB · 외부는 간선에서 만들어야 한다
  nodes: [
    { service_name: 'shop-gateway', cnt: 1269, err_cnt: 104 },
    { service_name: 'shop-order', cnt: 1285, err_cnt: 104 },
    { service_name: 'shop-inventory', cnt: 1778, err_cnt: 0 },
  ],
  // **순서가 중요하다.** 서버는 ORDER BY caller_service, callee_service 로 주므로
  // 큐에서 나가는 간선(kafka -> ...)이 큐로 들어가는 간선(shop-order -> kafka)보다 **먼저** 온다.
  // 그래서 큐 노드는 「부른 쪽」 자리에서 처음 만들어진다 (backend #259)
  edges: [
    edge('kafka', 'shop-inventory', 'MESSAGING', 1270, 0, 1.2),
    edge('shop-gateway', 'shop-order', 'SERVICE', 1269, 104, 130),
    edge('shop-order', 'kafka', 'MESSAGING', 1285, 0, 4.2),
    edge('shop-order', 'mysql:3306', 'DB', 2570, 0, 3.1),
    edge('shop-order', 'shop-inventory', 'SERVICE', 1389, 0, 7.9),
    edge('shop-payment', 'pg-stub:8080', 'EXTERNAL', 1163, 0, 2.3),
  ],
}

describe('Service map 노드 계산', () => {
  it('비동기 간선의 부른 쪽(큐)은 메시징 노드가 된다', () => {
    // 전에는 응답 nodes 에 없는 부른 쪽을 전부 SERVICE 로 만들어서 kafka 가 서비스 카드로 그려졌다.
    // 서버가 주는 순서(caller 순)에서 kafka -> ... 가 먼저 오기 때문에 실제로 그렇게 됐다
    const kafka = toGraph(map).nodes.find((n) => n.name === 'kafka')
    expect(kafka?.kind).toBe('MESSAGING')
  })

  it('DB · 외부 노드는 들어오는 간선에서 만들고, 서비스 노드는 서버가 준 합계를 쓴다', () => {
    const g = toGraph(map)
    expect(g.nodes.find((n) => n.name === 'mysql:3306')?.kind).toBe('DB')
    expect(g.nodes.find((n) => n.name === 'pg-stub:8080')?.kind).toBe('EXTERNAL')
    // 간선 cnt(1389) 가 아니라 nodes 의 합계(1778)
    expect(g.nodes.find((n) => n.name === 'shop-inventory')?.cnt).toBe(1778)
  })

  it('응답 nodes 에 없는 서비스는 간선에서 서비스 노드로 만든다', () => {
    const payment = toGraph(map).nodes.find((n) => n.name === 'shop-payment')
    expect(payment?.kind).toBe('SERVICE')
  })

  it('서비스 노드만 팔레트 순번을 받는다 (이름 정렬 순)', () => {
    const g = toGraph(map)
    expect(g.nodes.find((n) => n.name === 'shop-gateway')?.colorIndex).toBe(0)
    expect(g.nodes.find((n) => n.name === 'kafka')?.colorIndex).toBeUndefined()
  })

  it('구성이 같으면 key 가 같고 숫자만 바뀌면 배치를 다시 하지 않는다', () => {
    const more: ServerMap = { ...map, edges: map.edges.map((e) => ({ ...e, cnt: e.cnt * 2 })) }
    expect(toGraph(more).key).toBe(toGraph(map).key)
  })

  it('간선 종류마다 노드 크기가 있다', () => {
    // 종류를 더하고 크기를 안 넣으면 dagre 가 undefined 를 받아 배치가 깨진다
    const kinds: CalleeKind[] = ['SERVICE', 'DB', 'EXTERNAL', 'MESSAGING']
    for (const k of kinds) expect(NODE_SIZE[k]?.width).toBeGreaterThan(0)
  })

  it('비동기 노드가 섞여도 자동 배치가 좌표를 낸다', () => {
    const g = toGraph(map)
    const pos = autoLayout(g)
    for (const n of g.nodes) expect(Number.isFinite(pos[n.name]?.x)).toBe(true)
  })
})

describe('Service map 숫자', () => {
  it('에러율로 정상 · 경고 · 에러를 가른다 (1% · 4%)', () => {
    expect(health(100, 0)).toBe('ok')
    expect(health(100, 2)).toBe('warn')
    expect(health(100, 5)).toBe('crit')
  })

  it('들어오는 간선이 없는 노드는 평균이 null', () => {
    expect(incomingAvg(toGraph(map), 'shop-gateway')).toBeNull()
  })

  it('들어오는 간선 평균은 호출 수로 가중 평균', () => {
    const inv = incomingAvg(toGraph(map), 'shop-inventory')
    // SERVICE 1389건 7.9ms + MESSAGING 1270건 1.2ms
    expect(inv?.edges.length).toBe(2)
    expect(inv?.avgMs).toBeCloseTo((1389 * 7.9 + 1270 * 1.2) / (1389 + 1270), 4)
  })
})
