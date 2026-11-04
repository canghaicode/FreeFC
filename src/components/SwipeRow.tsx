// @title 滑动行:左滑内容,右侧露出操作区(如移除按钮)
import type {ITouchEvent} from '@tarojs/components'
import type {ReactNode} from 'react'
import {useRef, useState} from 'react'

interface SwipeRowProps {
  /** 当前是否展开操作区(由父级维护,多行互斥) */
  open: boolean
  /** 展开状态变化回调 */
  onOpenChange: (open: boolean) => void
  /** 滑出区宽度(px),默认 80 */
  actionWidth?: number
  /** 滑出区内容(通常为操作按钮) */
  actions: ReactNode
  /** 附加类名:圆角同时作用于外层裁切与内容层底色(如 rounded-2xl) */
  className?: string
  /** 内容层底色类名,默认 bg-card */
  contentClassName?: string
  /** 禁用滑动(无操作权限的行):不铺红色滑出层,不响应手势 */
  disabled?: boolean
  children: ReactNode
}

/**
 * 手势:水平拖动跟手位移,垂直滚动不拦截(touch-action: pan-y);
 * 松手按是否过半吸附展开/收起,transition 提供回弹动画。
 */
export function SwipeRow({open, onOpenChange, actionWidth = 80, actions, className = '', contentClassName = 'bg-card', disabled = false, children}: SwipeRowProps) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{startX: number; startY: number; baseX: number; horizontal: boolean | null} | null>(null)

  const onTouchStart = (e: ITouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    gesture.current = {startX: t.clientX, startY: t.clientY, baseX: open ? -actionWidth : 0, horizontal: null}
  }

  const onTouchMove = (e: ITouchEvent) => {
    const g = gesture.current
    const t = e.touches[0]
    if (!g || !t) return
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY
    if (g.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      g.horizontal = Math.abs(dx) > Math.abs(dy)
      if (g.horizontal) setDragging(true)
    }
    if (!g.horizontal) return
    // 仅向左露出右侧操作区,位移钳制 [-actionWidth, 0]
    setDragX(Math.max(-actionWidth, Math.min(0, g.baseX + dx)))
  }

  const onTouchEnd = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || !g.horizontal) {
      setDragging(false)
      return
    }
    setDragging(false)
    onOpenChange(dragX <= -actionWidth / 2)
    setDragX(0)
  }

  const translateX = dragging ? dragX : open ? -actionWidth : 0
  const lifted = dragging || open

  return (
    <div className={`relative shadow-elegant ${className}`}>
      {!disabled && (
        <div className={`absolute inset-0 bg-destructive ${className}`}>
          <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center" style={{width: actionWidth}}>
            {actions}
          </div>
        </div>
      )}
      <div
        className={`relative overflow-hidden ${contentClassName} ${className} ${lifted ? 'shadow-lg' : ''}`}
        style={{
          transform: `translateX(${disabled ? 0 : translateX}px)`,
          transition: dragging ? 'none' : 'transform 0.25s ease',
          touchAction: 'pan-y',
          zIndex: lifted ? 20 : undefined
        }}
        onTouchStart={disabled ? undefined : onTouchStart}
        onTouchMove={disabled ? undefined : onTouchMove}
        onTouchEnd={disabled ? undefined : onTouchEnd}
        onTouchCancel={disabled ? undefined : onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
