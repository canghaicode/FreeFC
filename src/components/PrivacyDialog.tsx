/**
 * @file 隐私协议弹窗组件
 * // [compliance] M01 隐私政策弹窗
 * 首次进入、收集任何个人信息之前展示。
 * 提供「同意」/「不同意」等权重按钮，不同意可进入仅浏览模式。
 * 用户点击不同意后弹出一次挽留弹窗，二次拒绝后进入仅浏览模式。
 */

import type React from 'react'
import Taro from '@tarojs/taro'
import {usePrivacy} from '@/contexts/PrivacyContext'

const PrivacyDialog: React.FC = () => {
  const {agreed, showRetain, agree, disagree, dismissRetain} = usePrivacy()

  const openPolicy = () => {
    Taro.navigateTo({url: '/pages/privacy-policy/index'})
  }

  if (agreed) return null

  // 挽留弹窗：用户首次点击「不同意」后展示
  if (showRetain) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-8">
        <div className="w-full bg-card rounded-2xl p-6">
          <h3 className="font-heading text-2xl text-foreground text-center mb-3">温馨提示</h3>
          <p className="text-xl text-muted-foreground leading-relaxed text-center">
            自由人FC仅会将信息用于提供球队管理服务和改善使用体验，我们将全力保障您的信息安全，请同意协议后使用。
          </p>
          <button
            type="button"
            className="w-full mt-6 flex items-center justify-center leading-none break-keep rounded-xl bg-primary"
            onClick={dismissRetain}
          >
            <div className="py-3.5 text-xl text-primary-foreground">知道了</div>
          </button>
        </div>
      </div>
    )
  }

  // 隐私政策同意弹窗
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-6">
      <div className="w-full bg-card rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-heading text-2xl text-foreground text-center mb-4">服务协议与隐私政策</h3>
        <p className="text-lg text-muted-foreground leading-relaxed">
          在使用自由人FC基本功能前，请您仔细阅读
          <span className="text-primary underline" onClick={openPolicy}>《隐私政策》</span>
          。本应用会收集您的昵称、头像、出勤与比赛数据等必要信息，用于球队管理、数据统计与海报生成等基本业务功能。
        </p>
        <p className="text-lg text-muted-foreground leading-relaxed mt-3">
          您同意本隐私政策，仅代表您已了解本产品提供的基本业务功能及其运行所需的必要个人信息。对于附加业务功能的个人信息处理，会在您使用过程中单独征求您的同意，如您拒绝提供，不会影响您使用我们的基本业务功能。
        </p>

        {/* 同意 / 不同意 等权重按钮 */}
        <div className="flex flex-row gap-3 mt-6">
          <button
            type="button"
            className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-card border-2 border-border"
            onClick={disagree}
          >
            <div className="py-3.5 text-xl text-foreground">不同意</div>
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-primary"
            onClick={agree}
          >
            <div className="py-3.5 text-xl text-primary-foreground">同意并继续</div>
          </button>
        </div>
      </div>
    </div>
  )
}

export default PrivacyDialog