import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, getApplicationConfig, putApplicationConfig } from '@/api'
import { useAuth } from '@/auth'
import { Banner, Button, Card, formatTime, Input, Slider } from '@/design-system'

const stamp = (iso: string) => `${new Date(iso).toLocaleDateString('sv-SE')} ${formatTime(iso).slice(0, 8)}`
/** 0.0125 → 1.25 (%). 저장 단위가 NUMERIC(5,4) 라 0.01 % 까지 */
const toPct = (rate: number) => Math.round(rate * 10000) / 100
const fmtPct = (pct: number) => pct.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

/**
 * 트레이스 샘플링률 (29 · 39번). Collector 가 trace_id 해시로 이 비율만큼 골라 남긴다. 30초 캐시 뒤 반영 · 재배포 없음.
 * 낙관적 잠금: 적용할 때 지금 보고 있는 판번호(expected_version)를 같이 보내고, 그 사이 누가 먼저 바꿨으면 409 로 막힌다
 */
export function SamplingCard({ appId }: { appId: string }) {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const id = useId()
  const q = useQuery({ queryKey: ['application-config', appId], queryFn: ({ signal }) => getApplicationConfig(appId, signal) })
  // 입력 중인 값(%). null 이면 아직 손대지 않음 = 현재값. 글자 그대로 둬서 "1." 같은 입력 중 상태를 허용한다
  const [draft, setDraft] = useState<string | null>(null)
  const [appliedVersion, setAppliedVersion] = useState<number | null>(null)

  const save = useMutation({
    mutationFn: (v: { rate: number; version: number }) => putApplicationConfig(appId, { sampling_rate: v.rate, expected_version: v.version }),
    onSuccess: (c) => {
      qc.setQueryData(['application-config', appId], c)
      setDraft(null)
      setAppliedVersion(c.version)
    },
  })
  const conflict = save.error instanceof ApiError && save.error.code === 'CONFIG_VERSION_CONFLICT' ? save.error : null

  const c = q.data
  if (!c) {
    return (
      <Card title="트레이스 샘플링률">
        <p className="st-empty text-body-13" role={q.isError ? 'alert' : 'status'}>
          {q.isError ? '설정을 불러오지 못했습니다.' : '불러오는 중…'}
        </p>
      </Card>
    )
  }

  const current = toPct(c.sampling_rate)
  const text = draft ?? String(current)
  const pct = Number(text)
  const valid = text.trim() !== '' && Number.isFinite(pct) && pct >= 0 && pct <= 100 && Math.abs(Math.round(pct * 100) - pct * 100) < 1e-9
  const changed = valid && pct !== current
  const error = draft !== null && !valid ? '0 ~ 100 사이, 소수 둘째 자리까지 적으세요.' : null

  // 충돌 뒤 「새로고침」: 최신 판을 다시 받는다. 입력해 둔 값은 그대로 두어 바로 다시 적용할 수 있게
  const refresh = async () => {
    save.reset()
    await q.refetch()
  }

  return (
    <Card className="st-sampling">
      <header>
        <h2 className="text-section-15">트레이스 샘플링률</h2>
        <p className="text-caption-12 st-muted">Collector 가 trace_id 해시로 선별 · 정본 PG · 30초 캐시 뒤 반영 · 재배포 없음</p>
      </header>

      {conflict ? (
        <Banner
          tone="warn"
          action={
            <Button onClick={() => void refresh()} disabled={q.isFetching}>
              새로고침
            </Button>
          }
        >
          다른 사용자가 먼저 바꿨습니다 (<span className="text-mono-12-strong">CONFIG_VERSION_CONFLICT</span>) — 새로고침으로 최신 판을 받은 뒤 다시 적용하세요.
        </Banner>
      ) : null}
      {q.isError ? <Banner tone="crit">최신 설정을 다시 받지 못했습니다. 잠시 뒤 다시 시도하세요.</Banner> : null}
      {conflict ? null : save.isError ? (
        <Banner tone="crit">
          {save.error instanceof ApiError ? (save.error.code === 'FORBIDDEN' ? '관리자(ADMIN)만 바꿀 수 있습니다.' : `${save.error.message} (${save.error.code})`) : '적용하지 못했습니다.'}
        </Banner>
      ) : null}

      <div className="st-sampling__now">
        <div>
          <span className="text-caption-12-medium st-muted">updated_by · updated_at</span>
          <div className="text-mono-12">
            {c.updated_by?.name ?? '처음 만든 값'} · {stamp(c.updated_at)}
          </div>
        </div>
        <div className="st-sampling__current">
          <span className="text-caption-12-medium st-muted">현재 적용 중 · sampling_rate</span>
          <span>
            <span className="text-number-28">{fmtPct(current)} %</span> <span className="st-version text-mono-12-strong">v{c.version}</span>
          </span>
          {appliedVersion === c.version && !changed && !save.isError ? <span className="text-caption-12 st-ok" role="status">v{c.version} 로 적용했습니다 · 30초 안에 Collector 가 읽어 갑니다</span> : null}
        </div>
      </div>

      <fieldset className="st-sampling__edit" disabled={!isAdmin || save.isPending}>
        <legend className="text-caption-12-medium">새 샘플링률</legend>
        <Slider
          aria-label="새 샘플링률(%)"
          value={valid ? pct : current}
          min={0}
          max={100}
          step={0.5}
          ticks={['0%', '25%', '50%', '75%', '100%']}
          onChange={(v) => setDraft(String(v))}
        />
        <div className="st-sampling__input">
          <label htmlFor={`${id}-pct`} className="text-caption-12-medium">
            직접 입력
          </label>
          <span className="st-unit">
            <Input id={`${id}-pct`} inputMode="decimal" value={text} aria-invalid={!!error} onChange={(e) => setDraft(e.target.value)} />
            <span className="text-mono-12">%</span>
          </span>
          {error ? (
            <span className="text-caption-12 st-crit" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </fieldset>

      <footer className="st-sampling__foot">
        <span className="text-caption-12 st-muted">
          {changed
            ? `트레이스 100건 중 약 ${fmtPct(pct)}건을 남깁니다 (지금 ${fmtPct(current)}건) · 서비스별 비율 중 최댓값만 Collector 가 쓴다 (ADR #53)`
            : `트레이스 100건 중 약 ${fmtPct(current)}건 저장 · 서비스별 비율 중 최댓값만 Collector 가 쓴다 (ADR #53)`}
        </span>
        {isAdmin ? (
          <span className="st-sampling__actions">
            <span className="text-mono-11 st-muted">적용 시 expected_version={c.version} 동봉</span>
            <Button
              onClick={() => {
                // 오류 · 충돌 안내도 같이 걷는다 (남겨 두면 "적용했습니다" 와 함께 보여 헷갈린다)
                save.reset()
                setDraft(null)
              }}
              disabled={(draft === null && !save.isError) || save.isPending}
            >
              되돌리기
            </Button>
            <Button variant="primary" disabled={!changed || save.isPending || !!conflict} onClick={() => save.mutate({ rate: pct / 100, version: c.version })}>
              {save.isPending ? '적용 중…' : '적용'}
            </Button>
          </span>
        ) : (
          <span className="text-caption-12 st-muted">VIEWER 는 읽기만 합니다 · 변경은 ADMIN</span>
        )}
      </footer>
    </Card>
  )
}
