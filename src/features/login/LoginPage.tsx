import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api'
import { safeNextPath, useAuth } from '@/auth'
import { Banner, Button, Field, IconArrowRight, Input } from '@/design-system'
import './LoginPage.css'

const PIPELINE = [
  { name: '에이전트', sub: 'OTel Java' },
  { name: 'Collector', sub: 'gRPC 4317' },
  { name: 'Kafka', sub: 'raw' },
  { name: 'Ingester', sub: 'batch 2k' },
  { name: 'ClickHouse', sub: 'spans' },
  { name: 'API server', sub: '/api/v1' },
]

function errorText(e: unknown): { text: string; code?: string } {
  if (e instanceof ApiError) {
    if (e.status === 401) return { text: '이메일 또는 비밀번호가 올바르지 않습니다', code: '401 UNAUTHENTICATED' }
    if (e.status === 429) return { text: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요', code: '429 TOO_MANY_REQUESTS' }
    if (e.status === 0) return { text: '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요' }
    return { text: e.message, code: `${e.status} ${e.code}` }
  }
  return { text: '로그인하지 못했습니다. 잠시 후 다시 시도하세요' }
}

/** S00 로그인 (monimo-backend docs/design/web-v2/artboards/Login.dc.html) */
export function LoginPage() {
  const { status, login, sessionExpired } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const expired = sessionExpired || params.get('expired') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ text: string; code?: string } | null>(null)

  // 세션 복원 중에는 폼을 그리지 않는다 (이미 로그인된 사람에게 폼이 잠깐 보이지 않도록)
  if (status === 'loading') return <div className="login" aria-busy="true" />
  if (status === 'authenticated') return <Navigate to={next} replace />

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError({ text: '이메일과 비밀번호를 입력하세요' })
      return
    }
    setPending(true)
    setError(null)
    try {
      await login(email.trim(), password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorText(err))
      setPassword('')
    } finally {
      setPending(false)
    }
  }

  const invalid = error?.code?.startsWith('401') || undefined

  return (
    <div className="login">
      <section className="login__intro" aria-label="서비스 소개">
        <div className="login__brand">
          <div className="login__wordmark">MONIMO</div>
          <p className="login__tagline">쿠버네티스 위 MSA를 비침습 수집하고, 그 감시 체계까지 스스로 감시하는 Pinpoint형 APM</p>
        </div>
        <div className="login__pipeline-block">
          <div className="login__micro text-micro-11">수집 파이프라인</div>
          <ol className="login__pipeline" aria-label="에이전트에서 Collector, Kafka, Ingester, ClickHouse를 거쳐 API server 로 흐르는 수집 파이프라인">
            {PIPELINE.map((step, i) => (
              <li key={step.name} className="login__step">
                <div className={i === PIPELINE.length - 1 ? 'login__node login__node--last' : 'login__node'}>
                  <span className="text-caption-12-medium">{step.name}</span>
                </div>
                <span className="login__node-sub text-mono-11">{step.sub}</span>
                {i < PIPELINE.length - 1 ? <IconArrowRight size={12} className="login__arrow" /> : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="login__main">
        <div className="login__column">
          <div className="login__card">
            <div className="login__heading">
              <h1 className="login__title text-title-20">로그인</h1>
              <p className="login__subtitle text-caption-12-medium">팀 계정으로 로그인합니다. 역할은 ADMIN / VIEWER</p>
            </div>
            {expired && !error ? <Banner tone="warn">세션이 만료되었습니다. 다시 로그인하세요.</Banner> : null}
            <form className="login__form" onSubmit={onSubmit} noValidate>
              <Field label="이메일" htmlFor="login-email">
                <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }} aria-invalid={invalid} autoFocus />
              </Field>
              <Field label="비밀번호" htmlFor="login-password">
                <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} aria-invalid={invalid} />
              </Field>
              {error ? (
                <Banner tone="crit">
                  {error.text}
                  {error.code ? <span className="text-mono-11"> ({error.code})</span> : null}
                </Banner>
              ) : null}
              <Button type="submit" variant="primary" size="lg" className="login__submit" disabled={pending}>
                {pending ? '로그인 중…' : '로그인'}
              </Button>
            </form>
            <div className="login__help">
              <span className="text-caption-12-medium">비밀번호를 잊으셨나요?</span>
              <span className="login__help-strong text-caption-12-medium">관리자에게 문의</span>
            </div>
          </div>
          <p className="login__note text-caption-12-medium">
            세션이 만료되면 자동으로 재발급합니다 (<span className="text-mono-11">POST /auth/refresh — refresh 토큰은 httpOnly 쿠키로 받고 쓸 때마다 새것으로 바뀝니다</span>). 재발급도 실패하면 이 화면으로 돌아옵니다.
          </p>
        </div>
      </div>
    </div>
  )
}
