// @title 战术管理
import {useCallback, useEffect, useMemo, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {Image} from '@tarojs/components'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {LogoBg} from '@/components/LogoBg'
import {Avatar} from '@/components/Avatar'
import {TacticView} from '@/components/TacticView'
import {confirmTactic, deleteTactic, getMyTacticsAll, getTacticsByMe} from '@/db/api'
import type {TacticWithActivity} from '@/db/types'
import {formatActivityTime, TACTIC_LINE_TYPES} from '@/constants'

/** 按活动分组展示的战术卡片列表（展开/收起战术图） */
function TacticCard({
  t,
  mode,
  onConfirm,
  onDelete,
  onGoActivity
}: {
  t: TacticWithActivity
  mode: 'received' | 'sent'
  onConfirm: (id: string) => void
  onDelete: (t: TacticWithActivity) => void
  onGoActivity: (activityId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasGraph = (t.lines || []).length > 0

  return (
    <div className={`bg-card rounded-2xl border-2 p-4 flex flex-col gap-3 ${t.confirmed ? 'border-primary/40' : 'border-destructive/40'}`}>
      {/* 头部：活动信息 + 确认状态 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => onGoActivity(t.activity_id)}>
          <div className="i-mdi-soccer-field text-3xl text-primary shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xl text-foreground truncate">{t.activities?.title || '约战活动'}</span>
            <span className="text-base text-muted-foreground truncate">
              {t.activities?.activity_time ? formatActivityTime(t.activities.activity_time) : ''}
            </span>
          </div>
        </div>
        {t.confirmed ? (
          <span className="px-2 py-0.5 rounded-md bg-primary/15 text-lg text-primary shrink-0">已确认</span>
        ) : mode === 'received' ? (
          <span className="px-2 py-0.5 rounded-md bg-destructive/10 text-lg text-destructive shrink-0">待确认</span>
        ) : (
          <span className="px-2 py-0.5 rounded-md bg-muted text-base text-muted-foreground shrink-0">待确认</span>
        )}
      </div>

      {/* 教练 / 目标队员 */}
      <div className="flex items-center gap-2">
        {mode === 'received' ? (
          <>
            <Avatar url={undefined} name={t.author?.nickname} size="sm" />
            <span className="text-lg text-foreground/80">{t.author?.nickname || '教练'} 的指导</span>
            <span className="px-1.5 py-0.5 rounded bg-muted text-base text-muted-foreground">{t.team}</span>
          </>
        ) : (
          <>
            <Avatar url={undefined} name={t.target?.nickname} size="sm" />
            <span className="text-lg text-foreground/80">指导 {t.target?.nickname || '队员'}</span>
            <span className="px-1.5 py-0.5 rounded bg-muted text-base text-muted-foreground">{t.team}</span>
          </>
        )}
      </div>

      {/* 文字指导 */}
      {t.note && <p className="text-lg text-foreground/80 leading-relaxed">{t.note}</p>}

      {/* 战术图展开/收起 */}
      {hasGraph && (
        <>
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-border/60 bg-background"
            onClick={() => setExpanded((v) => !v)}
          >
            <div className="py-2.5 flex items-center gap-2">
              <div className={`i-mdi-${expanded ? 'chevron-up' : 'chevron-down'} text-2xl text-primary`} />
              <span className="text-lg text-primary">{expanded ? '收起战术图' : '查看战术图'}</span>
            </div>
          </button>
          {expanded && (
            <TacticView
              domId={`tm-view-${t.id}`}
              lines={t.lines || []}
              players={t.players || []}
              viewMode={t.view_mode}
              team={t.team}
            />
          )}
        </>
      )}

      {/* 战术图片附件（教练上传的草图照片） */}
      {t.image_url && (
        <div
          className="rounded-xl overflow-hidden border-2 border-border/60"
          onClick={() => Taro.previewImage({current: t.image_url as string, urls: [t.image_url as string]})}
        >
          <Image src={t.image_url} mode="widthFix" className="w-full" />
        </div>
      )}

      {/* 各战术线/标记的备注说明 */}
      {(t.lines || []).filter((l) => l.note).length > 0 && (
        <div className="flex flex-col gap-1">
          {(t.lines || [])
            .filter((l) => l.note)
            .map((l, i) => {
              const meta = TACTIC_LINE_TYPES.find((m) => m.key === l.kind)
              const segLabel =
                l.kind === 'flag'
                  ? `我方 ${l.order ?? ''}`
                  : l.kind === 'opp'
                    ? `对方 ${l.order ?? ''}`
                    : `${meta?.label || '战术线'} #${l.order ?? ''}`
              return (
                <p key={i} className="text-base text-foreground/70 leading-relaxed">
                  <span className="text-primary font-medium">{segLabel}</span>：{l.note}
                </p>
              )
            })}
        </div>
      )}

      {/* 操作区 */}
      <div className="flex flex-row gap-3">
        {mode === 'received' && !t.confirmed && (
          <button
            type="button"
            className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-primary active:bg-primary/80"
            onClick={() => onConfirm(t.id)}
          >
            <div className="py-2 text-lg text-primary-foreground">确认收到</div>
          </button>
        )}
        {mode === 'sent' && (
          <button
            type="button"
            className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-destructive/50 bg-card"
            onClick={() => onDelete(t)}
          >
            <div className="py-2 text-lg text-destructive">删除</div>
          </button>
        )}
      </div>
    </div>
  )
}

function TacticsManage() {
  const {user, profile} = useAuth()
  const [tab, setTab] = useState<'received' | 'sent'>('received')
  const [received, setReceived] = useState<TacticWithActivity[]>([])
  const [sent, setSent] = useState<TacticWithActivity[]>([])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('tactics-manage')

  const loadData = useCallback(async () => {
    if (!user) {
      finishRefresh()
      return
    }
    startRefresh()
    const [r, s] = await Promise.all([getMyTacticsAll(), getTacticsByMe()])
    setReceived(r)
    setSent(s)
    finishRefresh()
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 返回本页时刷新（确认/删除后导航回来）
  useDidShow(() => {
    if (user) loadData()
  })

  const list = tab === 'received' ? received : sent

  // 待确认数量角标
  const pendingCount = useMemo(() => received.filter((t) => !t.confirmed).length, [received])

  const handleConfirm = async (id: string) => {
    Taro.showLoading({title: '确认中…'})
    const ok = await confirmTactic(id)
    Taro.hideLoading()
    Taro.showToast({title: ok ? '已确认收到' : '操作失败', icon: ok ? 'success' : 'none'})
    if (ok) await loadData()
  }

  const handleDelete = async (t: TacticWithActivity) => {
    const res = await Taro.showModal({title: '删除战术', content: '确定删除该战术指导吗？'})
    if (!res.confirm) return
    const ok = await deleteTactic(t.id)
    if (ok) {
      Taro.showToast({title: '已删除', icon: 'success'})
      await loadData()
    } else {
      Taro.showToast({title: '删除失败', icon: 'none'})
    }
  }

  const goActivity = (activityId: string) => {
    if (activityId) Taro.navigateTo({url: `/pages/activity-detail/index?id=${activityId}`})
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="i-mdi-loading animate-spin text-4xl text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8">
      <LogoBg />
      <div className="relative z-10 flex flex-col">
        <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-1">
          <h1 className="font-heading text-3xl text-foreground">战术管理</h1>
          <p className="text-lg text-muted-foreground">查看收到的战术指导 · 管理下发的战术</p>
        </div>

        {/* Tab 切换 */}
        <div className="px-5 pt-4 flex flex-row gap-3">
          <button
            type="button"
            className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 ${tab === 'received' ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
            onClick={() => setTab('received')}
          >
            <div className="py-2.5 flex items-center gap-2">
              <div className="i-mdi-inbox-arrow-down text-2xl text-primary" />
              <span className="text-lg text-foreground">我收到的</span>
              {pendingCount > 0 && (
                <span className="px-1.5 min-w-7 rounded-full bg-destructive text-base text-white text-center leading-6">
                  {pendingCount}
                </span>
              )}
            </div>
          </button>
          <button
            type="button"
            className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 ${tab === 'sent' ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
            onClick={() => setTab('sent')}
          >
            <div className="py-2.5 flex items-center gap-2">
              <div className="i-mdi-send-outline text-2xl text-primary" />
              <span className="text-lg text-foreground">我下发的</span>
              <span className="px-1.5 min-w-7 rounded-full bg-muted text-base text-muted-foreground text-center leading-6">
                {sent.length}
              </span>
            </div>
          </button>
        </div>

        {/* 列表 */}
        {list.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3">
            <div className="i-mdi-soccer text-6xl text-muted-foreground/40" />
            <p className="text-xl text-muted-foreground">
              {tab === 'received' ? '还没有收到战术指导' : '还没有下发过战术'}
            </p>
            <p className="text-base text-muted-foreground/70">
              {tab === 'received' ? '教练在活动战术板下发后，这里就能看到' : '进入活动详情页，点击「战术指导」开始绘制'}
            </p>
          </div>
        ) : (
          <div className="px-5 pt-4 flex flex-col gap-4">
            {list.map((t) => (
              <TacticCard key={t.id} t={t} mode={tab} onConfirm={handleConfirm} onDelete={handleDelete} onGoActivity={goActivity} />
            ))}
          </div>
        )}

        {/* 引导：去活动页下发新战术（仅管理员/教练可见提示） */}
        {profile?.role === 'admin' && tab === 'sent' && sent.length === 0 && (
          <div className="px-5 pt-6">
            <button
              type="button"
              className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow"
              onClick={() => Taro.switchTab({url: '/pages/activities/index'})}
            >
              <div className="py-3 flex items-center gap-2">
                <div className="i-mdi-soccer-field text-2xl" />
                <span className="text-xl text-primary-foreground">去活动下发战术</span>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(TacticsManage)
