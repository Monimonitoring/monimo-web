import { describe, expect, it } from 'vitest'
import { blockedSummary, groupByStack, lockOwners, parseDeadlocks, parseDump, sortThreads, stateCounts } from './dumpParse'

// jstack 이 실제로 찍는 모양을 줄였다. 스레드 사이는 빈 줄, 프레임은 탭으로 들여쓴다. 첫 스레드만 cpu= 가 있다 (JDK 11+ · agent-extension)
const DUMP = [
  '2026-09-21 14:05:41',
  'Full thread dump OpenJDK 64-Bit Server VM (21.0.4+7-LTS mixed mode, sharing):',
  '',
  '"http-nio-8080-exec-12" #20 daemon prio=5 os_prio=0 cpu=1234.56ms elapsed=88.10s tid=0x1 nid=0x2 runnable  [0x3]',
  '   java.lang.Thread.State: RUNNABLE',
  '\tat java.net.SocketInputStream.socketRead0(Native Method)',
  '\tat com.shop.order.OrderRepository.decreaseStock(OrderRepository.java:132)',
  '\t- locked <0x00007f3a8c41e2b0> (a com.shop.order.StockLock)',
  '\tat java.lang.Thread.run(Thread.java:1583)',
  '',
  '"http-nio-8080-exec-7" #21 daemon prio=5 os_prio=0 tid=0x4 nid=0x5 waiting for monitor entry  [0x6]',
  '   java.lang.Thread.State: BLOCKED (on object monitor)',
  '\tat com.shop.order.OrderService.create(OrderService.java:87)',
  '\t- waiting to lock <0x00007f3a8c41e2b0> (a com.shop.order.StockLock)',
  '\t- locked <0x00007f3a8c41f118> (a com.shop.order.OrderContext)',
  '\tat java.lang.Thread.run(Thread.java:1583)',
  '',
  '"http-nio-8080-exec-10" #22 daemon prio=5 os_prio=0 tid=0x7 nid=0x8 waiting for monitor entry  [0x9]',
  '   java.lang.Thread.State: BLOCKED (on object monitor)',
  '\tat com.shop.order.OrderService.create(OrderService.java:87)',
  '\t- waiting to lock <0x00007f3a8c41e2b0> (a com.shop.order.StockLock)',
  '',
  '"lettuce-eventExecutorLoop-1-3" #30 daemon prio=5 os_prio=0 tid=0xa nid=0xb waiting on condition  [0xc]',
  '   java.lang.Thread.State: WAITING (parking)',
  '\tat jdk.internal.misc.Unsafe.park(Native Method)',
  '\t- parking to wait for <0x00007f3a8d22ca10> (a java.util.concurrent.locks.AbstractQueuedSynchronizer$ConditionObject)',
  '',
  '"C2 CompilerThread0" #5 daemon prio=9 os_prio=0 tid=0xd nid=0xe waiting on condition  [0x0]',
  '   java.lang.Thread.State: RUNNABLE',
  '',
].join('\n')

describe('스레드 덤프 읽기', () => {
  const threads = parseDump(DUMP)

  it('머리말은 건너뛰고 스레드 5개를 이름 · 상태로 나눈다', () => {
    expect(threads.map((t) => [t.name, t.state])).toEqual([
      ['http-nio-8080-exec-12', 'RUNNABLE'],
      ['http-nio-8080-exec-7', 'BLOCKED'],
      ['http-nio-8080-exec-10', 'BLOCKED'],
      ['lettuce-eventExecutorLoop-1-3', 'WAITING'],
      ['C2 CompilerThread0', 'RUNNABLE'],
    ])
  })

  it('기다리는 락 · 쥔 락 · 스택 깊이를 뽑는다', () => {
    const exec7 = threads[1]
    expect(exec7.waiting).toEqual({ kind: 'lock', addr: '0x00007f3a8c41e2b0', cls: 'com.shop.order.StockLock' })
    expect(exec7.locked).toEqual([{ addr: '0x00007f3a8c41f118', cls: 'com.shop.order.OrderContext' }])
    expect(exec7.depth).toBe(2)
    // 뷰어가 노랗게 칠하는 줄이 정확히 "waiting to lock" 줄이어야 한다
    expect(exec7.lines[exec7.waitingLine]).toContain('waiting to lock')
    expect(threads[3].waiting?.kind).toBe('park')
    expect(threads[4].depth).toBe(0)
  })

  it('락 주소로 주인을 찾고, BLOCKED 가 같은 락을 기다리면 한 줄로 요약한다', () => {
    const owners = lockOwners(threads)
    expect(owners.get('0x00007f3a8c41e2b0')).toBe('http-nio-8080-exec-12')
    expect(stateCounts(threads)).toMatchObject({ RUNNABLE: 2, BLOCKED: 2, WAITING: 1, TIMED_WAITING: 0 })
    expect(blockedSummary(threads, owners)).toBe('BLOCKED 2건이 같은 락 하나(StockLock)를 기다리는 중입니다 — 주인 http-nio-8080-exec-12')
  })

  it('BLOCKED 가 없으면 요약이 없다', () => {
    const calm = parseDump(DUMP).filter((t) => t.state !== 'BLOCKED')
    expect(blockedSummary(calm, lockOwners(calm))).toBeNull()
  })

  it('머리줄 cpu= 를 읽고, 없으면 null', () => {
    expect(threads[0].cpuMs).toBe(1234.56)
    expect(threads[1].cpuMs).toBeNull()
  })

  it('데드락 절이 없으면 빈 배열', () => {
    expect(parseDeadlocks(DUMP)).toEqual([])
  })
})

// agent-extension 이 #57 전에 쓰던 모양 — 상태 줄 없이 머리줄에 상태 낱말. 보관 기간(3일) 동안 남아 있다
const OLD = [
  '"pool-1-thread-2" #31 daemon prio=5 TIMED_WAITING on java.util.concurrent.locks.AbstractQueuedSynchronizer$ConditionObject@1a2b3c',
  '\tat jdk.internal.misc.Unsafe.park(Native Method)',
  '\t- waiting on java.util.concurrent.locks.AbstractQueuedSynchronizer$ConditionObject@1a2b3c',
  '',
  '"WAITING-room-keeper" #32 prio=5 RUNNABLE',
  '\tat com.shop.Keeper.run(Keeper.java:10)',
  '',
].join('\n')

describe('옛 모양 · 이름에 상태 낱말이 든 스레드', () => {
  const threads = parseDump(OLD)

  it('상태 줄이 없으면 머리줄의 상태 낱말을 쓴다', () => {
    expect(threads[0].state).toBe('TIMED_WAITING')
    expect(threads[0].cpuMs).toBeNull()
  })

  it('이름 안의 낱말은 상태로 보지 않는다', () => {
    expect(threads[1].name).toBe('WAITING-room-keeper')
    expect(threads[1].state).toBe('RUNNABLE')
  })
})

const DEADLOCK = [
  '"dead-1" #14 prio=5 cpu=0.41ms waiting for monitor entry',
  '   java.lang.Thread.State: BLOCKED (on object monitor)',
  '\tat Full.lambda$main$0(Full.java:6)',
  '\t- waiting to lock <0x000000008bb19af0> (a java.lang.Object)',
  '\t- locked <0x000000008bb19ae0> (a java.lang.Object)',
  '',
  '"dead-2" #15 prio=5 cpu=0.39ms waiting for monitor entry',
  '   java.lang.Thread.State: BLOCKED (on object monitor)',
  '\tat Full.lambda$main$1(Full.java:7)',
  '\t- waiting to lock <0x000000008bb19ae0> (a java.lang.Object)',
  '\t- locked <0x000000008bb19af0> (a java.lang.Object)',
  '',
  'Found one Java-level deadlock:',
  '=============================',
  '"dead-1":',
  '  waiting to lock <0x000000008bb19af0> (a java.lang.Object),',
  '  which is held by "dead-2"',
  '"dead-2":',
  '  waiting to lock <0x000000008bb19ae0> (a java.lang.Object),',
  '  which is held by "dead-1"',
  '',
  'Java stack information for the threads listed above:',
  '===================================================',
  '"dead-1":',
  '\tat Full.lambda$main$0(Full.java:6)',
  '"dead-2":',
  '\tat Full.lambda$main$1(Full.java:7)',
  '',
  'Found 1 deadlock.',
  '',
].join('\n')

describe('데드락 절', () => {
  it('고리마다 스레드 이름 묶음을 돌려준다', () => {
    expect(parseDeadlocks(DEADLOCK)).toEqual([['dead-1', 'dead-2']])
  })

  it('절 안의 "이름": 줄과 스택은 스레드로 세지 않는다', () => {
    const threads = parseDump(DEADLOCK)
    expect(threads.map((t) => t.name)).toEqual(['dead-1', 'dead-2'])
    expect(threads[0].depth).toBe(1)
    expect(lockOwners(threads).get('0x000000008bb19af0')).toBe('dead-2')
  })
})

describe('열 정렬', () => {
  const threads = parseDump(DUMP) // exec-12(cpu 1234.56, locked, depth 3) · exec-7(BLOCKED, depth 2) · exec-10(BLOCKED, depth 1) · lettuce(WAITING, park) · C2(RUNNABLE, depth 0)
  const names = (sort: Parameters<typeof sortThreads>[1]) => sortThreads(threads, sort).map((t) => t.name)

  it('없으면 덤프 순서 그대로, 같은 배열을 돌려준다', () => {
    expect(sortThreads(threads, null)).toBe(threads)
  })

  it('이름은 숫자를 숫자로 비교한다 (exec-7 < exec-10 < exec-12)', () => {
    expect(names({ col: 'name', dir: 'asc' })).toEqual(['C2 CompilerThread0', 'http-nio-8080-exec-7', 'http-nio-8080-exec-10', 'http-nio-8080-exec-12', 'lettuce-eventExecutorLoop-1-3'])
  })

  it('상태는 JDK 선언 순서(RUNNABLE → BLOCKED → WAITING), 같으면 덤프 순서', () => {
    expect(names({ col: 'state', dir: 'asc' })).toEqual(['http-nio-8080-exec-12', 'C2 CompilerThread0', 'http-nio-8080-exec-7', 'http-nio-8080-exec-10', 'lettuce-eventExecutorLoop-1-3'])
  })

  it('cpu= 가 없는 스레드는 오름 · 내림 어느 쪽이든 맨 뒤', () => {
    expect(names({ col: 'cpu', dir: 'desc' })[0]).toBe('http-nio-8080-exec-12')
    expect(names({ col: 'cpu', dir: 'asc' })[0]).toBe('http-nio-8080-exec-12')
    expect(names({ col: 'cpu', dir: 'asc' }).slice(1)).toEqual(['http-nio-8080-exec-7', 'http-nio-8080-exec-10', 'lettuce-eventExecutorLoop-1-3', 'C2 CompilerThread0'])
  })

  it('락은 주소순이고 대기 없는 스레드는 맨 뒤, 깊이는 수치', () => {
    expect(names({ col: 'lock', dir: 'asc' })).toEqual(['http-nio-8080-exec-7', 'http-nio-8080-exec-10', 'lettuce-eventExecutorLoop-1-3', 'http-nio-8080-exec-12', 'C2 CompilerThread0'])
    expect(names({ col: 'depth', dir: 'desc' })).toEqual(['http-nio-8080-exec-12', 'http-nio-8080-exec-7', 'http-nio-8080-exec-10', 'lettuce-eventExecutorLoop-1-3', 'C2 CompilerThread0'])
  })
})

// 같은 스택 — exec 셋은 at 줄이 같고 락 주소만 다르다. idle 은 스택이 없다
const STACKS = [
  '"exec-1" #1 daemon prio=5 waiting on condition',
  '   java.lang.Thread.State: WAITING (parking)',
  '\tat jdk.internal.misc.Unsafe.park(Native Method)',
  '\t- parking to wait for <0x0000000000000a01> (a java.util.concurrent.ForkJoinPool)',
  '\tat java.util.concurrent.LinkedBlockingQueue.take(LinkedBlockingQueue.java:1)',
  '',
  '"other" #2 daemon prio=5 runnable',
  '   java.lang.Thread.State: RUNNABLE',
  '\tat java.net.SocketInputStream.read(Native Method)',
  '',
  '"exec-2" #3 daemon prio=5 waiting on condition',
  '   java.lang.Thread.State: WAITING (parking)',
  '\tat jdk.internal.misc.Unsafe.park(Native Method)',
  '\t- parking to wait for <0x0000000000000a02> (a java.util.concurrent.ForkJoinPool)',
  '\tat java.util.concurrent.LinkedBlockingQueue.take(LinkedBlockingQueue.java:1)',
  '',
  '"exec-3" #4 daemon prio=5 runnable',
  '   java.lang.Thread.State: RUNNABLE',
  '\tat jdk.internal.misc.Unsafe.park(Native Method)',
  '\tat java.util.concurrent.LinkedBlockingQueue.take(LinkedBlockingQueue.java:1)',
  '',
  '"idle" #5 daemon prio=5 runnable',
  '   java.lang.Thread.State: RUNNABLE',
  '',
].join('\n')

describe('같은 스택 묶음', () => {
  const threads = parseDump(STACKS)
  const groups = groupByStack(threads)

  it('at 줄이 같으면 락 주소 · 상태가 달라도 한 묶음, 처음 나타난 자리 순', () => {
    expect(groups.map((g) => g.threads.map((t) => t.name))).toEqual([['exec-1', 'exec-2', 'exec-3'], ['other'], ['idle']])
    expect(groups[0].states).toEqual({ WAITING: 2, RUNNABLE: 1 })
    expect(groups[2].key).toBe('')
  })

  it('정렬된 순서로 넣으면 묶음도 그 순서를 따른다 (이름 내림 → other 가 먼저, 묶음 안은 exec-3 · 2 · 1)', () => {
    const sorted = groupByStack(sortThreads(threads, { col: 'name', dir: 'desc' }))
    expect(sorted.map((g) => g.threads.map((t) => t.name))).toEqual([['other'], ['idle'], ['exec-3', 'exec-2', 'exec-1']])
  })
})
