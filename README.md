# monimo-web

모니모니터링 화면 (Service map · 트랜잭션 · Inspector · 에러 · 로그 · 경보 · 설정)

- 기술: React 19 · TypeScript · Vite · oxlint · React Router · TanStack Query · Zustand · ECharts · React Flow · MSW(가짜 응답)
- 상태: **3단계 완료** — 화면 7개를 가짜 응답(MSW)으로 모두 만들었다. 다음은 4단계(실서버 연결 · 보안). 플랫폼 상태 화면(제안 문 3개)은 받지 않기로 해 뺐다 (#75)

## 폴더 구성

**디자인 시스템에서 부품을 만들고, 화면(features)에서 조립한다.**

```
src/
├── design-system/   공통 부품 공장 (화면을 모른다). Figma 「디자인 시스템」 섹션 01~06 과 1:1
│   ├── tokens/
│   │   ├── color.css       01 색 (의미 색 34 + 원시 색 29)
│   │   ├── typography.css  02 타이포그래피 (서체 변수 + 텍스트 스타일 클래스)
│   │   ├── layout.css      03 간격 · 반경 · 그림자 · 크기
│   │   └── base.css        공통 바탕 (reset · body)
│   ├── icons/              04 아이콘 (SVG 를 감싼 컴포넌트)
│   ├── components/
│   │   ├── base/           05-A 기본 컴포넌트: Button · Badge · Input · Sidebar ...
│   │   └── extended/       05-B 확장 컴포넌트: Table · Tabs · Modal ...
│   ├── patterns/           06 패턴: AppShell · TableCard · FormCard · 상태색 · 차트 규칙
│   └── index.ts            입구. 밖에서는 '@/design-system' 으로만 가져다 쓴다
├── features/        화면 하나 = 폴더 하나 = 경로 하나 (아래 「화면 경로」 표)
├── api/             API 호출 (client.ts · auth.ts · tokens.ts) + 가짜 응답 (mocks/)
├── auth/            로그인 상태 · 라우트 가드 · 역할 (useAuth · RequireAuth · AdminOnly)
├── shared/          여러 화면이 같이 쓰는 앱 코드: 차트 공용 틀(charts/EChart) 등
├── stores/          여러 화면이 같이 쓰는 값 (Zustand): 서비스 · 시간 범위 · 새로고침 주기
├── app/             앱 뼈대: 경로(routes.tsx) · 셸(AppLayout) · TanStack Query · 디자인 시스템 미리보기
└── main.tsx
```

| 규칙 | 지키는 방법 |
|---|---|
| `design-system` 은 `features` · `api` · `stores` · `app` · `shared` 를 가져다 쓰지 않는다 | `npm run lint` 가 막는다 (`.oxlintrc.json`) |
| `shared` 는 `features` · `app` 을 가져다 쓰지 않는다 | `npm run lint` 가 막는다 |
| 색 · 간격은 hex · px 를 직접 쓰지 않고 토큰 변수를 쓴다 | 예: `var(--color-accent-default)` · `var(--space-4)` |
| 글자는 Figma 텍스트 스타일 이름 클래스를 쓴다 | 예: `Body/13 Strong` → `.text-body-13-strong` |
| 토큰 값을 바꿀 때는 Figma 먼저, 그다음 `tokens/` 의 해당 파일 | 둘이 어긋나지 않게 |
| 화면에서는 의미 색(`--color-*`)만 쓴다. 원시 색(`--gray-500` 등) 직접 사용 금지 | `color.css` 의 두 층 구분 참고 |

## 로컬 실행

필요한 것: Node 24 (`.nvmrc`)

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint     # 코드 검사 (design-system 경계 포함)
npm test         # 테스트 (아래 「테스트」)
npm run build    # 타입 검사 + 빌드
```

`/api` 로 시작하는 요청은 개발 서버가 `localhost:8080`(api-server)으로 넘긴다.

### 가짜 응답 (MSW)

백엔드 없이 화면을 볼 때는 가짜 응답을 켠다. 개발 서버에서만 동작하고 빌드 결과물에는 안 들어간다.

```bash
VITE_API_MOCK=true npm run dev
```

- 데모 계정 (비밀번호 모두 `monimo2026`): `admin@monimo.io` (ADMIN) · `viewer@monimo.io` (VIEWER)
- 응답은 `src/api/mocks/<도메인>.ts` 에 있고 `handlers.ts` 가 모은다. 같은 분이면 같은 값이 나오도록 정해진 난수로 만들어, 화면끼리 숫자가 맞는다 (Service map 빨간 점 = 트랜잭션 목록 = 트레이스 상세 예외 = 에러 표 = ERROR 로그).
- 만들기 · 수정(규칙 · 채널 · 서비스 · 샘플링률 · 덤프)은 메모리에 남고 **새로고침하면 처음으로 돌아간다**.
- 일부러 넣어 둔 장면: 설정에서 shop-order 샘플링률을 처음 적용하면 "다른 사용자가 먼저 바꾼" 409 충돌 · Inspector `shop-order-7d9f4-z9k1w` 는 덤프가 6초 걸려 timeout 5000 이면 503

브라우저 콘솔에서 흐름을 시험할 수 있다.

| 명령 | 하는 일 |
|---|---|
| `__monimoMock.expireAccess()` | access 토큰 만료 → 다음 요청이 401 → 자동 재발급 |
| `__monimoMock.revokeRefresh()` | refresh 쿠키도 무효 → 재발급 실패 → 로그인 화면(세션 만료) |

플랫폼 상태 화면이 부르던 제안 문 3개(`GET /platform/canary` · `/platform/services` · `/platform/canary/events`)는 백엔드가 받지 않기로 해 화면과 함께 뺐다(#75). 화면 사용자(쇼핑몰 담당자)의 관심사가 아니고, 파드 상태는 `kubectl`, 끝까지 통하는지는 Watchdog → Slack 이 본다. 나중에 "데이터가 최신인지" 가 필요하면 수집이 끊겼을 때만 배너로 보여 준다.

## 테스트

`npm test` 는 브라우저 없이 Node 에서 돈다 (vitest). CI 에서도 PR 마다 돈다. 두 종류가 있다.

| 종류 | 파일 | 확인하는 것 |
|---|---|---|
| 계약 테스트 | `src/api/contract.test.ts` | 화면이 쓰는 API 함수를 가짜 응답에 실제로 보내 보고, 돌아온 값에 api-spec 「응답 주요 필드」의 이름이 다 있는지. 오류 코드(401 · 403 · 409 · 422 · 503)도 명세대로 오는지 |
| 계산 테스트 | `src/features/**/<이름>.test.ts` | 화면 안의 순수 계산: 스레드 덤프 읽기, 규칙 · 채널 입력 검사, 에러 막대 모으기, 드래그 선택, 지표 단위 |

- 명세가 바뀌면 계약 테스트의 필드 목록부터 고친다. 가짜 응답이 따라오지 않으면 테스트가 깨져서 바로 보인다.
- 명세에 없는 값(이슈 #60 의 프론트 가정)은 테스트 이름에 「가정」 이라고 적어 두었다. 백엔드 답이 오면 그 줄을 먼저 본다.
- 실서버로 바꿀 때는 같은 필드 목록을 실서버 응답에 대 보면 된다.

## 상단바 공통 상태 (서비스 · 시간 범위 · 새로고침)

상단바의 서비스 선택 · 시간 범위(5m · 15m · 1h · 6h · 24h · 사용자 지정) · 자동 새로고침 주기는 `src/stores/filters.ts` 한 곳에 있고 주소와 맞춰진다.
`?service=shop-order&range=1h&refresh=30` 처럼 링크를 공유하면 같은 화면이 열린다. 화면이 쓰는 다른 쿼리(예: `tab`)는 그대로 둔다.

화면에서는 이렇게 쓴다. 시간 창을 `queryKey` 에 넣으면 자동 새로고침 때마다 다시 불린다.

```tsx
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { useServiceName, useTimeWindow } from '@/stores'

const serviceName = useServiceName() // null = 전체
const { from, to } = useTimeWindow() // UTC ISO, 명세 공통 파라미터 그대로
const { data } = useQuery({
  queryKey: ['server-map', serviceName, from, to],
  queryFn: () => api.get('/server-map', { query: { service_name: serviceName, from, to } }),
  placeholderData: keepPreviousData, // 새로고침 때 화면이 비지 않게
})
```

- 서비스가 꼭 필요한 문(`/traces/scatter` 등)인데 "전체"면 화면에서 "서비스를 선택하세요" 안내를 띄운다.
- 자동 새로고침은 탭이 숨겨지면 멈추고, 사용자 지정(고정 시각) 범위에서는 돌지 않는다.

## 차트

차트는 ECharts 를 `@/shared` 의 `EChart` 로만 그린다. 06 P5 차트 규약(축 글자 · 격자 · 툴팁)이 테마로 자동 적용된다.
캔버스는 CSS 변수를 못 읽으므로 색은 `chartColors()` 가 풀어 둔 값을 쓴다.

```tsx
import { chartColors, EChart } from '@/shared'

const c = chartColors()
<EChart
  aria-label="응답시간 스캐터"
  option={{ xAxis: { type: 'time' }, yAxis: { type: 'value' }, series: [{ type: 'scatter', itemStyle: { color: c.scatter.ok }, data }] }}
/>
```

- 히트맵은 `heatmapVisualMap()` · `heatmapStep()` 으로 06 P5 농도 5단계 + 에러 색을 칠한다.
- 새 차트 종류 · 부품(범례 · 확대 등)이 필요하면 `src/shared/charts/echarts.ts` 에 등록한다 (번들 크기 때문에 쓰는 것만).
- ECharts 는 `vendor-echarts` 파일로 떨어져 있고, 차트를 쓰는 화면에서만 내려받는다. Service map 그래프(React Flow)도 `vendor-xyflow` 로 따로 떨어진다. React 는 `vendor-react` 로 떨어져 배포가 바뀌어도 브라우저 캐시를 그대로 쓴다.

## 로그인 · 권한

백엔드 명세(monimo-backend `docs/design/web-v2/api-spec.md` §0)를 따른다.

- `/login` 에서 로그인하면 access 토큰은 메모리에 두고, refresh 토큰은 서버가 httpOnly 쿠키(`monimo_refresh`)로 심는다 — 화면은 갖지 않는다. 모든 요청에 `Authorization: Bearer` 가 붙고, 쿠키는 재발급 · 로그아웃에만 붙는다(같은 출처여야 한다. 개발은 vite 프록시).
- 요청이 401 이면 refresh 로 한 번 재발급하고 다시 보낸다 (동시에 여러 개여도 재발급은 1번). 재발급도 실패하면 로그인 화면으로 가며 "세션 만료" 배너가 뜬다.
- 로그인하지 않고 화면 주소로 들어오면 `/login?next=<원래 주소>` 로 가고, 로그인 뒤 원래 주소로 돌아온다.
- 화면에서 역할은 `useAuth()` 의 `isAdmin`, ADMIN 전용 버튼은 `<AdminOnly>` 로 감싼다. **이건 화면을 가리는 편의 기능이고, 실제로 막는 것은 API server 다.**
- API 응답은 명세 봉투(`{ data }` · `{ error: { code, message } }`)를 `api.get` 등이 벗겨서 돌려준다. 목록은 `api.getPage` 가 `{ items, nextCursor }` 로 준다.

## 화면 경로

화면 하나 = `src/features/<폴더>/` 하나 = 경로 하나. 메뉴 · 상단바 제목은 `src/app/screens.tsx`, 경로는 `src/app/routes.tsx` 에서 정한다. 화면 코드는 경로별로 따로 내려받는다.
화면마다 고른 값(탭 · 필터 · 열린 상세)도 주소에 둬서, 새로고침하거나 링크를 공유해도 같은 화면이 열린다.

| 경로 | 화면 | 주소에 두는 값 | 폴더 |
|---|---|---|---|
| `/server-map` (첫 화면) | Service map — 서비스 그래프 · 고른 노드의 호출 수 · 응답시간 스캐터 · 상위 URL · 발화 중 경보 띠 | `service` | `features/server-map` |
| `/transactions` | 트랜잭션 — 스캐터/히트맵 드래그 → 목록 · URL 통계 | `tab` | `features/transactions` |
| `/inspector` | Inspector — 파드 목록 · CPU/힙/GC/스레드 차트 · 지표 추가 · **스레드 덤프 탭**(요청 모달 · 스레드 표 · 스택) | `agent` `status` `m` `tab=dumps` `dump` `dagent` `period` | `features/inspector` |
| `/errors` | 에러 — 시간대별 에러 막대(누르면 표가 그 칸만) · 실패 스팬 표 | `agent` `status` `exception` `at` | `features/errors` |
| `/logs` | 로그 — 레벨 · 로거 · trace_id · 검색어 · 더 보기 | `agent` `level` `logger` `trace_id` `q` | `features/logs` |
| `/alerts` | 경보 — 이벤트(상세 드로어 · 발송 이력) · 규칙(켜기/끄기 · 만들기/수정) · 채널(테스트 발송) | `tab` `state` `severity` `event` `enabled` `rule` `type` `channel` | `features/alerts` |
| `/settings` | 설정 — 감시 대상 서비스 · 샘플링률(낙관적 잠금) · 에이전트 부착 · 계정 | `app` | `features/settings` |
| (모든 화면) | 트레이스 상세 드로어 — 스팬 트리 · 타임라인 · 스팬 상세 · 연결 로그 | `trace` | `features/trace-detail` · `shared/trace` |
| `/login` | 로그인 (셸 없음, 로그인 없이 들어감) | `next` `expired` | `features/login` |
| `/design-system` | 디자인 시스템 미리보기 (메뉴에 없음, 로그인 없이 들어감) | — | `app/DesignSystemPreview.tsx` |

화면 규칙

- API 는 `@/api` 의 `api.get` 등만 쓰고 fetch 를 직접 쓰지 않는다. 실패는 `ApiError(status · code · message)` 로 온다.
- 서버 데이터는 TanStack Query(`useQuery` · `useMutation`)로 가져온다.
- 부품 · 레이아웃 · 상태색은 `@/design-system` 에서 가져다 쓴다 (06 패턴: `TableCard` · `FormCard` · `severityTone` ...).

## 환경변수

실제 값은 레포에 올리지 않는다. `.env.example` 에 이름만 적는다.

| 이름 | 설명 |
|---|---|
| `VITE_API_BASE` | API 주소 앞부분 (기본 `/api/v1`) |
| `VITE_API_MOCK` | `true` 면 개발 서버에서 가짜 응답 사용 (기본 `false`) |
| `VITE_COLLECTOR_ENDPOINT` | 설정 화면 「에이전트 부착」 명령에 보이는 Collector OTLP 주소 (기본 `https://collector.monimo.dev:4317`) |

## 포트

| 서비스 | 포트 |
|---|---|
| 개발 서버 (Vite) | 5173 |
| api-server (monimo-backend) | 8080 |

## 관련 문서

- [설계 문서 (결정 기록 원본)](https://github.com/2026-techeer-project-team-b/monimo-backend/tree/main/docs/design): monimo-backend 레포의 `docs/design/`
- [레포별 파일 구성](https://app.notion.com/p/3e1d7d6851ff80a8a110e8aea0b5783b)
- [깃허브 레포지토리 규칙](https://app.notion.com/p/3dcd7d6851ff8000b795f1cc609124e6)

## 기여 규칙

- 브랜치 전략: 기능 브랜치 → `develop`(기본 브랜치, 작업을 모으는 곳) → 배포 단위로 `develop` → `main`
- `main` · `develop` 직접 push 금지, PR로만 머지. PR 의 base 는 기본값(`develop`) 그대로 두면 된다
- 브랜치: `feat/<이슈번호>-<설명>` · `fix/<이슈번호>-<설명>` · `chore/<설명>`
- 커밋: `<타입>(<범위>): <요약>` (타입: feat · fix · docs · chore · refactor · test)

## AI 와 일한 방법 (승조가 만든 부분)

화면 담당은 4명 공동이지만, 지금까지의 코드(`#1` ~ `#66`, 2026-09-22 ~ 10-03)는 승조(`@SeungJo-02`)가 AI(Claude Code)와 함께 만들었다. 규칙은 [`AGENTS.md`](AGENTS.md), 절차 · 역할 분담 · 토큰 기준값 · AI 가 틀린 것과 잡은 방법은 `monimo-backend` 의 [`docs/seungjo/harness.md`](https://github.com/2026-techeer-project-team-b/monimo-backend/blob/HEAD/docs/seungjo/harness.md)(정본, 한 곳에만 둔다), 이 레포에서 무엇을 어떻게 물었는지는 [`docs/prompts/`](docs/prompts/README.md) 에 있다. 다른 팀원이 작업을 시작하면 그 방식은 각자 적는다.
