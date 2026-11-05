/**
 * 活动分享海报组件（Canvas 2D 绘制，新艺术运动风浅色版：象牙白底 + 深绿主文字 + 金色装饰）
 * weapp：生成图片并可保存到相册；H5：仅提示需在微信中使用
 * 底部嵌入「自由人FC」小程序码（Edge Function minicode 提供本地文件）
 */
import {useEffect, useRef, useState} from 'react'
import Taro from '@tarojs/taro'
import {Canvas, Image} from '@tarojs/components'
import {supabase} from '@/client/supabase'
import type {Activity} from '@/db/types'
import {formatActivityTime, MATCH_FORMATS} from '@/constants'
import {LOGO_URL} from '@/components/LogoBg'

interface SharePosterProps {
  visible: boolean
  activity: Activity | null
  joinedCount: number
  onClose: () => void
}

/** 画布逻辑尺寸（750x1200，约 5:8） */
const W = 750
const H = 1200

/** weapp：base64 写本地临时文件（canvas 只能可靠绘制本地图片） */
async function base64ToTempFile(base64: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const fs = Taro.getFileSystemManager()
      const path = `${Taro.env.USER_DATA_PATH}/minicode_${Date.now()}.png`
      fs.writeFile({
        filePath: path,
        data: base64,
        encoding: 'base64',
        success: () => resolve(path),
        fail: () => resolve(null)
      })
    } catch {
      resolve(null)
    }
  })
}

/** 获取小程序码本地路径（weapp）或 URL（H5），失败返回 null（海报降级为无码） */
async function loadMinicodeImage(): Promise<string | null> {
  try {
    const {data, error} = await supabase.functions.invoke('minicode')
    if (error || !data) return null
    const resp = data as {url?: string; base64?: string; error?: string}
    if (resp?.error || !resp?.base64) return resp?.url || null
    if (Taro.getEnv() === 'WEAPP') {
      return await base64ToTempFile(resp.base64)
    }
    return `data:image/png;base64,${resp.base64}`
  } catch {
    return null
  }
}

export function SharePoster({visible, activity, joinedCount, onClose}: SharePosterProps) {
  const [drawing, setDrawing] = useState(false)
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const drawingRef = useRef(false)

  const canvasRef = useRef<any>(null)
  const canvasInstRef = useRef<any>(null)

  useEffect(() => {
    if (visible && activity && !posterUrl && !drawingRef.current) {
      // 延迟一帧，确保 Canvas 节点已挂载，避免首次查询拿不到 node
      const timer = setTimeout(() => draw(), 80)
      return () => clearTimeout(timer)
    }
  }, [visible])

  const draw = async () => {
    if (!activity || drawingRef.current) return
    drawingRef.current = true
    setDrawing(true)
    try {
      let canvas = canvasRef.current
      if (!canvas) {
        // weapp：Canvas 节点在组件挂载后可能尚未就绪，轮询等待最多 ~1.5s
        if (Taro.getEnv() === 'WEAPP') {
          const query = Taro.createSelectorQuery()
          for (let i = 0; i < 15; i++) {
            const res: any = await new Promise((resolve) => {
              query.select('#poster-canvas').fields({node: true, size: true}).exec((r) => resolve(r?.[0]))
            })
            if (res?.node) {
              canvas = res.node
              break
            }
            await new Promise((r) => setTimeout(r, 100))
          }
        } else {
          // H5：Taro Canvas 节点不可用，直接用 DOM 查询
          const el = document.querySelector('#poster-canvas canvas') as HTMLCanvasElement | null
          canvas = el ?? document.querySelector('#poster-canvas')
        }
        if (canvas) canvasRef.current = canvas
      }
      if (!canvas || typeof canvas.getContext !== 'function') {
        console.error('SharePoster: canvas node not ready')
        Taro.showToast({title: '海报初始化失败，请重试', icon: 'none'})
        return
      }
      const ctx = canvas.getContext('2d')
      const sysInfo = Taro.getSystemInfoSync()
      const dpr = Math.min(2.5, sysInfo.pixelRatio || 2)
      // 获取实际像素尺寸：weapp 用 res 返回；H5 用 getBoundingClientRect
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {width: W, height: H}
      const cssW = rect.width || W
      const cssH = rect.height || H
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      ctx.scale(dpr, dpr)
      // 以 CSS 尺寸为绘图坐标基准，按长边等比缩放保证海报比例
      const scale = Math.min(cssW / W, cssH / H)
      const drawW = W * scale
      const drawH = H * scale
      const offsetX = (cssW - drawW) / 2
      const offsetY = (cssH - drawH) / 2
      ctx.translate(offsetX, offsetY)
      ctx.scale(scale, scale)

      // ===== 背景：象牙白底（浅色系） =====
      ctx.fillStyle = '#FAF7EF'
      ctx.fillRect(0, 0, W, H)
      // 队徽微淡化背景水印
      try {
        const logoImg = canvas.createImage()
        const logoOk = await new Promise<boolean>((resolve) => {
          logoImg.onload = () => resolve(true)
          logoImg.onerror = () => resolve(false)
          logoImg.src = LOGO_URL
        })
        if (logoOk) {
          const logoSize = Math.min(W, H) * 0.72
          const lx = (W - logoSize) / 2
          const ly = (H - logoSize) / 2
          ctx.save()
          ctx.globalAlpha = 0.07
          ctx.drawImage(logoImg, lx, ly, logoSize, logoSize)
          ctx.restore()
        }
      } catch {
        // logo 加载失败时忽略，不影响海报生成
      }
      // 顶部装饰：淡金弧面（新艺术风曲线）
      const arc = ctx.createLinearGradient(0, 0, W, 260)
      arc.addColorStop(0, 'rgba(201,162,39,0.10)')
      arc.addColorStop(1, 'rgba(201,162,39,0.03)')
      ctx.fillStyle = arc
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(W * 0.3, 130, W * 0.7, 60, W, 180)
      ctx.lineTo(W, 0)
      ctx.closePath()
      ctx.fill()
      // 装饰圆环
      ctx.strokeStyle = 'rgba(45,80,22,0.18)'
      ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(W - 90, 200 + i * 26, 60 - i * 16, 0, Math.PI * 2)
        ctx.stroke()
      }

      // ===== 深绿双细边框 =====
      ctx.strokeStyle = '#2D5016'
      ctx.lineWidth = 3
      ctx.strokeRect(28, 28, W - 56, H - 56)
      ctx.lineWidth = 1
      ctx.strokeRect(40, 40, W - 80, H - 80)

      // ===== 顶部标签 =====
      ctx.fillStyle = '#C9A227'
      ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('球队活动 · 报名接龙', W / 2, 130)

      // ===== 标题（自动换行，最多3行，深绿） =====
      ctx.fillStyle = '#2D5016'
      ctx.font = 'bold 52px sans-serif'
      ctx.textAlign = 'left'
      const title = activity.title || '球队活动'
      const maxW = W - 160
      const lines: string[] = []
      let line = ''
      for (const ch of title) {
        if (ctx.measureText(line + ch).width > maxW) {
          lines.push(line)
          line = ch
          if (lines.length === 3) break
        } else {
          line += ch
        }
      }
      if (lines.length < 3 && line) lines.push(line)
      if (lines.length === 3 && line && !lines.includes(line)) lines[2] += '…'
      lines.forEach((l, i) => ctx.fillText(l, 80, 230 + i * 68))

      // ===== 分隔藤蔓线 =====
      const lineY = 230 + lines.length * 68 + 10
      ctx.strokeStyle = 'rgba(201,162,39,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(80, lineY)
      ctx.bezierCurveTo(W * 0.4, lineY - 8, W * 0.6, lineY + 8, W - 80, lineY)
      ctx.stroke()

      // ===== 信息区 =====
      ctx.font = '36px sans-serif'
      let infoY = lineY + 80
      const infoRows: [string, string][] = [
        ['赛制', MATCH_FORMATS[activity.match_format || '11']?.name || '11人制'],
        ['时间', formatActivityTime(activity.activity_time)],
        ['场地', activity.location || '待定'],
        ['名额', `${joinedCount} / ${activity.max_players} 人已报名`]
      ]
      for (const [label, value] of infoRows) {
        // 标签
        ctx.fillStyle = '#C9A227'
        ctx.textAlign = 'left'
        ctx.font = 'bold 34px sans-serif'
        ctx.fillText(label, 100, infoY)
        // 值（超长截断，深绿）
        ctx.fillStyle = '#2D5016'
        ctx.font = '34px sans-serif'
        let text = value
        while (ctx.measureText(text).width > W - 320 && text.length > 4) {
          text = text.slice(0, -2) + '…'
        }
        ctx.fillText(text, 230, infoY)
        infoY += 72
      }

      // ===== 报名进度条 =====
      const barY = infoY + 30
      const barW = W - 200
      const ratio = Math.min(1, activity.max_players > 0 ? joinedCount / activity.max_players : 0)
      ctx.fillStyle = 'rgba(45,80,22,0.12)'
      roundRect(ctx, 100, barY, barW, 26, 13)
      ctx.fill()
      if (ratio > 0) {
        const barGrad = ctx.createLinearGradient(100, 0, 100 + barW, 0)
        barGrad.addColorStop(0, '#C9A227')
        barGrad.addColorStop(1, '#E8C766')
        ctx.fillStyle = barGrad
        roundRect(ctx, 100, barY, Math.max(26, barW * ratio), 26, 13)
        ctx.fill()
      }

      // ===== 备注（自动换行，最多3行，避免与二维码重叠） =====
      if (activity.note) {
        ctx.fillStyle = 'rgba(45,80,22,0.72)'
        ctx.font = '28px sans-serif'
        ctx.textAlign = 'left'
        const noteMaxW = W - 200
        const noteLines: string[] = []
        let noteLine = ''
        for (const ch of activity.note) {
          if (ctx.measureText(noteLine + ch).width > noteMaxW) {
            noteLines.push(noteLine)
            noteLine = ch
            if (noteLines.length === 3) break
          } else {
            noteLine += ch
          }
        }
        if (noteLines.length < 3 && noteLine) noteLines.push(noteLine)
        if (noteLines.length === 3 && noteLine && !noteLines.includes(noteLine)) noteLines[2] += '…'
        const notePrefix = '备注：'
        noteLines.forEach((l, i) => {
          const x = i === 0 ? 100 : 100 + ctx.measureText(notePrefix).width
          ctx.fillText(`${i === 0 ? notePrefix : ''}${l}`, x, barY + 90 + i * 42)
        })
      }

      // ===== 底部：小程序码 + 提示（浅色版） =====
      // 左：二维码（加载失败则跳过，仅展示文字）
      const minicodeSrc = await loadMinicodeImage()
      let qrDrew = false
      if (minicodeSrc) {
        const img = canvas.createImage()
        const ok = await new Promise<boolean>((resolve) => {
          img.onload = () => resolve(true)
          img.onerror = () => resolve(false)
          img.src = minicodeSrc
        })
        if (ok) {
          const qrSize = 150
          const qrX = 100
          const qrY = H - 260
          ctx.fillStyle = '#FFFFFF'
          roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 10)
          ctx.fill()
          ctx.drawImage(img, qrX, qrY, qrSize, qrSize)
          qrDrew = true
        }
      }
      // 右：文字提示（右侧区域，垂直居中于二维码）
      const textCenterY = H - 260 + 75
      ctx.textAlign = 'left'
      const textLeft = qrDrew ? 300 : 100
      ctx.fillStyle = '#2D5016'
      ctx.font = 'bold 34px sans-serif'
      ctx.fillText('微信扫码 · 直达报名', textLeft, textCenterY - 16)
      ctx.fillStyle = '#C9A227'
      ctx.font = '28px sans-serif'
      ctx.fillText('小程序 · 自由人FC', textLeft, textCenterY + 30)
      ctx.fillStyle = 'rgba(45,80,22,0.55)'
      ctx.font = '24px sans-serif'
      ctx.fillText('报名接龙，一起踢球', textLeft, textCenterY + 72)

      // ===== 导出图片 =====
      await new Promise<void>((resolve) => {
        Taro.nextTick(() => {
          setTimeout(() => {
            resolve()
          }, 150)
        })
      })
      if (Taro.getEnv() === 'WEAPP') {
        // width/height 为画布实际像素裁剪区域（已含 dpr），必须等于 canvas.width/height，否则越界导致生成失败
        const exportCanvas = canvas
        Taro.canvasToTempFilePath({
          canvas: exportCanvas,
          x: 0,
          y: 0,
          width: exportCanvas.width,
          height: exportCanvas.height,
          destWidth: exportCanvas.width,
          destHeight: exportCanvas.height,
          fileType: 'png',
          success: (r) => setPosterUrl(r.tempFilePath),
          fail: (err) => {
            console.error('SharePoster export failed:', err)
            Taro.showToast({title: '海报生成失败，请重试', icon: 'none'})
          }
        })
      } else {
        // H5：直接用 base64 预览
        setPosterUrl(canvas.toDataURL('image/png'))
      }
    } catch (err) {
      console.error('SharePoster draw error:', err)
      Taro.showToast({title: '海报生成失败，请重试', icon: 'none'})
    } finally {
      drawingRef.current = false
      setDrawing(false)
    }
  }

  /** 保存到相册（weapp 专属，tempFilePath 可直接保存） */
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
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col items-center justify-center px-6">
      {/* 画布：weapp 隐藏；H5 需要可见但缩小占位以便 DOM 查询 */}
      <Canvas
        type="2d"
        id="poster-canvas"
        canvasId="poster-canvas"
        ref={(node) => {
          canvasInstRef.current = node
        }}
        className={Taro.getEnv() === 'WEAPP' ? 'fixed -left-[9999px] top-0' : 'rounded-xl gold-frame'}
        style={{width: `${W / 2.5}px`, height: `${H / 2.5}px`}}
      />

      {/* 预览图 */}
      {posterUrl ? (
        <div className="scale-in flex flex-col items-center gap-4 max-h-[75vh]">
          <div className="rounded-2xl overflow-hidden gold-frame" style={{width: '70vw', lineHeight: 0}}>
            <Image
              src={posterUrl}
              mode="widthFix"
              className="block"
              style={{width: '100%', display: 'block'}}
              showMenuByLongpress
            />
          </div>
          <p className="text-base text-white/80 text-center">长按海报可保存或转发给朋友、群聊</p>
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
      ) : drawing ? (
        <div className="bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
          <div className="i-mdi-image-edit-outline text-5xl text-primary float-slow" />
          <p className="text-xl text-foreground">海报生成中…</p>
          <p className="text-lg text-muted-foreground" onClick={onClose}>取消</p>
        </div>
      ) : null}
    </div>
  )
}

/** 圆角矩形路径 */
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
