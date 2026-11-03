// @title 球员评分
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {PageMeta} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {Avatar} from '@/components/Avatar'
import {RatingModal} from '@/components/RatingModal'
import {getRatingMembers} from '@/db/api'
import {positionShort} from '@/constants'
import type {RatingMemberRow} from '@/db/api'

/** 独立评分页：全队成员综合评分列表，点击成员打分（分值/标签/评语） */
export default function RatingPage() {
  const {user} = useAuth()
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('rating')
  const [members, setMembers] = useCachedState<RatingMemberRow[]>('rating-members', [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const locatedRef = useRef(false)

  /** 从球星卡跳转时定位到指定成员 */
  const memberParam = useMemo(() => Taro.getCurrentInstance().router?.params?.member_id || '', [])
  const selected = useMemo(
    () => (selectedId ? members.find((member) => member.id === selectedId) ?? null : null),
    [members, selectedId]
  )

  const loadData = useCallback(async () => {
    startRefresh()
    setMembers(await getRatingMembers())
    finishRefresh()
  }, [])

  useDidShow(() => {
    loadData()
  })

  /** 列表加载完成后，若带定位参数则直接打开该成员的评分弹窗 */
  useEffect(() => {
    if (!locatedRef.current && memberParam && members.length > 0) {
      const member = members.find((item) => item.id === memberParam)
      if (member) setSelectedId(member.id)
      locatedRef.current = true
    }
  }, [members, memberParam])


  return (
    <>
    <PageMeta pageStyle={selectedId ? 'overflow: hidden;' : ''} />
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
        <h1 className="font-heading text-3xl text-primary-foreground">球员评分</h1>
        <p className="text-xl text-primary-foreground/80 mt-2">点击队员卡片进行打分，1-10分</p>
      </div>

      <div className="px-5 -mt-6 pb-8 flex flex-col gap-3">
        {loading && <p className="text-xl text-muted-foreground text-center mt-10">加载中…</p>}

        {!loading && members.length === 0 && (
          <div className="mt-2 bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
            <div className="i-mdi-star-outline text-5xl text-muted-foreground/50" />
            <p className="text-xl text-muted-foreground">暂无队员</p>
          </div>
        )}

        {!loading &&
          members.map((m, index) => {
            const rating = m.avg_rating
            return (
              <div
                key={m.id}
                className="bg-card rounded-2xl gold-frame p-3 flex items-center gap-3 active:scale-[0.98] transition"
                onClick={() => setSelectedId(m.id)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-heading text-lg ${
                  index === 0 ? 'bg-amber-400 text-amber-950' : index === 1 ? 'bg-slate-300 text-slate-800' : index === 2 ? 'bg-amber-700 text-amber-50' : 'bg-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <Avatar url={m.avatar_url} name={m.nickname} />
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-xl text-foreground truncate">
                    {m.nickname || '队员'}
                    {m.id === user?.id && <span className="text-base text-primary">（我）</span>}
                  </span>
                  <span className="text-base text-muted-foreground">
                    {positionShort(m.preferred_position)}
                    {rating != null ? ` · ${m.rating_count}人评分` : ' · 暂无评分'}
                  </span>
                </div>
                {rating != null ? (
                  <span className="font-heading text-3xl text-primary shrink-0">{rating.toFixed(1)}</span>
                ) : (
                  <span className="font-heading text-3xl text-muted-foreground/40 shrink-0">--</span>
                )}
              </div>
            )
          })}
      </div>

      <RatingModal
        visible={!!selected}
        member={selected}
        currentUserId={user?.id ?? null}
        onClose={() => setSelectedId(null)}
        onRated={loadData}
      />
    </div>
    </>
  )
}
