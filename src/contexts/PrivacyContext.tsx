/**
 * @file 隐私合规上下文
 * 管理用户对《隐私政策》的同意状态，并在首次进入时弹出隐私协议弹窗。
 * 同意状态持久化到本地存储（小程序 Taro.setStorageSync / H5 localStorage）。
 */

import type React from 'react'
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react'
import Taro from '@tarojs/taro'

const STORAGE_KEY = '__privacy_agreed__'
const STORAGE_VERSION_KEY = '__privacy_version__'
// 隐私政策版本号：内容变更时递增，以触发用户重新同意
const PRIVACY_VERSION = '1'

type PrivacyContextValue = {
  agreed: boolean
  showRetain: boolean
  agree: () => void
  disagree: () => void
  dismissRetain: () => void
}

const PrivacyContext = createContext<PrivacyContextValue>({
  agreed: false,
  showRetain: false,
  agree: () => {},
  disagree: () => {},
  dismissRetain: () => {}
})

function readAgreed(): boolean {
  try {
    const version = Taro.getStorageSync(STORAGE_VERSION_KEY)
    const agreed = Taro.getStorageSync(STORAGE_KEY)
    return version === PRIVACY_VERSION && agreed === true
  } catch {
    return false
  }
}

function writeAgreed(value: boolean) {
  try {
    Taro.setStorageSync(STORAGE_KEY, value)
    Taro.setStorageSync(STORAGE_VERSION_KEY, PRIVACY_VERSION)
  } catch {
    // 存储不可用时忽略
  }
}

export const PrivacyProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [agreed, setAgreed] = useState<boolean>(false)
  const [showRetain, setShowRetain] = useState<boolean>(false)

  useEffect(() => {
    setAgreed(readAgreed())
  }, [])

  const agree = useCallback(() => {
    writeAgreed(true)
    setAgreed(true)
    setShowRetain(false)
  }, [])

  const disagree = useCallback(() => {
    // 首次不同意 → 弹出挽留弹窗
    setShowRetain(true)
  }, [])

  const dismissRetain = useCallback(() => {
    setShowRetain(false)
    // 挽留后用户仍可选择，进入仅浏览模式（agreed 保持 false）
  }, [])

  const value = useMemo<PrivacyContextValue>(
    () => ({agreed, showRetain, agree, disagree, dismissRetain}),
    [agreed, showRetain, agree, disagree, dismissRetain]
  )

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}