import type { ReactNode } from 'react'
import { cx } from '../../../cx'
import './Field.css'

export type FieldProps = {
  /** Caption/12 Medium 라벨 */
  label: ReactNode
  /** 안의 입력 id. <label htmlFor> 로 연결한다 */
  htmlFor?: string
  /** Caption/12 도움말 (text/tertiary) */
  help?: ReactNode
  /** 있으면 Figma `State=error`: 테두리 · 문구가 status/crit. 도움말 대신 보여준다 */
  error?: ReactNode
  /** Input · Select · Textarea 하나 */
  children: ReactNode
  className?: string
}

/**
 * Figma Field — 라벨 + 입력 + 도움말/오류 세트. 설정 · 규칙 편집 폼의 기본 단위.
 * 라벨 없이 입력만 필요하면 05-A Input 을 그대로 쓴다. 안의 입력에는 id 와 aria-invalid 를 화면이 넣는다.
 */
export function Field({ label, htmlFor, help, error, children, className }: FieldProps) {
  return (
    <div className={cx('ds-field', !!error && 'ds-field--error', className)}>
      <label htmlFor={htmlFor} className="ds-field__label text-caption-12-medium">{label}</label>
      {children}
      {error ? (
        <p role="alert" className="ds-field__message ds-field__message--error text-caption-12">{error}</p>
      ) : help ? (
        <p className="ds-field__message text-caption-12">{help}</p>
      ) : null}
    </div>
  )
}
