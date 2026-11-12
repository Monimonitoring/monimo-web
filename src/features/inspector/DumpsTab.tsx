import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ApiError, getThreadDump, listAgents, listThreadDumps, type ThreadDump } from '@/api'
import { useAuth } from '@/auth'
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  formatTime,
  IconCopy,
  Input,
  Segmented,
  Select,
  shortId,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  type Tone,
} from '@/design-system'
import { useServiceName } from '@/stores'
import { blockedSummary, lockOwners, parseDeadlocks, parseDump, stateCounts, THREAD_STATES, type DumpThread, type ThreadState } from './dumpParse'
import type { DumpPeriod } from './useInspectorParams'

// 93d 는 보관 기간(TTL) 그대로라 기간 필터 없이 전체를 받는다 — backend 범위 상한이 7일(422 TIME_RANGE_TOO_WIDE)
const PERIOD_MS: Record<DumpPeriod, number | null> = { '24h': 24 * 3_600_000, '7d': 7 * 24 * 3_600_000, '93d': null }
const LIMIT = 30

const threadTone = (s: string): Tone => (s === 'RUNNABLE' ? 'ok' : s === 'BLOCKED' ? 'crit' : s === 'TIMED_WAITING' ? 'warn' : 'muted')
const stamp = (iso: string) => `${new Date(iso).toLocaleDateString('sv-SE')} ${formatTime(iso).slice(0, 8)}`

type Props = {
  dumpId: string | null
  dumpAgent: string | null
  period: DumpPeriod
  onOpen: (id: string) => void
  onAgent: (key: string | null) => void
  onPeriod: (p: DumpPeriod) => void
  /** 「다시 요청」 — 같은 파드로 요청 모달을 연다 */
  onRequest: (agent: { agent_uuid: string; agent_key: string }) => void
}

/** 스레드 덤프 탭 (S05) — 왼쪽 덤프 목록, 오른쪽 고른 덤프의 스레드 표 · 스택 */
export function DumpsTab({ dumpId, dumpAgent, period, onOpen, onAgent, onPeriod, onRequest }: Props) {
  const serviceName = useServiceName()
  // from · to 는 쌍으로만 받는다(하나만 보내면 400). 끝을 조회 시각으로 매번 새로 찍어 탭을 연 뒤 뜬 덤프도 다시 받으면 들어온다
  const range = () => {
    const ms = PERIOD_MS[period]
    if (ms === null) return {}
    const to = Date.now()
    return { from: new Date(to - ms).toISOString(), to: new Date(to).toISOString() }
  }

  const agents = useQuery({ queryKey: ['agents', serviceName], queryFn: ({ signal }) => listAgents({ serviceName, limit: 500 }, signal) })
  const list = useInfiniteQuery({
    queryKey: ['thread-dumps', serviceName, dumpAgent, period],
    queryFn: ({ pageParam, signal }) => listThreadDumps({ serviceName, agentKey: dumpAgent, ...range(), cursor: pageParam, limit: LIMIT }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const selected = dumpId ?? rows[0]?.dump_uuid ?? null

  return (
    <div className="in-dumps">
      <Card className="in-dump-list">
        <header className="in-pods__head">
          <h2 className="text-section-15">덤프 목록</h2>
          <span className="text-caption-12 in-muted">{list.data ? `${rows.length}${list.hasNextPage ? '+' : ''}건` : ''}</span>
        </header>
        <span className="text-mono-11 in-muted">GET /thread-dumps</span>
        <div className="in-dump-list__filters">
          <label className="text-caption-12-medium" htmlFor="in-dump-agent">
            agent_key
          </label>
          <Select id="in-dump-agent" value={dumpAgent ?? ''} onChange={(e) => onAgent(e.target.value || null)}>
            <option value="">전체</option>
            {agents.data?.items.map((a) => (
              <option key={a.agent_uuid} value={a.agent_key}>
                {a.agent_key}
              </option>
            ))}
            {/* 서비스를 바꿔 목록에 없는 파드가 주소에 남아 있어도 고른 값이 보이게 */}
            {dumpAgent && agents.data && !agents.data.items.some((a) => a.agent_key === dumpAgent) ? <option value={dumpAgent}>{dumpAgent}</option> : null}
          </Select>
          <span className="text-caption-12-medium">기간</span>
          <Segmented<DumpPeriod>
            aria-label="덤프 기간"
            value={period}
            onChange={onPeriod}
            options={[
              { value: '24h', label: '24시간' },
              { value: '7d', label: '7일' },
              { value: '93d', label: '93일' },
            ]}
          />
        </div>
        {list.isError && !list.data ? (
          <p className="in-empty text-body-13" role="alert">덤프 목록을 불러오지 못했습니다.</p>
        ) : !list.data ? (
          <p className="in-empty text-body-13" role="status">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="in-empty text-body-13" role="status">이 기간에 찍은 덤프가 없습니다. 메트릭 탭의 「스레드 덤프 요청」으로 뜰 수 있습니다.</p>
        ) : (
          <ul className="in-dump-list__items" aria-label="덤프">
            {rows.map((d) => (
              <li key={d.dump_uuid}>
                <button
                  type="button"
                  className={d.dump_uuid === selected ? 'in-dump-item is-selected' : 'in-dump-item'}
                  aria-current={d.dump_uuid === selected ? 'true' : undefined}
                  onClick={() => onOpen(d.dump_uuid)}
                >
                  <span className="in-dump-item__text">
                    <span className="text-mono-12-strong">{stamp(d.requested_at)}</span>
                    <span className="text-mono-11">{d.agent_key}</span>
                    <span className="text-caption-12 in-muted">{d.requested_by}</span>
                  </span>
                  <span className="text-section-15 in-mono" title="thread_count">{d.thread_count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="in-dump-list__foot">
          <span className="text-caption-12 in-muted">보관: 3일 디스크 · 그 뒤 S3 90일 (합계 93일)</span>
          {list.hasNextPage ? (
            <Button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              {list.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
            </Button>
          ) : null}
        </footer>
      </Card>

      <div className="in-dump-main">
        {selected ? (
          <DumpViewer key={selected} dumpId={selected} agents={agents.data?.items} onRequest={onRequest} />
        ) : (
          <Card>
            <p className="in-empty text-body-13" role="status">왼쪽에서 덤프를 고르세요.</p>
          </Card>
        )}
      </div>
    </div>
  )
}

/** 「복사됨」 표시를 2초 보여 준다. 다시 누르면 2초를 새로 세고, 사라질 때 타이머를 정리한다 */
function useCopied() {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = (key: string, text: string) =>
    navigator.clipboard.writeText(text).then(
      () => {
        clearTimeout(timer.current)
        setCopied(key)
        timer.current = setTimeout(() => setCopied(null), 2000)
      },
      () => setCopied(null),
    )
  return { copied, copy }
}

function DumpViewer({ dumpId, agents, onRequest }: { dumpId: string; agents: { agent_uuid: string; agent_key: string; status: string }[] | undefined; onRequest: Props['onRequest'] }) {
  const { isAdmin } = useAuth()
  const q = useQuery({ queryKey: ['thread-dump', dumpId], queryFn: ({ signal }) => getThreadDump(dumpId, signal), staleTime: Infinity })
  const { copied, copy } = useCopied()
  const d = q.data

  if (!d) {
    const code = q.error instanceof ApiError ? q.error.code : ''
    return (
      <Card>
        <p className="in-empty text-body-13" role={q.isError ? 'alert' : 'status'}>
          {q.isError ? (code === 'NOT_FOUND' ? '덤프를 찾을 수 없습니다. 보관 기간(93일)이 지났을 수 있습니다.' : `덤프를 불러오지 못했습니다. ${code ? `(${code})` : ''}`) : '불러오는 중…'}
        </p>
      </Card>
    )
  }

  const agent = agents?.find((a) => a.agent_key === d.agent_key)
  return (
    <>
      <Card className="in-dump-head">
        <div className="in-dump-head__top">
          <span className="text-caption-12-medium in-muted">dump_uuid</span>
          <span className="text-mono-12-strong" title={d.dump_uuid}>
            {shortId(d.dump_uuid)}
          </span>
          <button type="button" className="in-remove" aria-label="dump_uuid 복사" title="dump_uuid 복사" onClick={() => copy('uuid', d.dump_uuid)}>
            <IconCopy size={14} />
          </button>
          {copied === 'uuid' ? <span className="text-caption-12 in-ok" role="status">복사됨</span> : null}
          <span className="text-mono-11 in-muted">GET /thread-dumps/{'{dumpUuid}'}</span>
          <span className="in-dump-head__actions">
            {isAdmin ? (
              <Button
                variant="primary"
                disabled={!agent || agent.status !== 'UP'}
                title={!agent ? '상단바 서비스에 이 파드가 없습니다' : agent.status !== 'UP' ? `파드가 ${agent.status} 상태라 덤프를 뜰 수 없습니다` : '같은 파드로 다시 뜨기'}
                onClick={() => agent && onRequest(agent)}
              >
                다시 요청
              </Button>
            ) : null}
            <Button onClick={() => copy('all', d.dump)}>{copied === 'all' ? '복사됨' : '전체 텍스트 복사'}</Button>
          </span>
        </div>
        <dl className="in-head__fields">
          {(
            [
              ['agent_key', d.agent_key],
              ['service_name', d.service_name],
              ['requested_by', d.requested_by],
              ['requested_at', stamp(d.requested_at)],
              ['thread_count', String(d.thread_count)],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-caption-12-medium">{k}</dt>
              <dd className="text-mono-12">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Threads dump={d} />
    </>
  )
}

function Threads({ dump }: { dump: ThreadDump }) {
  const threads = useMemo(() => parseDump(dump.dump), [dump.dump])
  const deadlocks = useMemo(() => parseDeadlocks(dump.dump), [dump.dump])
  const owners = useMemo(() => lockOwners(threads), [threads])
  const counts = stateCounts(threads)
  const summary = blockedSummary(threads, owners)
  const hasCpu = threads.some((t) => t.cpuMs !== null)

  const [needle, setNeedle] = useState('')
  const [state, setState] = useState<ThreadState | ''>('')
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [sort, setSort] = useState<'dump' | 'cpu'>('dump')
  // 처음에는 데드락에 걸린 스레드, 없으면 BLOCKED, 없으면 첫 스레드를 연다
  const [picked, setPicked] = useState<string | null>(
    () => deadlocks[0]?.[0] ?? (threads.find((t) => t.state === 'BLOCKED') ?? threads[0])?.name ?? null,
  )

  const n = needle.trim().toLowerCase()
  const filtered = threads.filter((t) => (!n || t.name.toLowerCase().includes(n)) && (!state || t.state === state) && (!blockedOnly || t.state === 'BLOCKED'))
  // cpu= 가 없는 스레드(옛 모양)는 맨 뒤로
  const rows = sort === 'cpu' ? [...filtered].sort((a, b) => (b.cpuMs ?? -1) - (a.cpuMs ?? -1)) : filtered
  const current = threads.find((t) => t.name === picked) ?? null

  return (
    <>
      <Card className="in-dump-states">
        <div className="in-dump-states__chips">
          {THREAD_STATES.map((s) => (
            <Badge key={s} tone={threadTone(s)}>
              {s} {counts[s]}
            </Badge>
          ))}
        </div>
        {deadlocks.length ? (
          <span className="text-body-13 in-crit" role="alert">
            데드락 {deadlocks.length}건 — {deadlocks.map((c) => c.join(' ↔ ')).join(' / ')}
          </span>
        ) : null}
        {summary ? <span className="text-body-13 in-crit">{summary}</span> : <span className="text-caption-12 in-muted">BLOCKED 스레드가 없습니다</span>}
      </Card>

      <Card className="in-threads">
        <div className="in-threads__filters" role="group" aria-label="스레드 필터">
          <label className="text-caption-12-medium" htmlFor="in-thread-q">
            스레드 이름
          </label>
          <Input id="in-thread-q" type="search" placeholder="이름으로 검색" value={needle} onChange={(e) => setNeedle(e.target.value)} />
          <label className="text-caption-12-medium" htmlFor="in-thread-state">
            상태
          </label>
          <Select id="in-thread-state" value={state} onChange={(e) => setState(e.target.value as ThreadState | '')}>
            <option value="">전체</option>
            {THREAD_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <span className="in-threads__switch">
            <Switch checked={blockedOnly} onChange={setBlockedOnly} aria-labelledby="in-blocked-only" />
            <span id="in-blocked-only" className="text-caption-12-medium">
              BLOCKED만
            </span>
          </span>
          <label className="text-caption-12-medium" htmlFor="in-thread-sort">
            정렬
          </label>
          <Select id="in-thread-sort" value={sort} onChange={(e) => setSort(e.target.value as 'dump' | 'cpu')} disabled={!hasCpu} title={hasCpu ? undefined : '이 덤프에는 cpu= 가 없습니다'}>
            <option value="dump">덤프 순서</option>
            <option value="cpu">CPU 시간 많은 순</option>
          </Select>
          <span className="text-caption-12 in-muted in-threads__count">
            {threads.length}개 중 {rows.length}개 표시
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="in-empty text-body-13" role="status">조건에 맞는 스레드가 없습니다.</p>
        ) : (
          <div className="in-threads__scroll">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>스레드 이름</TableHeaderCell>
                  <TableHeaderCell>상태</TableHeaderCell>
                  <TableHeaderCell>대기 중인 락</TableHeaderCell>
                  <TableHeaderCell align="right">CPU 시간</TableHeaderCell>
                  <TableHeaderCell align="right">스택 깊이</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.name} onClick={() => setPicked(t.name)} selected={t.name === picked} aria-label={`${t.name} 스택 보기`}>
                    <TableCell type="mono">{t.name}</TableCell>
                    <TableCell type="badge">
                      <Badge tone={threadTone(t.state)}>{t.state}</Badge>
                    </TableCell>
                    <TableCell>
                      <LockCell t={t} owners={owners} />
                    </TableCell>
                    <TableCell type="number">{t.cpuMs === null ? '—' : `${t.cpuMs.toFixed(1)} ms`}</TableCell>
                    <TableCell type="number">{t.depth}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="in-stack">
        <header className="in-stack__head">
          <h3 className="text-section-15">스택 트레이스</h3>
          {current ? (
            <>
              <span className="text-mono-12">{current.name}</span>
              <Badge tone={threadTone(current.state)}>{current.state}</Badge>
            </>
          ) : null}
          <span className="text-caption-12 in-muted in-stack__hint">노란 줄이 이 스레드가 멈춰 선 지점입니다</span>
        </header>
        {current ? (
          <CodeBlock className="in-stack__code" aria-label={`${current.name} 스택 트레이스`}>
            {current.lines.map((l, i) => (
              <span key={i} className={i === current.waitingLine ? 'in-stack__line is-stop' : 'in-stack__line'}>
                {l}
                {'\n'}
              </span>
            ))}
          </CodeBlock>
        ) : (
          <p className="in-empty text-body-13">표에서 스레드를 고르세요.</p>
        )}
      </Card>
    </>
  )
}

function LockCell({ t, owners }: { t: DumpThread; owners: Map<string, string> }) {
  if (t.waiting) {
    const owner = owners.get(t.waiting.addr)
    return (
      <span className="in-lock">
        <span className="text-mono-12">{t.waiting.addr}</span>
        {owner && owner !== t.name ? <span className="text-caption-12 in-muted">소유 {owner}</span> : null}
      </span>
    )
  }
  return <span className="text-caption-12 in-muted">{t.locked.length ? '락 보유 중 · 대기 없음' : '대기 없음'}</span>
}
