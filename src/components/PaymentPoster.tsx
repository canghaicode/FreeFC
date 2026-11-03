/**
 * 收款名单海报：
 * 1. 布局自上而下精确推导，人数再多（50+）也只加长海报，不截断、不遮挡
 * 2. 场地费/水费分开明细展示，自动 AA 计算人均
 * 3. 支持自定义收款码与收款人名称（未设置时用默认队长收款码）
 * 4. 醒目提醒付款时备注球衣号码
 * 5. 增强保存到相册能力：小程序相册权限自动引导 + H5 浏览器直接下载 + 长按保存转发
 */
import {useEffect, useRef, useState} from 'react'
import Taro, {useReady} from '@tarojs/taro'
import {Canvas, Image} from '@tarojs/components'
import type {Activity, Registration} from '@/db/types'
import {formatActivityTime} from '@/constants'

interface PaymentPosterProps {
  visible: boolean
  activity: Activity | null
  registrations: Registration[]
  venueFee: string
  waterFee: string
  /** 收款折扣（单数字，9 = 9折；空或非法按原价） */
  feeDiscount?: string
  /** 分摊人数（页面可覆盖；缺省用报名人头统计） */
  headcount?: number
  /** 自定义收款码图片地址（空则用默认队长收款码） */
  qrUrl?: string | null
  /** 自定义收款人名称（空则用默认） */
  qrOwner?: string | null
  onClose: () => void
}

/** 队长 Seven 7 微信收款码（项目 Supabase Storage 永久地址）
 * 原临时 CDN 链接会过期且域名不在小程序 downloadFile 白名单内，导致二维码缺失；
 * 现从 TARO_APP_SUPABASE_URL 派生，与头像同域名，必然在白名单内。
 */
const SUPABASE_BASE = String(process.env.TARO_APP_SUPABASE_URL || '')
const WECHAT_PAY_QR_URL = `${SUPABASE_BASE}/storage/v1/object/public/minicode/posters/wechat-pay-qr.png`

const W = 750

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

/** 下载网络图片为本地临时文件或 H5 img 对象 */
async function loadPosterImage(canvas: any, src: string): Promise<any | null> {
  try {
    if (Taro.getEnv() === 'WEAPP') {
      const res = await new Promise<any>((resolve, reject) => {
        Taro.downloadFile({
          url: src,
          success: resolve,
          fail: reject
        })
      })
      if (!res.tempFilePath) return null
      const img = canvas.createImage()
      const ok = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = res.tempFilePath
      })
      return ok ? img : null
    } else {
      const img = typeof (globalThis as any).Image !== 'undefined'
        ? new (globalThis as any).Image()
        : document.createElement('img')
      if (typeof img.crossOrigin === 'string') img.crossOrigin = 'anonymous'
      const ok = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = src
      })
      return ok ? img : null
    }
  } catch (e) {
    console.error('Failed to load image for poster:', e)
    return null
  }
}

export function PaymentPoster({visible, activity, registrations, venueFee, waterFee, feeDiscount, headcount, qrUrl, qrOwner, onClose}: PaymentPosterProps) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [posterHeight, setPosterHeight] = useState(1320)
  const drawingRef = useRef(false)
  const canvasRef = useRef<any>(null)
  const visibleRef = useRef(false)

  // 标记可见状态，供 useReady 触发首次绘制
  useEffect(() => {
    visibleRef.current = visible
    if (visible && activity && !drawingRef.current) {
      setPosterUrl(null)
      const timer = setTimeout(() => draw(), 150)
      return () => clearTimeout(timer)
    }
  }, [visible])

  // 页面渲染就绪后若弹层已打开，补触发一次绘制（解决首次打开 canvas 未就绪问题）
  useReady(() => {
    if (visibleRef.current && activity && !drawingRef.current) {
      setTimeout(() => draw(), 200)
    }
  })

  const draw = async () => {
    if (!activity || drawingRef.current) return
    drawingRef.current = true
    setDrawing(true)
    try {
      // 过滤有效正选参赛人员（排队外/教练不计入分摊）
      const list = registrations.filter((r) => r.seat_role !== 'coach' && r.status === 'confirmed')
      const totalHeadCount = (headcount && headcount > 0 ? headcount : list.reduce((sum, r) => sum + 1 + (Number(r.guest_count) || 0), 0)) || 1
      const venue = parseFloat(venueFee) || 0
      const water = parseFloat(waterFee) || 0
      const pd = parseFloat(feeDiscount || '')
      // 折扣由页面显式校验后传入；此处不再静默按默认折扣兜底，非法时按原价
      const discountMult = Number.isFinite(pd) && pd > 0 ? pd / 10 : 1
      const amount = Math.round((venue + water) * discountMult * 100) / 100
      const perPerson = Math.round((amount / totalHeadCount) * 100) / 100

      // 排版策略：>10 人启用双列排版
      const isTwoCols = list.length > 10
      const rowCount = isTwoCols ? Math.ceil(list.length / 2) : list.length
      const rowH = isTwoCols ? 40 : 46

      // 布局自上而下精确推导：各区块位置由内容高度决定，人数再多也只会加长海报，
      // 彻底修复旧版人数 >22 时名单底部与收款码卡片重叠的问题
      const cardY = 330 // 金额卡片顶部（横幅175 + 活动信息130 + 间距25）
      const cardH = 165 // 金额卡片高度（场地/水费明细 + 合计 + 人均）
      const listTitleY = cardY + cardH + 28
      const headerY = listTitleY + 45
      const listBottom = headerY + 40 + rowCount * rowH
      const qrCardY = listBottom + 28 // 收款码卡片顶部，紧跟名单底部
      const qrCardH = 228
      const H = qrCardY + qrCardH + 60 // 底部留白 + 底标
      setPosterHeight(H)
      let ctx: any
      let canvas: any

      if (Taro.getEnv() === 'WEAPP') {
        const sys = Taro.getSystemInfoSync()
        const dpr = sys.pixelRatio || 2
        const query = Taro.createSelectorQuery()
        const res = await new Promise<any>((resolve) => {
          query
            .select('#paymentPosterCanvas')
            .fields({node: true, size: true})
            .exec((r) => resolve(r[0]))
        })
        const node = res?.node
        if (!node) {
          throw new Error('canvas node not ready')
        }
        node.width = W * dpr
        node.height = H * dpr
        ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        canvas = node
      } else {
        canvas = canvasRef.current as HTMLCanvasElement
        if (!canvas) throw new Error('canvas not ready')
        canvas.width = W
        canvas.height = H
        ctx = canvas.getContext('2d')
      }

      // 1. 全局底色
      ctx.fillStyle = '#FAF7EF'
      ctx.fillRect(0, 0, W, H)

      // 2. 顶部渐变深绿横幅
      const topGrad = ctx.createLinearGradient(0, 0, 0, 180)
      topGrad.addColorStop(0, '#1C380E')
      topGrad.addColorStop(1, '#2D5016')
      ctx.fillStyle = topGrad
      ctx.fillRect(0, 0, W, 175)

      // 球队专属副标题
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '22px sans-serif'
      ctx.fillText('成都自由人FC · 球队活动结算', W / 2, 55)

      // 标题
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 44px sans-serif'
      ctx.fillText('活动收款与参赛名单', W / 2, 110)

      // 3. 活动信息框
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#2D5016'
      ctx.font = 'bold 32px sans-serif'
      const titleStr = activity.title || '周中日常约战'
      ctx.fillText(titleStr.length > 20 ? titleStr.slice(0, 20) + '…' : titleStr, 50, 205)

      ctx.font = '24px sans-serif'
      ctx.fillStyle = '#5D6C4D'
      ctx.fillText(`时间：${formatActivityTime(activity.activity_time)}`, 50, 250)
      const locStr = `场地：${activity.location || '待定'}`
      ctx.fillText(locStr.length > 24 ? locStr.slice(0, 24) + '…' : locStr, 50, 285)

      // 4. 金额总结卡片（场地费/水费分开明细 + 人均）
      ctx.fillStyle = '#FFFDF5'
      roundRect(ctx, 45, cardY, W - 90, cardH, 16)
      ctx.fill()
      ctx.strokeStyle = '#D9A938'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.fillStyle = '#5D6C4D'
      ctx.font = '24px sans-serif'
      ctx.fillText(`场地费 ¥${venue.toFixed(2)} · 水费 ¥${water.toFixed(2)}`, W / 2, cardY + 30)
      ctx.fillText(`合计 ¥${amount.toFixed(2)}${Number.isFinite(pd) && pd > 0 ? `（${pd}折）` : ''} · 共 ${totalHeadCount} 人分摊`, W / 2, cardY + 71)

      // 人均金额（小一号，整体居中靠上）
      const amtStr = `¥${perPerson.toFixed(2)}`
      ctx.font = 'bold 40px sans-serif'
      const amtW = ctx.measureText(amtStr).width
      ctx.font = '22px sans-serif'
      const labelW = ctx.measureText('人均 ').width
      const startX = (W - amtW - labelW) / 2
      ctx.textAlign = 'left'
      ctx.fillStyle = '#5D6C4D'
      ctx.fillText('人均 ', startX, cardY + 119)
      ctx.fillStyle = '#C9A227'
      ctx.font = 'bold 40px sans-serif'
      ctx.fillText(amtStr, startX + labelW, cardY + 108)

      // 5. 名单区域
      ctx.textAlign = 'left'
      ctx.fillStyle = '#2D5016'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(`参赛人员明细（已报名 ${list.length} 位队员，共 ${totalHeadCount} 人）`, 50, listTitleY)

      ctx.fillStyle = '#7A8C66'
      ctx.font = 'bold 20px sans-serif'

      if (!isTwoCols) {
        // === 单列排版（<= 10人） ===
        const colX = [55, 140, 420, 600]
        ctx.fillText('序号', colX[0], headerY)
        ctx.fillText('姓名 / 随行', colX[1], headerY)
        ctx.fillText('球衣号', colX[2], headerY)
        ctx.fillText('应付金额', colX[3], headerY)

        // 分割线
        ctx.strokeStyle = '#D5DBC9'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(50, headerY + 28)
        ctx.lineTo(W - 50, headerY + 28)
        ctx.stroke()

        let rowTop = headerY + 40
        for (let i = 0; i < list.length; i++) {
          const r = list[i]
          const p = r.profiles
          const guests = Number(r.guest_count) || 0
          const myHeads = 1 + guests
          const myPay = (perPerson * myHeads).toFixed(2)

          // 隔行斑马纹底色
          if (i % 2 === 1) {
            ctx.fillStyle = 'rgba(45, 80, 22, 0.04)'
            roundRect(ctx, 45, rowTop - 6, W - 90, 38, 6)
            ctx.fill()
          }

          ctx.font = '22px sans-serif'
          ctx.fillStyle = '#5D6C4D'
          ctx.fillText(String(i + 1).padStart(2, '0'), colX[0], rowTop)

          // 姓名与带人徽标
          ctx.font = 'bold 23px sans-serif'
          ctx.fillStyle = '#2D5016'
          const name = p?.nickname || '队员'
          const dispName = name.length > 7 ? name.slice(0, 7) + '…' : name
          ctx.fillText(dispName, colX[1], rowTop)

          if (guests > 0) {
            ctx.font = '18px sans-serif'
            ctx.fillStyle = '#C9A227'
            ctx.fillText(`+${guests}人`, colX[1] + 115, rowTop + 2)
          }

          // 号码
          ctx.font = '22px sans-serif'
          ctx.fillStyle = '#5D6C4D'
          ctx.fillText(p?.jersey_number != null ? `#${p.jersey_number}` : '-', colX[2], rowTop)

          // 金额
          ctx.font = 'bold 24px sans-serif'
          ctx.fillStyle = '#C9A227'
          ctx.fillText(`¥${myPay}`, colX[3], rowTop)

          rowTop += rowH
        }
      } else {
        // === 双列紧凑排版（> 10人，最多支持 30+ 人） ===
        const midX = W / 2
        // 左列表头（与数据行同列偏移：0/48/135/180；金额列名按金额宽度居中）
        ctx.fillText('序号', 55, headerY)
        ctx.fillText('姓名', 103, headerY)
        ctx.fillText('号码', 190, headerY)
        const amtHeadW = ctx.measureText('¥00.00').width
        ctx.fillText('序号', midX + 15, headerY)
        ctx.fillText('姓名', midX + 63, headerY)
        ctx.fillText('号码', midX + 150, headerY)
        ctx.textAlign = 'center'
        ctx.fillText('金额', 55 + 180 + amtHeadW / 2, headerY)
        ctx.fillText('金额', midX + 15 + 180 + amtHeadW / 2, headerY)
        ctx.textAlign = 'left'

        // 分割线
        ctx.strokeStyle = '#D5DBC9'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(45, headerY + 28)
        ctx.lineTo(W - 45, headerY + 28)
        ctx.stroke()

        // 中间纵向分割线
        ctx.beginPath()
        ctx.moveTo(midX, headerY + 34)
        ctx.lineTo(midX, headerY + 34 + rowCount * rowH)
        ctx.stroke()

        for (let i = 0; i < list.length; i++) {
          const r = list[i]
          const p = r.profiles
          const isRight = i >= rowCount
          const colIndex = isRight ? i - rowCount : i
          const guests = Number(r.guest_count) || 0
          const myHeads = 1 + guests
          const myPay = (perPerson * myHeads).toFixed(2)

          const baseLeft = isRight ? midX + 15 : 55
          const rowY = headerY + 40 + colIndex * rowH

          // 斑马纹
          if (colIndex % 2 === 1) {
            ctx.fillStyle = 'rgba(45, 80, 22, 0.035)'
            roundRect(ctx, isRight ? midX + 5 : 45, rowY - 6, (W - 100) / 2, 34, 4)
            ctx.fill()
          }

          // 序号
          ctx.font = '20px sans-serif'
          ctx.fillStyle = '#7A8C66'
          ctx.fillText(String(i + 1).padStart(2, '0'), baseLeft, rowY)

          // 姓名（长姓名紧凑截断）
          ctx.font = 'bold 21px sans-serif'
          ctx.fillStyle = '#2D5016'
          const name = p?.nickname || '队员'
          const maxNameLen = guests > 0 ? 4 : 5
          const dispName = name.length > maxNameLen ? name.slice(0, maxNameLen) + '…' : name
          ctx.fillText(dispName, baseLeft + 48, rowY)

          // 带人标志
          if (guests > 0) {
            ctx.font = '16px sans-serif'
            ctx.fillStyle = '#C9A227'
            ctx.fillText(`+${guests}`, baseLeft + 98, rowY + 2)
          }

          // 球衣号
          ctx.font = '20px sans-serif'
          ctx.fillStyle = '#5D6C4D'
          ctx.fillText(p?.jersey_number != null ? `#${p.jersey_number}` : '-', baseLeft + 135, rowY)

          // 应付
          ctx.font = 'bold 21px sans-serif'
          ctx.fillStyle = '#C9A227'
          ctx.fillText(`¥${myPay}`, baseLeft + 180, rowY)
        }
      }

      // 6. 底部收款码专属大卡片
      // 卡片底色（微信绿淡雅渐变）
      const qrBgGrad = ctx.createLinearGradient(45, qrCardY, 45, qrCardY + qrCardH)
      qrBgGrad.addColorStop(0, '#FFFFFF')
      qrBgGrad.addColorStop(1, '#F3F9F0')
      ctx.fillStyle = qrBgGrad
      roundRect(ctx, 45, qrCardY, W - 90, qrCardH, 20)
      ctx.fill()
      ctx.strokeStyle = '#2BA245'
      ctx.lineWidth = 2
      ctx.stroke()

      // 收款码图片加载并绘制在右侧（优先自定义收款码）
      const qrSize = 180
      const qrX = W - 45 - qrSize - 18
      const qrY = qrCardY + 18
      const effectiveQrUrl = qrUrl && qrUrl.length > 0 ? qrUrl : WECHAT_PAY_QR_URL

      const qrImg = await loadPosterImage(canvas, effectiveQrUrl)
      if (qrImg) {
        // 白底留白边框增强识别率
        ctx.fillStyle = '#FFFFFF'
        roundRect(ctx, qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 12)
        ctx.fill()
        ctx.strokeStyle = 'rgba(43, 162, 69, 0.3)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
      } else {
        // 兜底二维码占位框
        ctx.fillStyle = '#FFFFFF'
        roundRect(ctx, qrX, qrY, qrSize, qrSize, 8)
        ctx.fill()
        ctx.fillStyle = '#2D5016'
        ctx.font = '18px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('收款码加载失败', qrX + qrSize / 2, qrY + qrSize / 2)
      }

      // 左侧收款指引信息
      const infoLeft = 70
      ctx.textAlign = 'left'

      // 绿色圆标 + 微信支付（明显上移，避免与名单底部重叠）
      ctx.fillStyle = '#07C160'
      roundRect(ctx, infoLeft, qrCardY + 12, 120, 34, 17)
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('微信支付', infoLeft + 60, qrCardY + 30)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'

      // 收款人（支持自定义）
      ctx.fillStyle = '#1C380E'
      ctx.font = 'bold 30px sans-serif'
      const ownerStr = qrOwner && qrOwner.length > 0 ? qrOwner : 'Seven 7 (**文)'
      const ownerDisp = ownerStr.length > 11 ? ownerStr.slice(0, 11) + '…' : ownerStr
      ctx.fillText(`收款人：${ownerDisp}`, infoLeft, qrCardY + 84)

      // 提示
      ctx.fillStyle = '#5D6C4D'
      ctx.font = '22px sans-serif'
      ctx.fillText('踢球活动场租 / 水费自动AA结算', infoLeft, qrCardY + 122)

      // 备注号码提醒（醒目高亮）
      ctx.fillStyle = '#C9A227'
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText('付款时请备注您的球衣号码', infoLeft, qrCardY + 158)

      // 扫码提示
      ctx.fillStyle = '#07C160'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText('右侧长按识别二维码即可转账', infoLeft, qrCardY + 190)

      // 底标
      ctx.textAlign = 'center'
      ctx.fillStyle = '#9DA892'
      ctx.font = '18px sans-serif'
      ctx.fillText('成都自由人FC · 账目透明 · 快乐足球', W / 2, H - 22)

      // 等待画布渲染完全
      await new Promise<void>((resolve) => {
        Taro.nextTick(() => setTimeout(() => resolve(), 200))
      })

      // 导出海报图片
      if (Taro.getEnv() === 'WEAPP') {
        Taro.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width: W,
          height: H,
          destWidth: W * 2,
          destHeight: H * 2,
          fileType: 'png',
          quality: 1,
          success: (res) => setPosterUrl(res.tempFilePath),
          fail: (err) => {
            console.error('canvasToTempFilePath error:', err)
            Taro.showToast({title: '生成失败，请重试', icon: 'none'})
          }
        })
      } else {
        const base64 = (canvas as HTMLCanvasElement).toDataURL('image/png')
        setPosterUrl(base64)
      }
    } catch (err) {
      console.error('PaymentPoster draw error:', err)
      Taro.showToast({title: '海报绘制失败', icon: 'none'})
    } finally {
      setDrawing(false)
      drawingRef.current = false
    }
  }

  /**
   * 保存到相册能力：
   * 1. weapp: saveImageToPhotosAlbum + 自动权限检查引导
   * 2. H5: 自动触发浏览器文件下载
   */
  const handleSave = async () => {
    if (!posterUrl) return

    // H5 环境：直接触发浏览器下载
    if (Taro.getEnv() !== 'WEAPP') {
      try {
        const a = document.createElement('a')
        a.href = posterUrl
        a.download = `自由人FC_收款名单_${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        Taro.showToast({title: '已触发海报下载', icon: 'success'})
      } catch (err) {
        console.error('H5 download failed:', err)
        Taro.showToast({title: '请长按海报图片保存', icon: 'none'})
      }
      return
    }

    // 微信小程序环境：处理相册授权并保存
    try {
      await Taro.saveImageToPhotosAlbum({filePath: posterUrl})
      Taro.showToast({title: '已保存到手机相册', icon: 'success'})
    } catch (err: any) {
      console.warn('saveImageToPhotosAlbum fail:', err)
      // 检查是否因用户拒绝授权导致
      Taro.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum'] === false) {
            Taro.showModal({
              title: '需要相册权限',
              content: '需要开启保存到相册权限才能将海报存入手机相册',
              confirmText: '去开启',
              cancelText: '取消',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  Taro.openSetting()
                }
              }
            })
          } else {
            Taro.showToast({title: '长按海报也可以直接保存', icon: 'none'})
          }
        },
        fail: () => {
          Taro.showToast({title: '请长按海报图片保存', icon: 'none'})
        }
      })
    }
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div className="relative flex flex-col items-center max-w-full my-auto" onClick={(e) => e.stopPropagation()}>
        {/* 画布统一离屏定位，避免 H5 原件与预览图重叠 */}
        <Canvas
          ref={canvasRef}
          type="2d"
          id="paymentPosterCanvas"
          canvasId="paymentPosterCanvas"
          className="fixed -left-[9999px] top-0"
          style={{width: `${W}px`, height: `${posterHeight}px`}}
        />

        {drawing && (
          <div className="w-[78vw] h-[60vh] rounded-2xl bg-card gold-frame flex flex-col items-center justify-center gap-3">
            <div className="i-mdi-loading animate-spin text-4xl text-primary" />
            <span className="text-xl text-foreground font-medium">正在生成收款名单海报…</span>
            <span className="text-base text-muted-foreground">已排版名单并嵌入微信收款码</span>
          </div>
        )}

        {posterUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl overflow-hidden gold-frame shadow-2xl max-h-[70vh]">
              <Image
                src={posterUrl}
                mode="widthFix"
                style={{width: '76vw'}}
                className="block"
                showMenuByLongpress
              />
            </div>
            <p className="text-base text-white/80 text-center">💡 长按海报可直接保存到手机或转发微信群</p>
          </div>
        )}

        <div className="flex flex-row gap-4 mt-4 w-full justify-center">
          <button
            type="button"
            className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-white/40 px-6 py-2.5"
            onClick={onClose}
          >
            <span className="text-xl text-white">关闭</span>
          </button>
          <button
            type="button"
            className={`flex items-center justify-center leading-none break-keep rounded-xl px-7 py-2.5 ${
              posterUrl ? 'bg-gradient-gold lift-glow' : 'bg-muted'
            }`}
            onClick={handleSave}
            disabled={!posterUrl}
          >
            <div className="flex items-center gap-1.5">
              <div className="i-mdi-download-outline text-2xl text-primary-foreground" />
              <span className="text-xl text-primary-foreground font-medium">保存到相册</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
