// @title 发起投票

import Taro from '@tarojs/taro'
import {useEffect, useState} from 'react'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {createPoll} from '@/db/api'

function VoteCreate() {
  const {profile} = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile || isAdmin) return
    Taro.showToast({title: '仅管理员可发起投票', icon: 'none'})
    const timer = setTimeout(() => {
      Taro.navigateBack({fail: () => Taro.switchTab({url: '/pages/home/index'})})
    }, 800)
    return () => clearTimeout(timer)
  }, [profile, isAdmin])

  const setOption = (i: number, v: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)))
  }

  const addOption = () => {
    if (options.length >= 8) return
    setOptions((prev) => [...prev, ''])
  }

  const removeOption = (i: number) => {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    if (saving) return
    if (!isAdmin) {
      Taro.showToast({title: '仅管理员可发起投票', icon: 'none'})
      return
    }
    const t = title.trim()
    const opts = options.map((o) => o.trim()).filter(Boolean)
    if (!t) {
      Taro.showToast({title: '请填写投票主题', icon: 'none'})
      return
    }
    if (opts.length < 2) {
      Taro.showToast({title: '至少需要2个选项', icon: 'none'})
      return
    }
    setSaving(true)
    try {
      const ok = await createPoll(t, opts, null)
      if (ok) {
        Taro.showToast({title: '已发起', icon: 'success'})
        setTimeout(() => Taro.navigateBack(), 600)
      } else {
        Taro.showToast({title: '发起失败，请重试', icon: 'none'})
      }
    } finally {
      setSaving(false)
    }
  }

  if (!profile || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8">
        <div className="i-mdi-shield-lock-outline text-5xl text-muted-foreground" />
        <p className="text-xl text-muted-foreground mt-3">仅管理员可发起投票</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-1">
        <h1 className="font-heading text-3xl text-foreground">发起投票</h1>
        <p className="text-lg text-muted-foreground">队内事务表决 · 全员可投</p>
      </div>

      <div className="px-5 pt-5 pb-8 flex flex-col gap-5">
        {/* 主题 */}
        <div className="bg-card rounded-2xl border-2 border-border/60 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xl text-foreground font-bold">投票主题</span>
            <span className="text-destructive">*</span>
          </div>
          <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
            <input
              className="w-full text-xl text-foreground bg-transparent outline-none"
              placeholder="例如：本周聚餐定哪天？"
              maxLength={60}
              value={title}
              onInput={(e) => {
                const ev = e as any
                setTitle(ev.detail?.value ?? ev.target?.value ?? '')
              }}
            />
          </div>
        </div>

        {/* 选项 */}
        <div className="bg-card rounded-2xl border-2 border-border/60 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xl text-foreground font-bold">投票选项</span>
            <span className="text-destructive">*</span>
            <span className="text-lg text-muted-foreground">（2-8个）</span>
          </div>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0 border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder={`选项 ${i + 1}`}
                  maxLength={60}
                  value={o}
                  onInput={(e) => {
                    const ev = e as any
                    setOption(i, ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
              {options.length > 2 && (
                <button
                  type="button"
                  className="flex items-center justify-center leading-none break-keep rounded-xl bg-muted w-11 h-11 shrink-0"
                  onClick={() => removeOption(i)}
                >
                  <div className="i-mdi-close text-2xl text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button
              type="button"
              className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-dashed border-primary/40 bg-primary/5"
              onClick={addOption}
            >
              <div className="py-2.5 text-xl text-primary flex items-center gap-1">
                <div className="i-mdi-plus text-2xl text-primary" />
                <span>添加选项</span>
              </div>
            </button>
          )}
        </div>

        {/* 提交 */}
        <button
          type="button"
          className={`flex items-center justify-center leading-none break-keep rounded-xl ${saving ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
          onClick={handleSave}
        >
          <div className="py-3.5 text-2xl text-primary-foreground">{saving ? '提交中…' : '发起投票'}</div>
        </button>
      </div>
    </div>
  )
}

export default withRouteGuard(VoteCreate)
