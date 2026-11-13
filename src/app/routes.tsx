// 경로 정의. 화면 목록은 screens.tsx 에서 가져온다.
import { type RouteObject } from 'react-router'
import { RequireAuth } from '@/auth'
import { AppLayout } from './AppLayout'
import { indexLoader } from './indexLoader'
import { NotFound, RouteError } from './RouteError'
import { SCREENS, type ScreenMeta } from './screens'

export const routes: RouteObject[] = [
  {
    path: '/',
    // 로그인해야 보인다. 로그인 전이면 /login?next=... 로 보낸다
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, loader: indexLoader },
      ...SCREENS.map((s) => ({ path: s.path, handle: { title: s.title, subtitle: s.subtitle } satisfies ScreenMeta, lazy: s.load })),
      { path: '*', handle: { title: '페이지 없음' } satisfies ScreenMeta, element: <NotFound /> },
    ],
  },
  // 소개 페이지. 로그인 없이 보는 공개 화면 (발표 · 공유용 주소)
  { path: '/intro', errorElement: <RouteError />, lazy: () => import('@/features/landing').then((m) => ({ Component: m.LandingPage })) },
  // S00 로그인. 셸 없이 단독 화면
  { path: '/login', errorElement: <RouteError />, lazy: () => import('@/features/login').then((m) => ({ Component: m.LoginPage })) },
  // 디자인 시스템 미리보기. 사이드바에는 없고 주소로만 들어간다
  { path: '/design-system', errorElement: <RouteError />, lazy: () => import('./DesignSystemPreview').then((m) => ({ Component: m.DesignSystemPreview })) },
]
