// 화면 목록 = 사이드바 메뉴 = 경로. 메뉴를 늘리거나 이름을 바꿀 때는 여기 한 곳만 고친다.
// 화면 코드는 경로별로 따로 내려받는다(lazy) — Service map 그래프 · 차트 라이브러리가 다른 화면을 무겁게 하지 않도록.
import type { ReactNode } from 'react'
import {
  IconAlerts,
  IconError,
  IconInspector,
  IconLogs,
  IconServerMap,
  IconSettings,
  IconTransactions,
} from '@/design-system'

/** 상단바에 보일 제목 · 부제 (route handle) */
export type ScreenMeta = { title: string; subtitle?: string }

type Screen = ScreenMeta & {
  path: string
  icon: ReactNode
  load: () => Promise<{ Component: () => ReactNode }>
}

export const SCREENS: Screen[] = [
  { path: 'server-map', title: '서버맵', subtitle: '서비스 간 호출 관계와 에러를 한눈에', icon: <IconServerMap />, load: () => import('@/features/server-map').then((m) => ({ Component: m.ServerMapPage })) },
  { path: 'transactions', title: '트랜잭션', icon: <IconTransactions />, load: () => import('@/features/transactions').then((m) => ({ Component: m.TransactionsPage })) },
  { path: 'inspector', title: '인스펙터', icon: <IconInspector />, load: () => import('@/features/inspector').then((m) => ({ Component: m.InspectorPage })) },
  { path: 'errors', title: '에러', icon: <IconError />, load: () => import('@/features/errors').then((m) => ({ Component: m.ErrorsPage })) },
  { path: 'logs', title: '로그', icon: <IconLogs />, load: () => import('@/features/logs').then((m) => ({ Component: m.LogsPage })) },
  { path: 'alerts', title: '경보', icon: <IconAlerts />, load: () => import('@/features/alerts').then((m) => ({ Component: m.AlertsPage })) },
  { path: 'settings', title: '설정', icon: <IconSettings />, load: () => import('@/features/settings').then((m) => ({ Component: m.SettingsPage })) },
]
