/**
 * @file Taro application entry file
 */

import type React from 'react'
import type {PropsWithChildren} from 'react'
import {useEffect} from 'react'
import Taro from '@tarojs/taro'
import {useTabBarPageClass} from '@/hooks/useTabBarPageClass'

import './app.scss'
import {AuthProvider} from '@/contexts/AuthContext'
import {PrivacyProvider} from '@/contexts/PrivacyContext'
import {getGrowthConfig} from '@/db/api'
import {setGrowthConfig} from '@/constants'
import {ErrorBoundary} from '@/components/ErrorBoundary'
import PrivacyDialog from '@/components/PrivacyDialog'

const FONTS = [
  {
    family: 'SourceHanSerifCN',
    source: 'url("https://resource-static.bj.bcebos.com/fonts-skill/SourceHanSerifCN-Bold.woff2")'
  },
  {
    family: 'AlibabaPuHuiTi',
    source: 'url("https://resource-static.bj.bcebos.com/fonts-skill/AlibabaPuHuiTi_Regular.ttf")'
  }
]

const App: React.FC = ({children}: PropsWithChildren<unknown>) => {
  useTabBarPageClass()

  useEffect(() => {
    // 小程序环境需要 loadFontFace 加载远程字体（H5 由 app.scss 的 @font-face 覆盖）
    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
      FONTS.forEach((font) => {
        Taro.loadFontFace({
          global: true,
          family: font.family,
          source: font.source
        }).catch(() => {
          // 字体加载失败时回退系统字体，不打断启动
        })
      })
    }
    // 加载队长后台配置的成长数值，同步到前端计算引擎
    getGrowthConfig().then((c) => setGrowthConfig(c)).catch(() => {})
  }, [])

  useEffect(() => {
    // 仅在 Web (H5) 浏览器环境防范动态加载失败刷新，微信小程序 (WEAPP) 无 window/sessionStorage，严禁执行
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB || typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return
    }
    const KEY = '__module_reload_guard__'
    const onModuleFetchFail = (msg: string) => {
      if (!msg || !msg.includes('Failed to fetch dynamically imported module')) return
      try {
        if (sessionStorage.getItem(KEY)) return
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
      } catch {
        // 存储不可用时忽略，避免二次抛错
      }
    }
    const onErr = (e: ErrorEvent) => onModuleFetchFail(e?.message || '')
    const onRejection = (e: PromiseRejectionEvent) => {
      const r: any = e?.reason
      onModuleFetchFail((r?.message || String(r ?? '')) as string)
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRejection)
    // 启动成功即清除守卫标记，后续再遇瞬时失败仍可自动恢复
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // ignore
    }
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return (
    <ErrorBoundary>
      <PrivacyProvider>
        <AuthProvider>{children}</AuthProvider>
        {/* // [compliance] M01 隐私政策弹窗：首次进入展示 */}
        <PrivacyDialog />
      </PrivacyProvider>
    </ErrorBoundary>
  )
}

export default App
