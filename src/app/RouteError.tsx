import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Banner, Card } from '@/design-system'

/** 없는 경로. 앱 셸 안에 보인다 */
export function NotFound() {
  return (
    <Card title="페이지를 찾을 수 없습니다">
      <p className="text-body-13" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        주소를 확인하거나 <Link to="/server-map">Service map</Link>으로 돌아가세요.
      </p>
    </Card>
  )
}

/** 화면 코드를 불러오지 못했거나 렌더 중 오류가 났을 때. 셸 없이 단독으로 보인다 */
export function RouteError() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error)
  return (
    <div style={{ padding: 'var(--space-5)', maxWidth: 720 }}>
      <Banner tone="crit" action={<a href="/server-map">처음으로</a>}>
        화면을 여는 중 문제가 생겼습니다. 새로고침해도 같으면 알려 주세요. ({detail})
      </Banner>
    </div>
  )
}
