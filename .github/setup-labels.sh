#!/usr/bin/env bash
# PR 라벨 워크플로가 쓰는 라벨을 이 레포에 한 번에 만든다. 이미 있으면 색상 · 설명만 갱신한다.
# 실행: ./.github/setup-labels.sh   (gh auth login 필요)
set -euo pipefail

# 이름:색상(hex, # 없이):설명
LABELS=(
  "type/feature:0E8A16:새 기능 추가"
  "type/bug:D73A4A:버그 / 오류"
  "type/refactor:FBCA04:리팩토링 (동작 변경 없음)"
  "type/docs:0075CA:문서"
  "type/test:BFD4F2:테스트"
  "type/chore:CFD3D7:빌드/설정/잡일"
  "type/ci:CFD3D7:CI / 배포"
  "type/style:E4E669:코드 스타일 (포맷)"
  "type/perf:5319E7:성능 개선"
  "size/XS:3CBF00:변경 <10줄"
  "size/S:5FE800:변경 <50줄"
  "size/M:FBCA04:변경 <200줄"
  "size/L:FF9F00:변경 <500줄"
  "size/XL:E11D21:변경 ≥500줄"
  "area/server-map:C5DEF5:Service map 화면"
  "area/transactions:C5DEF5:트랜잭션 화면"
  "area/trace-detail:C5DEF5:트레이스 상세 드로어"
  "area/inspector:C5DEF5:Inspector 화면"
  "area/errors:C5DEF5:에러 화면"
  "area/logs:C5DEF5:로그 화면"
  "area/alerts:C5DEF5:경보 화면"
  "area/settings:C5DEF5:설정 화면"
  "area/platform:C5DEF5:플랫폼 상태 화면"
  "area/api:1D76DB:API 호출 (src/api)"
  "area/shared:D4C5F9:화면 공용 코드 (src/shared)"
  "area/design-system:D4C5F9:디자인 시스템 (src/design-system)"
  "area/build:FEF2C0:빌드 · 의존성 · Docker"
  "area/ci:CFD3D7:CI · GitHub 설정"
  "area/docs:0075CA:문서"
)

for entry in "${LABELS[@]}"; do
  IFS=":" read -r name color desc <<< "$entry"
  if gh label create "$name" --color "$color" --description "$desc" --force >/dev/null 2>&1; then
    echo "✓ $name"
  else
    echo "✗ $name (실패)"
  fi
done
