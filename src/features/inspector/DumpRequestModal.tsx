import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, requestThreadDump } from '@/api'
import { useAuth } from '@/auth'
import { Banner, Button, formatTime, IconCheck, Modal, Select } from '@/design-system'

const TIMEOUTS = [5000, 10000, 30000]

type Props = {
  /** 덤프를 뜰 파드. null 이면 닫힘 */
  agent: { agent_uuid: string; agent_key: string } | null
  onClose: () => void
  /** 덤프가 돌아오면 그 uuid 로 부른다 (덤프 탭에서 연다) */
  onDone: (dumpUuid: string) => void
}

/** 스레드 덤프 요청 모달 (S04b) — timeout 고르기 · 3단계 진행 · 503 안내 */
export function DumpRequestModal({ agent, ...rest }: Props) {
  return agent ? <Body key={agent.agent_uuid} agent={agent} {...rest} /> : null
}

type Step = 'idle' | 'active' | 'done' | 'failed'

function failText(e: unknown): string {
  if (!(e instanceof ApiError)) return '요청이 실패했습니다.'
  if (e.code === 'AGENT_NOT_REACHABLE') return '이 파드를 든 Collector 가 없습니다 — 파드가 내려갔거나 신호가 끊겼습니다.'
  if (e.code === 'THREAD_DUMP_TIMEOUT') return '시간 안에 덤프가 돌아오지 않았습니다 — timeout_ms 를 늘려 다시 요청해 보세요.'
  if (e.code === 'FORBIDDEN') return '관리자(ADMIN)만 덤프를 요청할 수 있습니다.'
  return e.message
}

function Body({ agent, onClose, onDone }: Props & { agent: NonNullable<Props['agent']> }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const id = useId()
  const [timeout, setTimeoutMs] = useState(10000)
  const [sentAt, setSentAt] = useState<string | null>(null)
  // 직전 실패 — 다시 요청해도 무엇이 실패했는지 남겨 둔다
  const [lastFail, setLastFail] = useState<{ code: string; text: string; at: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  // 창을 닫으면 기다리던 요청을 끊는다 (서버는 제 시간에 접는다)
  useEffect(() => () => abort.current?.abort(), [])

  const req = useMutation({
    mutationFn: (ms: number) => {
      abort.current = new AbortController()
      return requestThreadDump(agent.agent_uuid, ms, abort.current.signal)
    },
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['thread-dumps'] })
      onDone(d.dump_uuid)
    },
    onError: (e) => {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setLastFail({ code: e instanceof ApiError ? `${e.status} ${e.code}` : '', text: failText(e), at: new Date().toISOString() })
    },
  })

  const submit = () => {
    setSentAt(new Date().toISOString())
    req.mutate(timeout)
  }

  // 요청은 한 번의 동기 호출이라 가운데 단계를 서버가 알려 주지 않는다. 보낸 뒤 답을 기다리는 동안을 ② · ③ 으로 보여 준다
  const s1: Step = sentAt ? 'done' : 'idle'
  const s2: Step = req.isPending ? 'active' : req.isSuccess ? 'done' : req.isError && sentAt ? 'failed' : 'idle'
  const s3: Step = req.isSuccess ? 'done' : req.isError && sentAt ? 'failed' : 'idle'

  return (
    <Modal
      open
      onClose={onClose}
      className="in-dump-modal"
      title={
        <span className="in-modal-title">
          스레드 덤프 요청 — {agent.agent_key}
          <span className="text-mono-11 in-muted">POST /agents/{'{uuid}'}/thread-dumps · 권한 ADMIN</span>
        </span>
      }
      footer={
        <div className="in-modal-footer">
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={req.isPending} onClick={submit}>
            {req.isPending ? '요청 중…' : lastFail ? '다시 요청' : '요청'}
          </Button>
        </div>
      }
    >
      <div className="in-dump-form">
        <div className="in-dump-form__timeout">
          <label htmlFor={`${id}-timeout`} className="text-body-13">
            timeout_ms
          </label>
          <Select id={`${id}-timeout`} value={timeout} disabled={req.isPending} onChange={(e) => setTimeoutMs(Number(e.target.value))}>
            {TIMEOUTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <span className="text-caption-12 in-muted">이 시간 안에 답이 없으면 요청을 접습니다</span>
        </div>

        <ol className="in-steps" aria-label="진행 단계">
          <StepItem n={1} state={s1} title="API server 접수" desc={sentAt ? `${formatTime(sentAt).slice(0, 8)} · 요청자 ${user?.email ?? ''}` : '요청을 누르면 시작합니다'} />
          <StepItem
            n={2}
            state={s2}
            title="Collector 팬아웃 중"
            desc="POST /internal/thread-dump · MONIMO_COLLECTOR_URLS 의 Collector 전부에 동시 질의 (Collector 는 어느 파드가 어디 붙었는지 모른다)"
          />
          <StepItem n={3} state={s3} title="Extension 덤프 회수" desc="파드의 폴링을 쥔 Collector 한 대만 200 으로 덤프를 되돌린다 · 전부 503 이면 1회 재시도" />
        </ol>

        <p className="text-caption-12 in-muted">200 이 한 대도 없으면 503 AGENT_NOT_REACHABLE, 한 대라도 시간 초과면 503 THREAD_DUMP_TIMEOUT</p>

        {lastFail ? (
          <Banner tone="crit">
            {req.isPending ? '직전 요청 실패' : '요청 실패'}: <span className="text-mono-12-strong">{lastFail.code}</span> ({formatTime(lastFail.at).slice(0, 8)}) — {lastFail.text}
          </Banner>
        ) : null}
      </div>
    </Modal>
  )
}

const STATE_TEXT: Record<Step, string> = { idle: '대기', active: '진행 중', done: '완료', failed: '실패' }

function StepItem({ n, state, title, desc }: { n: number; state: Step; title: string; desc: string }) {
  return (
    <li className={`in-step is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
      <span className="in-step__mark" aria-hidden>
        {state === 'done' ? <IconCheck size={12} /> : null}
      </span>
      <div>
        <div className="text-body-13-strong">
          {'①②③'[n - 1]} {title} <span className="in-step__state">{STATE_TEXT[state]}</span>
        </div>
        <div className="text-caption-12 in-muted">{desc}</div>
      </div>
    </li>
  )
}
