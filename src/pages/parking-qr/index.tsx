// @title 锐博停车码

import {Image} from '@tarojs/components'
import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useRef, useState} from 'react'
import {supabase} from '@/client/supabase'
import {LogoBg} from '@/components/LogoBg'
import {withRouteGuard} from '@/components/RouteGuard'

const PARKING_QR_URL = 'https://miaoda-conversation-file.cdn.bcebos.com/user-ekxo3uclrw1s/app-ekxp48jlavpd/20260928/758f71c7e3bdb80ef86ce60eb3c124fa_1790560161057.jpg'
const PARKING_CAR_NUMBER_KEY = 'parking-qr:car-number'
const MANUAL_SCAN_HINT = '请手动扫码尝试'

function normalizeCarNumber(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 8)
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as {context?: {text?: () => Promise<string>}} | null)?.context
  try {
    const text = await context?.text?.()
    const parsed: unknown = text ? JSON.parse(text) : null
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }
  } catch {
    // 保留默认提示。
  }
  return MANUAL_SCAN_HINT
}

function ParkingQr() {
  const [carNumber, setCarNumber] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponMessage, setCouponMessage] = useState('')
  const [qrVisible, setQrVisible] = useState(false)
  const couponLoadingRef = useRef(false)

  const requestCoupon = useCallback(async (rawCarNumber: string) => {
    const normalized = normalizeCarNumber(rawCarNumber)
    if (!normalized || couponLoadingRef.current) return
    couponLoadingRef.current = true
    setCouponLoading(true)
    try {
      const {data, error} = await supabase.functions.invoke('parking-coupon', {
        body: {car_number: normalized}
      })
      if (error) {
        const message = await functionErrorMessage(error)
        setCouponMessage(message)
        Taro.showToast({title: message, icon: 'none', duration: 2500})
        return
      }
      const message = data && typeof data === 'object' && typeof data.message === 'string' && data.message.trim()
        ? data.message.trim()
        : '请求完成'
      setCouponMessage(message)
      Taro.showToast({title: message, icon: 'none', duration: 2500})
    } catch (error) {
      console.error('give parking coupon failed:', error)
      setCouponMessage(MANUAL_SCAN_HINT)
      Taro.showToast({title: MANUAL_SCAN_HINT, icon: 'none'})
    } finally {
      couponLoadingRef.current = false
      setCouponLoading(false)
    }
  }, [])

  useDidShow(() => {
    let cached = ''
    try {
      cached = normalizeCarNumber(Taro.getStorageSync(PARKING_CAR_NUMBER_KEY))
    } catch {
      cached = ''
    }
    if (!cached) return
    setCarNumber(cached)
    void requestCoupon(cached)
  })

  const handleCarNumberInput = (event: any) => {
    setCarNumber(normalizeCarNumber(event.detail?.value ?? event.target?.value))
  }

  const handleCoupon = () => {
    const normalized = normalizeCarNumber(carNumber)
    if (!normalized) {
      setCouponMessage('请输入车牌号')
      Taro.showToast({title: '请输入车牌号', icon: 'none'})
      return
    }
    setCarNumber(normalized)
    try {
      Taro.setStorageSync(PARKING_CAR_NUMBER_KEY, normalized)
    } catch (error) {
      console.warn('save parking car number failed:', error)
    }
    void requestCoupon(normalized)
  }

  return (
    <div className="min-h-screen bg-background relative px-5 py-6 flex flex-col items-center">
      <LogoBg />
      <div className="relative z-10 w-full flex flex-col items-center gap-5">
        <h1 className="font-heading text-3xl text-foreground">锐博足球公园停车码</h1>

        <div className="w-full bg-card rounded-2xl gold-frame p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-2xl text-foreground">停车费减免</h2>
            <span className="text-base text-muted-foreground">车牌自动大写</span>
          </div>
          <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="请输入车牌号，如川A12345"
              maxLength={8}
              value={carNumber}
              onInput={handleCarNumberInput}
            />
          </div>
          {couponMessage ? <p className="text-sm text-muted-foreground leading-relaxed">{couponMessage}</p> : null}
          <button
            type="button"
            disabled={couponLoading}
            className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${couponLoading ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
            onClick={handleCoupon}
          >
            <span className="py-3 text-xl text-primary-foreground">{couponLoading ? '减免处理中…' : '申请停车费减免'}</span>
          </button>
          <p className="text-sm text-muted-foreground">点击申请后会记住车牌，下次进入本页自动申请。</p>
        </div>

        <div className="w-full flex items-center">
          <div className="vine-divider-side flex-1" />
          <span className="px-3 text-base text-muted-foreground">或</span>
          <div className="vine-divider-side-end flex-1" />
        </div>

        <button
          type="button"
          className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/40"
          onClick={() => setQrVisible((visible) => !visible)}
        >
          <span className="py-3 text-xl text-primary">{qrVisible ? '收起停车码' : '手动扫码'}</span>
        </button>
        {qrVisible ? (
          <>
            <div className="rounded-2xl bg-card gold-frame p-4">
              <Image
                src={PARKING_QR_URL}
                mode="aspectFit"
                style={{width: '78vw', height: '78vw'}}
                className="rounded-xl"
                showMenuByLongpress
              />
            </div>
            <p className="text-base text-muted-foreground">长按图片可保存到相册</p>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default withRouteGuard(ParkingQr)
