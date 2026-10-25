import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './context'

/**
 * 로그인해야 보이는 영역. 로그인 전이면 /login?next=<원래 주소> 로 보낸다 (세션 만료면 expired=1 도 붙인다).
 * 화면을 가리는 편의 기능일 뿐이다 — 실제 차단은 API server 가 JWT 로 한다.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, sessionExpired } = useAuth()
  const { pathname, search } = useLocation()
  if (status === 'loading') return <div style={{ minHeight: '100vh', background: 'var(--color-bg-canvas)' }} aria-busy="true" />
  if (status === 'anonymous') {
    const params = new URLSearchParams({ next: pathname + search })
    if (sessionExpired) params.set('expired', '1')
    return <Navigate to={`/login?${params}`} replace />
  }
  return children
}

/** ADMIN 에게만 보이는 요소 (값을 바꾸는 버튼 등). VIEWER 에게는 fallback 을 보인다 */
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : fallback
}
