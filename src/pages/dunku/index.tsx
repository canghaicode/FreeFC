// @title 蹲坑专区

import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useState} from 'react'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {Avatar} from '@/components/Avatar'
import {LogoBg} from '@/components/LogoBg'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {
  closeKickRequest,
  createKickRequest,
  getKickRequests,
  joinKickRequest,
  leaveKickRequest
} from '@/db/api'
import type {KickRequest} from '@/db/types'

function Dunku() {
  const {user, profile} = useAuth()
  const [kicks, setKicks] = useState<KickRequest[]>([])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('dunku')
  const [showForm, setShowForm] = useState(false)
  const [ptime, setPtime] = useState('')
  const [ploc, setPloc] = useState('')
  const [pnote, setPnote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isAdmin = profile?.role === 'admin'

  const loadData = useCallback(async () => {
    startRefresh()
    const list = await getKickRequests('open')
    setKicks(list)
    finishRefresh()
  }, [])


  useDidShow(() => {
    loadData()
  })

  const resetForm = () => {
    setPtime('')
    setPloc('')
    setPnote('')
    setShowForm(false)
  }

  const handleCreate = async () => {
    if (submitting) return
    if (!isAdmin) {
      Taro.showToast({title: '仅管理员可发起蹲坑', icon: 'none'})
      return
    }
    if (!ptime.trim() || !ploc.trim()) {
      Taro.showToast({title: '请填写期望时间和场地', icon: 'none'})
      return
    }
    setSubmitting(true)
    try {
      const ok = await createKickRequest({preferred_time: ptime, preferred_location: ploc, note: pnote})
      if (ok) {
        Taro.showToast({title: '蹲坑已发起', icon: 'success'})
        resetForm()
        loadData()
      } else {
        Taro.showToast({title: '发起失败', icon: 'none'})
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleJoin = async (k: KickRequest) => {
    const ok = await joinKickRequest(k.id)
    Taro.showToast({title: ok ? '已加入' : '操作失败', icon: ok ? 'success' : 'none'})
    if (ok) loadData()
  }

  const handleLeave = async (k: KickRequest) => {
    const ok = await leaveKickRequest(k.id)
    Taro.showToast({title: ok ? '已退出' : '操作失败', icon: ok ? 'success' : 'none'})
    if (ok) loadData()
  }

  const handleClose = async (k: KickRequest) => {
    const res = await Taro.showModal({title: '关闭蹲坑', content: '确定关闭该蹲坑？'})
    if (!res.confirm) return
    const ok = await closeKickRequest(k.id)
    Taro.showToast({title: ok ? '已关闭' : '操作失败', icon: ok ? 'success' : 'none'})
    if (ok) loadData()
  }

  const handleConvert = (k: KickRequest) => {
    const url = `/pages/activity-create/index?dunku_id=${k.id}&preferred_location=${encodeURIComponent(k.preferred_location)}&preferred_time=${encodeURIComponent(k.preferred_time)}`
    Taro.navigateTo({url})
  }

  const fieldCls = 'border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden'

  return (
    <div className="min-h-screen bg-background relative">
      <LogoBg />
      <div className="relative z-10 px-5 py-6 flex flex-col gap-4">
        <div className="bg-gradient-primary rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="i-mdi-account-group-outline text-3xl text-primary-foreground" />
            <h1 className="font-heading text-3xl text-primary-foreground">蹲坑专区</h1>
          </div>
          <p className="text-lg text-primary-foreground/80">想踢球但没场次？发起蹲坑凑人数，达到阈值队长就能加场</p>
        </div>

        {isAdmin && (
          <button
            type="button"
            className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${showForm ? 'bg-muted' : 'bg-primary lift-glow'}`}
            onClick={() => setShowForm((s) => !s)}
          >
            <div className="py-3 px-6 flex items-center gap-2">
              <div className={`${showForm ? 'i-mdi-close' : 'i-mdi-plus'} text-xl ${showForm ? 'text-muted-foreground' : 'text-primary-foreground'}`} />
              <span className={`text-xl ${showForm ? 'text-muted-foreground' : 'text-primary-foreground'}`}>{showForm ? '收起' : '发起蹲坑'}</span>
            </div>
          </button>
        )}

        {isAdmin && showForm && (
          <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">期望时间</span>
              <div className={fieldCls}>
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="如：本周六晚 20:00"
                  value={ptime}
                  onInput={(e) => {
                    const ev = e as any
                    setPtime(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">期望场地</span>
              <div className={fieldCls}>
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="如：锦城足球公园"
                  value={ploc}
                  onInput={(e) => {
                    const ev = e as any
                    setPloc(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">备注（选填）</span>
              <div className={`${fieldCls} h-24`}>
                <textarea
                  className="w-full h-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="如：缺守门员、可约外战"
                  value={pnote}
                  onInput={(e) => {
                    const ev = e as any
                    setPnote(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
              onClick={handleCreate}
            >
              <div className="py-3 px-6 text-xl text-primary-foreground">{submitting ? '提交中…' : '提交蹲坑'}</div>
            </button>
          </div>
        )}

        {loading && <p className="text-xl text-muted-foreground text-center py-8">加载中…</p>}

        {!loading && kicks.length === 0 && (
          <div className="bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
            <div className="i-mdi-account-group-outline text-5xl text-muted-foreground/50" />
            <p className="text-xl text-muted-foreground">{isAdmin ? '还没有蹲坑，点击上方按钮发起' : '暂无进行中的蹲坑'}</p>
          </div>
        )}

        {!loading &&
          kicks.map((k) => {
            const reached = k.participant_count >= k.target
            const joined = k.participants.some((p) => p.user_id === user?.id)
            const isCreator = k.creator_id === user?.id
            const canManage = isCreator || isAdmin
            return (
              <div key={k.id} className={`bg-card rounded-2xl p-4 flex flex-col gap-3 ${reached ? 'gold-frame lift-glow' : 'border-2 border-border/60'}`}>
                {reached && (
                  <div className="flex items-center gap-1 self-start px-3 py-1 rounded-full bg-gradient-gold">
                    <div className="i-mdi-fire text-lg text-primary-foreground" />
                    <span className="text-base text-primary-foreground font-medium">人数已达标，可加场</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Avatar url={k.creator_avatar} name={k.creator_nickname} size="sm" />
                  <span className="text-lg text-muted-foreground flex-1">{k.creator_nickname || '队员'} 发起</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="i-mdi-clock-outline text-xl text-primary" />
                    <span className="text-xl text-foreground">{k.preferred_time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="i-mdi-map-marker-outline text-xl text-primary" />
                    <span className="text-xl text-foreground flex-1">{k.preferred_location}</span>
                  </div>
                  {k.note ? (
                    <div className="flex items-start gap-2">
                      <div className="i-mdi-note-text-outline text-xl text-muted-foreground mt-0.5" />
                      <span className="text-lg text-muted-foreground flex-1">{k.note}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-gold rounded-full" style={{width: `${Math.min(100, (k.participant_count / k.target) * 100)}%`}} />
                  </div>
                  <span className="text-lg text-muted-foreground">{k.participant_count}/{k.target} 人</span>
                </div>

                {k.participants.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {k.participants.slice(0, 6).map((p) => (
                      <Avatar key={p.user_id} url={p.avatar_url} name={p.nickname} size="sm" />
                    ))}
                    {k.participants.length > 6 && <span className="text-base text-muted-foreground">+{k.participants.length - 6}</span>}
                  </div>
                )}

                <div className="flex flex-row gap-2">
                  {joined ? (
                    <button type="button" className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-muted" onClick={() => handleLeave(k)}>
                      <div className="py-2.5 px-4 text-lg text-muted-foreground">取消加入</div>
                    </button>
                  ) : (
                    <button type="button" className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-primary" onClick={() => handleJoin(k)}>
                      <div className="py-2.5 px-4 text-lg text-primary-foreground">我也想踢</div>
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold" onClick={() => handleConvert(k)}>
                      <div className="py-2.5 px-4 text-lg text-primary-foreground">一键转活动</div>
                    </button>
                  )}
                  {canManage && (
                    <button type="button" className="flex items-center justify-center leading-none break-keep rounded-xl bg-muted px-3" onClick={() => handleClose(k)}>
                      <div className="py-2.5 text-lg text-muted-foreground">关闭</div>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

export default withRouteGuard(Dunku)