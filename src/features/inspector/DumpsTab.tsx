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
import {
  blockedSummary,
  groupByStack,
  lockOwners,
  parseDeadlocks,
  parseDump,
  sortThreads,
  stateCounts,
  THREAD_STATES,
  type DumpSort,
  type DumpSortCol,
  type DumpThread,
  type StackGroup,
  type ThreadState,
} from './dumpParse'
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
  /** 스레드 표 정렬 (주소 dsort). null 이면 덤프 순서 */
  sort: DumpSort | null
  onOpen: (id: string) => void
  onAgent: (key: string | null) => void
  onPeriod: (p: DumpPeriod) => void
  onSort: (s: DumpSort | null) => void
  /** 「다시 요청」 — 같은 파드로 요청 모달을 연다 */
  onRequest: (agent: { agent_uuid: string; agent_key: string }) => void
}

/** 스레드 덤프 탭 (S05) — 왼쪽 덤프 목록, 오른쪽 고른 덤프의 스레드 표 · 스택 */
export function DumpsTab({ dumpId, dumpAgent, period, sort, onOpen, onAgent, onPeriod, onSort, onRequest }: Props) {
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
          <DumpViewer key={selected} dumpId={selected} agents={agents.data?.items} sort={sort} onSort={onSort} onRequest={onRequest} />
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

type ViewerProps = {
  dumpId: string
  agents: { agent_uuid: string; agent_key: string; status: string }[] | undefined
  sort: DumpSort | null
  onSort: Props['onSort']
  onRequest: Props['onRequest']
}

function DumpViewer({ dumpId, agents, sort, onSort, onRequest }: ViewerProps) {
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
      <Threads dump={d} sort={sort} onSort={onSort} />
    </>
  )
}

function Threads({ dump, sort, onSort }: { dump: ThreadDump; sort: DumpSort | null; onSort: Props['onSort'] }) {
  const threads = useMemo(() => parseDump(dump.dump), [dump.dump])
  const deadlocks = useMemo(() => parseDeadlocks(dump.dump), [dump.dump])
  const owners = useMemo(() => lockOwners(threads), [threads])
  const counts = stateCounts(threads)
  const summary = blockedSummary(threads, owners)

  const [needle, setNeedle] = useState('')
  const [state, setState] = useState<ThreadState | ''>('')
  const [blockedOnly, setBlockedOnly] = useState(false)
  // 덤프를 열 때 표 맨 위 스레드를 고른 것으로 시작한다 — 스택 칸이 비지 않게. 그 뒤 정렬 · 필터를 바꿔도 사람이 다시 고르기 전엔 그대로
  const [picked, setPicked] = useState<number | null>(() => sortThreads(threads, sort)[0]?.id ?? null)
  // 펼친 묶음 (StackGroup.key)
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const n = needle.trim().toLowerCase()
  const filtered = threads.filter((t) => (!n || t.name.toLowerCase().includes(n)) && (!state || t.state === state) && (!blockedOnly || t.state === 'BLOCKED'))
  const groups = groupByStack(sortThreads(filtered, sort))
  const current = threads.find((t) => t.id === picked) ?? null

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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
          <span className="text-caption-12 in-muted in-threads__count">
            {threads.length}개 중 {filtered.length}개 표시
          </span>
        </div>
        {filtered.length === 0 ? (
          <p className="in-empty text-body-13" role="status">조건에 맞는 스레드가 없습니다.</p>
        ) : (
          <div className="in-threads__scroll">
            <Table>
              <TableHead>
                <TableRow>
                  <SortTh col="name" natural="asc" sort={sort} onSort={onSort}>
                    스레드 이름
                  </SortTh>
                  <SortTh col="state" natural="asc" sort={sort} onSort={onSort}>
                    상태
                  </SortTh>
                  <SortTh col="lock" natural="asc" sort={sort} onSort={onSort}>
                    대기 중인 락
                  </SortTh>
                  <SortTh col="cpu" natural="desc" align="right" sort={sort} onSort={onSort}>
                    CPU 시간
                  </SortTh>
                  <SortTh col="depth" natural="desc" align="right" sort={sort} onSort={onSort}>
                    스택 깊이
                  </SortTh>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((g) =>
                  g.threads.length === 1 ? (
                    <ThreadRow key={g.threads[0].id} t={g.threads[0]} owners={owners} picked={picked} onPick={setPicked} />
                  ) : (
                    <GroupRows key={g.key} group={g} open={open.has(g.key)} owners={owners} picked={picked} onPick={setPicked} onToggle={() => toggle(g.key)} />
                  ),
                )}
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

/** 열 머리 정렬 버튼 — 누를 때마다 그 열의 자연 방향 → 반대 방향 → 덤프 순서(해제) */
function SortTh({
  col,
  natural,
  align,
  sort,
  onSort,
  children,
}: {
  col: DumpSortCol
  natural: 'asc' | 'desc'
  align?: 'left' | 'right'
  sort: DumpSort | null
  onSort: Props['onSort']
  children: string
}) {
  const dir = sort?.col === col ? sort.dir : null
  const next = () => onSort(dir === null ? { col, dir: natural } : dir === natural ? { col, dir: natural === 'asc' ? 'desc' : 'asc' } : null)
  return (
    <TableHeaderCell align={align} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}>
      <button type="button" className="in-th-sort" onClick={next} title={dir === null ? '이 열로 정렬' : dir === natural ? '반대로 정렬' : '덤프 순서로'}>
        {children}
        <span aria-hidden="true" className="in-th-sort__mark">
          {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : ''}
        </span>
      </button>
    </TableHeaderCell>
  )
}

type RowProps = { t: DumpThread; owners: Map<string, string>; picked: number | null; onPick: (id: number) => void; member?: boolean }

function ThreadRow({ t, owners, picked, onPick, member }: RowProps) {
  return (
    <TableRow className={member ? 'in-thread-row--member' : undefined} onClick={() => onPick(t.id)} selected={t.id === picked} aria-label={`${t.name} 스택 보기`}>
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
  )
}

/** 같은 스택 묶음 — 접혀 있으면 대표 스레드 한 줄에 「외 N」, 누르면 전부 펼친다. 고른 스레드가 안에 있으면 접힌 줄을 표시한다 */
function GroupRows({ group, open, owners, picked, onPick, onToggle }: { group: StackGroup; open: boolean; owners: Map<string, string>; picked: number | null; onPick: (id: number) => void; onToggle: () => void }) {
  const head = group.threads[0]
  const holds = picked !== null && group.threads.some((t) => t.id === picked)
  return (
    <>
      <TableRow onClick={onToggle} selected={!open && holds} aria-expanded={open} aria-label={`${head.name} 외 ${group.threads.length - 1} ${open ? '접기' : '펼치기'}`}>
        <TableCell type="mono">
          <span aria-hidden="true" className="in-thread-row__fold">
            {open ? '▾' : '▸'}
          </span>
          {head.name}
          <span className="text-caption-12 in-muted"> 외 {group.threads.length - 1}</span>
        </TableCell>
        <TableCell type="badge">
          {THREAD_STATES.filter((s) => group.states[s]).map((s) => (
            <Badge key={s} tone={threadTone(s)}>
              {s} {group.states[s]}
            </Badge>
          ))}
        </TableCell>
        <TableCell>
          <span className="text-caption-12 in-muted">같은 스택 {group.threads.length}개</span>
        </TableCell>
        <TableCell type="number">{head.cpuMs === null ? '—' : `${head.cpuMs.toFixed(1)} ms`}</TableCell>
        <TableCell type="number">{head.depth}</TableCell>
      </TableRow>
      {open ? group.threads.map((t) => <ThreadRow key={t.id} t={t} owners={owners} picked={picked} onPick={onPick} member />) : null}
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
