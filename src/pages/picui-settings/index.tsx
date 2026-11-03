// @title 图床设置
import {useCallback, useEffect, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {getPicuiStatus, savePicuiToken} from '@/db/api'
import type {PicuiStatus} from '@/db/types'

/** picui 接口：size 单位为 KB，capacity 单位为 MB，需分别换算展示 */
function formatKB(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`
  return `${Math.max(0, kb).toFixed(2)} KB`
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.max(0, Math.round(mb))} MB`
}

function PicuiSettings() {
  const {profile, loading: authLoading} = useAuth()
  const [status, setStatus] = useState<PicuiStatus | null>(null)
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('picui-settings')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    startRefresh()
    setStatus(await getPicuiStatus())
    finishRefresh()
  }, [])


  useDidShow(() => {
    loadData()
  })

  // 权限拦截：仅队长可访问
  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'admin') {
      Taro.showToast({title: '仅队长可访问此页面', icon: 'none'})
      setTimeout(() => Taro.navigateBack(), 900)
    }
  }, [authLoading, profile])

  const handleSave = async () => {
    const t = token.trim()
    if (!t) {
      Taro.showToast({title: '请输入 Token', icon: 'none'})
      return
    }
    setSaving(true)
    try {
      await savePicuiToken(t)
      setToken('')
      Taro.showToast({title: '保存成功', icon: 'success'})
      loadData()
    } catch (e) {
      Taro.showToast({title: (e as Error).message || '保存失败', icon: 'none'})
    } finally {
      setSaving(false)
    }
  }

  const p = status?.profile
  // size 为 KB、capacity 为 MB，统一换算成 KB 计算占比
  const usagePct = p && p.capacity > 0 ? Math.min(100, Math.round((p.size / (p.capacity * 1024)) * 100)) : 0

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 头部 */}
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-1">
        <h1 className="font-heading text-3xl text-foreground">图床设置</h1>
        <p className="text-lg text-muted-foreground">群相册图片存储服务配置（仅队长）</p>
      </div>

      <div className="px-5 pt-6 pb-8 flex flex-col gap-4">
        {loading ? (
          <p className="text-xl text-muted-foreground text-center py-8">加载中…</p>
        ) : (
          <>
            {/* 账号状态 */}
            {status?.configured && status.valid && p && (
              <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shrink-0">
                    <div className="i-mdi-check-decagram text-3xl text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <h3 className="font-heading text-2xl text-foreground">服务正常</h3>
                    <p className="text-lg text-muted-foreground truncate">账号：{p.username || p.name || '未知'}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-lg text-foreground">存储用量</span>
                    <span className="text-lg text-muted-foreground">{formatKB(p.size)} / {formatMB(p.capacity)}</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-gold" style={{width: `${usagePct}%`}} />
                  </div>
                </div>
                <div className="flex flex-row gap-3">
                  <div className="flex-1 bg-muted rounded-xl px-4 py-3 flex flex-col items-center gap-1">
                    <span className="font-heading text-2xl text-primary">{p.image_num}</span>
                    <span className="text-lg text-muted-foreground">图片数量</span>
                  </div>
                  <div className="flex-1 bg-muted rounded-xl px-4 py-3 flex flex-col items-center gap-1">
                    <span className="font-heading text-2xl text-primary">{p.album_num}</span>
                    <span className="text-lg text-muted-foreground">图床相册</span>
                  </div>
                </div>
              </div>
            )}

            {/* 配置异常 */}
            {status?.configured && status.valid === false && (
              <div className="bg-card rounded-2xl border-2 border-destructive/40 p-5 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="i-mdi-alert-circle-outline text-2xl text-destructive" />
                  <h3 className="font-heading text-2xl text-foreground">配置异常</h3>
                </div>
                <p className="text-lg text-muted-foreground">{status.message || 'Token 已失效，请在下方重新配置'}</p>
              </div>
            )}

            {/* Token 配置表单 */}
            <div className="bg-card rounded-2xl border-2 border-border/60 p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xl text-foreground font-bold">picui API Token</span>
                <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                  <input
                    className="w-full text-lg text-foreground bg-transparent outline-none"
                    placeholder="粘贴 picui.cn 个人中心的 API Token"
                    maxLength={300}
                    value={token}
                    onInput={(e) => {
                      const ev = e as any
                      setToken(ev.detail?.value ?? ev.target?.value ?? '')
                    }}
                  />
                </div>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  获取方式：登录 picui.cn，进入「个人中心」，创建 API Token（形如 1|xxxx…），复制后粘贴到上方输入框。
                </p>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  注意：创建 Token 时需勾选接口权限——用户资料、上传图片、删除图片（建议全选），缺少对应权限会导致对应功能不可用。
                </p>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  保存时系统调用 picui.cn「用户资料」接口校验有效性；Token 仅保存在服务器，队员端不可见。
                </p>
              </div>
              <button
                type="button"
                className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${saving ? 'bg-primary/50' : 'bg-primary'} lift-glow`}
                onClick={handleSave}
              >
                <div className="py-3.5 px-6 text-xl text-primary-foreground">
                  {saving ? '校验并保存中…' : status?.configured ? '更新 Token' : '保存并启用'}
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(PicuiSettings)
