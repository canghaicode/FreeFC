// @title 账号注销
/**
 * // [compliance] M09 账号注销流程
 * 设置 > 账号管理 > 账号注销，5 次操作内可达。
 * 注销前展示数据清除说明，注销/取消按钮等视觉权重。
 */

import type React from 'react'
import {useState} from 'react'
import Taro from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import {supabase} from '@/client/supabase'
import {useAuth} from '@/contexts/AuthContext'

const AccountDelete: React.FC = () => {
  const {user, signOut} = useAuth()
  const [step, setStep] = useState<'intro' | 'confirm'>('intro')
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!user) return
    setLoading(true)
    try {
      const {data, error} = await supabase.functions.invoke('delete-account')
      if (error || data?.error) {
        Taro.showToast({title: '注销失败，请稍后重试', icon: 'none'})
        return
      }
      // 清除本地登录状态
      await signOut()
      Taro.showToast({title: '账号已注销', icon: 'success'})
      setTimeout(() => {
        Taro.reLaunch({url: '/pages/login/index'})
      }, 1200)
    } catch {
      Taro.showToast({title: '网络异常，请稍后重试', icon: 'none'})
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="bg-gradient-primary px-6 py-8">
        <h1 className="font-heading text-3xl text-primary-foreground">账号注销</h1>
        <p className="text-lg text-primary-foreground/80 mt-2">请仔细阅读注销须知</p>
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">
        <div className="bg-card rounded-2xl border-2 border-border/60 p-5">
          <h2 className="font-heading text-xl text-foreground mb-3">注销须知</h2>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2">
              <div className="i-mdi-alert-circle-outline text-xl text-destructive mt-0.5" />
              <span className="flex-1 text-lg text-muted-foreground leading-relaxed">
                注销后，您的账号将无法恢复，所有相关数据将被清除。
              </span>
            </div>
            <div className="flex items-start gap-2">
              <div className="i-mdi-database-remove-outline text-xl text-primary mt-0.5" />
              <span className="flex-1 text-lg text-muted-foreground leading-relaxed">
                将清除：您的昵称、头像、出勤记录、比赛数据、能力评分、赛后匿名表现评分、投票记录、装备信息等全部个人数据。
              </span>
            </div>
            <div className="flex items-start gap-2">
              <div className="i-mdi-clock-outline text-xl text-primary mt-0.5" />
              <span className="flex-1 text-lg text-muted-foreground leading-relaxed">
                为保障数据安全，部分必要的日志信息可能依法保留一定期限。
              </span>
            </div>
          </div>
        </div>

        {step === 'intro' ? (
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-destructive"
            onClick={() => setStep('confirm')}
          >
            <div className="py-3.5 text-xl text-destructive-foreground">我已了解，继续注销</div>
          </button>
        ) : (
          <div className="bg-card rounded-2xl border-2 border-destructive/40 p-5">
            <h3 className="font-heading text-xl text-foreground mb-2">最终确认</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-4">
              确认要注销当前账号吗？此操作不可撤销。
            </p>
            {/* 注销 / 取消 等权重按钮 */}
            <div className="flex flex-row gap-3">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-card border-2 border-border"
                onClick={() => setStep('intro')}
              >
                <div className="py-3.5 text-xl text-foreground">取消</div>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${loading ? 'bg-destructive/50' : 'bg-destructive'}`}
                onClick={handleDelete}
              >
                <div className="py-3.5 text-xl text-destructive-foreground">
                  {loading ? '注销中...' : '确认注销'}
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(AccountDelete)