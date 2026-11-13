import { useEffect, useState } from 'react'

/*
 * 「MONIMO 가 멈추면 누가 알려 주나」를 그림으로.
 * 정상 장면과 장애 장면을 8초씩 번갈아 돈다. 버튼으로 직접 고를 수도 있다.
 * 근거 : ADR #18 (Lambda + EventBridge 1분 · traceparent 를 직접 만든 카나리 · 별도 Slack 웹훅 · Healthchecks.io),
 *        api-spec 4번 canary/freshness(기본 180초) · 52번 self-check
 */

type Mode = 'ok' | 'down'
const STEPS = 8 // 장면 하나 = 8초

const NODES = [
  { name: 'shop-order', sub: '주문 API' },
  { name: 'Collector', sub: '수집' },
  { name: 'Kafka', sub: '대기열' },
  { name: 'Ingester', sub: '적재' },
  { name: 'ClickHouse', sub: '저장' },
  { name: 'API server', sub: '조회' },
]
const STUCK_AT = 3 // 장애 장면에서 멈추는 노드 (Ingester)

const SCRIPT: Record<Mode, { at: number; text: string }[]> = {
  ok: [
    { at: 0, text: '1분마다 표식을 단 가짜 주문(카나리)을 보낸다' },
    { at: 3, text: '조회 API 에 「그 trace ID 가 도착했나?」 묻는다' },
    { at: 5, text: '도착 확인 · 내부 점검 5개 모두 정상 → 조용히 넘어간다' },
  ],
  down: [
    { at: 0, text: '같은 카나리를 보냈는데 적재가 멈춰 중간에서 끊긴다' },
    { at: 3, text: '평소 경보도 울리지 않는다 · 경보를 내는 쪽도 같은 클러스터 안이라서' },
    { at: 5, text: '180초째 카나리가 안 보이면 클러스터 밖에서 Slack 으로 직접 알린다' },
  ],
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function WatchdogDemo() {
  const [reduced] = useState(prefersReducedMotion)
  const [state, setState] = useState<{ mode: Mode; t: number; auto: boolean; scene: number }>(() => ({ mode: 'ok', t: reduced ? STEPS - 1 : 0, auto: !reduced, scene: 0 }))
  const { mode, t } = state

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => {
      setState((s) => {
        if (s.t < STEPS - 1) return { ...s, t: s.t + 1 }
        // 장면 끝 : 자동이면 다른 장면으로, 직접 고른 장면이면 같은 장면을 처음부터
        return { mode: s.auto ? (s.mode === 'ok' ? 'down' : 'ok') : s.mode, t: 0, auto: s.auto, scene: s.scene + 1 }
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [reduced])

  const choose = (m: Mode) => setState((s) => ({ mode: m, t: reduced ? STEPS - 1 : 0, auto: false, scene: s.scene + 1 }))
  const script = SCRIPT[mode]
  const current = script.filter((s) => s.at <= t).length - 1
  const asking = t >= 3
  const result = t >= 5
  const seconds = mode === 'down' ? Math.min(180, Math.max(0, (t - 2) * 60)) : 0

  return (
    <div className={`wd wd--${mode}`}>
      <div className="wd__switch" role="tablist" aria-label="장면 고르기">
        <button type="button" role="tab" aria-selected={mode === 'ok'} onClick={() => choose('ok')} className="text-body-13-strong">
          <span className="wd__switch-dot wd__switch-dot--ok" /> 평소
        </button>
        <button type="button" role="tab" aria-selected={mode === 'down'} onClick={() => choose('down')} className="text-body-13-strong">
          <span className="wd__switch-dot wd__switch-dot--crit" /> 수집이 멈췄을 때
        </button>
        {state.auto ? <span className="wd__auto text-caption-12">자동 재생 중</span> : null}
      </div>

      <div className="wd__stage">
        {/* 바깥 : Watchdog */}
        <div className={`wd__outside${asking ? ' wd__outside--asking' : ''}`}>
          <span className="wd__tag text-mono-11">클러스터 밖</span>
          <div className="wd__lambda">
            <span className="wd__lambda-icon" aria-hidden="true">λ</span>
            <div>
              <b className="text-body-13-strong">Watchdog</b>
              <span className="text-caption-12">Lambda · 1분마다</span>
            </div>
          </div>
          <div className="wd__timer text-mono-12">
            {mode === 'down' && t >= 2 ? (
              <>
                <span className="wd__timer-label">카나리 못 본 지</span>
                <b>{seconds}초</b>
                <span className="wd__timer-bar"><span style={{ width: `${(seconds / 180) * 100}%` }} /></span>
              </>
            ) : (
              <>
                <span className="wd__timer-label">trace ID</span>
                <b>4bf9…0736</b>
              </>
            )}
          </div>
        </div>

        {/* 안 : 클러스터 */}
        <div className="wd__cluster">
          <span className="wd__tag text-mono-11">쿠버네티스 클러스터 · MONIMO</span>
          <ol className="wd__nodes">
            {NODES.map((n, i) => {
              const stopped = mode === 'down' && i === STUCK_AT
              const lit = mode === 'ok' ? t >= i * 0.5 : t >= i * 0.5 && i < STUCK_AT
              const queried = asking && i === NODES.length - 1
              return (
                <li key={n.name} className={`wd__node${lit ? ' wd__node--lit' : ''}${stopped ? ' wd__node--down' : ''}${queried ? ' wd__node--asked' : ''}`}>
                  <b className="text-caption-12-medium">{n.name}</b>
                  <span className="text-mono-11">{stopped ? '멈춤' : n.sub}</span>
                </li>
              )
            })}
          </ol>
          <div className="wd__track" aria-hidden="true">
            <span key={state.scene} className={mode === 'ok' ? 'wd__canary' : 'wd__canary wd__canary--stuck'} />
          </div>
          <div className="wd__inside-alert text-caption-12">
            <span className="wd__mute" aria-hidden="true" />
            {mode === 'down' && t >= 3 ? 'Detector · Notifier 도 이 안에 있어 평소 경보는 조용하다' : '평소 경보(Detector → Notifier)는 이 안에서 돈다'}
          </div>
        </div>

        {/* 결과 */}
        <div className="wd__result" aria-live="polite">
          {!result ? (
            <div className="wd__wait text-caption-12">
              <span className="wd__spinner" aria-hidden="true" /> {asking ? '조회 API 에 묻는 중…' : '카나리가 흘러가는 중…'}
            </div>
          ) : mode === 'ok' ? (
            <div className="wd__card wd__card--ok">
              <span className="wd__big" aria-hidden="true">✓</span>
              <b className="text-body-13-strong">카나리 도착</b>
              <span className="text-caption-12">수집 · 적재 · 조회가 끝까지 돈다</span>
              <ul className="wd__checks text-mono-11">
                {['postgres', 'detector', 'collector', 'notifier', 'outbox'].map((c) => <li key={c}>✓ {c}</li>)}
              </ul>
            </div>
          ) : (
            <div className="wd__card wd__card--crit">
              <span className="wd__slack-head text-caption-12-medium"># monimo-watchdog</span>
              <b className="text-body-13-strong">MONIMO 수집이 멈췄습니다</b>
              <span className="text-caption-12">카나리 180초째 미도착 · 클러스터 밖 Lambda 가 보냄</span>
            </div>
          )}
        </div>
      </div>

      <ol className="wd__script">
        {script.map((s, i) => (
          <li key={s.text} className={i === current ? 'wd__line wd__line--on' : i < current ? 'wd__line wd__line--done' : 'wd__line'}>
            <span className="wd__num text-mono-12-strong">{i + 1}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
