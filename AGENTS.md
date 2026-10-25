# AGENTS.md — 작업을 시작하기 전에 읽는 파일

> **사람이든 AI 도구든, 이 레포에서 무언가를 고치기 전에 이 파일을 먼저 읽는다.**
> 레포 구조, 깨면 안 되는 규칙, 지금까지 한 일, 지금 막혀 있는 것이 들어 있다.
> 백엔드 짝 문서는 monimo-backend 의 `AGENTS.md` 다. 화면이 부르는 API 의 사정은 거기 §6 에 있다.
>
> 작업을 끝내면 **§5(지금까지 한 일)와 §6(막혀 있는 것)을 갱신해서 같은 PR 에 넣는다.**

## 0. 정본이 어디인가

| 무엇 | 정본 | 여기서 쓰는 곳 |
|---|---|---|
| API 명세 | monimo-backend `docs/design/web-v2/api-spec.md` (노션 「API 명세」와 같이 고친다) | `src/api/*.ts` 타입 · 가짜 응답 · 계약 테스트 |
| 화면 시안 | monimo-backend `docs/design/web-v2/artboards/*.dc.html` · `shots/*.png` | 화면 배치 · 문구 |
| 화면 목록 | monimo-backend `docs/design/web-v2/ia.md` (S00~S10) | `src/app/screens.tsx` |
| 디자인 토큰 · 부품 | Figma 「디자인 시스템」 01~06 | `src/design-system/` |
| 명세 빈칸을 프론트가 채운 것 | 이슈 #60 | 가짜 응답 · 계약 테스트의 「가정」 |

**명세는 백엔드가 구현하면서 계속 바뀐다.** 작업을 시작하기 전에 백엔드 레포에서 `git log -- docs/design/web-v2/api-spec.md` 로 바뀐 게 있는지 먼저 본다. 2026-09-27 에 서비스 제외가 "409" 에서 논리 삭제로 바뀐 걸 늦게 알아 한 번 되돌린 적이 있다 (#65).

## 1. 레포 한눈에

React 19 · TypeScript(strict) · Vite 8 · React Router · TanStack Query 5 · Zustand · ECharts 6 · React Flow · MSW 2 · vitest · oxlint.

```bash
npm install
VITE_API_MOCK=true npm run dev   # 백엔드 없이 가짜 응답으로. http://localhost:5173
npm run lint                     # 코드 검사 (디자인 시스템 경계 포함)
npm test                         # 계산 테스트 + 가짜 응답 ↔ 명세 계약 테스트
npm run build                    # 타입 검사 + 빌드
```

가짜 응답 데모 계정은 `admin@monimo.io` (ADMIN) · `viewer@monimo.io` (VIEWER), 비밀번호는 `src/api/mocks/common.ts` 의 `PASSWORD`. 콘솔 명령(`__monimoMock.*`)과 일부러 넣어 둔 장면은 README 「가짜 응답」 절.

| 폴더 | 하는 일 |
|---|---|
| `src/design-system/` | 토큰 · 아이콘 · 부품 · 패턴. 화면을 모른다. 밖에서는 `@/design-system` 으로만 |
| `src/features/<화면>/` | 화면 하나 = 폴더 하나 = 경로 하나. 경로별로 따로 내려받는다 |
| `src/api/` | API 함수(명세 1문 = 함수 1개) · 요청 모듈(`client.ts`) · 가짜 응답(`mocks/`) · 계약 테스트 |
| `src/shared/` | 여러 화면이 같이 쓰는 앱 코드: 차트 틀(`charts/`) · 트레이스 드로어(`trace/`) · 로그 표(`logs/`) |
| `src/stores/` | 상단바 공통 값(서비스 · 시간 범위 · 새로고침), 주소와 맞춘다 |
| `src/auth/` · `src/app/` | 로그인 · 권한 / 경로 · 앱 셸 · 사이드바 Watchdog 카드 |

## 2. 깨면 안 되는 규칙

- **디자인 시스템은 화면 코드를 가져다 쓰지 않는다.** `shared` 도 `features` · `app` 을 가져다 쓰지 않는다. `npm run lint` 가 막는다.
- **색 · 간격은 토큰 변수만.** hex · px 를 직접 쓰지 않고, 화면에서는 의미 색(`--color-*`)만 쓴다. 차트(캔버스)는 CSS 변수를 못 읽으니 `chartColors()` · `resolveColor()` 로 푼 값을 쓴다.
- **API 는 `@/api` 함수로만 부른다.** fetch 를 직접 쓰지 않는다. 새 문을 붙이면 `src/api/<도메인>.ts` 에 함수, `mocks/<도메인>.ts` 에 가짜 응답, `contract.test.ts` 에 명세 필드 한 줄을 같이 넣는다.
- **가짜 응답은 명세를 따른다.** 명세에 없는 값을 쓰면 #60 에 한 줄 적고 계약 테스트 이름에 「가정」 을 붙인다. 가짜 응답만 편하게 바꾸면 실서버에서 화면이 깨진다.
- **화면이 고른 값(탭 · 필터 · 열린 상세)은 주소 쿼리에 두고 `replace` 로 바꾼다.** 뒤로가기가 필터를 하나씩 되돌리지 않게. 부작용이 있는 모달(덤프 요청 등)은 주소에 두지 않는다.
- **시간 창(`from` · `to`)은 `queryKey` 에 넣는다.** 자동 새로고침이 그걸로 돈다. 새로고침 때 화면이 비지 않게 `placeholderData` 를 쓰되, 서비스 · 파드가 바뀐 뒤 이전 값이 남아 보이지 않는지 확인한다.
- **첫 화면 번들(gzip)은 PR 마다 +1 kB 안으로.** 재는 법: `npm run build` 뒤 `dist/index.html` 이 부르는 js 파일들을 gzip 해서 더한다. 앱 셸(`AppLayout`)에서는 `@/shared` 대신 `@/shared/trace` 처럼 하위 경로를 가져온다. barrel(`@/shared`)이 ECharts 까지 끌고 온다.
- **`<AdminOnly>` 는 버튼을 숨기는 편의 기능이다.** 실제로 막는 건 API server 다. VIEWER 로도 한 번 눌러 본다.
- **비밀값은 레포에 올리지 않는다.** `.env.example` 에 이름만. 레포는 퍼블릭이다.

## 3. 작업 흐름

1. 이슈를 먼저 만든다. 라벨은 `area/<화면>` (labeler 가 PR 에도 붙인다).
2. **브랜치는 항상 `origin/develop` 에서 새로 판다.** `feat/<이슈번호>-<설명>` · `fix/…` · `docs/…`. 앞 PR 위에 쌓지 않는다. 스쿼시 머지라 쌓은 PR 의 커밋이 main 에 안 들어간 적이 있다 (#15 → #16).
3. 커밋은 `<타입>(<범위>): <요약> (#이슈)`. 타입은 feat · fix · docs · chore · refactor · test (PR 제목 접두어로 `type/*` 라벨이 붙는다).
4. 확인: `npm run lint` · `npm test` · `npm run build` · 첫 화면 번들 · 가짜 응답으로 브라우저에서 ADMIN 과 VIEWER 둘 다.
5. PR 본문에 무엇을 · 왜 · 어떻게 확인했는지(실제 수치), 명세와 다르게 정한 것, `closes #번호`.
6. CI(`build` 안에 lint · test · build, 라벨 3종) 통과 뒤 스쿼시 머지. PR 의 base 는 `develop`(기본 브랜치)이고, `main` 은 배포 단위로 `develop` 에서 한 번에 올린다 (그때는 머지 커밋).
7. `main` · `develop` 직접 push 는 막혀 있다.

## 4. 담당

화면은 4명 공동(CODEOWNERS `*`). 화면 담당이 정해지면 `src/features/<화면>/` 별로 나눈다. 화면이 부르는 API 의 주인은 백엔드 파트를 따른다 (2026-09-23 확정).

| 파트 | 담당 | 화면에서 부르는 문 |
|---|---|---|
| 수집 · 배포 | 승조 `@SeungJo-02` | (직접 부르는 문 없음) 지표 이름 형식 · 덤프 본문 형식 · 게이트웨이 설정 |
| 알림 | ukong `@ukongee` | 경보 이벤트 · 규칙 · 채널 |
| 조회 | Nova `@hyl1115` | Service map · 스캐터 · 히트맵 · 트랜잭션 · 트레이스 · 에러 · 로그 · 지표 |
| 인증 설정 | 재범 `@jaebeom79` | 로그인 · 서비스 · 샘플링 설정 · 스레드 덤프 · Watchdog |

## 5. 지금까지 한 일

2026-09-22 ~ 09-30, 승조가 순서대로 만들었다. 모든 화면은 가짜 응답(MSW)으로 돈다. 실서버 연결은 아직이다.

| 단계 | 한 일 | PR |
|---|---|---|
| 개발 환경 | Vite · React · TS 뼈대, 토큰, 경계 검사, CI, 라벨 자동화 | #1 #2 #3 |
| 1 디자인 시스템 | Figma 01~06 을 코드로 1:1. 색 토큰 두 층, 아이콘 29, 부품 폴더 25개(기본 9 · 확장 16), 패턴 6 | #5 ~ #18 |
| 2 앱 기반 | 경로 · 앱 셸 · 요청 모듈(401 이면 한 번 재발급) · 로그인 · 역할 · 상단바 공통 값(주소 동기화) | #20 #22 #24 |
| 3 화면 | Service map, 트랜잭션, 트레이스 드로어, 에러, 로그, 경보 3탭, Inspector · 스레드 덤프, 설정, 플랫폼 상태(#75 로 뺌) | #26 ~ #58 |
| 3 통합 점검 | 시연 시나리오 5개 × ADMIN · VIEWER, 에러 막대 → 표 필터, README | #64 |
| 테스트 | vitest 계약 테스트 25 + 계산 테스트 21, CI 에 테스트 단계. 서비스 제외 명세 변경(논리 삭제)에 맞춤 | #65 |
| 3 백엔드 대조 | Figma 15화면을 백엔드 실제 구현과 대조해 고치고(Figma 「변경 기록」 프레임), 코드를 거기에 맞춤 — Watchdog 180초 · 1분, 쇼핑몰 4서비스(shop-user 없음), 소프트 삭제, 로그 FATAL · 빈값, `jvm.gc.duration.sum`, 덤프 팬아웃, 준비 판정 `/actuator/health/readiness`. 플랫폼 상태 화면 몫은 `#75` 가 그 화면을 빼면서 같이 빠졌다 | #82 |

화면별로 주소에 두는 값은 README 「화면 경로」 표에 있다.

README 「AI 와 일한 방법」 절과 `docs/prompts/`(프롬프트 로그 : 코드와 같은 PR 에)를 두었다. 하네스 정본은 backend `docs/seungjo/harness.md` 한 곳이고 여기서는 링크만 한다.
- 2026-10-26 문서 · 주석의 우리말 조어를 현업 이름으로 바꿨다 (backend `#240` · ADR `#73`). 코드 안 문자열(화면 문구 · Slack 경보 · 테스트 이름)은 backend `#241`

## 6. 지금 막혀 있는 것

| 무엇 | 누가 풀어야 하나 | 안 풀면 |
|---|---|---|
| 명세 빈칸 19곳을 프론트가 정해 둔 것 | 각 파트 (#60 의 "누가" 칸) | 백엔드 구현이 다르면 그 화면이 깨진다. 댓글로 알려 달라고 해 뒀다 |
| 배포 결과물에 `mockServiceWorker.js` 가 들어간다 · CSP 없음 | web (#63) | 개발용 파일이 운영에 나간다 |
| 상단바 사용자 지정 범위에 7일 상한이 없다 (명세 §0 은 넘으면 422) | web (#62) | 긴 범위를 고르면 화면이 오류로 비어 보인다 |

## 7. 알아 두면 덜 헤매는 것

- **개발 모드에서 차트가 두 번 만들어진다** (React StrictMode). 드래그(brush) 같은 명령은 새 인스턴스마다 다시 켠다 (`transactions/BrushChart.tsx` 의 `chartGen`).
- **숨은 탭에서는 ECharts 첫 애니메이션과 TanStack Query 주기 재조회가 멈춘다.** 자동화 브라우저로 확인할 때 막대 높이가 0 이거나 값이 안 바뀌면 탭이 숨은 것이다. 화면을 앞으로 가져오면 돈다.
- **가짜 응답은 같은 분이면 같은 값이다** (정해진 난수). Service map 빨간 점 = 트랜잭션 실패 = 에러 표 = ERROR 로그로 숫자가 맞게 만들어 뒀으니, 한쪽만 고치면 화면끼리 어긋난다.
- **가짜 응답 순서가 중요한 곳**: `/traces/:traceId` 는 `/traces/scatter` 등보다 뒤에 둔다 (`mocks/handlers.ts`). 앞에 두면 `scatter` 를 trace id 로 잡는다.
- **만들기 · 수정한 가짜 데이터는 메모리에만 있다.** 새로고침하면 처음으로 돌아간다.
- **계약 테스트는 Node 에서 돈다.** 브라우저에만 있는 것(`window` · `sessionStorage`)을 가짜 응답이나 `src/api` 에서 쓰면 테스트가 깨진다. 없을 때 대신할 길을 둔다 (`mocks/handlers.ts` 의 refresh 토큰 보관 참고).
- 시안의 값 중 줄 문이 없는 것(단계별 카나리 시각, 힙 한도선, 유입량)은 화면에서 빼거나 대신 그렸다. 어떤 걸 뺐는지는 각 PR 본문과 #60 에 있다.

## 8. 참고

- 로컬 실행 · 가짜 응답 · 화면 경로 · 테스트 · 환경변수: `README.md`
- 명세 빈칸과 담당: 이슈 #60, 후속: #62 (화면) · #63 (보안 · 배포)
- 백엔드 사정: monimo-backend `AGENTS.md` §6
