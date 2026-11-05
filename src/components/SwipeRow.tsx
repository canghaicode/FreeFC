// @title 滑动行:左滑内容,右侧露出操作区(如移除按钮)
import type {ITouchEvent} from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {ReactNode} from 'react'
import {memo, useRef, useState} from 'react'

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
  /** 触摸开始与结束时回调(父级用于触摸期间抑制页面滚动触发的自动收回) */
  onTouchActive?: () => void
  /** 横向手势锁定时回调(父级立刻收回其他已展开行) */
  onSwipeStart?: () => void
  children: ReactNode
}

/** 松手吸附:先快后慢 */
const SNAP = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)'

interface PaintStyle {
  transform: string
  transition: string
}

function isPaintStyle(style: object): style is PaintStyle {
  return 'transform' in style && 'transition' in style
}

/** 跟手只写节点 style,不走 setState,避免每帧重渲染头像等内容 */
function paintOf(node: unknown): PaintStyle | null {
  if (typeof node !== 'object' || node === null || !('style' in node)) return null
  const style = node.style
  if (typeof style !== 'object' || style === null || !isPaintStyle(style)) return null
  return style
}

/**
 * 手势:水平拖动跟手位移,垂直滚动不拦截(touch-action: pan-y);
 * 松手按是否过半吸附展开/收起,transition 提供先快后慢的回弹。
 */
export const SwipeRow = memo(function SwipeRow({open, onOpenChange, actionWidth = 80, actions, className = '', contentClassName = 'bg-card', disabled = false, onTouchActive, onSwipeStart, children}: SwipeRowProps) {
  const sheetRef = useRef<unknown>(null)
  const dragXRef = useRef(0)
  const draggingRef = useRef(false)
  const gesture = useRef<{startX: number; startY: number; baseX: number; horizontal: boolean | null} | null>(null)
  // 仅在松手吸附或直写失败时刷新,拖动过程不 setState
  const [epoch, setEpoch] = useState(0)

  const clamp = (x: number) => Math.max(-actionWidth, Math.min(0, x))

  const paint = (x: number, transition: string) => {
    const style = paintOf(sheetRef.current)
    if (!style) return false
    style.transition = transition
    style.transform = `translateX(${x}px)`
    return true
  }

  const onTouchStart = (e: ITouchEvent) => {
    onTouchActive?.()
    const t = e.touches[0]
    if (!t) return
    const baseX = open ? -actionWidth : 0
    dragXRef.current = baseX
    gesture.current = {startX: t.clientX, startY: t.clientY, baseX, horizontal: null}
  }

  const onTouchMove = (e: ITouchEvent) => {
    const g = gesture.current
    const t = e.touches[0]
    if (!g || !t) return
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY
    if (g.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      // 角度加严:水平分量需 2 倍于垂直(约 27° 内)才判为横向滑开;垂直同理;中间模糊带继续等待
      if (ax > ay * 2) {
        g.horizontal = true
        draggingRef.current = true
        const x = clamp(g.baseX + dx)
        dragXRef.current = x
        if (!paint(x, 'none')) setEpoch((n) => n + 1)
        onTouchActive?.()
        onSwipeStart?.()
      } else if (ay > ax * 2) {
        g.horizontal = false
      }
      return
    }
    if (!g.horizontal) return
    onTouchActive?.()
    const x = clamp(g.baseX + dx)
    if (x === dragXRef.current) return
    dragXRef.current = x
    if (!paint(x, 'none')) setEpoch((n) => n + 1)
  }

  const onTouchEnd = () => {
    onTouchActive?.()
    const g = gesture.current
    gesture.current = null
    if (!g || !g.horizontal) {
      draggingRef.current = false
      return
    }
    const from = dragXRef.current
    const shouldOpen = from <= -actionWidth / 2
    const finalX = shouldOpen ? -actionWidth : 0
    // 先挂上渐缓,下一帧再改目标,否则微信会把过渡和位移合成一次,动画被吃掉
    paint(from, SNAP)
    Taro.nextTick(() => {
      dragXRef.current = finalX
      draggingRef.current = false
      paint(finalX, SNAP)
      onOpenChange(shouldOpen)
      setEpoch((n) => n + 1)
    })
  }

  const follow = draggingRef.current
  const translateX = follow ? dragXRef.current : open ? -actionWidth : 0
  void epoch

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
        ref={sheetRef}
        className="relative"
        style={{
          transform: `translateX(${disabled ? 0 : translateX}px)`,
          transition: follow ? 'none' : SNAP,
          touchAction: 'pan-y',
          // 固定层级:避免浮起/放下时 zIndex 切换触发微信重建合成层,导致内部 Image 闪暗
          zIndex: 20
        }}
        onTouchStart={disabled ? undefined : onTouchStart}
        onTouchMove={disabled ? undefined : onTouchMove}
        onTouchEnd={disabled ? undefined : onTouchEnd}
        onTouchCancel={disabled ? undefined : onTouchEnd}
      >
        <div className={`overflow-hidden ${contentClassName} ${className}`}>{children}</div>
      </div>
    </div>
  )
})
