import type { MouseEvent, ReactNode } from 'react'
import { cx } from '../../../cx'
import { StatusDot } from '../StatusDot'
import type { Tone } from '../Badge'
import './Sidebar.css'

export type SidebarItem = {
  key: string
  label: string
  /** 04 아이콘 컴포넌트 (16px) */
  icon?: ReactNode
  /** 우측 빨간 카운트 (경보 개수 등). 0 이거나 없으면 숨김 */
  count?: number
  /** 있으면 <a href>, 없으면 <button> */
  href?: string
}

export type SidebarProps = {
  /** 워드마크. 기본 MONIMO */
  brandName?: string
  brandCaption?: string
  items: SidebarItem[]
  activeKey?: string
  /** 클릭한 메뉴 key 와 이벤트. 라우터 링크로 쓸 때는 e.preventDefault() 후 navigate 한다 */
  onSelect?: (key: string, e: MouseEvent<HTMLElement>) => void
  /** 하단 슬롯. 보통 <SidebarStatusCard> */
  footer?: ReactNode
  className?: string
}

/**
 * Figma Shell/Sidebar — 앱 좌측 내비게이션 (폭 size/sidebar 고정 · bg/sidebar 다크).
 * 로그인 화면을 제외한 모든 화면에 쓴다. 메뉴 목록 · 활성 항목 · 클릭 처리는 전부 props (라우터를 모른다).
 */
export function Sidebar({
  brandName = 'MONIMO',
  brandCaption = 'Pinpoint형 APM · Self-monitoring',
  items,
  activeKey,
  onSelect,
  footer,
  className,
}: SidebarProps) {
  return (
    <aside className={cx('ds-sidebar', className)}>
      <div className="ds-sidebar__brand">
        <div className="ds-sidebar__brand-name text-mono-16-strong">{brandName}</div>
        <div className="ds-sidebar__brand-caption text-micro-11">{brandCaption}</div>
      </div>
      <nav className="ds-sidebar__nav">
        {items.map((item) => {
          const active = item.key === activeKey
          const cls = cx('ds-sidebar__item', active && 'ds-sidebar__item--active', active ? 'text-body-13-strong' : 'text-body-13')
          const inner = (
            <>
              <span className="ds-sidebar__icon">{item.icon}</span>
              <span className="ds-sidebar__label">{item.label}</span>
              {item.count ? <span className="ds-sidebar__count text-mono-11">{item.count}</span> : null}
            </>
          )
          return item.href ? (
            <a key={item.key} href={item.href} className={cls} aria-current={active ? 'page' : undefined} onClick={(e) => onSelect?.(item.key, e)}>
              {inner}
            </a>
          ) : (
            <button key={item.key} type="button" className={cls} aria-current={active ? 'page' : undefined} onClick={(e) => onSelect?.(item.key, e)}>
              {inner}
            </button>
          )
        })}
      </nav>
      {footer ? <div className="ds-sidebar__footer">{footer}</div> : null}
    </aside>
  )
}

export type SidebarStatusCardProps = {
  /** Micro/11 제목. 예: Watchdog · 카나리 */
  title: string
  tone: Tone
  /** Mono/12 값. 예: 63초 전 */
  value: string
  /** Caption/12 보조. 예: 정상 (기준 180초) */
  caption?: string
}

/** Figma Shell/Sidebar 하단 WatchdogCard. Sidebar 의 footer 슬롯에 넣는다. */
export function SidebarStatusCard({ title, tone, value, caption }: SidebarStatusCardProps) {
  return (
    <div className="ds-sidebar-status">
      <div className="ds-sidebar-status__title text-micro-11">{title}</div>
      <div className="ds-sidebar-status__row">
        <StatusDot tone={tone} className="ds-sidebar-status__dot" />
        <span className="ds-sidebar-status__value text-mono-12">{value}</span>
        {caption ? <span className="ds-sidebar-status__caption text-caption-12">{caption}</span> : null}
      </div>
    </div>
  )
}
