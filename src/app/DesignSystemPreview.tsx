// 디자인 시스템 미리보기 (/design-system). Figma 「디자인 시스템」 과 눈으로 대조하는 용도. 사이드바에는 없다.
import { useState } from 'react'
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Chip,
  CodeBlock,
  Drawer,
  Field,
  FormCard,
  IconAlerts,
  IconError,
  IconInspector,
  IconLogs,
  IconPlatform,
  IconServerMap,
  IconPlus,
  IconSettings,
  IconTransactions,
  Input,
  CursorPager,
  KPICard,
  PageGrid,
  PageGridItem,
  alertStateTone,
  chartTheme,
  formatTime,
  heatmapLevel,
  httpStatusTone,
  podStatusTone,
  serviceColor,
  severityTone,
  shortId,
  ToastViewport,
  TableCard,
  Modal,
  Pagination,
  Segmented,
  Select,
  Sidebar,
  SidebarStatusCard,
  Slider,
  StatusBadge,
  StatusDot,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  Textarea,
  Toast,
  Topbar,
  type Tone,
} from '@/design-system'
import { ChartPreview } from './ChartPreview'

const TONES: Tone[] = ['ok', 'warn', 'crit', 'muted', 'accent']

const NAV = [
  { key: 'server-map', label: 'Service map', icon: <IconServerMap /> },
  { key: 'transactions', label: '트랜잭션', icon: <IconTransactions /> },
  { key: 'inspector', label: 'Inspector', icon: <IconInspector /> },
  { key: 'error', label: '에러', icon: <IconError /> },
  { key: 'logs', label: '로그', icon: <IconLogs /> },
  { key: 'alerts', label: '경보', icon: <IconAlerts />, count: 3 },
  { key: 'settings', label: '설정', icon: <IconSettings /> },
  { key: 'platform', label: '플랫폼 상태', icon: <IconPlatform /> },
]

export function DesignSystemPreview() {
  const [on, setOn] = useState(true)
  const [active, setActive] = useState('server-map')
  const [range, setRange] = useState('1h')
  const [tab, setTab] = useState('overview')
  const [chips, setChips] = useState<Record<string, boolean>>({ all: true, ok: true, warn: false, crit: false })
  const [ratio, setRatio] = useState(60)
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState(0)
  const row = { display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-5)' } as const

  return (
    <div style={{ padding: 'var(--space-5)' }}>
      <h1 className="text-title-20" style={{ marginBottom: 'var(--space-5)' }}>05-A 기본 컴포넌트</h1>

      <div style={row}>
        <Button variant="primary">버튼</Button>
        <Button variant="secondary">버튼</Button>
        <Button variant="danger">버튼</Button>
        <Button variant="secondary" icon={<IconSettings />}>아이콘 버튼</Button>
        <Button variant="primary" disabled>비활성</Button>
      </div>

      <div style={row}>
        {TONES.map((t) => <Badge key={t} tone={t}>LABEL</Badge>)}
      </div>

      <div style={row}>
        {TONES.map((t) => <StatusDot key={t} tone={t} />)}
      </div>

      <div style={row}>
        <Input defaultValue="값" />
        <Input placeholder="플레이스홀더" />
        <Select defaultValue="all" aria-label="범위">
          <option value="all">전체</option>
          <option value="shop-order">shop-order</option>
        </Select>
        <Switch checked={on} onChange={setOn} aria-label="토글" />
        <Switch checked={false} aria-label="꺼짐" />
      </div>

      <div style={row}>
        <Card title="카드 제목" style={{ width: 320 }} />
        <Card title="액션 있는 카드" actions={<Button>내보내기</Button>} style={{ width: 360 }}>
          <p className="text-body-13" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>본문 내용</p>
        </Card>
      </div>

      <h1 className="text-title-20" style={{ marginBottom: 'var(--space-5)' }}>05-B 확장 컴포넌트 (1/2)</h1>

      <div style={row}>
        <Button variant="primary" icon={<IconPlus />}>새 규칙</Button>
        <Button variant="primary" size="lg" icon={<IconPlus />}>새 규칙</Button>
        <Button variant="secondary" size="lg" icon={<IconSettings />}>설정</Button>
        <Button variant="danger" size="lg">삭제</Button>
        <Button variant="primary" disabled icon={<IconPlus />}>비활성</Button>
      </div>

      <div style={row}>
        {TONES.map((t) => <StatusBadge key={t} tone={t}>FIRING</StatusBadge>)}
      </div>

      <div style={row}>
        {(['all', 'ok', 'warn', 'crit'] as const).map((k) => (
          <Chip key={k} tone={k === 'all' ? 'default' : k} selected={chips[k]} onChange={(v) => setChips({ ...chips, [k]: v })}>
            {k === 'all' ? '전체' : k.toUpperCase()}
          </Chip>
        ))}
      </div>

      <div style={row}>
        <Segmented
          aria-label="시간 범위"
          value={range}
          onChange={setRange}
          options={['5m', '15m', '1h', '6h', '24h', '사용자 지정'].map((v) => ({ value: v, label: v }))}
        />
        <Tabs
          aria-label="트랜잭션 보기"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: '개요' },
            { value: 'spans', label: '스팬 타임라인' },
            { value: 'sql', label: 'SQL · 로그' },
          ]}
        />
      </div>

      <div style={{ ...row, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Checkbox defaultChecked>SLACK 채널로 보내기</Checkbox>
          <Checkbox>이메일로 보내기</Checkbox>
          <Checkbox disabled>비활성</Checkbox>
        </div>
        <Textarea defaultValue="경보 발생 시 담당자에게 전달할 메모를 적습니다." />
        <Slider value={ratio} onChange={setRatio} aria-label="샘플링 비율" />
      </div>

      <div style={{ ...row, alignItems: 'flex-start' }}>
        <Field label="임계값 (ms)" htmlFor="f-threshold" help="P95 기준으로 이 값을 넘으면 경보가 발생합니다.">
          <Input id="f-threshold" defaultValue="500" />
        </Field>
        <Field label="임계값 (ms)" htmlFor="f-threshold-err" error="값을 입력해 주세요. 1 이상의 정수만 됩니다.">
          <Input id="f-threshold-err" aria-invalid />
        </Field>
        <Pagination start={(page - 1) * 20 + 1} end={Math.min(page * 20, 184)} total={184} onPrev={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />
      </div>

      <h1 className="text-title-20" style={{ marginBottom: 'var(--space-5)' }}>05-B 확장 컴포넌트 (2/2)</h1>

      <div style={{ ...row, alignItems: 'flex-start' }}>
        <div style={{ width: 720, border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>서비스</TableHeaderCell>
                <TableHeaderCell>트레이스 ID</TableHeaderCell>
                <TableHeaderCell align="right">건수</TableHeaderCell>
                <TableHeaderCell>상태</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {[0, 1, 2].map((i) => (
                <TableRow key={i} selected={selectedRow === i} onClick={() => { setSelectedRow(i); setDrawerOpen(true) }}>
                  <TableCell>shop-order</TableCell>
                  <TableCell type="mono">a3f1…9c2e</TableCell>
                  <TableCell type="number">1,284</TableCell>
                  <TableCell type="badge"><Badge tone="crit">CRITICAL</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', width: 500 }}>
          <KPICard label="P95 응답시간" value="482 ms" delta="0%" caption="정상 범위" />
          <KPICard label="P95 응답시간" value="482 ms" delta="-12%" caption="전일 대비 개선" tone="ok" />
          <KPICard label="P95 응답시간" value="482 ms" delta="+18%" caption="임계값 초과" tone="crit" />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: 600, marginBottom: 'var(--space-5)' }}>
        {(['info', 'ok', 'warn', 'crit'] as const).map((t) => (
          <Banner key={t} tone={t} action={<a href="#detail">자세히</a>}>안내 문구</Banner>
        ))}
      </div>

      <div style={{ ...row, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Toast tone="ok" onClose={() => {}}>알림 문구</Toast>
          <Toast tone="crit" onClose={() => {}}>알림 문구</Toast>
        </div>
        <CodeBlock style={{ width: 440 }}>{`java.lang.IllegalStateException: order already settled
  at shop.order.OrderService.settle(OrderService.java:142)
  at shop.order.OrderController.post(OrderController.java:58)`}</CodeBlock>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Button variant="primary" onClick={() => setModalOpen(true)}>모달 열기</Button>
          <Button onClick={() => setDrawerOpen(true)}>드로어 열기</Button>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="덤프 내려받기"
        footer={<><Button onClick={() => setModalOpen(false)}>취소</Button><Button variant="primary" onClick={() => setModalOpen(false)}>저장</Button></>}
      >
        <div className="text-caption-12" style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-surface-2)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)' }}>
          본문 슬롯 — 폼 · 표 · 안내 문구를 넣는다
        </div>
      </Modal>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="트레이스 상세">
        <div className="text-caption-12" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-surface-2)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)' }}>
          본문 슬롯 — 스팬 목록 · 속성 표 · 로그를 넣는다
        </div>
      </Drawer>

      <h1 className="text-title-20" style={{ marginBottom: 'var(--space-5)' }}>06 패턴</h1>

      <PageGrid style={{ marginBottom: 'var(--space-5)' }}>
        <PageGridItem span={8}>
          <TableCard
            title="최근 트랜잭션"
            actions={<Button>내보내기</Button>}
            summary="1,284건 · limit 50 · 커서 페이징"
            pager={<CursorPager hasPrev={page > 1} hasNext onPrev={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />}
          >
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>시각</TableHeaderCell>
                  <TableHeaderCell>trace_id</TableHeaderCell>
                  <TableHeaderCell>서비스</TableHeaderCell>
                  <TableHeaderCell align="right">http</TableHeaderCell>
                  <TableHeaderCell align="right">응답(ms)</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {[
                  [200, 'shop-order', 142],
                  [404, 'shop-gateway', 36],
                  [500, 'shop-inventory', 1204],
                ].map(([code, svc, ms], i) => (
                  <TableRow key={i}>
                    <TableCell type="mono">{formatTime(Date.UTC(2026, 8, 24, 5, 38, 12, 481 + i * 400))}</TableCell>
                    <TableCell type="mono" title="a3f1e2d4-5b6c-7d8e-9f00-11229c2e">{shortId('a3f1e2d4-5b6c-7d8e-9f00-11229c2e')}</TableCell>
                    <TableCell>{svc}</TableCell>
                    <TableCell type="number"><Badge tone={httpStatusTone(Number(code))}>{code}</Badge></TableCell>
                    <TableCell type="number">{ms}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </PageGridItem>
        <PageGridItem span={4}>
          <FormCard
            title="경보 규칙 수정"
            banners={<Banner tone="warn">409 CONFLICT · 다른 사용자가 먼저 저장했습니다. 판번호 v7 → v8, 최신 값을 불러온 뒤 다시 저장하세요.</Banner>}
            actions={<><Button variant="primary" type="submit">저장</Button><Button>취소</Button></>}
            permissionNote="VIEWER는 읽기만 · 변경은 ADMIN"
          >
            <Field label="규칙 이름" htmlFor="p6-name"><Input id="p6-name" defaultValue="5XX 비율" /></Field>
            <Field label="임계값 (%)" htmlFor="p6-th" error="0 보다 큰 숫자를 넣어 주세요."><Input id="p6-th" aria-invalid /></Field>
          </FormCard>
        </PageGridItem>
        <PageGridItem span={6}>
          <Card title="P4 상태색 규칙">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {['FIRING', 'RESOLVED'].map((v) => <Badge key={v} tone={alertStateTone(v)}>{v}</Badge>)}
              {['CRITICAL', 'WARNING', 'INFO'].map((v) => <Badge key={v} tone={severityTone(v)}>{v}</Badge>)}
              {['UP', 'DOWN', 'UNKNOWN'].map((v) => <Badge key={v} tone={podStatusTone(v)}>{v}</Badge>)}
            </div>
          </Card>
        </PageGridItem>
        <PageGridItem span={6}>
          <Card title="P5 차트 색">
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map((v) => <span key={v} style={{ width: 24, height: 24, background: heatmapLevel(v, 5) ?? undefined }} />)}
              <span style={{ width: 24, height: 24, background: chartTheme.heatmap.error }} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {['shop-gateway', 'shop-order', 'shop-payment'].map((svc, i) => (
                <span key={svc} className={chartTheme.axisTextClass} style={{ color: chartTheme.axisText, display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 'var(--radius-sm)', background: serviceColor(i) }} />{svc}
                </span>
              ))}
            </div>
          </Card>
        </PageGridItem>
      </PageGrid>

      <h2 className="text-section-15" style={{ marginBottom: 'var(--space-3)' }}>06 P5 차트 (ECharts 공용 틀)</h2>
      <ChartPreview />

      <ToastViewport>
        <Toast tone="ok" onClose={() => {}}>규칙을 저장했습니다 · 판번호 v8</Toast>
      </ToastViewport>

      <div style={{ display: 'flex', height: 960, border: '1px solid var(--color-border-default)' }}>
        <Sidebar
          items={NAV}
          activeKey={active}
          onSelect={setActive}
          footer={<SidebarStatusCard title="Watchdog · 카나리" tone="ok" value="63초 전" caption="정상 (기준 180초)" />}
        />
        <div style={{ flex: 1, background: 'var(--color-bg-canvas)' }}>
          <Topbar title="Service map" subtitle="서비스 간 호출 관계와 에러를 한눈에">
            <span className="text-caption-12" style={{ color: 'var(--color-text-tertiary)' }}>서비스</span>
            <Select defaultValue="shop-order" aria-label="서비스">
              <option value="shop-order">shop-order</option>
            </Select>
            <Segmented aria-label="시간 범위" value={range} onChange={setRange} options={['5m', '15m', '1h', '6h', '24h'].map((v) => ({ value: v, label: v }))} />
            <Button variant="secondary">30s</Button>
            <Badge tone="accent">ADMIN</Badge>
          </Topbar>
        </div>
      </div>
    </div>
  )
}
