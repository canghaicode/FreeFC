// @title 数据统计
import {useCallback, useEffect, useMemo, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {Picker} from '@tarojs/components'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {getDefenderVoteInfo, getMemberGrowth, getMvpRanking, getSeasonStats, getSeasons} from '@/db/api'
import type {Season} from '@/db/types'
import {POSITION_ICONS, HONOR_BADGES} from '@/constants'
import {Avatar} from '@/components/Avatar'

type BoardKey = 'appearances' | 'goals' | 'assists' | 'defender' | 'firepower' | 'mvp'

type FormatTab = 'all' | '5' | '8' | '11'

/** 统一渲染行 */
interface RankRow {
  user_id: string
  nickname: string | null
  avatar_url: string | null
  jersey_number: number | null
  position: string | null
  value: number
}

const BOARDS: {key: BoardKey; label: string; icon: string; unit: string}[] = [
  {key: 'appearances', label: '出场', icon: 'i-mdi-shoe-print', unit: '场'},
  {key: 'goals', label: '射手', icon: 'i-mdi-soccer', unit: '球'},
  {key: 'assists', label: '助攻', icon: 'i-mdi-handshake', unit: '次'},
  {key: 'defender', label: '防守', icon: 'i-mdi-shield-star-outline', unit: '票'},
  {key: 'mvp', label: 'MVP', icon: 'i-mdi-star-circle', unit: '次'},
  {key: 'firepower', label: '火力', icon: 'i-mdi-fire', unit: '分'}
]

/** 赛制筛选（火力值榜与赛制无关，不显示该切换） */
const FORMAT_TABS: {key: FormatTab; label: string}[] = [
  {key: 'all', label: '全部'},
  {key: '5', label: '5人制'},
  {key: '8', label: '8人制'},
  {key: '11', label: '11人制'}
]

function Stats() {
  const {user} = useAuth()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useCachedState<string>('stats-season', '')
  const [rankRows, setRankRows] = useCachedState<RankRow[]>('stats-rows', [])
  const [board, setBoard] = useState<BoardKey>('appearances')
  const [formatTab, setFormatTab] = useState<FormatTab>('all')
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('stats')

  const loadSeasons = useCallback(async () => {
    const list = await getSeasons()
    setSeasons(list)
    setSeasonId((prev) => {
      if (prev && list.some((s) => s.id === prev)) return prev
      return list.find((s) => s.is_active)?.id || list[0]?.id || ''
    })
  }, [])

  const loadStats = useCallback(async () => {
    if (!seasonId) {
      setRankRows([])
      return
    }
    startRefresh()
    // 赛制筛选（all = 赛季总量；火力值榜与赛制无关）
    const fmt = formatTab === 'all' ? undefined : formatTab
    if (board === 'defender') {
      const info = await getDefenderVoteInfo(seasonId, fmt)
      const rows: RankRow[] = (info?.ranking || []).map((r) => ({
        user_id: r.candidate_id,
        nickname: r.profiles?.nickname ?? null,
        avatar_url: r.profiles?.avatar_url ?? null,
        jersey_number: r.profiles?.jersey_number ?? null,
        position: null,
        value: r.points
      }))
      setRankRows(rows)
    } else if (board === 'mvp') {
      const list = await getMvpRanking(seasonId, fmt)
      const rows: RankRow[] = list.map((r) => ({
        user_id: r.user_id,
        nickname: r.nickname,
        avatar_url: r.avatar_url,
        jersey_number: r.jersey_number,
        position: r.position,
        value: r.mvp_votes
      }))
      setRankRows(rows)
    } else if (board === 'firepower') {
      const list = await getMemberGrowth()
      const rows: RankRow[] = list.map((m) => ({
        user_id: m.id,
        nickname: m.nickname,
        avatar_url: m.avatar_url,
        jersey_number: m.jersey_number,
        position: m.preferred_position,
        value: m.firepower
      }))
      setRankRows(rows)
    } else {
      const stats = await getSeasonStats(seasonId, fmt)
      const field = board === 'appearances' ? 'appearances' : board === 'goals' ? 'goals' : 'assists'
      const rows: RankRow[] = stats.map((s) => ({
        user_id: s.user_id,
        nickname: s.nickname,
        avatar_url: s.avatar_url,
        jersey_number: s.jersey_number,
        position: s.position,
        value: s[field]
      }))
      setRankRows(rows)
    }
    finishRefresh()
  }, [seasonId, board, formatTab])


  useDidShow(() => {
    loadSeasons()
  })

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const currentSeason = seasons.find((s) => s.id === seasonId)
  const seasonIndex = seasons.findIndex((s) => s.id === seasonId)

  /** 榜单：按当前维度降序 */
  const ranked = useMemo(() => {
    return [...rankRows].sort((a, b) => b.value - a.value)
  }, [rankRows])

  /** 并列名次：同值同名次（1,2,2,4…） */
  const rankOf = useMemo(() => {
    const map = new Map<string, number>()
    let rank = 0
    let prevValue: number | null = null
    ranked.forEach((row) => {
      const v = row.value
      if (prevValue === null || v !== prevValue) {
        rank = prevValue === null ? 1 : rank + 1
        prevValue = v
      }
      map.set(row.user_id, rank)
    })
    return map
  }, [ranked, board])

  /** 前三名徽章（金/银/铜） */
  const badge = (rank: number) => {
    if (rank === 1) return {icon: 'i-mdi-crown', cls: 'medal-gold'}
    if (rank === 2) return {icon: 'i-mdi-medal', cls: 'medal-silver'}
    if (rank === 3) return {icon: 'i-mdi-medal', cls: 'medal-bronze'}
    return null
  }

  /** 榜单专属荣誉：射手榜 金靴/银靴/铜靴；助攻榜第一 助攻王；防守榜第一 防守铁闸（含并列） */
  const honorOf = (rank: number): string | null => {
    if (board === 'goals' && rank === 1) return 'golden_boot'
    if (board === 'goals' && rank === 2) return 'silver_boot'
    if (board === 'goals' && rank === 3) return 'bronze_boot'
    if (board === 'assists' && rank === 1) return 'assist_king'
    if (board === 'defender' && rank === 1) return 'defense_wall'
    if (board === 'mvp' && rank === 1) return 'mvp'
    return null
  }

  const medalCls = (rank: number) => {
    if (rank === 1) return 'bg-gradient-gold text-primary-foreground'
    if (rank === 2) return 'bg-secondary text-secondary-foreground'
    if (rank === 3) return 'bg-accent/25 text-accent-foreground'
    return 'bg-muted text-muted-foreground'
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
      <h1 className="font-heading text-3xl text-primary-foreground">赛季数据</h1>
        <div className="flex items-center gap-2 mt-3">
          <Picker
            mode="selector"
            range={seasons.map((s) => s.name)}
            value={Math.max(0, seasonIndex)}
            onChange={(e) => {
              const idx = Number(e.detail.value)
              if (seasons[idx]) setSeasonId(seasons[idx].id)
            }}
          >
            <div className="flex items-center gap-2 bg-primary-foreground/15 rounded-full px-4 py-2">
              <div className="i-mdi-trophy-outline text-2xl text-primary-foreground" />
              <span className="text-xl text-primary-foreground">
                {currentSeason?.name || '暂无赛季'}
              </span>
              <div className="i-mdi-chevron-down text-2xl text-primary-foreground/70" />
            </div>
          </Picker>
          {currentSeason?.is_active && (
            <span className="px-2.5 py-1 rounded-full bg-accent/90 text-accent-foreground text-lg">进行中</span>
          )}
        </div>
      </div>

      <div className="px-5 -mt-6 pb-8">
        {/* 榜单切换 */}
        <div className="bg-card rounded-2xl gold-frame p-1.5 flex flex-row gap-1">
          {BOARDS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`flex-1 flex items-center justify-center rounded-xl transition ${
                board === b.key ? 'bg-primary' : ''
              }`}
              onClick={() => setBoard(b.key)}
            >
              <div className="py-2.5 flex items-center gap-1.5">
                <div
                  className={`${b.icon} text-xl ${board === b.key ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                />
                <span
                  className={`text-lg whitespace-nowrap ${board === b.key ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  {b.label}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* 赛制筛选（5人/8人/11人分榜统计；火力值榜不区分） */}
        {board !== 'firepower' && (
          <div className="mt-3 bg-card rounded-2xl gold-frame p-1.5 flex flex-row gap-1">
            {FORMAT_TABS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`flex-1 flex items-center justify-center rounded-xl transition ${
                  formatTab === f.key ? 'bg-primary/15 border-2 border-primary' : ''
                }`}
                onClick={() => setFormatTab(f.key)}
              >
                <div className="py-2">
                  <span className={`text-lg ${formatTab === f.key ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    {f.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {loading && <p className="text-xl text-muted-foreground text-center mt-10">加载中…</p>}

        {!loading && ranked.length === 0 && (
          <div className="mt-6 bg-card rounded-2xl gold-frame p-8 flex flex-col items-center gap-3">
            <div className="i-mdi-chart-bar text-5xl text-muted-foreground/50" />
            <p className="text-xl text-muted-foreground">
              {seasons.length === 0
                ? '还没有赛季，等待管理员创建'
                : formatTab !== 'all' && board !== 'firepower'
                  ? '该赛制暂无比赛数据'
                  : '本赛季暂无数据，报名后自动累计'}
            </p>
          </div>
        )}

        {!loading && ranked.length > 0 && (
          <div className="mt-5 flex flex-col gap-3">
            {ranked.map((row, index) => {
              const value = row.value
              const isMe = row.user_id === user?.id
              const rank = rankOf.get(row.user_id) ?? index + 1
              const badgeInfo = badge(rank)
              const honorKey = honorOf(rank)
              const honor = honorKey ? HONOR_BADGES[honorKey] : null
              return (
                <div
                  key={row.user_id}
                  className={`rounded-2xl p-3 flex items-center gap-3 slide-in-right ${
                    isMe ? 'bg-primary/10 border-2 border-primary/40' : 'bg-card gold-frame'
                  }`}
                  style={{animationDelay: `${Math.min(index * 70, 700)}ms`}}
                >
                  {badgeInfo ? (
                    <div className={`relative w-11 h-11 rounded-full flex items-center justify-center overflow-hidden ${badgeInfo.cls}`}>
                      <div className={`${badgeInfo.icon} text-2xl`} />
                      <div className="medal-shine" />
                    </div>
                  ) : (
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center ${medalCls(rank)}`}>
                      <span className="font-heading text-xl">{rank}</span>
                    </div>
                  )}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${medalCls(index)}`}>
                    <span className="font-heading text-xl">{index + 1}</span>
                  </div>
                  <Avatar url={row.avatar_url} name={row.nickname} />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-xl text-foreground truncate flex items-center gap-1.5">
                      {row.nickname || '队员'}
                      {isMe && <span className="text-primary">(我)</span>}
                      {honor && (
                        <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-base shrink-0 ${honor.cls}`}>
                          <div className={`${honor.icon} text-base`} />
                          {honor.label}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {row.jersey_number !== null && (
                        <span className="text-lg text-muted-foreground">#{row.jersey_number}</span>
                      )}
                      {row.position && (
                        <span className="text-lg text-muted-foreground flex items-center gap-0.5">
                          <div className={`${POSITION_ICONS[row.position] || 'i-mdi-soccer'} text-lg`} />
                          {row.position}
                        </span>
                      )}
                      <span className="text-lg text-muted-foreground">第 {rankOf.get(row.user_id) ?? index + 1} 名</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-heading text-3xl text-primary">{value}</span>
                    <span className="text-lg text-muted-foreground">
                      {BOARDS.find((b) => b.key === board)?.unit}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(Stats)
