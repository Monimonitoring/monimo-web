// 스레드 덤프 본문(jstack 형식) 읽기 — 스레드마다 이름 · 상태 · CPU 시간 · 기다리는 락 · 쥔 락 · 스택 깊이, 끝의 데드락 절. React 와 무관한 계산만 둔다
//
//   "http-nio-8080-exec-7" #142 daemon prio=5 cpu=12.34ms waiting for monitor entry  [0x…]
//      java.lang.Thread.State: BLOCKED (on object monitor)
//      at com.shop.order.OrderService.create(OrderService.java:87)
//      - waiting to lock <0x00007f3a8c41e2b0> (a com.shop.order.StockLock)
//      - locked <0x00007f3a8c41f118> (a com.shop.order.OrderContext)
//
// agent-extension 은 이 모양으로 쓰되 nid · elapsed 가 없다 (shop #57). 머리줄에 상태 낱말을 적던 옛 모양 덤프도 보관 기간 동안 읽힌다

export type ThreadState = 'RUNNABLE' | 'WAITING' | 'TIMED_WAITING' | 'BLOCKED' | 'NEW' | 'TERMINATED'
export const THREAD_STATES: ThreadState[] = ['RUNNABLE', 'WAITING', 'TIMED_WAITING', 'BLOCKED']

export type LockRef = { addr: string; cls: string }

export type DumpThread = {
  name: string
  state: ThreadState
  /** 머리줄 cpu=…ms 누적 CPU 시간. 없는 모양이면 null */
  cpuMs: number | null
  /** 이 스레드의 원문 줄 (머리 줄 포함) */
  lines: string[]
  /** 기다리는 대상 — waiting to lock(모니터) · waiting on(Object.wait) · parking to wait for(LockSupport.park) */
  waiting: (LockRef & { kind: 'lock' | 'wait' | 'park' }) | null
  /** lines 안에서 기다리는 줄의 위치 — 뷰어가 강조한다 */
  waitingLine: number
  /** 쥐고 있는 모니터 */
  locked: LockRef[]
  /** at … 줄 수 */
  depth: number
}

const HEAD = /^"(.+?)"\s/
const HEAD_STATE = /\s(RUNNABLE|BLOCKED|WAITING|TIMED_WAITING|NEW|TERMINATED)\b/
const CPU = /\scpu=(\d+(?:\.\d+)?)ms/
const WAIT = /^\s*- (waiting to lock|waiting on|parking to wait for)\s+<(0x[0-9a-f]+)>\s+\(a ([^)]+)\)/
const LOCKED = /^\s*- locked\s+<(0x[0-9a-f]+)>\s+\(a ([^)]+)\)/
const KIND = { 'waiting to lock': 'lock', 'waiting on': 'wait', 'parking to wait for': 'park' } as const

export function parseDump(text: string): DumpThread[] {
  const out: DumpThread[] = []
  let cur: DumpThread | null = null
  for (const line of text.split('\n')) {
    const head = HEAD.exec(line)
    if (head) {
      // 상태 낱말은 이름 뒤에서만 찾는다 — 이름에 WAITING 이 들어간 스레드가 있을 수 있다
      const rest = line.slice(head[0].length)
      const hs = HEAD_STATE.exec(rest)
      const cpu = CPU.exec(rest)
      cur = { name: head[1], state: (hs?.[1] as ThreadState | undefined) ?? 'RUNNABLE', cpuMs: cpu ? Number(cpu[1]) : null, lines: [line], waiting: null, waitingLine: -1, locked: [], depth: 0 }
      out.push(cur)
      continue
    }
    if (!cur) continue
    if (!line.trim()) {
      cur = null
      continue
    }
    cur.lines.push(line)
    const st = /java\.lang\.Thread\.State: (\w+)/.exec(line)
    if (st) cur.state = st[1] as ThreadState
    else if (/^\s*at /.test(line)) cur.depth++
    else {
      const w = WAIT.exec(line)
      if (w && !cur.waiting) {
        cur.waiting = { kind: KIND[w[1] as keyof typeof KIND], addr: w[2], cls: w[3] }
        cur.waitingLine = cur.lines.length - 1
      }
      const l = LOCKED.exec(line)
      if (l) cur.locked.push({ addr: l[1], cls: l[2] })
    }
  }
  return out
}

/**
 * 끝의 데드락 절 — 고리마다 스레드 이름 묶음. 없으면 빈 배열
 *
 *   Found one Java-level deadlock:
 *   =============================
 *   "dead-1":
 *     waiting to lock <0x…> (a java.lang.Object),
 *     which is held by "dead-2"
 *   …
 *   Java stack information for the threads listed above:
 */
export function parseDeadlocks(text: string): string[][] {
  const out: string[][] = []
  let cur: string[] | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('Found one Java-level deadlock')) {
      cur = []
      out.push(cur)
      continue
    }
    if (!cur) continue
    if (line.startsWith('Java stack information')) {
      cur = null
      continue
    }
    const m = /^"(.+)":$/.exec(line)
    if (m) cur.push(m[1])
  }
  return out
}

/** 락 주소 → 그 락을 쥔 스레드 이름 */
export function lockOwners(threads: DumpThread[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const t of threads) for (const l of t.locked) if (!m.has(l.addr)) m.set(l.addr, t.name)
  return m
}

export function stateCounts(threads: DumpThread[]): Record<ThreadState, number> {
  const c = { RUNNABLE: 0, WAITING: 0, TIMED_WAITING: 0, BLOCKED: 0, NEW: 0, TERMINATED: 0 }
  for (const t of threads) c[t.state] = (c[t.state] ?? 0) + 1
  return c
}

/** BLOCKED 요약 한 줄 — 가장 많이 기다리는 락과 그 주인. 없으면 null */
export function blockedSummary(threads: DumpThread[], owners: Map<string, string>): string | null {
  const blocked = threads.filter((t) => t.state === 'BLOCKED' && t.waiting)
  if (!blocked.length) return null
  const by = new Map<string, number>()
  for (const t of blocked) by.set(t.waiting!.addr, (by.get(t.waiting!.addr) ?? 0) + 1)
  const [addr, n] = [...by].sort((a, b) => b[1] - a[1])[0]
  const cls = blocked.find((t) => t.waiting!.addr === addr)!.waiting!.cls.split('.').pop()
  const owner = owners.get(addr)
  const who = owner ? ` — 주인 ${owner}` : ''
  return n === blocked.length
    ? `BLOCKED ${n}건이 같은 락 하나(${cls})를 기다리는 중입니다${who}`
    : `BLOCKED ${blocked.length}건 중 ${n}건이 같은 락(${cls})을 기다리는 중입니다${who}`
}
