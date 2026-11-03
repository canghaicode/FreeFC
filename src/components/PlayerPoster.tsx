/**
 * EA FC / FUT 终极特殊卡风格球星海报（Canvas 2D 绘制）v2 华丽版
 * 1. 人物 aspectFill 等比裁切绘制（修复压缩变矮），接近全实度 + 多层渐变羽化嵌入卡面
 * 2. FUT 异形盾牌轮廓：金属拉丝多层金边 + 外发光 + 角部铆钉 + 内缘金线
 * 3. 卡内光效：放射光芒、六边形科技网格、对角光泽带、星尘粒子
 * 4. 左上超大 OVR + FUT 位置；左侧竖排菱形 PlayStyles
 * 5. 经典六维横排（PAC/SHO/PAS/DRI/DEF/PHY）内嵌黑曜石玻璃数据面板 + 迷你金条
 * 6. 底部取消二维码 → 官方认证钢印签名区
 */
import {useEffect, useRef, useState} from 'react'
import Taro from '@tarojs/taro'
import {Canvas, Image} from '@tarojs/components'
import type {Profile} from '@/db/types'
import {
  overallAbility, cardTier, abilitiesWithBonus, skillBonuses,
  footLabel, titleOf, levelFromActivity, homeTeamOf, isNegativeTrait, positionToFutCode
} from '@/constants'

interface PlayerPosterProps {
  visible: boolean
  member: Profile | null
  onClose: () => void
}

/** 画布逻辑尺寸 750x1334（经典 9:16 高清竖版海报） */
const W = 750
const H = 1334

/** FUT 经典六维国际缩写与顺序 */
const FUT_STATS = [
  {key: 'ab_pace', label: 'PAC'},
  {key: 'ab_shooting', label: 'SHO'},
  {key: 'ab_passing', label: 'PAS'},
  {key: 'ab_dribbling', label: 'DRI'},
  {key: 'ab_defending', label: 'DEF'},
  {key: 'ab_stamina', label: 'PHY'}
] as const

/** 品质色系（对应传奇/金卡/银卡/铜卡） */
const TIER_THEMES: Record<
  string,
  {
    goldLight: string
    goldDark: string
    accent: string
    cardBgTop: string
    cardBgBottom: string
    cardGlow: string
  }
> = {
  legend: {
    goldLight: '#E9D5FF',
    goldDark: '#9333EA',
    accent: '#C084FC',
    cardBgTop: '#1E1035',
    cardBgBottom: '#0A0614',
    cardGlow: '#7E22CE'
  },
  gold: {
    goldLight: '#FCE7A1',
    goldDark: '#C9A227',
    accent: '#E5B842',
    cardBgTop: '#0D172A',
    cardBgBottom: '#060B14',
    cardGlow: '#B8860B'
  },
  silver: {
    goldLight: '#F1F5F9',
    goldDark: '#94A3B8',
    accent: '#CBD5E1',
    cardBgTop: '#131B26',
    cardBgBottom: '#0A0F16',
    cardGlow: '#64748B'
  },
  bronze: {
    goldLight: '#FED7AA',
    goldDark: '#B45309',
    accent: '#D97706',
    cardBgTop: '#1C130E',
    cardBgBottom: '#0E0907',
    cardGlow: '#92400E'
  },
  unset: {
    goldLight: '#E2E8F0',
    goldDark: '#64748B',
    accent: '#94A3B8',
    cardBgTop: '#111827',
    cardBgBottom: '#030712',
    cardGlow: '#475569'
  }
}

/** 绘制 FUT 盾牌路径（顶端微凹切角、两侧斜切肩部、底部尖盾收尾） */
function buildFutShieldPath(ctx: any, x: number, y: number, w: number, h: number) {
  const topCutW = w * 0.18
  const topDrop = h * 0.024
  const shoulderY = y + h * 0.075
  const waistY = y + h * 0.76
  const bottomTipY = y + h

  ctx.beginPath()
  // 顶端微内凹曲线 / 切角
  ctx.moveTo(x + topCutW, y + topDrop)
  ctx.quadraticCurveTo(x + w / 2, y + topDrop * 0.4, x + w - topCutW, y + topDrop)
  // 右上肩角
  ctx.lineTo(x + w - 10, y + topDrop + 14)
  ctx.lineTo(x + w, shoulderY)
  // 右侧腰身（微内收）
  ctx.lineTo(x + w, waistY)
  // 底部右侧渐收向盾尖
  ctx.quadraticCurveTo(x + w * 0.88, y + h * 0.94, x + w / 2, bottomTipY)
  // 底部左侧从盾尖向腰身
  ctx.quadraticCurveTo(x + w * 0.12, y + h * 0.94, x, waistY)
  // 左侧腰身向上
  ctx.lineTo(x, shoulderY)
  // 左上肩角
  ctx.lineTo(x + 10, y + topDrop + 14)
  ctx.closePath()
}

/** 绘制圆角矩形路径辅助方法 */
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/** 绘制菱形 FUT PlayStyle 技能图标 */
function drawPlayStyleDiamond(
  ctx: any,
  cx: number,
  cy: number,
  size: number,
  title: string,
  accentColor: string,
  isNeg: boolean
) {
  const half = size / 2
  ctx.save()

  ctx.beginPath()
  ctx.moveTo(cx, cy - half)
  ctx.lineTo(cx + half, cy)
  ctx.lineTo(cx, cy + half)
  ctx.lineTo(cx - half, cy)
  ctx.closePath()

  ctx.fillStyle = isNeg ? 'rgba(185, 28, 28, 0.45)' : 'rgba(15, 23, 42, 0.75)'
  ctx.fill()

  ctx.strokeStyle = isNeg ? '#EF4444' : accentColor
  ctx.lineWidth = 1.8
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillStyle = isNeg ? '#FCA5A5' : '#FFFFFF'
  ctx.fillText(title.slice(0, 2), cx, cy)

  ctx.restore()
}

/**
 * aspectFill 等比裁切绘制（与 CSS aspectFill 完全一致的算法）：
 * 保持照片原始宽高比，居中/偏上裁切后填充目标区域，绝不拉伸变形。
 * focusY：竖图裁切时保留的垂直焦点（0=顶部，0.5=居中）
 */
function drawImageCover(
  ctx: any,
  img: any,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  focusY = 0.12
) {
  const iw = img.naturalWidth || img.width || 0
  const ih = img.naturalHeight || img.height || 0
  if (!iw || !ih) {
    ctx.drawImage(img, dx, dy, dw, dh)
    return
  }
  const imgRatio = iw / ih
  const boxRatio = dw / dh
  let sx = 0
  let sy = 0
  let sw = iw
  let sh = ih
  if (imgRatio > boxRatio) {
    // 照片更宽：水平居中裁切左右
    sw = ih * boxRatio
    sx = (iw - sw) / 2
  } else {
    // 照片更高：垂直裁切，保留头部（顶部偏上）
    sh = iw / boxRatio
    sy = Math.max(0, (ih - sh) * focusY)
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

/** 确定性伪随机（星尘分布每次生成保持一致） */
function seededRand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** 星尘粒子（金白双色微光点） */
function drawStarDust(ctx: any, x: number, y: number, w: number, h: number, count: number, seed: number) {
  for (let i = 0; i < count; i++) {
    const px = x + seededRand(seed + i * 2.3) * w
    const py = y + seededRand(seed + i * 3.7 + 1.3) * h
    const r = 0.6 + seededRand(seed + i * 5.1 + 2.6) * 1.6
    const a = 0.08 + seededRand(seed + i * 7.9 + 3.9) * 0.3
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = i % 3 === 0 ? `rgba(229, 184, 66, ${a})` : `rgba(255, 255, 255, ${a * 0.75})`
    ctx.fill()
  }
}

/** 加载图片为 canvas Image，失败返回 null（H5 降级 new Image） */
async function loadImage(canvas: any, src: string): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      let img: any
      if (typeof canvas?.createImage === 'function') {
        img = canvas.createImage()
      } else if (typeof (globalThis as any).Image !== 'undefined') {
        img = new (globalThis as any).Image()
        // H5：必须先声明跨域再赋 src，否则无 CORS 头的头像会污染画布导致 toDataURL 抛错
        if (typeof img.crossOrigin === 'string') img.crossOrigin = 'anonymous'
      } else {
        resolve(null)
        return
      }
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    } catch {
      resolve(null)
    }
  })
}

export function PlayerPoster({visible, member, onClose}: PlayerPosterProps) {
  const [drawing, setDrawing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const drawingRef = useRef(false)
  const canvasRef = useRef<any>(null)
  const canvasInstRef = useRef<any>(null)
  const openedRef = useRef(false)
  if (visible !== openedRef.current) {
    openedRef.current = visible
    if (visible) {
      setDrawing(true)
      setFailed(false)
      setPosterUrl(null)
    }
  }

  // 仅依赖 visible：member 引用变化（父页 members 刷新导致 useMemo 重算）不得重置海报，
  // 否则已生成/生成中的海报会被清空重新"锻造"（与 SharePoster/PaymentPoster 行为对齐）
  useEffect(() => {
    if (!visible) {
      drawingRef.current = false
      canvasRef.current = null
      return
    }
    drawingRef.current = false
    canvasRef.current = null
    const timer = setTimeout(() => {
      void draw()
    }, 80)
    return () => clearTimeout(timer)
  }, [visible])

  const draw = async () => {
    if (!member || drawingRef.current) return
    drawingRef.current = true
    setDrawing(true)
    try {
      let canvas = canvasRef.current
      if (!canvas) {
        if (Taro.getEnv() === 'WEAPP') {
          const query = Taro.createSelectorQuery()
          for (let i = 0; i < 15; i++) {
            const res: any = await new Promise((resolve) => {
              query.select('#player-canvas').fields({node: true, size: true}).exec((r) => resolve(r?.[0]))
            })
            if (res?.node) {
              canvas = res.node
              break
            }
            await new Promise((r) => setTimeout(r, 100))
          }
        } else {
          const el = document.querySelector('#player-canvas canvas') as HTMLCanvasElement | null
          canvas = el ?? document.querySelector('#player-canvas')
        }
        if (canvas) canvasRef.current = canvas
      }
      if (!canvas || typeof canvas.getContext !== 'function') {
        console.error('PlayerPoster: canvas node not ready')
        setFailed(true)
        Taro.showToast({title: '海报初始化失败，请重试', icon: 'none'})
        return
      }

      const ctx = canvas.getContext('2d')
      const sysInfo = Taro.getSystemInfoSync()
      const dpr = Math.min(2.5, sysInfo.pixelRatio || 2)
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {width: W, height: H}
      const cssW = rect.width || W
      const cssH = rect.height || H
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      ctx.scale(dpr, dpr)
      const scale = Math.min(cssW / W, cssH / H)
      const drawW = W * scale
      const drawH = H * scale
      ctx.translate((cssW - drawW) / 2, (cssH - drawH) / 2)
      ctx.scale(scale, scale)

      const finalAb = abilitiesWithBonus(member, skillBonuses(member.member_skills))
      const ovr = overallAbility(finalAb) ?? 75
      const tier = cardTier(ovr)
      const theme = TIER_THEMES[tier.key] || TIER_THEMES.gold
      const levelDef = levelFromActivity(member.activity)
      const team = homeTeamOf(member.home_team)
      const titleDef = titleOf(member.title)
      const futPos = positionToFutCode(member.preferred_position)

      // ==========================================
      // 1. 海报深空背景 + 聚光光柱 + 星尘
      // ==========================================
      const bgGrad = ctx.createLinearGradient(0, 0, W, H)
      bgGrad.addColorStop(0, '#060B12')
      bgGrad.addColorStop(0.5, '#0B1522')
      bgGrad.addColorStop(1, '#04070D')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // 顶部三束舞台聚光光柱（营造颁奖仪式感）
      const beams = [
        {x: W * 0.3, w1: 24, w2: 130, a: 0.05},
        {x: W * 0.5, w1: 38, w2: 180, a: 0.07},
        {x: W * 0.7, w1: 24, w2: 130, a: 0.05}
      ]
      for (const b of beams) {
        ctx.beginPath()
        ctx.moveTo(b.x - b.w1, 0)
        ctx.lineTo(b.x + b.w1, 0)
        ctx.lineTo(b.x + b.w2, H * 0.62)
        ctx.lineTo(b.x - b.w2, H * 0.62)
        ctx.closePath()
        const bg2 = ctx.createLinearGradient(b.x, 0, b.x, H * 0.62)
        bg2.addColorStop(0, `rgba(255, 246, 220, ${b.a})`)
        bg2.addColorStop(1, 'rgba(255, 246, 220, 0)')
        ctx.fillStyle = bg2
        ctx.fill()
      }

      // 全局星尘
      drawStarDust(ctx, 0, 0, W, H, 42, 7.3)

      // 顶部官方标识
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText('CHENGDU FREEMEN FC · ULTIMATE TEAM', W / 2, 38)

      // ==========================================
      // 2. FUT 核心盾牌异形卡面
      // ==========================================
      const cardX = 45
      const cardY = 66
      const cardW = W - 90 // 660
      const cardH = 1120 // 修长霸气比例

      // 2.0 盾尖底部投影（悬浮感）
      ctx.save()
      const shadowEll = ctx.createRadialGradient(
        cardX + cardW / 2, cardY + cardH + 12, 4,
        cardX + cardW / 2, cardY + cardH + 12, cardW * 0.45
      )
      shadowEll.addColorStop(0, 'rgba(0, 0, 0, 0.6)')
      shadowEll.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = shadowEll
      ctx.save()
      ctx.translate(cardX + cardW / 2, cardY + cardH + 12)
      ctx.scale(1, 0.06)
      ctx.beginPath()
      ctx.arc(0, 0, cardW * 0.45, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.restore()

      // 2.1 外发光（金属边框溢出的金色辉光）
      ctx.save()
      ctx.shadowColor = `${theme.goldLight}90`
      ctx.shadowBlur = 28
      buildFutShieldPath(ctx, cardX - 7, cardY - 7, cardW + 14, cardH + 14)
      ctx.strokeStyle = `${theme.goldLight}35`
      ctx.lineWidth = 10
      ctx.stroke()
      ctx.stroke()
      ctx.restore()

      // 2.2 金属拉丝渐变厚边框
      ctx.save()
      buildFutShieldPath(ctx, cardX - 4, cardY - 4, cardW + 8, cardH + 8)
      const outerBorderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH)
      outerBorderGrad.addColorStop(0, theme.goldLight)
      outerBorderGrad.addColorStop(0.22, theme.goldDark)
      outerBorderGrad.addColorStop(0.45, theme.goldLight)
      outerBorderGrad.addColorStop(0.62, '#FFFFFF')
      outerBorderGrad.addColorStop(0.78, theme.goldDark)
      outerBorderGrad.addColorStop(1, theme.accent)
      ctx.fillStyle = outerBorderGrad
      ctx.fill()
      buildFutShieldPath(ctx, cardX - 2.5, cardY - 2.5, cardW + 5, cardH + 5)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.lineWidth = 0.9
      ctx.stroke()
      ctx.restore()

      // 2.3 暗槽（内凹立体深槽）
      ctx.save()
      buildFutShieldPath(ctx, cardX - 1.5, cardY - 1.5, cardW + 3, cardH + 3)
      ctx.fillStyle = '#05080E'
      ctx.fill()
      ctx.restore()

      // ------------------------------------------
      // 2.4 盾牌内部：光效底板 + 等比人物立绘
      // ------------------------------------------
      ctx.save()
      buildFutShieldPath(ctx, cardX, cardY, cardW, cardH)
      ctx.clip()

      // 深曜石渐变底板
      const innerBg = ctx.createLinearGradient(cardX + cardW / 2, cardY, cardX + cardW / 2, cardY + cardH)
      innerBg.addColorStop(0, theme.cardBgTop)
      innerBg.addColorStop(0.65, '#0A1220')
      innerBg.addColorStop(1, theme.cardBgBottom)
      ctx.fillStyle = innerBg
      ctx.fillRect(cardX, cardY, cardW, cardH)

      // 放射光芒（从人物胸口向外的太阳光芒束）
      const rayCx = cardX + cardW * 0.52
      const rayCy = cardY + cardH * 0.3
      const rays = 14
      for (let i = 0; i < rays; i++) {
        const ang = (Math.PI * 2 * i) / rays + 0.12
        const spread = 0.055
        const len = 580
        ctx.beginPath()
        ctx.moveTo(rayCx, rayCy)
        ctx.lineTo(rayCx + Math.cos(ang - spread) * len, rayCy + Math.sin(ang - spread) * len)
        ctx.lineTo(rayCx + Math.cos(ang + spread) * len, rayCy + Math.sin(ang + spread) * len)
        ctx.closePath()
        const rg = ctx.createLinearGradient(rayCx, rayCy, rayCx + Math.cos(ang) * len, rayCy + Math.sin(ang) * len)
        rg.addColorStop(0, `${theme.goldLight}2E`)
        rg.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = rg
        ctx.fill()
      }

      // 六边形科技网格
      ctx.save()
      ctx.strokeStyle = `${theme.goldLight}16`
      ctx.lineWidth = 1.1
      for (let r = 120; r <= 380; r += 70) {
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6
          const px = rayCx + r * Math.cos(a)
          const py = rayCy + r * Math.sin(a)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.stroke()
      }
      ctx.restore()

      // 对角光泽带（玻璃反光质感）
      ctx.save()
      ctx.transform(1, 0, -0.42, 1, 0, 0)
      const sheen1 = ctx.createLinearGradient(0, cardY, 0, cardY + 260)
      sheen1.addColorStop(0, 'rgba(255, 255, 255, 0)')
      sheen1.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)')
      sheen1.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = sheen1
      ctx.fillRect(W * 0.28, cardY, 110, 300)
      const sheen2 = ctx.createLinearGradient(0, cardY + 200, 0, cardY + 520)
      sheen2.addColorStop(0, 'rgba(255, 255, 255, 0)')
      sheen2.addColorStop(0.5, 'rgba(255, 255, 255, 0.035)')
      sheen2.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = sheen2
      ctx.fillRect(W * 0.58, cardY + 200, 70, 340)
      ctx.restore()

      // 人物身后金色光环
      const halo = ctx.createRadialGradient(
        cardX + cardW * 0.55, cardY + cardH * 0.3, 30,
        cardX + cardW * 0.55, cardY + cardH * 0.3, 330
      )
      halo.addColorStop(0, `${theme.goldLight}38`)
      halo.addColorStop(0.55, `${theme.goldLight}14`)
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = halo
      ctx.fillRect(cardX, cardY, cardW, cardH * 0.75)

      // ===== 大幅人物立绘：等比裁切，接近全实度 =====
      if (member.avatar_url) {
        const playerImg = await loadImage(canvas, member.avatar_url as string)
        if (playerImg) {
          ctx.save()
          ctx.globalAlpha = 0.97
          drawImageCover(
            ctx,
            playerImg,
            cardX,                       // 覆盖整个卡面宽度
            cardY + 10,                  // 更靠上，头部更突出
            cardW,                       // 全宽
            cardH * 0.74,                // 占卡面 74% 高度（放大拉近主体）
            0.08                         // 竖图裁切保留头部（更居中）
          )
          ctx.globalAlpha = 1
          ctx.restore()
        }
      }

      // ===== 多层渐变羽化：人物与卡面完美融合（嵌入风格）=====
      // 顶部压暗（人物与金边衔接）
      const topFade = ctx.createLinearGradient(0, cardY, 0, cardY + 90)
      topFade.addColorStop(0, 'rgba(6, 10, 18, 0.6)')
      topFade.addColorStop(1, 'rgba(6, 10, 18, 0)')
      ctx.fillStyle = topFade
      ctx.fillRect(cardX, cardY, cardW, 90)

      // 左侧保护渐变（确保 OVR 与菱形徽章可读）
      const leftFade = ctx.createLinearGradient(cardX, 0, cardX + cardW * 0.5, 0)
      leftFade.addColorStop(0, 'rgba(6, 10, 18, 0.78)')
      leftFade.addColorStop(0.55, 'rgba(6, 10, 18, 0.35)')
      leftFade.addColorStop(1, 'rgba(6, 10, 18, 0)')
      ctx.fillStyle = leftFade
      ctx.fillRect(cardX, cardY, cardW * 0.5, cardH * 0.8)

      // 底部大面积羽化（人物腰部融入数据区）
      const botFade = ctx.createLinearGradient(
        0, cardY + cardH * 0.5,
        0, cardY + cardH * 0.78
      )
      botFade.addColorStop(0, 'rgba(10, 18, 32, 0)')
      botFade.addColorStop(0.42, 'rgba(10, 18, 32, 0.68)')
      botFade.addColorStop(0.82, 'rgba(10, 18, 32, 0.97)')
      botFade.addColorStop(1, '#0A1220')
      ctx.fillStyle = botFade
      ctx.fillRect(cardX, cardY + cardH * 0.5, cardW, cardH * 0.28)

      // 卡内星尘（点缀人物上方空气感）
      drawStarDust(ctx, cardX, cardY, cardW, cardH * 0.5, 14, 21.7)

      // ------------------------------------------
      // 2.5 左上角：超大 FUT OVR + 位置（金属渐变数字）
      // ------------------------------------------
      const leftColX = cardX + 52
      // 立体投影
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.font = 'bold 88px sans-serif'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
      ctx.fillText(String(ovr), leftColX + 3, cardY + 58 + 4)
      // 金属渐变主体
      const ovrGrad = ctx.createLinearGradient(0, cardY + 56, 0, cardY + 56 + 88)
      ovrGrad.addColorStop(0, '#FFFDF2')
      ovrGrad.addColorStop(0.45, theme.goldLight)
      ovrGrad.addColorStop(1, theme.goldDark)
      ctx.fillStyle = ovrGrad
      ctx.fillText(String(ovr), leftColX, cardY + 56)

      // 位置缩写（ST / CM / CB / GK）
      ctx.font = 'bold 38px sans-serif'
      ctx.fillStyle = theme.goldLight
      ctx.fillText(futPos, leftColX, cardY + 152)

      // 位置下方金色分割线（中间菱形结点）
      ctx.strokeStyle = `${theme.goldDark}90`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(leftColX - 34, cardY + 204)
      ctx.lineTo(leftColX + 34, cardY + 204)
      ctx.stroke()
      ctx.save()
      ctx.translate(leftColX, cardY + 204)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = theme.goldLight
      ctx.fillRect(-3, -3, 6, 6)
      ctx.restore()

      // 左侧竖排菱形 PlayStyles / 特质徽章
      const playStyles: {name: string; isNeg: boolean}[] = []
      const equippedSkills = (member.member_skills || []).filter((ms) => ms.equipped && ms.skill)
      for (const ms of equippedSkills.slice(0, 3)) {
        playStyles.push({name: ms.skill!.name, isNeg: false})
      }
      if (member.traits && member.traits.length > 0) {
        for (const t of member.traits.slice(0, 4 - playStyles.length)) {
          playStyles.push({name: t, isNeg: isNegativeTrait(t)})
        }
      }
      if (playStyles.length === 0) {
        playStyles.push({name: '铁人', isNeg: false}, {name: '领袖', isNeg: false})
      }
      let psY = cardY + 236
      for (const ps of playStyles.slice(0, 4)) {
        drawPlayStyleDiamond(ctx, leftColX, psY, 38, ps.name, theme.goldLight, ps.isNeg)
        psY += 48
      }

      // ------------------------------------------
      // 2.6 中下部：大号姓名 + 称号/球衣号
      // ------------------------------------------
      const nameY = cardY + cardH * 0.645
      const displayName = member.nickname || 'FREEMAN'
      const nameFont = displayName.length > 6 ? 42 : displayName.length > 4 ? 48 : 54
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // 姓名：黑色立体投影 + 金色辉光双层
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 3
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `bold ${nameFont}px sans-serif`
      ctx.fillText(displayName, cardX + cardW / 2, nameY)
      ctx.restore()
      ctx.save()
      ctx.shadowColor = `${theme.goldLight}60`
      ctx.shadowBlur = 16
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
      ctx.font = `bold ${nameFont}px sans-serif`
      ctx.fillText(displayName, cardX + cardW / 2, nameY)
      ctx.restore()

      // 称号 / 球衣号 / 等级
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.font = 'bold 22px sans-serif'
      ctx.fillStyle = theme.goldLight
      const subInfo = [
        member.jersey_number != null ? `#${member.jersey_number}` : '',
        titleDef ? `【${titleDef.label}】` : '',
        `Lv.${levelDef.level}`
      ]
        .filter(Boolean)
        .join(' · ')
      ctx.fillText(subInfo, cardX + cardW / 2, nameY + 36)

      // 金色装饰分割线（两端菱形结点）
      const divY = nameY + 72
      const divGrad = ctx.createLinearGradient(cardX + 40, divY, cardX + cardW - 40, divY)
      divGrad.addColorStop(0, 'transparent')
      divGrad.addColorStop(0.2, theme.goldDark)
      divGrad.addColorStop(0.5, theme.goldLight)
      divGrad.addColorStop(0.8, theme.goldDark)
      divGrad.addColorStop(1, 'transparent')
      ctx.strokeStyle = divGrad
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(cardX + 45, divY)
      ctx.lineTo(cardX + cardW - 45, divY)
      ctx.stroke()
      for (const dx2 of [cardX + 45, cardX + cardW - 45]) {
        ctx.save()
        ctx.translate(dx2, divY)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = theme.goldLight
        ctx.fillRect(-2.5, -2.5, 5, 5)
        ctx.restore()
      }

      // ------------------------------------------
      // 2.7 经典 FUT 六维：内嵌黑曜石玻璃数据面板
      // ------------------------------------------
      const panelX = cardX + 36
      const panelW = cardW - 72
      const panelY = divY + 16
      const panelH = 126

      roundRect(ctx, panelX, panelY, panelW, panelH, 14)
      ctx.fillStyle = 'rgba(4, 8, 15, 0.66)'
      ctx.fill()
      ctx.strokeStyle = `${theme.goldDark}70`
      ctx.lineWidth = 1.2
      roundRect(ctx, panelX, panelY, panelW, panelH, 14)
      ctx.stroke()
      // 面板顶部高光细线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(panelX + 18, panelY + 1.5)
      ctx.lineTo(panelX + panelW - 18, panelY + 1.5)
      ctx.stroke()

      const colW = panelW / 6
      const barMaxW = colW * 0.52
      const barY = panelY + 92
      for (let i = 0; i < FUT_STATS.length; i++) {
        const item = FUT_STATS[i]
        const colCenterX = panelX + i * colW + colW / 2
        const rawVal = finalAb[item.key as keyof typeof finalAb] ?? 70
        const statVal = Math.min(99, Math.max(40, Number(rawVal) || 70))

        // 属性缩写 PAC / SHO / PAS ...
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.font = 'bold 22px sans-serif'
        ctx.fillStyle = `${theme.goldLight}D0`
        ctx.fillText(item.label, colCenterX, panelY + 16)

        // 数值（高分金色渐变）
        ctx.font = 'bold 38px sans-serif'
        if (statVal >= 88) {
          const hiGrad = ctx.createLinearGradient(0, panelY + 42, 0, panelY + 82)
          hiGrad.addColorStop(0, '#FFFDF2')
          hiGrad.addColorStop(1, theme.goldDark)
          ctx.fillStyle = hiGrad
        } else {
          ctx.fillStyle = '#FFFFFF'
        }
        ctx.fillText(String(statVal), colCenterX, panelY + 44)

        // 迷你金条（能力仪表）
        roundRect(ctx, colCenterX - barMaxW / 2, barY, barMaxW, 3, 1.5)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
        ctx.fill()
        const barW = Math.max(6, barMaxW * (statVal / 99))
        const barG = ctx.createLinearGradient(colCenterX - barW / 2, 0, colCenterX + barW / 2, 0)
        barG.addColorStop(0, theme.goldDark)
        barG.addColorStop(0.5, theme.goldLight)
        barG.addColorStop(1, theme.goldDark)
        roundRect(ctx, colCenterX - barMaxW / 2, barY, barW, 3, 1.5)
        ctx.fillStyle = barG
        ctx.fill()
      }

      // ------------------------------------------
      // 2.8 卡面底端标识栏：惯用脚 / 赛事 / 主队队徽
      // ------------------------------------------
      const iconsY = panelY + panelH + 42
      const badgesCenterX = cardX + cardW / 2
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // 惯用脚徽章
      const footStr = footLabel(member.preferred_foot)
      roundRect(ctx, badgesCenterX - 145, iconsY - 14, 76, 28, 6)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.fill()
      ctx.strokeStyle = `${theme.goldLight}B0`
      ctx.lineWidth = 1
      roundRect(ctx, badgesCenterX - 145, iconsY - 14, 76, 28, 6)
      ctx.stroke()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText(footStr, badgesCenterX - 107, iconsY)

      // 赛事徽章
      roundRect(ctx, badgesCenterX - 50, iconsY - 14, 100, 28, 6)
      ctx.fillStyle = 'rgba(229, 184, 66, 0.16)'
      ctx.fill()
      ctx.strokeStyle = `${theme.goldLight}B0`
      ctx.lineWidth = 1
      roundRect(ctx, badgesCenterX - 50, iconsY - 14, 100, 28, 6)
      ctx.stroke()
      ctx.fillStyle = theme.goldLight
      ctx.font = 'bold 17px sans-serif'
      ctx.fillText('FREEMEN', badgesCenterX, iconsY)

      // 主队徽章
      roundRect(ctx, badgesCenterX + 68, iconsY - 14, 82, 28, 6)
      if (team) {
        ctx.fillStyle = `${team.color}45`
        ctx.fill()
        ctx.strokeStyle = team.color
        ctx.lineWidth = 1
        roundRect(ctx, badgesCenterX + 68, iconsY - 14, 82, 28, 6)
        ctx.stroke()
        ctx.fillStyle = team.text || '#FFFFFF'
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
        ctx.fill()
        ctx.fillStyle = '#FFFFFF'
      }
      ctx.font = 'bold 17px sans-serif'
      ctx.fillText(team ? (team.short || team.name.slice(0, 3)) : 'FC.CD', badgesCenterX + 109, iconsY)

      ctx.restore() // 结束盾牌裁切

      // 2.9 内缘金线（卡面内侧的反光镶边）
      ctx.save()
      buildFutShieldPath(ctx, cardX + 5, cardY + 5, cardW - 10, cardH - 10)
      const innerLineGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH)
      innerLineGrad.addColorStop(0, `${theme.goldLight}C8`)
      innerLineGrad.addColorStop(0.5, `${theme.goldLight}70`)
      innerLineGrad.addColorStop(1, `${theme.goldDark}C8`)
      ctx.strokeStyle = innerLineGrad
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()

      // 2.10 角部铆钉（金属球面感）
      const shoulderY2 = cardY + cardH * 0.075
      const waistY2 = cardY + cardH * 0.76
      const rivets: [number, number][] = [
        [cardX + 16, shoulderY2 + 10],
        [cardX + cardW - 16, shoulderY2 + 10],
        [cardX + 14, waistY2 + 46],
        [cardX + cardW - 14, waistY2 + 46]
      ]
      for (const [rx, ry] of rivets) {
        const rivetGrad = ctx.createRadialGradient(rx - 1.5, ry - 1.5, 0.5, rx, ry, 5)
        rivetGrad.addColorStop(0, '#FFF6D8')
        rivetGrad.addColorStop(0.55, theme.goldLight)
        rivetGrad.addColorStop(1, theme.goldDark)
        ctx.beginPath()
        ctx.arc(rx, ry, 4.2, 0, Math.PI * 2)
        ctx.fillStyle = rivetGrad
        ctx.fill()
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // ==========================================
      // 3. 底部：官方认证钢印签名区（替代二维码）
      // ==========================================
      const certCy = cardY + cardH + 86
      // 上小字
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillStyle = `${theme.goldLight}C0`
      ctx.fillText('O F F I C I A L L Y   C E R T I F I E D', W / 2, certCy - 38)

      // 主字：官方认证（金属渐变 + 辉光）
      ctx.save()
      ctx.shadowColor = `${theme.goldLight}70`
      ctx.shadowBlur = 14
      const certGrad = ctx.createLinearGradient(0, certCy - 20, 0, certCy + 20)
      certGrad.addColorStop(0, '#FFFDF2')
      certGrad.addColorStop(0.5, '#F5E1A0')
      certGrad.addColorStop(1, theme.goldDark)
      ctx.fillStyle = certGrad
      ctx.font = 'bold 34px sans-serif'
      ctx.fillText('官 方 认 证', W / 2, certCy)
      ctx.restore()

      // 左右金色延展线 + 菱形结点
      for (const dir of [-1, 1]) {
        const x1 = W / 2 + dir * 100
        const x2 = W / 2 + dir * 216
        const lg = ctx.createLinearGradient(x1, certCy, x2, certCy)
        lg.addColorStop(0, theme.goldLight)
        lg.addColorStop(1, 'rgba(229, 184, 66, 0)')
        ctx.strokeStyle = lg
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(x1, certCy)
        ctx.lineTo(x2, certCy)
        ctx.stroke()
        ctx.save()
        ctx.translate(x2, certCy)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = `${theme.goldLight}90`
        ctx.fillRect(-3, -3, 6, 6)
        ctx.restore()
      }

      // 下小字
      ctx.font = '15px sans-serif'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)'
      ctx.fillText('CHENGDU FREEMEN FC · 2026 SEASON', W / 2, certCy + 36)

      // ==========================================
      // 4. 导出图片
      // ==========================================
      await new Promise<void>((resolve) => {
        Taro.nextTick(() => {
          setTimeout(() => resolve(), 150)
        })
      })

      if (Taro.getEnv() === 'WEAPP') {
        const exportCanvas = canvas
        let exported = false
        let lastError: unknown
        for (let attempt = 0; attempt < 3 && !exported; attempt++) {
          try {
            const tempPath = await new Promise<string>((resolve, reject) => {
              Taro.canvasToTempFilePath({
                canvas: exportCanvas,
                x: 0,
                y: 0,
                width: exportCanvas.width,
                height: exportCanvas.height,
                destWidth: exportCanvas.width,
                destHeight: exportCanvas.height,
                fileType: 'png',
                success: (result) => {
                  if (result.tempFilePath) resolve(result.tempFilePath)
                  else reject(new Error('empty poster path'))
                },
                fail: (err) => reject(err)
              })
            })
            setPosterUrl(tempPath)
            exported = true
          } catch (err) {
            lastError = err
            await new Promise((resolve) => setTimeout(resolve, 180))
          }
        }
        if (!exported) {
          console.error('PlayerPoster export failed:', lastError)
          setFailed(true)
          Taro.showToast({title: '海报生成失败，请重试', icon: 'none'})
        }
      } else {
        setPosterUrl(canvas.toDataURL('image/png'))
      }
    } catch (err) {
      console.error('PlayerPoster draw error:', err)
      setFailed(true)
      Taro.showToast({title: '海报生成失败，请重试', icon: 'none'})
    } finally {
      drawingRef.current = false
      setDrawing(false)
    }
  }

  const saveToAlbum = async () => {
    if (!posterUrl) return
    if (Taro.getEnv() !== 'WEAPP') {
      Taro.showToast({title: '请在微信小程序中保存', icon: 'none'})
      return
    }
    try {
      await Taro.saveImageToPhotosAlbum({filePath: posterUrl})
      Taro.showToast({title: '已保存到相册', icon: 'success'})
    } catch {
      Taro.showToast({title: '保存失败，请重试', icon: 'none'})
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex flex-col items-center justify-center px-4">
      {/* 画布统一离屏：weapp 隐藏；H5 离屏避免画布原件与预览图同时显示 */}
      <Canvas
        type="2d"
        id="player-canvas"
        canvasId="player-canvas"
        ref={(node) => {
          canvasInstRef.current = node
        }}
        className="fixed -left-[9999px] top-0"
        style={{width: `${W / 2.5}px`, height: `${H / 2.5}px`}}
      />

      {posterUrl ? (
        <div className="scale-in flex flex-col items-center gap-4 max-h-[90vh]">
          <div className="overflow-hidden rounded-lg" style={{width: '78vw', lineHeight: 0, border: '1px solid rgba(201, 162, 39, 0.55)'}}>
            <Image
              src={posterUrl}
              mode="widthFix"
              style={{width: '78vw', display: 'block'}}
            />
          </div>
          <div className="flex flex-row gap-3">
            <button
              type="button"
              className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary-foreground/50"
              onClick={onClose}
            >
              <div className="py-2.5 px-6 text-xl text-primary-foreground">关闭</div>
            </button>
            <button
              type="button"
              className="flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow"
              onClick={saveToAlbum}
            >
              <div className="py-2.5 px-6 flex items-center gap-1.5">
                <div className="i-mdi-download-outline text-2xl text-primary-foreground" />
                <span className="text-xl text-primary-foreground">保存图片</span>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl gold-frame p-6 flex flex-col items-center gap-3">
          {failed && !drawing ? (
            <>
              <div className="i-mdi-alert-circle-outline text-3xl text-destructive" />
              <span className="text-xl text-foreground font-medium">海报生成失败</span>
              <button
                type="button"
                className="mt-1 flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow"
                onClick={() => {
                  setFailed(false)
                  setDrawing(true)
                  drawingRef.current = false
                  void draw()
                }}
              >
                <div className="py-2.5 px-8 text-xl text-primary-foreground">重新生成</div>
              </button>
            </>
          ) : (
            <>
              <div className="i-mdi-loading animate-spin text-3xl text-primary" />
              <span className="text-xl text-foreground font-medium">正在锻造终极卡牌…</span>
              <span className="text-lg text-muted-foreground">渲染盾牌金边与流光特效</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
