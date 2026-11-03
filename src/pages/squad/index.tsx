// @title 球队名单
import {useCallback, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {Avatar} from '@/components/Avatar'
import {TitleBadge} from '@/components/TitleBadge'
import {TraitTags} from '@/components/TraitTags'
import {MemberDetailModal} from '@/components/MemberDetailModal'
import {getAllPlayerAvgRatings, getSquadMember, getSquadRoster} from '@/db/api'

import type {Profile} from '@/db/types'
import {POSITIONS, POSITION_ICONS, memberFinalAbilities, overallAbility} from '@/constants'

function Squad() {
  const {user} = useAuth()
  const [members, setMembers] = useCachedState<Profile[]>('squad-members', [])
  const [filter, setFilter] = useState<string>('全部')
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('squad')
  const [avgRatings, setAvgRatings] = useCachedState<Map<string, number>>('squad-ratings', new Map())
  /** 详情弹层：完整资料（含技能加成），点击卡片时按需拉取 */
  const [detail, setDetail] = useState<Profile | null>(null)

  const loadData = useCallback(async () => {
    startRefresh()
    const [list, ratings] = await Promise.all([getSquadRoster(), getAllPlayerAvgRatings()])
    setMembers(list)
    const map = new Map<string, number>()
    ratings.forEach((rating) => {
      if (rating.avg_rating != null) map.set(rating.user_id, Number(rating.avg_rating))
    })
    setAvgRatings(map)
    finishRefresh()
  }, [])


  useDidShow(() => {
    loadData()
  })

  /** 点击卡片：拉完整资料后直接在本页弹详情，不跳转 */
  const openDetail = async (id: string) => {
    const full = await getSquadMember(id)
    if (full) setDetail(full)
  }

  const filtered =
    filter === '全部'
      ? members
      : members.filter((m) => m.preferred_position === filter || m.secondary_position === filter)

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
        <div className="flex flex-row gap-4 items-center">
          <h1 className="font-heading text-3xl text-primary-foreground">球队名单</h1>
          <p className="text-xl text-primary-foreground/80 mt-2">共 {members.length} 名队员</p>
          <button
            type="button"
            className="ml-auto flex items-center justify-center leading-none break-keep rounded-xl bg-primary-foreground/20 active:scale-95"
            onClick={() => Taro.navigateTo({url: '/pages/rating/index'})}
          >
            <div className="py-2 px-4 flex items-center gap-1.5">
              <div className="i-mdi-star-circle-outline text-2xl text-primary-foreground" />
              <span className="text-lg text-primary-foreground">评分</span>
            </div>
          </button>
        </div>
      </div>

      <div className="px-5 -mt-6 pb-8">
        {/* 位置筛选 */}
        <div className="bg-card rounded-2xl gold-frame p-1.5 flex flex-row gap-1">
          {['全部', ...POSITIONS].map((pos) => (
            <button
              key={pos}
              type="button"
              className={`flex-1 flex items-center justify-center rounded-xl transition ${
                filter === pos ? 'bg-primary' : ''
              }`}
              onClick={() => setFilter(pos)}
            >
              <div className="py-2.5">
                <span
                  className={`text-lg ${filter === pos ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  {pos}
                </span>
              </div>
            </button>
          ))}
        </div>

        {loading && <p className="text-xl text-muted-foreground text-center mt-10">加载中…</p>}

        {!loading && filtered.length === 0 && (
          <div className="mt-6 bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
            <div className="i-mdi-account-group-outline text-5xl text-muted-foreground/50" />
            <p className="text-xl text-muted-foreground">暂无该位置的队员</p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3">
          {!loading &&
            filtered.map((m) => {
              const ability = overallAbility(memberFinalAbilities(m))
              const isMe = m.id === user?.id
              const rating = avgRatings.get(m.id)
              return (
                <div
                  key={m.id}
                  className={`rounded-2xl p-4 ${
                    isMe ? 'bg-primary/10 border-2 border-primary/40' : 'bg-card gold-frame'
                  }`}
                  onClick={() => {
                    void openDetail(m.id)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Avatar url={m.avatar_url} name={m.nickname} size="lg" />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl text-foreground truncate">{m.nickname || '队员'}</span>
                        {m.role === 'admin' && (
                          <span className="px-2 py-0.5 rounded-md bg-gradient-gold text-primary-foreground text-lg">
                            队长
                          </span>
                        )}
                        <TitleBadge titleKey={m.title} size="sm" />
                        {isMe && <span className="text-lg text-primary">(我)</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {m.jersey_number !== null && m.jersey_number !== undefined && (
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-lg">
                            #{m.jersey_number}
                          </span>
                        )}
                        {m.preferred_position && (
                          <span className="flex items-center gap-1 text-lg text-muted-foreground">
                            <div className={`${POSITION_ICONS[m.preferred_position] || 'i-mdi-soccer'} text-lg`} />
                            {m.preferred_position}
                          </span>
                        )}
                        {m.secondary_position && (
                          <span className="text-lg text-muted-foreground/70">/ {m.secondary_position}</span>
                        )}
                      </div>
                      <TraitTags list={m.traits} />
                    </div>
                    {/* 能力总评徽章 */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-heading text-3xl text-primary">{ability ?? '--'}</span>
                      <span className="text-lg text-muted-foreground">总评</span>
                      {rating != null && (
                        <span className="text-base text-muted-foreground">
                          评分 <span className="text-primary font-medium">{rating.toFixed(1)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* 详情弹层：本页直接打开，不跳转 */}
      {detail && (
        <MemberDetailModal member={detail} isSelf={detail.id === user?.id} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

export default withRouteGuard(Squad)
