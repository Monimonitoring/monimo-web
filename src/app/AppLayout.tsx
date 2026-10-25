import { lazy, type MouseEvent } from 'react'
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router'
import { AppShell, Sidebar, Topbar } from '@/design-system'
// 차트(echarts)까지 딸려 오지 않게 barrel(@/shared) 대신 trace 만 가져온다
import { TraceDrawerHost } from '@/shared/trace'
import { useFilterHref } from '@/stores'
import { SCREENS, type ScreenMeta } from './screens'
import { TopbarControls } from './TopbarControls'
import { useAutoRefresh } from './useAutoRefresh'
import { useFilterUrlSync } from './useFilterUrlSync'
import { UserMenu } from './UserMenu'

// 트레이스 상세 본문. 모듈 최상단에서 한 번만 만들어야 드로어가 열린 채 자동 새로고침해도 본문이 다시 마운트되지 않는다
const TraceBody = lazy(() => import('@/features/trace-detail').then((m) => ({ default: m.TraceDetail })))

/** 로그인 화면을 뺀 모든 화면의 틀 (06 P1). 사이드바 · 상단바 · 공통 상태 동기화는 여기서만 한다 */
export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const matches = useMatches()
  const meta = [...matches].reverse().find((m) => m.handle)?.handle as ScreenMeta | undefined
  const activeKey = pathname.split('/')[1]

  useFilterUrlSync()
  useAutoRefresh()

  // 메뉴 링크에도 공통 상태를 실어서, 새 탭으로 열어도 같은 서비스 · 시간 범위가 보이게 한다
  const href = useFilterHref()
  const items = SCREENS.map((s) => ({ key: s.path, label: s.title, icon: s.icon, href: href(`/${s.path}`) }))

  const onSelect = (key: string, e: MouseEvent<HTMLElement>) => {
    // Ctrl/⌘/Shift/Alt 클릭은 브라우저 기본 동작(새 탭 · 새 창)에 맡긴다
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href(`/${key}`))
  }

  return (
    <AppShell
      sidebar={<Sidebar items={items} activeKey={activeKey} onSelect={onSelect} />}
      topbar={
        <Topbar title={meta?.title ?? ''} subtitle={meta?.subtitle}>
          <TopbarControls />
          <UserMenu />
        </Topbar>
      }
    >
      <Outlet />
      <TraceDrawerHost Body={TraceBody} />
    </AppShell>
  )
}
