import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, getApplication } from '@/api'
import { AdminOnly } from '@/auth'
import { Button, Card, formatTime, IconLock, shortId } from '@/design-system'
import { useFilterHref } from '@/stores'

const stamp = (iso?: string) => (iso ? `${new Date(iso).toLocaleDateString('sv-SE')} ${formatTime(iso).slice(0, 8)}` : '—')

type Props = { appId: string; onEdit: () => void; onDelete: () => void }

/** 서비스 상세 (6번) — 이름(불변) · 표시명 · system · 파드 수 · 설명, 수정 · 감시 대상에서 제외 */
export function ServiceDetail({ appId, onEdit, onDelete }: Props) {
  const href = useFilterHref()
  const q = useQuery({ queryKey: ['application', appId], queryFn: ({ signal }) => getApplication(appId, signal) })
  const a = q.data

  if (!a) {
    const code = q.error instanceof ApiError ? q.error.code : ''
    return (
      <Card>
        <p className="st-empty text-body-13" role={q.isError ? 'alert' : 'status'}>
          {q.isError ? (code === 'NOT_FOUND' ? '이 서비스를 찾을 수 없습니다. 제외됐을 수 있습니다.' : `서비스를 불러오지 못했습니다. ${code ? `(${code})` : ''}`) : '불러오는 중…'}
        </p>
      </Card>
    )
  }

  return (
    <Card className="st-detail">
      <header className="st-detail__head">
        <div>
          <h2 className="text-section-15">서비스 상세</h2>
          <span className="text-mono-11 st-muted" title={a.application_uuid}>
            application_uuid {shortId(a.application_uuid)}
          </span>
        </div>
        <AdminOnly>
          <div className="st-detail__actions">
            <Button onClick={onEdit}>수정</Button>
            <Button variant="danger" onClick={onDelete}>
              감시 대상에서 제외
            </Button>
            <span className="text-caption-12 st-muted">deleted_at 만 찍고 규칙 · 파드 · 이력은 남깁니다 · 같은 name 재등록은 409</span>
          </div>
        </AdminOnly>
      </header>
      <dl className="st-fields">
        <div>
          <dt className="text-caption-12-medium">name</dt>
          <dd>
            <span className="st-lock text-mono-12-strong">
              <IconLock size={12} /> {a.name}
            </span>
            <span className="text-caption-12 st-muted">name 은 바꿀 수 없음 (모든 신호의 열쇠)</span>
          </dd>
        </div>
        <div>
          <dt className="text-caption-12-medium">display_name</dt>
          <dd className="text-body-13">{a.display_name || <span className="st-muted">—</span>}</dd>
        </div>
        <div>
          <dt className="text-caption-12-medium">system</dt>
          <dd className="text-body-13">
            <span className="text-mono-12-strong">{a.system}</span>
            <span className="text-caption-12 st-muted">같은 System 은 샘플링 비율의 최댓값 하나를 같이 씀</span>
          </dd>
        </div>
        <div>
          <dt className="text-caption-12-medium">agent_count</dt>
          <dd className="text-body-13">
            <span className="text-mono-12-strong">{a.agent_count ?? '—'}</span>{' '}
            <Link className="st-link" to={href('/inspector', { serviceName: a.name })}>
              파드 {a.agent_count ?? ''}개 보기
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-caption-12-medium">created_at · updated_at</dt>
          <dd className="text-mono-12">
            {stamp(a.created_at)}
            <br />
            {stamp(a.updated_at)}
          </dd>
        </div>
        <div className="st-fields__wide">
          <dt className="text-caption-12-medium">description</dt>
          <dd className="text-body-13">{a.description || <span className="st-muted">설명이 없습니다.</span>}</dd>
        </div>
      </dl>
    </Card>
  )
}
