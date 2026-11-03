// @title 投票中心

import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useState} from 'react'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {getPolls} from '@/db/api'
import type {PollWithMeta} from '@/db/types'

function VoteCenter() {
  const {profile} = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [polls, setPolls] = useState<PollWithMeta[]>([])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('vote-center')

  const loadData = useCallback(async () => {
    startRefresh()
    setPolls(await getPolls())
    finishRefresh()
  }, [])


  useDidShow(() => {
    loadData()
  })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 头部 */}
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-1">
        <h1 className="font-heading text-3xl text-foreground">投票中心</h1>
        <p className="text-lg text-muted-foreground">队内事务表决</p>
      </div>

      {/* 事务投票列表 */}
      <div className="px-5 pt-6 pb-8 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-2xl text-foreground">队内事务投票</h3>
          {isAdmin && (
            <button
              type="button"
              className="flex items-center justify-center leading-none break-keep rounded-xl bg-primary"
              onClick={() => Taro.navigateTo({url: '/pages/vote-create/index'})}
            >
              <div className="py-2 px-4 text-lg text-primary-foreground flex items-center gap-1">
                <div className="i-mdi-plus text-xl text-primary-foreground" />
                <span>发起投票</span>
              </div>
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-xl text-muted-foreground text-center py-8">加载中…</p>
        ) : polls.length === 0 ? (
          <div className="bg-card rounded-2xl border-2 border-border/60 py-10 flex flex-col items-center gap-2">
            <div className="i-mdi-vote-outline text-5xl text-muted-foreground/50" />
            <p className="text-lg text-muted-foreground">{isAdmin ? '还没有投票，发起第一个吧' : '还没有投票'}</p>
          </div>
        ) : (
          polls.map((p) => {
            const total = p.options.reduce((s, o) => s + o.votes, 0)
            const myLabel = p.options.find((o) => o.id === p.my_option_id)?.label
            return (
              <div
                key={p.id}
                className="bg-card rounded-2xl border-2 border-border/60 p-4"
                onClick={() => Taro.navigateTo({url: `/pages/vote-detail/index?id=${p.id}`})}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xl text-foreground font-bold flex-1 min-w-0">{p.title}</h4>
                  {p.is_closed ? (
                    <span className="px-2 py-0.5 rounded-md bg-muted text-lg text-muted-foreground">已结束</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-accent/20 text-lg text-accent-foreground">进行中</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-lg text-muted-foreground">共 {total} 票 · {p.options.length} 个选项</span>
                  {myLabel && (
                    <span className="px-2 py-0.5 rounded-md bg-primary/15 text-lg text-primary">已投：{myLabel}</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(VoteCenter)
