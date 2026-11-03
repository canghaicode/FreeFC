/**
 * 只读战术板视图：队员查看教练下发的战术图（线/标记/球员棋子）
 * 渲染逻辑与战术板绘制区一致（纯 DOM 旋转线段 + 棋子，weapp 不支持 SVG）
 * 容器固定 1.25 宽高比（与战术板球场一致），保证百分比坐标不变形
 */

import Taro from '@tarojs/taro'
import type {CSSProperties} from 'react'
import {useEffect, useState} from 'react'
import {CachedAvatarImage} from '@/components/Avatar'
import {TACTIC_LINE_TYPES} from '@/constants'
import type {TacticLine} from '@/db/types'

/** 战术球员棋子（教练放置，随战术保存） */
export interface TacticPlayer {
  id: string
  /** 0-100 百分比坐标 */
  x: number
  y: number
  label: string
  avatar_url?: string | null
}

interface TacticViewProps {
  /** 容器 DOM id（页面内需唯一，用于测量像素尺寸） */
  domId: string
  lines: TacticLine[]
  players?: TacticPlayer[]
  /** 场地视角：半场 / 全场 */
  viewMode?: 'half' | 'full'
  /** 所属分队名称 */
  team?: string
}

/** 战术线渲染：按像素尺寸把每段线段转成旋转 div */
function LineSegs({ln, size}: {ln: TacticLine; size: {w: number; h: number}}) {
  if (ln.points.length < 2 || !size.w || !size.h) return null
  const meta = TACTIC_LINE_TYPES.find((t) => t.key === ln.kind)
  const color = meta?.color || '#fff'
  const toPx = (pt: {x: number; y: number}) => ({px: (pt.x / 100) * size.w, py: (pt.y / 100) * size.h})
  const dash = ln.kind === 'pass' ? 'dashed' : ln.kind === 'defend' ? 'dotted' : 'solid'

  const segs: CSSProperties[] = []
  for (let i = 0; i < ln.points.length - 1; i++) {
    const a = toPx(ln.points[i])
    const b = toPx(ln.points[i + 1])
    const len = Math.hypot(b.px - a.px, b.py - a.py)
    const ang = (Math.atan2(b.py - a.py, b.px - a.px) * 180) / Math.PI
    segs.push({
      position: 'absolute',
      left: `${ln.points[i].x}%`,
      top: `${ln.points[i].y}%`,
      width: `${len}px`,
      height: 0,
      borderTop: `4px ${dash} ${color}`,
      transform: `rotate(${ang}deg)`,
      transformOrigin: '0 0',
      zIndex: 12
    })
  }

  // 终点箭头
  const last = ln.points[ln.points.length - 1]
  const prev = ln.points[ln.points.length - 2]
  const lp = toPx(last)
  const pp = toPx(prev)
  const angEnd = (Math.atan2(lp.py - pp.py, lp.px - pp.px) * 180) / Math.PI
  const arrowStyle: CSSProperties = {
    position: 'absolute',
    left: `${last.x}%`,
    top: `${last.y}%`,
    width: 0,
    height: 0,
    borderLeft: `12px solid ${color}`,
    borderTop: '7px solid transparent',
    borderBottom: '7px solid transparent',
    transform: `rotate(${angEnd}deg)`,
    transformOrigin: '0 7px',
    zIndex: 12
  }

  // 起点序号徽章
  const sp = ln.points[0]
  const badgeStyle: CSSProperties = {
    position: 'absolute',
    left: `${sp.x}%`,
    top: `${sp.y}%`,
    transform: 'translate(-50%, -160%)',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    background: '#1a1a1a',
    border: `2px solid ${color}`,
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    zIndex: 13
  }

  return (
    <>
      {segs.map((st, i) => <div key={i} style={st} />)}
      <div style={arrowStyle} />
      {ln.order ? <div style={badgeStyle}>{ln.order}</div> : null}
    </>
  )
}

/** 标记渲染：我方（蓝色编号旗子）/ 对方（黑红）球员标记 */
function MarkerSeg({ln}: {ln: TacticLine}) {
  const p = ln.points[0]
  if (!p) return null
  const wrapStyle: CSSProperties = {
    position: 'absolute',
    left: `${p.x}%`,
    top: `${p.y}%`,
    transform: 'translate(-50%, -50%)',
    zIndex: 25
  }
  if (ln.kind === 'flag') {
    return (
      <div style={wrapStyle}>
        <div style={{position: 'relative'}}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              background: 'rgba(37,99,235,0.95)',
              border: '2.5px solid #93C5FD',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.35)'
            }}
          >
            <div className="i-mdi-account" style={{color: '#fff', fontSize: 22}} />
          </div>
          {ln.order ? (
            <div
              style={{
                position: 'absolute',
                right: -5,
                bottom: -3,
                width: 18,
                height: 18,
                borderRadius: 9,
                background: '#0F3D91',
                border: '2px solid #93C5FD',
                color: '#fff',
                fontSize: 11,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {ln.order}
            </div>
          ) : null}
        </div>
      </div>
    )
  }
  return (
    <div style={wrapStyle}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          background: 'rgba(20,20,20,0.92)',
          border: '2.5px solid #B03A2E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span style={{color: '#fff', fontSize: 15, fontWeight: 'bold'}}>对{ln.order}</span>
      </div>
    </div>
  )
}

export function TacticView({domId, lines, players = [], viewMode = 'full', team}: TacticViewProps) {
  const [size, setSize] = useState<{w: number; h: number}>({w: 0, h: 0})

  // 测量球场像素尺寸（线段长度/角度需按像素换算，容器宽高比非 1:1）
  // 带重试：异步加载/隐藏 tab 时首次测量可能拿到 0，持续重试直到拿到真实尺寸
  useEffect(() => {
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const measure = () => {
      try {
        Taro.createSelectorQuery()
          .select('#' + domId)
          .boundingClientRect((rect: any) => {
            if (rect && rect.width > 0) {
              setSize({w: rect.width, h: rect.height})
            } else if (tries < 12) {
              tries++
              timer = setTimeout(measure, 200)
            }
          })
          .exec()
      } catch (e) {
        console.warn('TacticView measure fail:', e)
        if (tries < 12) {
          tries++
          timer = setTimeout(measure, 200)
        }
      }
    }
    measure()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [domId, lines])

  const isHalf = viewMode === 'half'

  return (
    <div
      id={domId}
      className="relative w-full rounded-2xl overflow-hidden pitch-bg shadow-lg"
      style={{height: '125vw'}}
    >
      {/* 分队标签 */}
      {team ? (
        <div
          className="absolute left-3 top-3 px-2.5 py-1 rounded-lg bg-black/55 text-white text-base z-30"
        >
          {team}
        </div>
      ) : null}

      {/* 球场标线：全场=中线+中圈；半场=底线+罚球区 */}
      {isHalf ? (
        <>
          {/* 底线（球门线） */}
          <div
            className="absolute left-0 right-0 border-t border-white/35"
            style={{bottom: 0, zIndex: 5}}
          />
          {/* 罚球区 */}
          <div
            className="absolute border border-white/35"
            style={{left: '25%', right: '25%', bottom: 0, height: '30%', zIndex: 5}}
          />
          {/* 小禁区 */}
          <div
            className="absolute border border-white/35"
            style={{left: '38%', right: '38%', bottom: 0, height: '13%', zIndex: 5}}
          />
          {/* 点球点 */}
          <div
            className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
            style={{left: '50%', bottom: '18%', transform: 'translateX(-50%)', zIndex: 5}}
          />
        </>
      ) : (
        <>
          {/* 中线 */}
          <div
            className="absolute left-0 right-0 border-b border-white/35"
            style={{top: '50%', transform: 'translateY(-50%)', zIndex: 5}}
          />
          {/* 中圈 */}
          <div
            className="absolute rounded-full border border-white/35"
            style={{left: '50%', top: '50%', width: '80px', height: '80px', transform: 'translate(-50%, -50%)', zIndex: 5}}
          />
          {/* 中点 */}
          <div
            className="absolute rounded-full bg-white/45 w-1.5 h-1.5"
            style={{left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5}}
          />
        </>
      )}

      {/* 球员棋子（教练放置） */}
      {players.map((dp) => (
        <div
          key={dp.id}
          style={{position: 'absolute', left: `${dp.x}%`, top: `${dp.y}%`, transform: 'translate(-50%, -50%)', zIndex: 20}}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center border-2 relative border-[#C9A227] bg-primary/95 shadow-md"
          >
            {dp.avatar_url ? (
              <CachedAvatarImage src={dp.avatar_url} mode="aspectFill" className="w-full h-full rounded-full" lazyLoad />
            ) : (
              <span className="font-heading text-base text-primary-foreground">{(dp.label || '队').slice(0, 1)}</span>
            )}
          </div>
          <span className="px-1.5 py-0.5 rounded text-xs truncate max-w-[60px] bg-black/60 text-white">{dp.label}</span>
        </div>
      ))}

      {/* 战术线与标记 */}
      {lines.map((ln, i) =>
        ln.kind === 'flag' || ln.kind === 'opp' ? <MarkerSeg key={i} ln={ln} /> : <LineSegs key={i} ln={ln} size={size} />
      )}
    </div>
  )
}
