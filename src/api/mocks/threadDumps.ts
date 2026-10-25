// 스레드 덤프 가짜 응답 (POST /agents/:uuid/thread-dumps · GET /thread-dumps · GET /thread-dumps/:uuid).
// 본문은 jstack 형식 글자. 덤프마다 정해지는 난수로 스레드를 만들고, 일부 덤프에는 BLOCKED 스레드 여럿이
// 락 하나(StockLock)를 기다리고 그 락을 exec-12 가 쥐고 있는 장면을 넣는다.
// 요청: 끊긴 파드(DOWN · UNKNOWN)는 503 AGENT_NOT_REACHABLE, 느린 파드(z9k1w, 6초)는 timeout 이 짧으면 503 THREAD_DUMP_TIMEOUT
import { http } from 'msw'
import { API_BASE } from '../client'
import type { ThreadDump, ThreadDumpMeta } from '../threadDumps'
import { AGENTS } from './agents'
import { currentUser, fail, notAdmin, ok, okPage, seeded, unauthenticated } from './common'

const HOUR = 3_600_000
const LOCK = '0x00007f3a8c41e2b0'

const hex = (r: () => number, n = 12) => `0x${Math.floor(r() * 16 ** n).toString(16).padStart(n, '0')}`

type T = { name: string; daemon: boolean; state: 'RUNNABLE' | 'WAITING' | 'TIMED_WAITING' | 'BLOCKED'; head: string; frames: string[] }

/** 서비스 이름 → 가짜 패키지 (shop-order → com.shop.order) */
const pkg = (service: string) => `com.shop.${service.replace(/^shop-/, '')}`

function threads(service: string, total: number, blocked: number, r: () => number): T[] {
  const p = pkg(service)
  const Svc = service.replace(/^shop-/, '').replace(/^./, (c) => c.toUpperCase())
  const web = ['at o.s.w.s.DispatcherServlet.doDispatch(DispatcherServlet.java:1089)', 'at o.a.c.c.StandardWrapperValve.invoke(StandardWrapperValve.java:166)', 'at o.a.t.u.n.NioEndpoint$SocketProcessor.doRun(NioEndpoint.java:1740)', 'at java.lang.Thread.run(Thread.java:1583)']
  const idle = ['at jdk.internal.misc.Unsafe.park(Native Method)', `- parking to wait for <${hex(r)}> (a java.util.concurrent.locks.AbstractQueuedSynchronizer$ConditionObject)`, 'at java.util.concurrent.locks.LockSupport.park(LockSupport.java:371)', 'at o.a.t.u.t.TaskQueue.take(TaskQueue.java:117)', 'at java.util.concurrent.ThreadPoolExecutor.getTask(ThreadPoolExecutor.java:1070)', 'at java.lang.Thread.run(Thread.java:1583)']
  const out: T[] = [
    { name: 'Reference Handler', daemon: true, state: 'RUNNABLE', head: 'runnable', frames: ['at java.lang.ref.Reference.waitForReferencePendingList(Native Method)', 'at java.lang.ref.Reference.processPendingReferences(Reference.java:246)'] },
    { name: 'Finalizer', daemon: true, state: 'WAITING', head: 'in Object.wait()', frames: ['at java.lang.Object.wait0(Native Method)', `- waiting on <${hex(r)}> (a java.lang.ref.NativeReferenceQueue$Lock)`, 'at java.lang.ref.ReferenceQueue.remove(ReferenceQueue.java:158)', 'at java.lang.ref.Finalizer$FinalizerThread.run(Finalizer.java:172)'] },
    { name: 'Signal Dispatcher', daemon: true, state: 'RUNNABLE', head: 'waiting on condition', frames: [] },
    { name: 'C2 CompilerThread0', daemon: true, state: 'RUNNABLE', head: 'waiting on condition', frames: [] },
    { name: 'Common-Cleaner', daemon: true, state: 'TIMED_WAITING', head: 'waiting on condition', frames: ['at jdk.internal.misc.Unsafe.park(Native Method)', `- parking to wait for <${hex(r)}> (a java.util.concurrent.locks.AbstractQueuedSynchronizer$ConditionObject)`, 'at java.lang.ref.ReferenceQueue.remove(ReferenceQueue.java:167)', 'at jdk.internal.ref.CleanerImpl.run(CleanerImpl.java:140)'] },
    { name: 'HikariPool-1 connection adder', daemon: true, state: 'TIMED_WAITING', head: 'waiting on condition', frames: ['at jdk.internal.misc.Unsafe.park(Native Method)', `- parking to wait for <0x00007f3a91b07d58> (a java.util.concurrent.SynchronousQueue$TransferStack)`, 'at java.util.concurrent.LinkedBlockingQueue.poll(LinkedBlockingQueue.java:460)', 'at java.util.concurrent.ThreadPoolExecutor.getTask(ThreadPoolExecutor.java:1069)', 'at java.lang.Thread.run(Thread.java:1583)'] },
    { name: 'kafka-producer-network-thread | producer-1', daemon: true, state: 'RUNNABLE', head: 'runnable', frames: ['at sun.nio.ch.EPoll.wait(Native Method)', 'at sun.nio.ch.EPollSelectorImpl.doSelect(EPollSelectorImpl.java:121)', 'at o.a.k.common.network.Selector.select(Selector.java:874)', 'at o.a.k.clients.producer.internals.Sender.run(Sender.java:243)', 'at java.lang.Thread.run(Thread.java:1583)'] },
    { name: 'lettuce-eventExecutorLoop-1-3', daemon: true, state: 'WAITING', head: 'waiting on condition', frames: ['at jdk.internal.misc.Unsafe.park(Native Method)', '- parking to wait for <0x00007f3a8d22ca10> (a java.util.concurrent.locks.AbstractQueuedSynchronizer$ConditionObject)', 'at io.netty.util.concurrent.SingleThreadEventExecutor.takeTask(SingleThreadEventExecutor.java:243)', 'at java.lang.Thread.run(Thread.java:1583)'] },
    { name: 'scheduling-1', daemon: false, state: 'TIMED_WAITING', head: 'sleeping', frames: ['at java.lang.Thread.sleep0(Native Method)', 'at java.lang.Thread.sleep(Thread.java:509)', `at ${p}.job.MetricsFlushJob.run(MetricsFlushJob.java:41)`, 'at java.lang.Thread.run(Thread.java:1583)'] },
  ]
  // 락을 쥔 스레드와 기다리는 스레드들 (BLOCKED 가 있을 때만)
  if (blocked > 0) {
    out.push({
      name: 'http-nio-8080-exec-12',
      daemon: true,
      state: 'RUNNABLE',
      head: 'runnable',
      frames: [
        'at java.net.SocketInputStream.socketRead0(Native Method)',
        'at o.p.core.PGStream.receiveChar(PGStream.java:453)',
        `at ${p}.${Svc}Repository.decreaseStock(${Svc}Repository.java:132)`,
        `- locked <${LOCK}> (a ${p}.StockLock)`,
        `at ${p}.${Svc}Service.create(${Svc}Service.java:81)`,
        ...web,
      ],
    })
    for (let i = 0; i < blocked; i++) {
      out.push({
        name: `http-nio-8080-exec-${7 + i * 3}`,
        daemon: true,
        state: 'BLOCKED',
        head: 'waiting for monitor entry',
        frames: [
          `at ${p}.${Svc}Service.create(${Svc}Service.java:87)`,
          `- waiting to lock <${LOCK}> (a ${p}.StockLock)`,
          `- locked <${hex(r)}> (a ${p}.${Svc}Context)`,
          `at ${p}.${Svc}Controller.post${Svc}(${Svc}Controller.java:54)`,
          'at j.i.r.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)',
          'at o.s.w.m.s.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:895)',
          ...web,
        ],
      })
    }
  }
  // 나머지는 요청을 처리 중(RUNNABLE) 이거나 놀고 있는(WAITING) 웹 스레드 · 공용 풀
  let n = 1
  while (out.length < total) {
    const busy = r() < 0.3
    let name = `http-nio-8080-exec-${n++}`
    while (out.some((t) => t.name === name)) name = `http-nio-8080-exec-${n++}`
    if (r() < 0.12) {
      out.push({ name: `ForkJoinPool.commonPool-worker-${out.length}`, daemon: true, state: 'WAITING', head: 'waiting on condition', frames: ['at jdk.internal.misc.Unsafe.park(Native Method)', `- parking to wait for <${hex(r)}> (a java.util.concurrent.ForkJoinPool)`, 'at java.util.concurrent.ForkJoinPool.awaitWork(ForkJoinPool.java:1893)', 'at java.util.concurrent.ForkJoinWorkerThread.run(ForkJoinWorkerThread.java:188)'] })
    } else if (busy) {
      out.push({ name, daemon: true, state: 'RUNNABLE', head: 'runnable', frames: ['at java.net.SocketInputStream.socketRead0(Native Method)', 'at o.p.core.PGStream.receiveChar(PGStream.java:453)', `at ${p}.${Svc}Repository.findById(${Svc}Repository.java:58)`, `at ${p}.${Svc}Service.get(${Svc}Service.java:40)`, ...web] })
    } else {
      out.push({ name, daemon: true, state: 'WAITING', head: 'waiting on condition', frames: idle })
    }
  }
  return out
}

function render(t: T, i: number, r: () => number): string {
  const desc = { RUNNABLE: '', WAITING: ' (parking)', TIMED_WAITING: ' (parking)', BLOCKED: ' (on object monitor)' }[t.state]
  return [
    `"${t.name}" #${i + 1}${t.daemon ? ' daemon' : ''} prio=5 os_prio=0 cpu=${(r() * 900).toFixed(2)}ms elapsed=${(r() * 90000).toFixed(2)}s tid=${hex(r, 16)} nid=0x${Math.floor(r() * 65535).toString(16)} ${t.head}  [${hex(r)}]`,
    `   java.lang.Thread.State: ${t.state}${desc}`,
    ...t.frames.map((f) => `\t${f}`),
    '',
  ].join('\n')
}

function build(meta: ThreadDumpMeta, blocked: number): ThreadDump {
  const r = seeded(meta.dump_uuid)
  const ts = threads(meta.service_name, meta.thread_count, blocked, r)
  const at = new Date(meta.requested_at)
  const head = `${at.toISOString().slice(0, 19).replace('T', ' ')}\nFull thread dump OpenJDK 64-Bit Server VM (21.0.4+7-LTS mixed mode, sharing):\n\n`
  return { ...meta, dump: head + ts.map((t, i) => render(t, i, r)).join('\n') }
}

const USERS_BY_SEED = ['seungjo@monimo.io', 'jihoon@monimo.io', 'onduty@monimo.io']

/** 이미 찍어 둔 덤프 7건. 시각은 지금 기준 몇 시간 전 */
const SEEDS: [agentKey: string, hoursAgo: number, count: number, blocked: number, user: number][] = [
  ['shop-order-7d9f4-x2k8q', 0.9, 142, 4, 0],
  ['shop-order-7d9f4-m6p1v', 1.1, 137, 0, 0],
  ['shop-payment-7d9f4-x2k8q', 3.4, 96, 2, 1],
  ['shop-order-7d9f4-x2k8q', 5.7, 128, 0, 0],
  ['shop-gateway-7d9f4-x2k8q', 16.6, 211, 0, 2],
  ['shop-inventory-7d9f4-x2k8q', 22.2, 84, 1, 1],
  ['shop-order-6c81b-h5r3n', 28.8, 119, 3, 0],
]

const DUMPS: ThreadDump[] = []
let seededAt = 0

/** 처음 부를 때 한 번 지금 기준으로 7건을 만든다 (그 뒤 요청한 덤프가 앞에 쌓인다) */
function all(): ThreadDump[] {
  if (!seededAt) {
    seededAt = Date.now()
    SEEDS.forEach(([agentKey, hoursAgo, count, blocked, user], i) => {
      const a = AGENTS.find((x) => x.agent_key === agentKey)!
      DUMPS.push(
        build(
          {
            dump_uuid: `7c41a8e2-0000-4c00-9000-0000000000${String(i + 1).padStart(2, '0')}`,
            agent_key: agentKey,
            service_name: a.service_name,
            requested_by: USERS_BY_SEED[user],
            requested_at: new Date(seededAt - hoursAgo * HOUR).toISOString(),
            thread_count: count,
          },
          blocked,
        ),
      )
    })
  }
  return DUMPS
}

const toMeta = ({ dump: _d, ...meta }: ThreadDump): ThreadDumpMeta => meta
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()))
  })

export const threadDumpsHandlers = [
  http.get(`${API_BASE}/thread-dumps`, ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const q = new URL(request.url).searchParams
    // backend 와 같다: from · to 는 둘 다 보내거나 둘 다 안 보낸다. 하나만 오면 400, 7일 넘으면 422
    if ((q.get('from') === null) !== (q.get('to') === null)) return fail(400, 'INVALID_REQUEST', 'from 과 to 는 같이 보내야 합니다.')
    const from = Date.parse(q.get('from') ?? '')
    const to = Date.parse(q.get('to') ?? '')
    if (from >= to) return fail(422, 'UNPROCESSABLE', 'from 은 to 보다 앞이어야 합니다.')
    if (to - from > 7 * 24 * 3_600_000) return fail(422, 'TIME_RANGE_TOO_WIDE', '시간 범위는 최대 7일입니다.')
    const rows = all()
      .filter(
        (d) =>
          (!q.get('service_name') || d.service_name === q.get('service_name')) &&
          (!q.get('agent_key') || d.agent_key === q.get('agent_key')) &&
          (Number.isNaN(from) || Date.parse(d.requested_at) >= from) &&
          (Number.isNaN(to) || Date.parse(d.requested_at) < to),
      )
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
      .map(toMeta)
    const limit = Math.min(Number(q.get('limit')) || 50, 500)
    const offset = Number(q.get('cursor')) || 0
    return okPage(rows.slice(offset, offset + limit), limit, offset + limit < rows.length ? String(offset + limit) : null)
  }),

  http.get(`${API_BASE}/thread-dumps/:uuid`, ({ request, params }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const d = all().find((x) => x.dump_uuid === params.uuid)
    return d ? ok(d) : fail(404, 'NOT_FOUND', '덤프를 찾을 수 없습니다.')
  }),

  // 동기 요청: Collector 팬아웃을 흉내 내 1.5초(느린 파드는 6초) 기다린 뒤 답한다
  http.post(`${API_BASE}/agents/:uuid/thread-dumps`, async ({ request, params }) => {
    const denied = notAdmin(request)
    if (denied) return denied
    const a = AGENTS.find((x) => x.agent_uuid === params.uuid)
    if (!a) return fail(404, 'NOT_FOUND', '파드를 찾을 수 없습니다.')
    const b = (await request.json().catch(() => null)) as { timeout_ms?: unknown } | null
    const timeout = typeof b?.timeout_ms === 'number' ? b.timeout_ms : 10_000
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60_000) return fail(400, 'INVALID_REQUEST', 'timeout_ms 는 1000~60000 사이 정수여야 합니다.')
    const takes = a.agent_key.endsWith('z9k1w') ? 6000 : 1500
    await wait(Math.min(takes, timeout), request.signal)
    // 화면이 창을 닫아 요청을 끊었으면 덤프를 만들지 않는다 (취소한 요청이 목록에 쌓이지 않게)
    if (request.signal.aborted) return new Response(null, { status: 499 })
    if (a.status !== 'UP') return fail(503, 'AGENT_NOT_REACHABLE', '이 파드를 든 Collector 가 없습니다. 파드가 내려갔거나 신호가 끊겼습니다.')
    if (takes > timeout) return fail(503, 'THREAD_DUMP_TIMEOUT', `${timeout}ms 안에 덤프가 돌아오지 않았습니다.`)
    const n = all().length + 1
    const r = seeded(`${a.agent_key}|${n}`)
    const d = build(
      {
        dump_uuid: crypto.randomUUID(),
        agent_key: a.agent_key,
        service_name: a.service_name,
        requested_by: currentUser(request)!.email,
        requested_at: new Date().toISOString(),
        thread_count: 90 + Math.floor(r() * 80),
      },
      r() < 0.5 ? 2 + Math.floor(r() * 3) : 0,
    )
    DUMPS.push(d)
    return ok({ ...d, agent_uuid: a.agent_uuid })
  }),
]
