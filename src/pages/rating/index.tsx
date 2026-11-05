// @title 球员评分
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {PageMeta} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {Avatar} from '@/components/Avatar'
import {RatingModal} from '@/components/RatingModal'
import {getHiddenRatingMembers, getRatingMembers} from '@/db/api'
import {positionShort} from '@/constants'
import type {HiddenRatingMemberRow, RatingMemberRow} from '@/db/api'

interface RatingListItem {
  id: string
  nickname: string | null
  avatar_url: string | null
  preferred_position: string | null
  rating: number | null
  meta: string
  detail: string | null
}

/** 公开综合评分；管理员可切换到仅返回汇总的赛后匿名隐藏分。 */
export default function RatingPage() {
  const {user, profile} = useAuth()
  const isAdmin = profile?.role === 'admin'
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('rating')
  const [members, setMembers] = useCachedState<RatingMemberRow[]>('rating-members', [])
  const [hiddenMembers, setHiddenMembers] = useState<HiddenRatingMemberRow[]>([])
  const [hiddenLoading, setHiddenLoading] = useState(false)
  const [hiddenMode, setHiddenMode] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const locatedRef = useRef(false)
  const hiddenLoadedRef = useRef(false)

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
  }, [finishRefresh, setMembers, startRefresh])

  const loadHiddenData = useCallback(async () => {
    if (!isAdmin || hiddenLoading) return
    setHiddenLoading(true)
    try {
      setHiddenMembers(await getHiddenRatingMembers())
      hiddenLoadedRef.current = true
    } finally {
      setHiddenLoading(false)
    }
  }, [isAdmin, hiddenLoading])

  useDidShow(() => {
    loadData()
    if (hiddenMode && isAdmin) loadHiddenData()
  })

  /** 列表加载完成后，若带定位参数则直接打开该成员的公开评分弹窗 */
  useEffect(() => {
    if (!locatedRef.current && memberParam && members.length > 0) {
      const member = members.find((item) => item.id === memberParam)
      if (member) setSelectedId(member.id)
      locatedRef.current = true
    }
  }, [members, memberParam])

  const displayMembers = useMemo<RatingListItem[]>(() => {
    if (hiddenMode) {
      return hiddenMembers.map((member) => ({
        id: member.id,
        nickname: member.nickname,
        avatar_url: member.avatar_url,
        preferred_position: member.preferred_position,
        rating: member.hidden_rating,
        meta: member.match_count > 0
          ? `最近10场评分 · ${member.match_count}场 · 被评分${member.rating_count}次`
          : '暂无赛后评分',
        detail: member.match_count > 0
          ? `管理员${member.admin_rating_count}次 · 队员${member.player_rating_count}次`
          : null
      }))
    }
    return members.map((member) => ({
      id: member.id,
      nickname: member.nickname,
      avatar_url: member.avatar_url,
      preferred_position: member.preferred_position,
      rating: member.avg_rating,
      meta: `${positionShort(member.preferred_position)}${member.avg_rating != null ? ` · ${member.rating_count}人评分` : ' · 暂无评分'}`,
      detail: null
    }))
  }, [hiddenMode, hiddenMembers, members])

  const toggleHiddenMode = () => {
    if (!isAdmin) return
    const next = !hiddenMode
    setHiddenMode(next)
    setSelectedId(null)
    if (next && !hiddenLoadedRef.current) loadHiddenData()
  }

  const listLoading = hiddenMode ? hiddenLoading : loading

  return (
    <>
      <PageMeta pageStyle={selectedId ? 'overflow: hidden;' : ''} />
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-heading text-3xl text-primary-foreground">{hiddenMode ? '匿名隐藏分' : '球员评分'}</h1>
              <p className="text-xl text-primary-foreground/80 mt-2">
                {hiddenMode ? '最近10场有评分比赛，管理员组70% · 队员组30%' : '点击队员卡片进行打分，1-10分'}
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                className="shrink-0 rounded-xl border-2 border-primary-foreground/40 bg-white/10 px-3 py-2 flex items-center gap-1"
                onClick={toggleHiddenMode}
              >
                <div className={`${hiddenMode ? 'i-mdi-star-outline' : 'i-mdi-eye-off-outline'} text-xl text-primary-foreground`} />
                <span className="text-lg text-primary-foreground">{hiddenMode ? '综合评分' : '隐藏分'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="px-5 -mt-6 pb-8 flex flex-col gap-3">
          {listLoading && <p className="text-xl text-muted-foreground text-center mt-10">加载中…</p>}

          {!listLoading && displayMembers.length === 0 && (
            <div className="mt-2 bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
              <div className="i-mdi-star-outline text-5xl text-muted-foreground/50" />
              <p className="text-xl text-muted-foreground">暂无队员</p>
            </div>
          )}

          {!listLoading && displayMembers.map((member, index) => (
            <div
              key={member.id}
              className={`bg-card rounded-2xl gold-frame p-3 flex items-center gap-3 ${hiddenMode ? '' : 'active:scale-[0.98] transition'}`}
              onClick={hiddenMode ? undefined : () => setSelectedId(member.id)}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-heading text-lg ${
                index === 0 ? 'bg-amber-400 text-amber-950' : index === 1 ? 'bg-slate-300 text-slate-800' : index === 2 ? 'bg-amber-700 text-amber-50' : 'bg-muted text-muted-foreground'
              }`}>
                {index + 1}
              </div>
              <Avatar url={member.avatar_url} name={member.nickname} />
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-xl text-foreground truncate">
                  {member.nickname || '队员'}
                  {member.id === user?.id && <span className="text-base text-primary">（我）</span>}
                </span>
                <span className="text-base text-muted-foreground truncate">{member.meta}</span>
                {member.detail && <span className="text-sm text-muted-foreground/70 truncate">{member.detail}</span>}
              </div>
              {member.rating != null ? (
                <span className="font-heading text-3xl text-primary shrink-0">{member.rating.toFixed(1)}</span>
              ) : (
                <span className="font-heading text-3xl text-muted-foreground/40 shrink-0">--</span>
              )}
            </div>
          ))}
        </div>

        <RatingModal
          visible={!hiddenMode && !!selected}
          member={selected}
          currentUserId={user?.id ?? null}
          onClose={() => setSelectedId(null)}
          onRated={loadData}
        />
      </div>
    </>
  )
}
