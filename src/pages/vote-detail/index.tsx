// @title 投票详情
import {useCallback, useMemo, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {castPollVote, getPolls, togglePollClosed} from '@/db/api'
import type {PollWithMeta} from '@/db/types'

function VoteDetail() {
  const id = useMemo(() => Taro.getCurrentInstance().router?.params?.id || '', [])
  const {profile} = useAuth()
  const [poll, setPoll] = useState<PollWithMeta | null>(null)
  /** 首次加载是否完成：未完成前不显示"不存在"，避免二次进入闪现 */
  const [loaded, setLoaded] = useState(false)
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('vote-detail')
  const [acting, setActing] = useState(false)

  const loadData = useCallback(async () => {
    if (!id) return
    startRefresh()
    const polls = await getPolls()
    setPoll(polls.find((p) => p.id === id) || null)
    setLoaded(true)
    finishRefresh()
  }, [id])


  useDidShow(() => {
    loadData()
  })

  const handleVote = async (optionId: string) => {
    if (acting || !poll || poll.is_closed) return
    if (poll.my_option_id === optionId) return
    setActing(true)
    try {
      const ok = await castPollVote(poll.id, optionId)
      Taro.showToast({title: ok ? '已投票' : '投票失败，请重试', icon: ok ? 'success' : 'none'})
      if (ok) await loadData()
    } finally {
      setActing(false)
    }
  }

  const handleToggle = async () => {
    if (acting || !poll) return
    // 当前已结束 → 本次操作是重新开启；当前进行中 → 本次操作是结束
    const reopening = poll.is_closed
    const res = await Taro.showModal({
      title: reopening ? '开启投票' : '结束投票',
      content: reopening ? '确定重新开启该投票吗？' : '结束后队员将无法继续投票，确定结束吗？'
    })
    if (!res.confirm) return
    setActing(true)
    try {
      const ok = await togglePollClosed(poll.id, !poll.is_closed)
      if (ok) {
        Taro.showToast({title: reopening ? '已开启' : '已结束', icon: 'success'})
        await loadData()
      } else {
        Taro.showToast({title: '操作失败，请重试', icon: 'none'})
      }
    } finally {
      setActing(false)
    }
  }

  if (loading || !loaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (!poll) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">投票不存在或已删除</p>
      </div>
    )
  }

  const total = poll.options.reduce((s, o) => s + o.votes, 0)
  const canManage = profile?.role === 'admin' || profile?.id === poll.created_by

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8">
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="font-heading text-3xl text-foreground flex-1">{poll.title}</h1>
          {poll.is_closed ? (
            <span className="px-2 py-0.5 rounded-md bg-muted text-lg text-muted-foreground shrink-0">已结束</span>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-accent/20 text-lg text-accent-foreground shrink-0">进行中</span>
          )}
        </div>
        <p className="text-lg text-muted-foreground">
          发起人：{poll.profiles?.nickname || '队员'} · 共 {total} 票
        </p>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-3">
        {poll.options.map((o, i) => {
          const ratio = total > 0 ? Math.round((o.votes / total) * 100) : 0
          const mine = poll.my_option_id === o.id
          return (
            <button
              type="button"
              key={o.id}
              className={`relative flex flex-col items-stretch text-left rounded-2xl border-2 overflow-hidden transition ${
                mine ? 'border-primary' : 'border-border/60 bg-card'
              } ${poll.is_closed ? 'opacity-90' : 'active:scale-[0.98]'}`}
              onClick={() => handleVote(o.id)}
            >
              {/* 占比底条 */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-primary/10 transition-all"
                style={{width: `${ratio}%`}}
              />
              <div className="relative px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${
                    mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-xl text-foreground truncate">{o.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {mine && <div className="i-mdi-check-circle text-2xl text-primary" />}
                  <span className="text-xl text-foreground font-bold">{o.votes}</span>
                  <span className="text-lg text-muted-foreground">({ratio}%)</span>
                </div>
              </div>
            </button>
          )
        })}

        <p className="text-lg text-muted-foreground text-center mt-2">
          {poll.is_closed ? '投票已结束' : '点击选项即可投票，重复点击可改投'}
        </p>

        {canManage && (
          <button
            type="button"
            className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/30"
            onClick={handleToggle}
          >
            <div className="py-3 text-xl text-primary">{poll.is_closed ? '重新开启投票' : '结束投票'}</div>
          </button>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(VoteDetail)
