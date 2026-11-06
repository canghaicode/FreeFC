// @title 活动详情

import {Image, Picker} from '@tarojs/components'
import Taro, {useDidShow, usePageScroll, useShareAppMessage} from '@tarojs/taro'
import {useCallback, useMemo, useRef, useState} from 'react'
import {supabase} from '@/client/supabase'
import {Avatar} from '@/components/Avatar'
import {SwipeRow} from '@/components/SwipeRow'
import {LogoBg} from '@/components/LogoBg'
import {PaymentPoster} from '@/components/PaymentPoster'
import {PostMatchRatingModal} from '@/components/PostMatchRatingModal'
import {withRouteGuard} from '@/components/RouteGuard'
import {SharePoster} from '@/components/SharePoster'
import {TitleBadge} from '@/components/TitleBadge'
import {canWithdrawByRule, defaultMatchFees, formatActivityTime, HONOR_BADGES, MATCH_FORMATS, marketValueOf, POSITION_ICONS, POSITIONS, positionShort, profileIncomplete } from '@/constants'
import {useAuth} from '@/contexts/AuthContext'
import {
  addActivityComment, autoSplitTeams, cancelActivity, cancelRegistration, castMatchVote, deleteActivity, getActivity,
  getActivityComments, getDefenderVoteInfo, getHiddenRatingMembers, getMatchSummary, getMatchVotes, getMyLikedCommentIds, getMyMatchVotes,
  getPaymentQr, getPostMatchRatingForm, getRegistrationsWithProfiles, getSeasonStats, joinWithSeat, removeRegistration,
  saveMatchSummary, setGuestPosition, setGuestTeam, setPaymentQr, setRegistrationPosition, setRegistrationSeat,
  setRegistrationTeam, settleActivityActivity, toggleCommentLike,
  updateOwnProfile
} from '@/db/api'
import type {PostMatchRatingForm} from '@/db/api'
import type {Activity, ActivityComment, MatchSummary, MatchVoteRow, Registration, SeasonStatsRow} from '@/db/types'
import {selectMediaFiles, uploadToSupabase} from '@/utils/upload'

/** 手动位置选择器选项（未定=清除手动指定，回落资料首选位置） */
const POS_PICK = ['前锋', '中场', '后卫', '门将', '未定']

/** 报名列表荣誉徽章：射手榜金/银/铜靴 + 助攻王 + 防守铁闸（含并列） */
function honorKeysOf(
  goalRank: Map<string, number>,
  assistRank: Map<string, number>,
  defenseRank: Map<string, number>,
  userId: string
): string[] {
  const keys: string[] = []
  const g = goalRank.get(userId)
  if (g === 1) keys.push('golden_boot')
  else if (g === 2) keys.push('silver_boot')
  else if (g === 3) keys.push('bronze_boot')
  if (assistRank.get(userId) === 1) keys.push('assist_king')
  if (defenseRank.get(userId) === 1) keys.push('defense_wall')
  return keys
}

/** 活动时间段显示：同一天只显示结束时刻 HH:mm，跨天才补完整日期 */
function formatTimeRange(startIso: string, endIso: string | null): string {
  if (!endIso) return formatActivityTime(startIso)
  const s = new Date(startIso)
  const e = new Date(endIso)
  const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate()
  return sameDay ? `${formatActivityTime(startIso)} — ${formatActivityTime(endIso).slice(-5)}` : `${formatActivityTime(startIso)} — ${formatActivityTime(endIso)}`
}

function ActivityDetail() {
  const id = useMemo(() => Taro.getCurrentInstance().router?.params?.id || '', [])
  const {user, profile} = useAuth()
  const loginUsername = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || ''
  const isAdminAccount = String(loginUsername).trim().toLowerCase() === 'admin'

  const [activity, setActivity] = useState<Activity | null>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [swipedRegId, setSwipedRegId] = useState<string | null>(null)
  const [comments, setComments] = useState<ActivityComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showPoster, setShowPoster] = useState(false)
  const [summary, setSummary] = useState<MatchSummary | null>(null)
  const [votes, setVotes] = useState<{mvp: MatchVoteRow[]; defender: MatchVoteRow[]}>({mvp: [], defender: []})
  const [myVotes, setMyVotes] = useState<{mvp: string | null; defender: string | null}>({mvp: null, defender: null})
  const [summaryText, setSummaryText] = useState('')
  const [editingSummary, setEditingSummary] = useState(false)
  const [savingSummary, setSavingSummary] = useState(false)
  const [voting, setVoting] = useState(false)
  const [myLikedIds, setMyLikedIds] = useState<string[]>([])
  const [replyTo, setReplyTo] = useState<ActivityComment | null>(null)
  const [teamAction, setTeamAction] = useState(false)
  const [commentExpanded, setCommentExpanded] = useState(false)
  const [showSeatPicker, setShowSeatPicker] = useState(false)
  const [guestCount, setGuestCount] = useState(0)
  const [joinPos1, setJoinPos1] = useState<string>(profile?.preferred_position || '')
  const [joinPos2, setJoinPos2] = useState<string>(profile?.secondary_position || '')
  const [regPosFilter, setRegPosFilter] = useState<string>('全部')
  /** 带人嘉宾信息：姓名 + 位置 */
  const [guestInfo, setGuestInfo] = useState<{name: string; position: string}[]>([])
  const [cancelling, setCancelling] = useState(false)
  const [settling, setSettling] = useState(false)
  const [showPaymentPoster, setShowPaymentPoster] = useState(false)
  const [venueFee, setVenueFee] = useState('')
  const [waterFee, setWaterFee] = useState('')
  /** 收款折扣（单数字，9 = 9折），空时默认 9 */
  const [feeDiscount, setFeeDiscount] = useState('')
  /** 分摊人数（默认本场报名人头），空时用 count */
  const [headcountInput, setHeadcountInput] = useState('')
  // 收款码设置
  const [showQrSetup, setShowQrSetup] = useState(false)
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null)
  const [paymentQrOwner, setPaymentQrOwner] = useState('')
  const [qrFile, setQrFile] = useState<any>(null)
  const [qrOwnerInput, setQrOwnerInput] = useState('')
  const [qrSaving, setQrSaving] = useState(false)
  /** 赛季射手榜/助攻榜排名（用于报名列表荣誉徽章） */
  const [goalRank, setGoalRank] = useState<Map<string, number>>(new Map())
  const [assistRank, setAssistRank] = useState<Map<string, number>>(new Map())
  const [defenseRank, setDefenseRank] = useState<Map<string, number>>(new Map())
  const [hiddenRatings, setHiddenRatings] = useState<Record<string, number>>({})
  const [postMatchRatingForm, setPostMatchRatingForm] = useState<PostMatchRatingForm | null>(null)
  const [showPostMatchRating, setShowPostMatchRating] = useState(false)
  const ratingPromptDismissedRef = useRef(false)

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const act = await getActivity(id)
    const [regs, cmts, sm, mv, myv, liked, qr, stats, defender, ratingForm, hiddenRows] = await Promise.all([
      getRegistrationsWithProfiles(id),
      getActivityComments(id),
      getMatchSummary(id),
      getMatchVotes(id),
      getMyMatchVotes(id),
      getMyLikedCommentIds(id),
      getPaymentQr(),
      act?.season_id ? getSeasonStats(act.season_id) : Promise.resolve([]),
      act?.season_id ? getDefenderVoteInfo(act.season_id) : Promise.resolve(null),
      getPostMatchRatingForm(id),
      profile?.role === 'admin' ? getHiddenRatingMembers() : Promise.resolve([])
    ])
    const hiddenMap: Record<string, number> = {}
    hiddenRows.forEach((row) => {
      if (row.hidden_rating != null) hiddenMap[row.id] = row.hidden_rating
    })
    setHiddenRatings(hiddenMap)
    setPostMatchRatingForm(ratingForm)
    if (ratingForm?.should_prompt && !ratingPromptDismissedRef.current) setShowPostMatchRating(true)
    if (qr) {
      setPaymentQrUrl(qr.url)
      setPaymentQrOwner(qr.owner)
    } else {
      setPaymentQrUrl(null)
      setPaymentQrOwner('')
    }
    setActivity(act)
    setRegistrations(regs)
    setComments(cmts)
    setSummary(sm)
    setSummaryText(sm?.content || '')
    setVotes(mv)
    setMyVotes(myv)
    setMyLikedIds(liked)
    const rankBy = (key: 'goals' | 'assists') => {
      const map = new Map<string, number>()
      const sorted = [...stats].sort((a, b) => b[key] - a[key]).filter((row) => row[key] > 0)
      let rank = 0
      let prev: number | null = null
      sorted.forEach((row) => {
        if (prev === null || row[key] !== prev) {
          rank = prev === null ? 1 : rank + 1
          prev = row[key]
        }
        map.set(row.user_id, rank)
      })
      return map
    }
    setGoalRank(rankBy('goals'))
    setAssistRank(rankBy('assists'))
    const defenseSorted = (defender?.ranking || []).filter((row) => row.points > 0)
    const defenseMap = new Map<string, number>()
    let defenseRank = 0
    let defensePrev: number | null = null
    defenseSorted.forEach((row) => {
      if (defensePrev === null || row.points !== defensePrev) {
        defenseRank = defensePrev === null ? 1 : defenseRank + 1
        defensePrev = row.points
      }
      defenseMap.set(row.candidate_id, defenseRank)
    })
    setDefenseRank(defenseMap)
    setLoading(false)
  }, [id, profile?.role])

  useDidShow(() => {
    loadData()
  })

  useShareAppMessage(() => ({
    title: activity ? `【报名接龙】${activity.title}` : '球队活动报名',
    path: `/pages/activity-detail/index?id=${id}`
  }))

  const [barHidden, setBarHidden] = useState(false)
  const lastScrollTop = useRef(0)
  // 触摸滑动行期间(及松手后 500ms 内)抑制滚动触发的自动收回和底栏刷新,防止吸附尾段整页重渲染
  const swipeLockUntil = useRef(0)
  const holdSwipeLock = useCallback(() => {
    swipeLockUntil.current = Date.now() + 500
  }, [])
  // 往下滚动隐藏底部报名按钮(单帧 >2),往上大幅滚动(单帧 <-20)才弹出,避免轻微下滑误弹出
  usePageScroll(({scrollTop}: {scrollTop: number}) => {
    const locked = Date.now() < swipeLockUntil.current
    if (!locked) setSwipedRegId(null)
    const delta = scrollTop - lastScrollTop.current
    lastScrollTop.current = scrollTop
    if (locked) return
    if (scrollTop <= 0) {
      setBarHidden(false)
      return
    }
    if (delta > 2) setBarHidden(true)
    else if (delta < -20) setBarHidden(false)
  })

  const count = registrations
    .filter((r) => r.seat_role !== 'coach' && r.status === 'confirmed')
    .reduce((sum, r) => sum + 1 + (r.guest_count || 0), 0)
  const maxPlayers = activity?.max_players ?? 0
  /** 场次默认费用（5/8人内外战），0 表示无默认 */
  const feeDefaults = defaultMatchFees(activity)
  /** 生效费用：留空回退场次默认值；明确填写 0 按 0 计算 */
  const [effectiveVenue, effectiveWater] = [venueFee, waterFee].map((raw, index) => {
    const text = raw.trim()
    const amount = Number(text)
    const fallback = index === 0 ? feeDefaults.venue : feeDefaults.water
    return text !== '' && Number.isFinite(amount) && amount >= 0 ? amount : fallback
  })
  const effDiscount = parseFloat(feeDiscount)
  const discountEmpty = feeDiscount.trim() === ''
  /** 留空 = 默认 9 折；填了但非法（不在 1-10）才提示 */
  const discountValid = discountEmpty || (Number.isFinite(effDiscount) && effDiscount > 0 && effDiscount <= 10)
  const effectiveDiscount = discountEmpty ? 9 : effDiscount
  const baseFee = Math.round((effectiveVenue + effectiveWater) * 100) / 100
  /** 分摊人数：输入为空时回退到报名人头；非法（<=0）同样回退 */
  const effectiveHeadcount = parseFloat(headcountInput) > 0 ? Math.floor(parseFloat(headcountInput)) : count
  const finalFee = discountValid ? Math.round(baseFee * (effectiveDiscount / 10) * 100) / 100 : 0
  const coaches = registrations.filter((r) => r.seat_role === 'coach')
  const coachSlots = activity?.coach_slots ?? (activity?.match_type === 'internal' ? 2 : 1)
  const joined = !!user && registrations.some((r) => r.user_id === user.id && r.status === 'confirmed')
  /** 是否为该活动发起人 */
  const isCreator = !!activity && !!user && activity.created_by === user.id
  /** 管理权限：队长（role=admin）、平台管理员 或 活动发起人 */
  const canManageActivity = profile?.role === 'admin' || isCreator
  /** 删除权限：管理员 或 活动发起人 */
  const canDelete = canManageActivity
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (deleting) return
    // 纵深防御：仅管理员或发起人可删除
    if (!canDelete) {
      Taro.showToast({title: '仅队长、管理员或发起人可删除', icon: 'none'})
      return
    }
    const res = await Taro.showModal({
      title: '删除活动',
      content: '删除后报名名单、填报数据与首发阵型将一并清除，不可恢复。确定删除吗？',
      confirmColor: '#B03A2E'
    })
    if (!res.confirm) return
    setDeleting(true)
    try {
      const ok = await deleteActivity(id)
      if (ok) {
        Taro.showToast({title: '已删除', icon: 'success'})
        setTimeout(() => Taro.navigateBack(), 600)
      } else {
        Taro.showToast({title: '删除失败，请重试', icon: 'none'})
      }
    } finally {
      setDeleting(false)
    }
  }
  const ended = activity
    ? new Date(activity.end_time || activity.activity_time).getTime() <= Date.now()
    : false
  const cancelled = activity?.cancelled ?? false
  /** 结束未满12小时：可填报/投票窗口 */
  const reportOpen = ended && !cancelled && new Date(activity!.end_time || activity!.activity_time).getTime() + 12 * 3600 * 1000 > Date.now()
  const full = count >= maxPlayers

  const closePostMatchRating = () => {
    ratingPromptDismissedRef.current = true
    setShowPostMatchRating(false)
  }

  const markPostMatchRatingSubmitted = () => {
    ratingPromptDismissedRef.current = true
    setShowPostMatchRating(false)
    setPostMatchRatingForm((current) => current ? {...current, submitted: true, should_prompt: false} : current)
  }
  /** 按活动设置的取消截止规则判断（发起人手动移除不受此限制） */
  const withdrawCheck = canWithdrawByRule(activity)
  const canWithdraw = withdrawCheck.allowed
  /** 收款名单海报入口：管理员或发起人随时可见 */
  const canExportPayment = canManageActivity

  /** 打开收款码设置弹窗（预填当前设置） */
  const openQrSetup = () => {
    setQrFile(null)
    setQrOwnerInput(paymentQrOwner || '')
    setShowQrSetup(true)
  }

  /** 选择收款码图片 */
  const handlePickQr = async () => {
    try {
      const files = await selectMediaFiles({mediaType: ['image'], count: 1})
      if (files && files.length > 0) setQrFile(files[0])
    } catch (e) {
      console.warn('selectMediaFiles cancel/fail:', e)
    }
  }

  /** 保存收款码（上传图片到 Storage + 写入设置） */
  const handleSaveQr = async () => {
    if (qrSaving) return
    setQrSaving(true)
    try {
      let finalUrl = paymentQrUrl || ''
      if (qrFile) {
        const up = await uploadToSupabase(qrFile, {bucket: 'minicode', userId: user?.id || ''})
        if (!up.success || !up.data?.path) {
          Taro.showToast({title: '收款码图片上传失败', icon: 'none'})
          return
        }
        const {data: urlData} = supabase.storage.from('minicode').getPublicUrl(up.data.path)
        finalUrl = urlData.publicUrl
      }
      if (!finalUrl) {
        Taro.showToast({title: '请先选择收款码图片', icon: 'none'})
        return
      }
      const r = await setPaymentQr(finalUrl, qrOwnerInput)
      Taro.showToast({title: r.message || (r.ok ? '保存成功' : '保存失败'), icon: r.ok ? 'success' : 'none'})
      if (r.ok) {
        setPaymentQrUrl(finalUrl)
        setPaymentQrOwner(qrOwnerInput)
        setShowQrSetup(false)
      }
    } finally {
      setQrSaving(false)
    }
  }

  /** 恢复默认收款码 */
  const handleResetQr = async () => {
    if (qrSaving) return
    setQrSaving(true)
    try {
      const r = await setPaymentQr('', '')
      Taro.showToast({title: r.message || '已恢复默认', icon: r.ok ? 'success' : 'none'})
      if (r.ok) {
        setPaymentQrUrl(null)
        setPaymentQrOwner('')
        setQrFile(null)
        setShowQrSetup(false)
      }
    } finally {
      setQrSaving(false)
    }
  }

  const isAdmin = profile?.role === 'admin'
  const canEditSummary = isAdmin

  // 赛后投票候选人：已正选报名且非本人
  const voteCandidates = useMemo(() => {
    const map = new Map<string, {id: string; nickname: string | null; avatar_url: string | null; jersey_number: number | null}>()
    for (const r of registrations) {
      if (r.status === 'confirmed' && r.user_id !== user?.id && r.profiles) {
        map.set(r.user_id, {...(r.profiles as any), id: r.user_id})
      }
    }
    return Array.from(map.values())
  }, [registrations, user])

  const handleSaveSummary = async () => {
    if (!summaryText.trim()) {
      Taro.showToast({title: '请填写赛后总结', icon: 'none'})
      return
    }
    setSavingSummary(true)
    try {
      const ok = await saveMatchSummary(id, summaryText.trim())
      if (ok) {
        Taro.showToast({title: '总结已保存', icon: 'success'})
        setEditingSummary(false)
        await loadData()
      } else {
        Taro.showToast({title: '保存失败，请重试', icon: 'none'})
      }
    } finally {
      setSavingSummary(false)
    }
  }

  const handleVote = async (candidateId: string, kind: 'mvp' | 'defender') => {
    if (voting) return
    setVoting(true)
    try {
      const res = await castMatchVote(id, candidateId, kind)
      if (res.ok) {
        Taro.showToast({title: '投票成功', icon: 'success'})
        await loadData()
      } else {
        Taro.showToast({title: res.message || '投票失败', icon: 'none'})
      }
    } finally {
      setVoting(false)
    }
  }

  const handleJoin = async () => {
    if (acting) return
    // 报名门槛：资料不完善则拦截引导
    const missing = profileIncomplete(profile)
    if (missing) {
      const res = await Taro.showModal({
        title: '先完善资料再报名',
        content: `${missing}还未填写，队友们报名时看不到你是谁，去补全资料吧？`,
        confirmText: '去填写'
      })
      if (res.confirm) Taro.navigateTo({url: '/pages/profile-edit/index'})
      return
    }
    setShowSeatPicker(true)
    // 重置带人状态，避免上次未提交的嘉宾信息残留
    setGuestCount(0)
    setGuestInfo([])
  }

  const handleJoinSeat = async (seat: 'player' | 'coach' | 'captain', guestCount = 0) => {
    if (acting) return
    // 队员/队长报名前保存本场位置选择（写入个人资料，便于按位置分人）
    if (seat !== 'coach') {
      if (!joinPos1) {
        Taro.showToast({title: '请选择首选位置', icon: 'none'})
        return
      }
      // 带人时：每位嘉宾需姓名（可选）与位置（必选）
      if (guestCount > 0) {
        for (let i = 0; i < guestCount; i++) {
          const gi = guestInfo[i]
          if (!gi?.position) {
            Taro.showToast({title: `请为嘉宾${i + 1}选位置`, icon: 'none'})
            return
          }
        }
      }
      const ok = await updateOwnProfile({preferred_position: joinPos1, secondary_position: joinPos2 || null})
      if (!ok) {
        Taro.showToast({title: '位置保存失败', icon: 'none'})
        return
      }
    }
    setShowSeatPicker(false)
    setActing(true)
    try {
      const guests = guestCount > 0 ? guestInfo.slice(0, guestCount).map((g, i) => ({name: g?.name || `嘉宾${i + 1}`, position: g?.position || ''})) : []
      const result = await joinWithSeat(id, seat, guestCount, guests)
      Taro.showToast({title: result.message, icon: result.ok ? 'success' : 'none'})
      if (result.ok) {
        setGuestInfo([])
        await loadData()
      }
    } finally {
      setActing(false)
    }
  }

  // 仅管理员可管理分队与席位
  const canManageTeams = isAdmin
  const isExternal = activity?.match_type === 'external'

  const coachUsed = registrations.filter((r) => r.seat_role === 'coach').length
  const captainUsed = registrations.filter((r) => r.seat_role === 'captain').length
  const coachAvail = Math.max(0, (activity?.coach_slots ?? 0) - coachUsed)
  const captainAvail = Math.max(0, (activity?.captain_slots ?? 0) - captainUsed)

  const teamGroups = Math.max(2, Math.min(4, activity?.team_groups ?? 2))
  const teamKeys = (['A', 'B', 'C', 'D'] as const).slice(0, teamGroups)
  const teamColor = (tk: string) => {
    switch (tk) {
      case 'A': return 'bg-rose-500'
      case 'B': return 'bg-sky-500'
      case 'C': return 'bg-emerald-500'
      default: return 'bg-amber-500'
    }
  }
  const teamList = (tk: string) => registrations.filter((r) => r.team === tk && r.seat_role !== 'coach' && r.status === 'confirmed')
  const unassigned = registrations.filter((r) => !r.team && r.seat_role !== 'coach' && r.status === 'confirmed')
  const playerRegs = registrations.filter((r) => r.seat_role !== 'coach' && r.status === 'confirmed')
  /** 全部嘉宾（含携带人昵称），用于分队展示 */
  const allGuests = registrations.flatMap((r) => (r.guests || []).map((g) => ({...g, owner: r.profiles?.nickname || '队友'})))
  const unassignedGuests = allGuests.filter((g) => !g.team)

  /** 管理员/发起人移除教练报名 */
  const handleRemoveCoach = async (reg: Registration) => {
    if (teamAction) return
    const res = await Taro.showModal({title: '移除教练', content: `确定将「${reg.profiles?.nickname || '该教练'}」移出教练组吗？`})
    if (!res.confirm) return
    setTeamAction(true)
    try {
      const ok = await removeRegistration(reg.id)
      if (ok) await loadData()
      else Taro.showToast({title: '操作失败', icon: 'none'})
    } finally {
      setTeamAction(false)
    }
  }

  /** 发起人/管理员移除已报名队员（不受开赛前 4 小时限制） */
  const handleRemoveRegistrant = async (reg: Registration) => {
    if (teamAction) return
    const res = await Taro.showModal({title: '移除报名', content: `确定将「${reg.profiles?.nickname || '该队员'}」移出报名名单吗？`})
    if (!res.confirm) return
    setTeamAction(true)
    try {
      const ok = await removeRegistration(reg.id)
      if (ok) {
        Taro.showToast({title: '已移除', icon: 'success'})
        await loadData()
      } else {
        Taro.showToast({title: '操作失败', icon: 'none'})
      }
    } finally {
      setTeamAction(false)
    }
  }

  const handleAutoSplit = async () => {
    if (teamAction) return
    setTeamAction(true)
    try {
      const ok = await autoSplitTeams(id)
      Taro.showToast({title: ok ? '已自动分队' : '操作失败', icon: ok ? 'success' : 'none'})
      if (ok) await loadData()
    } finally {
      setTeamAction(false)
    }
  }

  const handleMoveTeam = async (regId: string, team: string) => {
    if (teamAction) return
    setTeamAction(true)
    try {
      const ok = await setRegistrationTeam(regId, team)
      if (ok) await loadData()
      else Taro.showToast({title: '操作失败', icon: 'none'})
    } finally {
      setTeamAction(false)
    }
  }

  /** 嘉宾换队 */
  const handleMoveGuestTeam = async (guestId: string, team: string) => {
    if (teamAction) return
    setTeamAction(true)
    try {
      const ok = await setGuestTeam(guestId, team)
      if (ok) await loadData()
      else Taro.showToast({title: '操作失败', icon: 'none'})
    } finally {
      setTeamAction(false)
    }
  }

  /** 手动指定队员场上位置（null=清除，回落资料首选位置） */
  const handleSetPlayerPosition = async (regId: string, pos: string | null) => {
    if (teamAction) return
    setTeamAction(true)
    try {
      const ok = await setRegistrationPosition(regId, pos)
      if (ok) await loadData()
      else Taro.showToast({title: '操作失败', icon: 'none'})
    } finally {
      setTeamAction(false)
    }
  }

  /** 手动指定嘉宾场上位置 */
  const handleSetGuestPosition = async (guestId: string, pos: string | null) => {
    if (teamAction) return
    setTeamAction(true)
    try {
      const ok = await setGuestPosition(guestId, pos)
      if (ok) await loadData()
      else Taro.showToast({title: '操作失败', icon: 'none'})
    } finally {
      setTeamAction(false)
    }
  }

  const handleToggleCaptain = async (reg: Registration) => {
    if (teamAction) return
    const next = reg.seat_role === 'captain' ? 'player' : 'captain'
    setTeamAction(true)
    try {
      const ok = await setRegistrationSeat(reg.id, next)
      if (ok) await loadData()
      else Taro.showToast({title: '操作失败', icon: 'none'})
    } finally {
      setTeamAction(false)
    }
  }

  const handleToggleLike = async (comment: ActivityComment) => {
    const liked = myLikedIds.includes(comment.id)
    const ok = await toggleCommentLike(comment.id, !liked)
    if (!ok) return
    setMyLikedIds(liked ? myLikedIds.filter((i) => i !== comment.id) : [...myLikedIds, comment.id])
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? {...c, likes: [{count: Math.max(0, (c.likes?.[0]?.count || 0) + (liked ? -1 : 1))}]}
          : c
      )
    )
  }

  const handleSendComment = async () => {
    if (sendingComment) return
    const text = commentText.trim()
    if (!text) {
      Taro.showToast({title: '评论内容不能为空', icon: 'none'})
      return
    }
    setSendingComment(true)
    try {
      const c = await addActivityComment(
        id,
        text,
        // 回复楼中楼时仍归属顶层评论，保证盖楼结构
        replyTo ? (replyTo.parent_id || replyTo.id) : undefined,
        replyTo?.user_id
      )
      if (c) {
        setCommentText('')
        setReplyTo(null)
        await loadData()
      } else {
        Taro.showToast({title: '发送失败', icon: 'none'})
      }
    } finally {
      setSendingComment(false)
    }
  }

  const handleCancel = async () => {
    if (acting || !user) return
    if (!canWithdraw) {
      Taro.showToast({title: withdrawCheck.reason || '当前不允许取消报名', icon: 'none'})
      return
    }
    const res = await Taro.showModal({title: '取消报名', content: '确定取消本次报名吗？'})
    if (!res.confirm) return
    setActing(true)
    try {
      const result = await cancelRegistration(id, user.id)
      if (result.ok) {
        Taro.showToast({title: '已取消报名', icon: 'success'})
        await loadData()
      } else {
        Taro.showToast({title: '取消失败，请重试', icon: 'none'})
      }
    } finally {
      setActing(false)
    }
  }

  /** 发起人/管理员取消整场活动：取消后不计出场、不结算、不发奖励 */
  const handleCancelActivity = async () => {
    if (cancelling) return
    const res = await Taro.showModal({
      title: '取消活动',
      content: '取消后本场活动不计出场次数、不结算奖励，且不可恢复。确定取消吗？',
      confirmColor: '#B03A2E'
    })
    if (!res.confirm) return
    setCancelling(true)
    try {
      const result = await cancelActivity(id)
      if (result.ok) {
        Taro.showToast({title: '活动已取消', icon: 'success'})
        await loadData()
      } else {
        Taro.showToast({title: result.message || '取消失败，请重试', icon: 'none'})
      }
    } finally {
      setCancelling(false)
    }
  }

  /** 管理员手动结算：为已结束比赛结算奖励（出勤经验/活跃度、MVP、最佳防守） */
  const handleSettle = async () => {
    if (settling) return
    const res = await Taro.showModal({
      title: '结算奖励',
      content: '结算后将为参赛队员发放出勤经验/活跃度，并评定 MVP 与最佳防守。确定结算吗？',
      confirmColor: '#C9A227'
    })
    if (!res.confirm) return
    setSettling(true)
    try {
      const ok = await settleActivityActivity(id)
      if (ok) {
        Taro.showToast({title: '结算成功', icon: 'success'})
        await loadData()
      } else {
        Taro.showToast({title: '结算失败，请重试', icon: 'none'})
      }
    } finally {
      setSettling(false)
    }
  }

  if (loading && !activity) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">活动不存在或已被删除</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative" onClick={() => setSwipedRegId(null)}>
      <LogoBg />
      <div className="px-5 pt-6 pb-32 relative z-10">
        {/* 活动信息卡 */}
        <div className="bg-card rounded-2xl gold-frame p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-primary/15 text-primary text-lg font-medium">
                {MATCH_FORMATS[activity.match_format || '11']?.name || '11人制'}
              </span>
              <h2 className="font-heading text-3xl text-foreground">{activity.title}</h2>
            </div>
            {cancelled && <span className="px-3 py-1 rounded-full bg-destructive/15 text-destructive text-lg">已取消</span>}
            {!cancelled && ended && <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-lg">已结束</span>}
          </div>

          <div className="vine-divider my-4" />

          {/* 快捷入口：海报 + 阵型 + 编辑 */}
          <div className="flex flex-row gap-3">
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/30 lift-glow"
              onClick={() => setShowPoster(true)}
            >
              <div className="py-2.5 flex items-center gap-1.5">
                <div className="i-mdi-image-frame text-2xl text-primary" />
                <span className="text-xl text-primary">分享海报</span>
              </div>
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/30 lift-glow"
              onClick={() => Taro.navigateTo({url: `/pages/lineup/index?id=${id}`})}
            >
              <div className="py-2.5 flex items-center gap-1.5">
                <div className="i-mdi-tshirt-crew-outline text-2xl text-primary" />
                <span className="text-xl text-primary">阵型</span>
              </div>
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/30 lift-glow"
              onClick={() => Taro.navigateTo({url: `/pages/tactics-board/index?id=${id}`})}
            >
              <div className="py-2.5 flex items-center gap-1.5">
                <div className="i-mdi-strategy text-2xl text-primary" />
                <span className="text-xl text-primary">战术指导</span>
              </div>
            </button>
          </div>

          {/* 管理操作：编辑活动 / 取消活动 */}
          {canManageActivity && !cancelled && (
            <div className="flex flex-row gap-3 mt-3">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-card"
                onClick={() => Taro.navigateTo({url: `/pages/activity-edit/index?id=${id}`})}
              >
                <div className="py-2.5 flex items-center gap-1.5">
                  <div className="i-mdi-pencil-outline text-2xl text-primary" />
                  <span className="text-xl text-primary">编辑活动</span>
                </div>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-destructive/40 bg-destructive/5 ${cancelling ? 'opacity-50' : ''}`}
                onClick={handleCancelActivity}
              >
                <div className="py-2.5 flex items-center gap-1.5">
                  <div className="i-mdi-close-circle-outline text-2xl text-destructive" />
                  <span className="text-xl text-destructive">{cancelling ? '取消中…' : '取消活动'}</span>
                </div>
              </button>
            </div>
          )}
          {/* 管理员结算入口：已结束且未结算时显示 */}
          {canManageActivity && ended && !cancelled && !activity?.settled && (
            <button
              type="button"
              className={`w-full mt-3 flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow ${settling ? 'opacity-50' : ''}`}
              onClick={handleSettle}
            >
              <div className="py-3 flex items-center gap-2">
                <div className="i-mdi-trophy-outline text-2xl text-primary-foreground" />
                <span className="text-xl text-primary-foreground">{settling ? '结算中…' : '结算奖励（计入球星卡）'}</span>
              </div>
            </button>
          )}
          {cancelled && (
            <div className="mt-3 rounded-xl px-4 py-3 flex items-center gap-2 bg-destructive/10">
              <div className="i-mdi-information-outline text-2xl text-destructive" />
              <p className="text-lg text-destructive">活动已取消：不计出场次数、不结算奖励</p>
            </div>
          )}
          {ended && !cancelled && (
            <div className={`mt-3 rounded-xl px-4 py-3 flex items-center gap-2 ${activity?.settled ? 'bg-primary/10' : 'bg-muted'}`}>
              <div className={`${activity?.settled ? 'i-mdi-check-circle' : 'i-mdi-clock-outline'} text-2xl ${activity?.settled ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-lg ${activity?.settled ? 'text-primary' : 'text-muted-foreground'}`}>
                {activity?.settled ? '奖励已结算，MVP按造球评定，最佳防守由投票产生' : '数据填报完成后，由队长/管理员点击「结算奖励」计入球星卡'}
              </span>
            </div>
          )}
          {postMatchRatingForm?.eligible && (
            postMatchRatingForm.submitted ? (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-center gap-2 bg-amber-500/10">
                <div className="i-mdi-check-decagram-outline text-2xl text-amber-600" />
                <span className="text-lg text-amber-700">本场表现评分已提交</span>
              </div>
            ) : (
              <button
                type="button"
                className="w-full mt-3 rounded-xl border-2 border-amber-500/40 bg-amber-500/10 flex items-center justify-center"
                onClick={() => setShowPostMatchRating(true)}
              >
                <div className="py-3 flex items-center gap-2">
                  <div className="i-mdi-star-half-full text-2xl text-amber-600" />
                  <span className="text-xl text-amber-700">填写赛后评分</span>
                </div>
              </button>
            )
          )}

          <div className="flex flex-col gap-3 mt-3">
            <div className="flex items-center gap-2">
              <div className="i-mdi-clock-outline text-2xl text-primary" />
              <span className="text-xl text-foreground">
                {formatTimeRange(activity.activity_time, activity.end_time)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="i-mdi-map-marker-outline text-2xl text-primary" />
              <span className="text-xl text-foreground flex-1">{activity.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="i-mdi-account-group-outline text-2xl text-primary" />
              <span className="text-xl text-foreground">限 {maxPlayers} 人</span>
            </div>
          </div>

          {activity.note && (
            <div className="mt-4 rounded-xl bg-secondary/50 p-3">
              <p className="text-lg text-muted-foreground leading-relaxed">{activity.note}</p>
            </div>
          )}

          {activity.notice && (
            <div className="mt-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="i-mdi-shield-check-outline text-2xl text-primary" />
                <span className="font-heading text-xl text-primary">参赛约定</span>
              </div>
              <p className="text-lg text-foreground/80 leading-relaxed whitespace-pre-line">{activity.notice}</p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-gold rounded-full"
                style={{width: `${Math.min(100, (count / maxPlayers) * 100)}%`}}
              />
            </div>
            <span className="text-xl text-foreground">
              {count}/{maxPlayers}
            </span>
            <span className="text-lg text-muted-foreground">
              {ended ? '已截止' : full ? '已满员' : `余 ${maxPlayers - count} 位`}
            </span>
          </div>
        </div>

        {/* 报名接龙名单 */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-2xl text-foreground">报名接龙</h3>
            <span className="text-lg text-muted-foreground">共 {count} 人</span>
          </div>

          {/* 按位置筛选（首选/次选匹配，含嘉宾） */}
          {playerRegs.length > 0 && (
            <div className="mt-3 flex flex-row gap-1.5 flex-wrap">
              {['全部', ...POSITIONS].map((pos) => (
                <button
                  key={pos}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg border-2 ${
                    regPosFilter === pos ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'
                  }`}
                  onClick={() => setRegPosFilter(pos)}
                >
                  <span className={`text-base ${regPosFilter === pos ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    {pos === '全部' ? '全部' : positionShort(pos)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {playerRegs.length === 0 ? (
            <div className="mt-4 bg-card rounded-2xl gold-frame p-6 flex flex-col items-center gap-2">
              <div className="i-mdi-account-plus-outline text-4xl text-muted-foreground/50" />
              <p className="text-xl text-muted-foreground">还没有人报名，来当第一位</p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {playerRegs
                .filter((r) => {
                  if (regPosFilter === '全部') return true
                  const p = r.profiles
                  if (p?.preferred_position === regPosFilter || p?.secondary_position === regPosFilter) return true
                  // 嘉宾位置匹配
                  return (r.guests || []).some((g) => g.position === regPosFilter)
                })
                .map((r, index) => {
                const p = r.profiles
                const appearances = p?.appearances
                const honors = honorKeysOf(goalRank, assistRank, defenseRank, r.user_id)
                const regGuests = (r.guests || []).filter(
                  (g) => regPosFilter === '全部' || !g.position || g.position === regPosFilter
                )
                return (
                  <div key={r.id} className="flex flex-col gap-1.5">
                  <SwipeRow
                    open={swipedRegId === r.id}
                    onOpenChange={(o) => setSwipedRegId(o ? r.id : null)}
                    className="rounded-2xl"
                    disabled={!isAdmin}
                    onTouchActive={holdSwipeLock}
                    onSwipeStart={() => setSwipedRegId((current) => current === r.id ? current : null)}
                    actions={
                      isAdmin ? (
                        <button
                          type="button"
                          className="h-full w-full flex flex-col items-center justify-center gap-0.5 active:bg-black/10"
                          onClick={() => {
                            setSwipedRegId(null)
                            handleRemoveRegistrant(r)
                          }}
                        >
                          <div className="i-mdi-account-remove-outline text-xl text-primary-foreground" />
                          <span className="text-base text-primary-foreground">移除</span>
                        </button>
                      ) : null
                    }
                  >
                  <div className="rounded-2xl gold-frame p-3 flex items-center gap-3">
                    <span className="w-9 text-center font-heading text-2xl text-accent">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Avatar url={p?.avatar_url} name={p?.nickname} />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl text-foreground truncate">{p?.nickname || '队员'}</span>
                        {honors.map((k) => {
                          const h = HONOR_BADGES[k]
                          if (!h) return null
                          return (
                            <span key={k} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-base shrink-0 ${h.cls}`}>
                              <div className={`${h.icon} text-base`} />
                              {h.label}
                            </span>
                          )
                        })}
                        {r.seat_role === 'captain' && (
                          <span className="px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-base shrink-0">队长</span>
                        )}
                        {(r.guest_count || 0) > 0 && (
                          <span className="px-1.5 py-0.5 rounded-md bg-accent/15 text-accent-foreground text-base shrink-0">
                            +{r.guest_count} 人
                          </span>
                        )}
                        <TitleBadge titleKey={p?.title} size="sm" />
                        {r.team && (
                          <span className={`px-1.5 py-0.5 rounded-md text-base shrink-0 ${r.team === 'A' ? 'bg-rose-500/15 text-rose-600' : 'bg-sky-500/15 text-sky-600'}`}>
                            {r.team}队
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p?.jersey_number !== null && p?.jersey_number !== undefined && (
                          <span className="text-lg text-muted-foreground">#{p.jersey_number}</span>
                        )}
                        {p?.preferred_position && (
                          <span className="text-lg text-muted-foreground flex items-center gap-0.5">
                            <div className={`${POSITION_ICONS[p.preferred_position] || 'i-mdi-soccer'} text-lg`} />
                            {positionShort(p.preferred_position)}
                            {p.secondary_position ? ` / ${positionShort(p.secondary_position)}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    {appearances !== undefined && (
                      appearances === 0 ? (
                        <span aria-label="总出场0次" className="w-9 h-9 rounded-lg bg-primary/15 text-primary font-sans font-extrabold text-lg flex items-center justify-center shrink-0">新</span>
                      ) : (
                        <span aria-label={`总出场${appearances}次`} className="px-2.5 py-1 rounded-lg bg-accent/15 text-accent-foreground text-lg shrink-0">
                          {appearances}
                        </span>
                      )
                    )}
                  </div>
                  </SwipeRow>
                  {/* 嘉宾行（随队员报名带入，含位置） */}
                  {regGuests.map((g) => (
                    <div key={g.id} className="bg-muted/40 rounded-xl px-3 py-2 flex items-center gap-2">
                      <div className="i-mdi-account-plus-outline text-xl text-muted-foreground" />
                      <span className="text-lg text-foreground truncate">{g.name || `${p?.nickname || '队友'}的嘉宾`}</span>
                      <span className="text-base text-muted-foreground shrink-0">({p?.nickname || '队友'}带)</span>
                      {g.position && (
                        <span className="flex items-center gap-0.5 text-base text-muted-foreground shrink-0">
                          <div className={`${POSITION_ICONS[g.position] || 'i-mdi-soccer'} text-base`} />
                          {positionShort(g.position)}
                        </span>
                      )}
                      {g.team && (
                        <span className={`px-1.5 py-0.5 rounded-md text-base shrink-0 ${g.team === 'A' ? 'bg-rose-500/15 text-rose-600' : 'bg-sky-500/15 text-sky-600'}`}>
                          {g.team}队
                        </span>
                      )}
                    </div>
                  ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 候补功能已取消 */}

      {/* 教练组（独立名额，不占队员名额） */}
      <div className="mt-4 bg-card rounded-2xl border-2 border-amber-500/30 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="i-mdi-whistle text-3xl text-amber-600" />
            <h3 className="font-heading text-2xl text-foreground">教练组</h3>
            <span className="text-lg text-muted-foreground">
              {coachUsed}/{coachSlots}
            </span>
          </div>
          {!joined && coachAvail > 0 && !ended && (
            <button
              type="button"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/15 active:scale-95"
              onClick={() => handleJoinSeat('coach')}
            >
              <div className="i-mdi-plus text-lg text-amber-600" />
              <span className="text-base text-amber-600 font-medium">报主教练</span>
            </button>
          )}
        </div>
        <div className="px-5 py-4 flex flex-col gap-2">
          {coaches.length === 0 ? (
            <p className="text-lg text-muted-foreground">
              还没有主教练报名{ended ? '' : '，报满队员名额后可单独报名教练席位'}
            </p>
          ) : (
            coaches.map((r) => (
              <SwipeRow
                key={r.id}
                open={swipedRegId === r.id}
                onOpenChange={(o) => setSwipedRegId(o ? r.id : null)}
                className="rounded-xl"
                contentClassName="bg-background"
                disabled={!(canManageTeams && r.user_id !== user?.id)}
                onTouchActive={holdSwipeLock}
                onSwipeStart={() => setSwipedRegId((current) => current === r.id ? current : null)}
                actions={
                  canManageTeams && r.user_id !== user?.id ? (
                    <button
                      type="button"
                      className="h-full w-full flex flex-col items-center justify-center gap-0.5 active:bg-black/10"
                      onClick={() => {
                        setSwipedRegId(null)
                        handleRemoveCoach(r)
                      }}
                    >
                      <div className="i-mdi-account-remove-outline text-xl text-primary-foreground" />
                      <span className="text-base text-primary-foreground">移除</span>
                    </button>
                  ) : null
                }
              >
              <div className="rounded-xl p-2 flex items-center gap-2">
                <Avatar url={r.profiles?.avatar_url} name={r.profiles?.nickname} />
                <span className="text-lg text-foreground flex-1 truncate">{r.profiles?.nickname || '队员'}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-600 text-base shrink-0">主教练</span>
                {r.user_id === user?.id && (
                  <button
                    type="button"
                    className="px-2 py-1 rounded-md bg-destructive/10 text-destructive text-base active:scale-95"
                    onClick={handleCancel}
                  >
                    取消
                  </button>
                )}
              </div>
              </SwipeRow>
            ))
          )}
        </div>
      </div>

      {/* 内战分队管理（内战才分组，外战不分组） */}
      {!isExternal && registrations.filter((r) => r.seat_role !== 'coach').length > 0 && (
        <div className="mt-4 bg-card rounded-2xl border-2 border-primary/30 overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/40">
            <div className="flex items-center gap-2">
              <div className="i-mdi-account-group-outline text-3xl text-primary" />
              <h3 className="font-heading text-2xl text-foreground">分队管理</h3>
            </div>
            {canManageTeams && (
              <button
                type="button"
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/15 active:scale-95 ${teamAction ? 'opacity-50' : ''}`}
                onClick={handleAutoSplit}
              >
                <div className="i-mdi-shuffle-variant text-lg text-primary" />
                <span className="text-base text-primary font-medium">自动分队</span>
              </button>
            )}
          </div>
          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              {teamKeys.map((tk) => {
                const list = teamList(tk)
                const otherKeys = teamKeys.filter((k) => k !== tk)
                const teamGuests = allGuests.filter((g) => g.team === tk)
                // 仅管理员可见隐藏分；无评分队员和嘉宾按中性基准6.0估算。
                const memberScores = list.map((r) => hiddenRatings[r.user_id] ?? 6.0)
                const guestScores = teamGuests.map(() => 6.0)
                const teamTotal = [...memberScores, ...guestScores].reduce((s, v) => s + v, 0)
                const teamCount = memberScores.length + guestScores.length
                const teamAvg = teamCount > 0 ? teamTotal / teamCount : 0
                // 生效位置：手动指定 > 资料首选；嘉宾按录入位置
                const posOf = (r: Registration) => positionShort(r.assigned_position || r.profiles?.preferred_position)
                const POS_ORDER = ['前锋', '中场', '后卫', '门将']
                const sections = POS_ORDER.map((pos) => {
                  const players = list.filter((r) => posOf(r) === pos)
                  const guests = teamGuests.filter((g) => positionShort(g.position) === pos)
                  return {pos, players, guests, count: players.length + guests.length}
                }).filter((s) => s.count > 0)
                const noPosPlayers = list.filter((r) => !POS_ORDER.includes(posOf(r)))
                const noPosGuests = teamGuests.filter((g) => !POS_ORDER.includes(positionShort(g.position)))
                const noPosCount = noPosPlayers.length + noPosGuests.length
                /** 位置标签：管理员点击弹选择器手动指定；非管理员只读 */
                const PosChip = ({label, onPick}: {label: string; onPick: (v: string | null) => void}) =>
                  canManageTeams ? (
                    <Picker
                      mode="selector"
                      range={POS_PICK}
                      value={Math.max(0, POS_PICK.indexOf(label))}
                      onChange={(e) => {
                        const next = POS_PICK[Number(e.detail.value)]
                        onPick(next === '未定' ? null : next)
                      }}
                    >
                      <div className="self-start px-2 py-0.5 rounded-lg bg-primary/10 flex items-center gap-1 active:scale-95 transition">
                        <span className="text-base text-primary font-medium">{label}</span>
                        <div className="i-mdi-pencil-outline text-sm text-primary/70" />
                      </div>
                    </Picker>
                  ) : (
                    <span className="self-start px-2 py-0.5 rounded-lg bg-muted text-base text-muted-foreground">{label}</span>
                  )
                return (
                  <div key={tk} className="bg-card rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-3.5 h-3.5 rounded-full ${teamColor(tk)}`} />
                      <span className="text-2xl font-heading font-bold text-foreground">{tk}队</span>
                      <span className="text-lg text-muted-foreground">{teamCount}人</span>
                      {canManageTeams && teamCount > 0 && (
                        <div className="ml-auto bg-primary/10 rounded-lg px-3 py-1 flex items-center gap-2">
                          <span className="text-base text-primary">隐藏总分 {(Math.round(teamTotal * 10) / 10).toFixed(1)}</span>
                          <span className="text-base text-primary/80">均分 {(Math.round(teamAvg * 10) / 10).toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      {sections.map((s) => (
                        <div key={s.pos} className="bg-background rounded-xl p-3 flex flex-col gap-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`${POSITION_ICONS[s.pos]} text-xl text-primary`} />
                            <span className="text-lg text-primary font-medium">{s.pos}</span>
                            <span className="text-base text-muted-foreground">{s.count}人</span>
                          </div>
                          {s.players.map((r) => {
                            const p = r.profiles
                            const rating = hiddenRatings[r.user_id]
                            return (
                              <div key={r.id} className="flex items-center gap-2.5">
                                <Avatar url={p?.avatar_url} name={p?.nickname} />
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                  <span className="text-lg text-foreground truncate">
                                    {p?.nickname || '队员'}
                                    {r.seat_role === 'captain' && <span className="text-base text-primary"> · 队长</span>}
                                  </span>
                                  <PosChip label={posOf(r)} onPick={(v) => handleSetPlayerPosition(r.id, v)} />
                                </div>
                                {canManageTeams && (
                                  <span className={`font-heading text-2xl shrink-0 ${rating ? 'text-primary' : 'text-muted-foreground/50'}`}>
                                    {(rating ?? 6.0).toFixed(1)}
                                  </span>
                                )}
                                {canManageTeams && (
                                  <button
                                    type="button"
                                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 active:scale-95 ${r.seat_role === 'captain' ? 'bg-primary/15' : 'bg-muted'}`}
                                    onClick={() => handleToggleCaptain(r)}
                                  >
                                    <div className={`i-mdi-crown-outline text-lg ${r.seat_role === 'captain' ? 'text-primary' : 'text-muted-foreground'}`} />
                                  </button>
                                )}
                                {canManageTeams && otherKeys.length > 0 && (
                                  <div className="flex flex-row gap-1 shrink-0">
                                    {otherKeys.slice(0, 2).map((ok) => (
                                      <button
                                        key={ok}
                                        type="button"
                                        className="px-2 py-1 rounded-md bg-muted text-base text-muted-foreground active:scale-95"
                                        onClick={() => handleMoveTeam(r.id, ok)}
                                      >
                                        {ok}队
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {s.guests.map((g) => (
                            <div key={g.id} className="flex items-center gap-2.5">
                              <div className="i-mdi-account-plus-outline text-2xl text-muted-foreground/70" />
                              <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <span className="text-lg text-foreground truncate">
                                  {g.name || `${g.owner}的嘉宾`}
                                  <span className="text-base text-muted-foreground">（嘉宾）</span>
                                </span>
                                <PosChip label={positionShort(g.position)} onPick={(v) => handleSetGuestPosition(g.id, v)} />
                              </div>
                              {canManageTeams && <span className="font-heading text-2xl text-muted-foreground/70 shrink-0">6.0</span>}
                              {canManageTeams && otherKeys.length > 0 && (
                                <div className="flex flex-row gap-1 shrink-0">
                                  {otherKeys.slice(0, 2).map((ok) => (
                                    <button
                                      key={ok}
                                      type="button"
                                      className="px-2 py-1 rounded-md bg-muted text-base text-muted-foreground active:scale-95"
                                      onClick={() => handleMoveGuestTeam(g.id, ok)}
                                    >
                                      {ok}队
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                      {noPosCount > 0 && (
                        <div className="bg-background rounded-xl p-3 flex flex-col gap-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="i-mdi-help-circle-outline text-xl text-muted-foreground" />
                            <span className="text-lg text-muted-foreground font-medium">未定位置</span>
                            <span className="text-base text-muted-foreground">{noPosCount}人</span>
                          </div>
                          {noPosPlayers.map((r) => {
                            const p = r.profiles
                            const rating = hiddenRatings[r.user_id]
                            return (
                              <div key={r.id} className="flex items-center gap-2.5">
                                <Avatar url={p?.avatar_url} name={p?.nickname} />
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                  <span className="text-lg text-foreground truncate">
                                    {p?.nickname || '队员'}
                                    {r.seat_role === 'captain' && <span className="text-base text-primary"> · 队长</span>}
                                  </span>
                                  <PosChip label={posOf(r)} onPick={(v) => handleSetPlayerPosition(r.id, v)} />
                                </div>
                                {canManageTeams && (
                                  <span className={`font-heading text-2xl shrink-0 ${rating ? 'text-primary' : 'text-muted-foreground/50'}`}>
                                    {(rating ?? 6.0).toFixed(1)}
                                  </span>
                                )}
                                {canManageTeams && otherKeys.length > 0 && (
                                  <div className="flex flex-row gap-1 shrink-0">
                                    {otherKeys.slice(0, 2).map((ok) => (
                                      <button
                                        key={ok}
                                        type="button"
                                        className="px-2 py-1 rounded-md bg-muted text-base text-muted-foreground active:scale-95"
                                        onClick={() => handleMoveTeam(r.id, ok)}
                                      >
                                        {ok}队
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {noPosGuests.map((g) => (
                            <div key={g.id} className="flex items-center gap-2.5">
                              <div className="i-mdi-account-plus-outline text-2xl text-muted-foreground/70" />
                              <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <span className="text-lg text-foreground truncate">
                                  {g.name || `${g.owner}的嘉宾`}
                                  <span className="text-base text-muted-foreground">（嘉宾）</span>
                                </span>
                                <PosChip label={positionShort(g.position)} onPick={(v) => handleSetGuestPosition(g.id, v)} />
                              </div>
                              <span className="font-heading text-2xl text-muted-foreground/70 shrink-0">6.0</span>
                              {canManageTeams && otherKeys.length > 0 && (
                                <div className="flex flex-row gap-1 shrink-0">
                                  {otherKeys.slice(0, 2).map((ok) => (
                                    <button
                                      key={ok}
                                      type="button"
                                      className="px-2 py-1 rounded-md bg-muted text-base text-muted-foreground active:scale-95"
                                      onClick={() => handleMoveGuestTeam(g.id, ok)}
                                    >
                                      {ok}队
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {sections.length === 0 && noPosCount === 0 && (
                        <p className="text-base text-muted-foreground text-center py-2">暂无队员</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {unassigned.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-base text-muted-foreground">未分队（{unassigned.length}人）</span>
                <div className="flex flex-row flex-wrap gap-2">
                  {unassigned.map((r) => {
                    const p = r.profiles
                    return (
                      <div key={r.id} className="bg-background rounded-xl px-3 py-2 flex items-center gap-2">
                        <span className="text-lg text-foreground">{p?.nickname || '队员'}</span>
                        <span className="text-base text-muted-foreground">{positionShort(p?.preferred_position)}</span>
                        {canManageTeams && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {teamKeys.map((tk) => (
                              <button
                                key={tk}
                                type="button"
                                className="px-2 py-0.5 rounded-md bg-muted text-base text-muted-foreground active:scale-95"
                                onClick={() => handleMoveTeam(r.id, tk)}
                              >
                                {tk}队
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {unassignedGuests.length > 0 && (
                  <div className="flex flex-row flex-wrap gap-2 mt-1">
                    {unassignedGuests.map((g) => (
                      <div key={g.id} className="bg-background rounded-xl px-3 py-2 flex items-center gap-2">
                        <span className="text-lg text-foreground">{g.name || `${g.owner}的嘉宾`}</span>
                        <span className="text-base text-muted-foreground">（嘉宾）</span>
                        <span className="text-base text-muted-foreground">{positionShort(g.position)}</span>
                        {canManageTeams && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {teamKeys.map((tk) => (
                              <button
                                key={tk}
                                type="button"
                                className="px-2 py-0.5 rounded-md bg-muted text-base text-muted-foreground active:scale-95"
                                onClick={() => handleMoveGuestTeam(g.id, tk)}
                              >
                                {tk}队
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 赛后总结模块（已取消活动不展示） */}
      {ended && !cancelled && (
        <div className="mt-4 bg-card rounded-2xl border-2 border-primary/30 overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-border/40">
            <div className="i-mdi-clipboard-text-clock-outline text-3xl text-primary" />
            <h3 className="font-heading text-2xl text-foreground">赛后总结</h3>
            <span className="px-2 py-0.5 rounded-md bg-primary/15 text-base text-primary">已完赛</span>
          </div>

          {/* 总结内容 / 编辑 */}
          <div className="px-5 py-4 flex flex-col gap-3">
            {editingSummary ? (
              <>
                <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                  <textarea
                    className="w-full h-40 text-xl text-foreground bg-transparent outline-none leading-relaxed"
                    placeholder="填写本场赛后总结…"
                    value={summaryText}
                    onInput={(e) => {
                      const ev = e as any
                      setSummaryText(ev.detail?.value ?? ev.target?.value ?? '')
                    }}
                  />
                </div>
                <div className="flex flex-row gap-3">
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-border/60 bg-card"
                    onClick={() => {
                      setEditingSummary(false)
                      setSummaryText(summary?.content || '')
                    }}
                  >
                    <div className="py-2.5 text-lg text-muted-foreground">取消</div>
                  </button>
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${savingSummary ? 'bg-primary/50' : 'bg-primary'}`}
                    onClick={handleSaveSummary}
                  >
                    <div className="py-2.5 text-lg text-primary-foreground">{savingSummary ? '保存中…' : '保存总结'}</div>
                  </button>
                </div>
              </>
            ) : summary ? (
              <>
                <p className="text-xl text-foreground/85 leading-relaxed whitespace-pre-line">{summary.content}</p>
                <div className="flex items-center gap-2">
                  <Avatar url={summary.author?.nickname ? undefined : undefined} name={summary.author?.nickname || ''} size="sm" />
                  <span className="text-base text-muted-foreground">{summary.author?.nickname || '主教练'} · 撰写</span>
                  {canEditSummary && (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5"
                      onClick={() => {
                        setSummaryText(summary.content)
                        setEditingSummary(true)
                      }}
                    >
                      <div className="i-mdi-pencil-outline text-lg text-muted-foreground" />
                      <span className="text-base text-muted-foreground">编辑</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-lg text-muted-foreground">本场比赛暂无赛后总结</p>
                {canEditSummary && (
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none break-keep rounded-xl bg-primary self-start"
                    onClick={() => {
                      setSummaryText('')
                      setEditingSummary(true)
                    }}
                  >
                    <div className="py-2.5 px-6 text-lg text-primary-foreground">填写赛后总结</div>
                  </button>
                )}
              </>
            )}
          </div>

          {/* MVP 投票 */}
          <div className="px-5 py-4 border-t border-border/40 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="i-mdi-trophy-award text-2xl text-primary" />
              <span className="font-heading text-xl text-foreground">本场 MVP</span>
            </div>
            <VoteSection
              rows={votes.mvp}
              myVote={myVotes.mvp}
              candidates={voteCandidates}
              onVote={(cid) => handleVote(cid, 'mvp')}
              disabled={voting}
            />
          </div>

          {/* 最佳防守投票 */}
          <div className="px-5 py-4 border-t border-border/40 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="i-mdi-shield-star-outline text-2xl text-primary" />
              <span className="font-heading text-xl text-foreground">本场最佳防守</span>
            </div>
            <VoteSection
              rows={votes.defender}
              myVote={myVotes.defender}
              candidates={voteCandidates}
              onVote={(cid) => handleVote(cid, 'defender')}
              disabled={voting}
            />
          </div>
        </div>
      )}

      {/* 评论区 */}
      {!isAdminAccount && (

      <div className="mt-4 mb-8 bg-card rounded-2xl border-2 border-border/60 overflow-hidden">
        <div
          className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-border/40"
          onClick={() => setCommentExpanded((v) => !v)}
        >
          <div className="i-mdi-comment-text-outline text-3xl text-primary" />
          <h3 className="font-heading text-2xl text-foreground">活动评论</h3>
          <span className="text-lg text-muted-foreground">({comments.length})</span>
          <div
            className="ml-auto i-mdi-chevron-down text-2xl text-muted-foreground transition-transform"
            style={{transform: commentExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}}
          />
        </div>
        {commentExpanded && (
          <>
        {/* 评论输入（回复时显示被回复人，可取消） */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-border/40">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {replyTo && (
              <div className="flex items-center gap-2">
                <div className="i-mdi-reply-outline text-lg text-primary" />
                <span className="text-base text-muted-foreground truncate flex-1">
                  回复 @{replyTo.profiles?.nickname || '队员'}：{replyTo.content.slice(0, 18)}
                </span>
                <button type="button" className="shrink-0" onClick={() => setReplyTo(null)}>
                  <div className="i-mdi-close-circle-outline text-xl text-muted-foreground" />
                </button>
              </div>
            )}
            <div className="w-full border-2 border-input rounded-lg px-4 py-2.5 bg-background overflow-hidden">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder={replyTo ? `回复 @${replyTo.profiles?.nickname || '队员'}…` : '说点什么…'}
                value={commentText}
                maxLength={500}
                onInput={(e) => {
                  const ev = e as any
                  setCommentText(ev.detail?.value ?? ev.target?.value ?? '')
                }}
              />
            </div>
          </div>
          <button
            type="button"
            className={`self-end flex items-center justify-center leading-none break-keep rounded-xl ${
              commentText.trim() ? 'bg-primary lift-glow' : 'bg-muted'
            }`}
            onClick={handleSendComment}
          >
            <div className="py-2.5 px-5 text-xl text-primary-foreground">
              {sendingComment ? '发送中…' : '发送'}
            </div>
          </button>
        </div>
        {/* 评论列表（盖楼层级 + 点赞） */}
        {comments.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center gap-2">
            <div className="i-mdi-message-bulleted-off text-5xl text-muted-foreground/50" />
            <p className="text-lg text-muted-foreground">还没有评论，来抢沙发吧</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {comments
              .filter((c) => !c.parent_id)
              .map((c) => (
                <div key={c.id} className="px-5 py-4 flex flex-col gap-2 border-b border-border/30 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <Avatar url={c.profiles?.avatar_url} name={c.profiles?.nickname} size="sm" />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg text-foreground font-bold truncate">
                          {c.profiles?.nickname || '队员'}
                        </span>
                        <span className="text-base text-muted-foreground">
                          {new Date(c.created_at).toLocaleString('zh-CN', {
                            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <p className="text-xl text-foreground/90 break-words leading-relaxed">{c.content}</p>
                    </div>
                    {/* 点赞 */}
                    <button
                      type="button"
                      className="shrink-0 flex flex-col items-center gap-0.5"
                      onClick={() => handleToggleLike(c)}
                    >
                      <div
                        className={`${
                          myLikedIds.includes(c.id) ? 'i-mdi-heart text-2xl text-primary' : 'i-mdi-heart-outline text-2xl text-muted-foreground'
                        }`}
                      />
                      <span className={`text-base ${myLikedIds.includes(c.id) ? 'text-primary' : 'text-muted-foreground'}`}>
                        {c.likes?.[0]?.count || 0}
                      </span>
                    </button>
                  </div>
                  {/* 回复按钮 */}
                  <div className="pl-14">
                    <button
                      type="button"
                      className="flex items-center gap-1"
                      onClick={() => setReplyTo(c)}
                    >
                      <div className="i-mdi-reply-outline text-lg text-muted-foreground" />
                      <span className="text-base text-muted-foreground">回复</span>
                    </button>
                  </div>
                  {/* 楼中楼回复 */}
                  {(() => {
                    const replies = comments.filter((r) => r.parent_id === c.id)
                    if (replies.length === 0) return null
                    return (
                      <div className="ml-14 rounded-xl bg-muted/60 px-3 py-2 flex flex-col gap-2">
                        {replies.map((r) => (
                          <div key={r.id} className="flex items-start gap-2">
                            <Avatar url={r.profiles?.avatar_url} name={r.profiles?.nickname} size="sm" />
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-base text-foreground font-bold truncate">
                                  {r.profiles?.nickname || '队员'}
                                </span>
                                {r.reply_to?.nickname && (
                                  <span className="text-base text-muted-foreground truncate">
                                    回复 @{r.reply_to.nickname}
                                  </span>
                                )}
                              </div>
                              <p className="text-lg text-foreground/90 break-words leading-relaxed">{r.content}</p>
                              <button
                                type="button"
                                className="flex items-center gap-1 self-start"
                                onClick={() => setReplyTo(r)}
                              >
                                <div className="i-mdi-reply-outline text-base text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">回复</span>
                              </button>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 flex flex-col items-center gap-0.5"
                              onClick={() => handleToggleLike(r)}
                            >
                              <div
                                className={`${
                                  myLikedIds.includes(r.id) ? 'i-mdi-heart text-xl text-primary' : 'i-mdi-heart-outline text-xl text-muted-foreground'
                                }`}
                              />
                              <span className={`text-sm ${myLikedIds.includes(r.id) ? 'text-primary' : 'text-muted-foreground'}`}>
                                {r.likes?.[0]?.count || 0}
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              ))}
          </div>
        )}
          </>
        )}
      </div>
      )}

      {/* 删除活动（管理员/发起人） */}
      {canDelete && (
        <div className="pb-44 pt-2">
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-destructive/40 bg-destructive/5"
            onClick={handleDelete}
          >
            <div className="py-3 flex items-center gap-1.5">
              <div className={`${deleting ? 'i-mdi-loading' : 'i-mdi-trash-can-outline'} text-2xl text-destructive`} />
              <span className="text-xl text-destructive">{deleting ? '删除中…' : '删除活动'}</span>
            </div>
          </button>
        </div>
      )}
      </div>

      {/* 海报弹层 */}
      <SharePoster
        visible={showPoster}
        activity={activity}
        joinedCount={count}
        onClose={() => setShowPoster(false)}
      />

      <PostMatchRatingModal
        visible={showPostMatchRating}
        activityId={id}
        form={postMatchRatingForm}
        onClose={closePostMatchRating}
        onSubmitted={markPostMatchRatingSubmitted}
      />

      <PaymentPoster
        visible={showPaymentPoster}
        activity={activity}
        registrations={registrations}
        venueFee={String(effectiveVenue)}
        waterFee={String(effectiveWater)}
        feeDiscount={feeDiscount.trim() === '' ? '9' : feeDiscount}
        headcount={effectiveHeadcount}
        qrUrl={paymentQrUrl}
        qrOwner={paymentQrOwner}
        onClose={() => setShowPaymentPoster(false)}
      />

      {/* 收款码设置弹窗 */}
      {showQrSetup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setShowQrSetup(false)}>
          <div
            className="w-full bg-card rounded-t-3xl p-6 flex flex-col gap-4"
            style={{maxHeight: '80vh'}}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-2xl text-foreground">自定义收款码</h3>
              <button
                type="button"
                className="i-mdi-close text-2xl text-muted-foreground"
                onClick={() => setShowQrSetup(false)}
              />
            </div>
            <div className="overflow-y-auto flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-lg text-foreground">收款码图片</span>
                <div
                  className="w-full h-40 rounded-xl border-2 border-dashed border-input flex items-center justify-center overflow-hidden bg-background"
                  onClick={handlePickQr}
                >
                  {qrFile?.tempFilePath || paymentQrUrl ? (
                    <Image
                      src={qrFile?.tempFilePath || paymentQrUrl || ''}
                      mode="aspectFit"
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div className="i-mdi-qrcode-plus text-4xl text-muted-foreground" />
                      <span className="text-base text-muted-foreground">点击选择收款码图片</span>
                    </div>
                  )}
                </div>
                <p className="text-base text-muted-foreground">
                  未设置时使用默认收款码（Seven 7）。上传后全队海报共用该收款码。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-lg text-foreground">收款人名称</span>
                <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                  <input
                    className="w-full text-xl text-foreground bg-transparent outline-none"
                    placeholder="如：阿文 (**文)"
                    value={qrOwnerInput}
                    onInput={(e) => {
                      const ev = e as any
                      setQrOwnerInput(ev.detail?.value ?? ev.target?.value ?? '')
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-row gap-3">
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl bg-card border-2 border-border"
                  onClick={handleResetQr}
                >
                  <div className="py-3 text-xl text-foreground">恢复默认</div>
                </button>
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${qrSaving ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
                  onClick={handleSaveQr}
                >
                  <div className="py-3 text-xl text-primary-foreground">{qrSaving ? '保存中…' : '保存'}</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部操作区 */}
      <div className={`fixed bottom-0 left-0 right-0 z-30 bg-card border-t-2 border-border px-5 pt-4 pb-8 transition-transform duration-300 ${barHidden ? 'translate-y-full' : 'translate-y-0'}`}>
        {cancelled ? (
          <div className="w-full flex items-center justify-center rounded-xl bg-destructive/10 py-3.5">
            <span className="text-xl text-destructive">活动已取消 · 不计出场、不结算奖励</span>
          </div>
        ) : ended ? (
          joined ? (
            <button
              type="button"
              className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow"
              onClick={() => Taro.navigateTo({url: `/pages/match-report/index?activity_id=${id}`})}
            >
              <div className="py-3.5 px-6 flex items-center gap-2">
                <div className="i-mdi-clipboard-edit-outline text-2xl text-primary-foreground" />
                <span className="text-2xl text-primary-foreground font-medium">填报进球 / 助攻</span>
              </div>
            </button>
          ) : (
            <div className="w-full flex items-center justify-center rounded-xl bg-muted py-3.5">
              <span className="text-xl text-muted-foreground">活动已结束</span>
            </div>
          )
        ) : joined ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-row gap-3">
              <div className="flex-1 flex items-center justify-center rounded-xl bg-primary/10 py-3.5">
                <span className="text-xl text-primary">已报名成功</span>
              </div>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-destructive/60 ${
                  acting || !canWithdraw ? 'opacity-50' : 'lift-glow'
                }`}
                onClick={handleCancel}
              >
                <div className="py-3 px-4 text-xl text-destructive">取消报名</div>
              </button>
            </div>
            {!canWithdraw && (
              <p className="text-center text-base text-muted-foreground">{withdrawCheck.reason || '当前不允许取消报名'}</p>
            )}
          </div>
        ) : full ? (
          <div className="flex flex-col gap-3">
            <div className="w-full flex items-center justify-center rounded-xl bg-muted py-3.5">
              <span className="text-xl text-muted-foreground">名额已满 · 暂无法报名</span>
            </div>
            {coachAvail > 0 && (
              <button
                type="button"
                className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${acting ? 'bg-amber-500/50' : 'bg-amber-500 lift-glow'}`}
                onClick={() => handleJoinSeat('coach')}
              >
                <div className="py-3 px-6 flex items-center gap-2">
                  <div className="i-mdi-whistle text-2xl text-white" />
                  <span className="text-xl text-white font-medium">或报主教练（余{coachAvail}）</span>
                </div>
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${
              acting ? 'bg-primary/50' : 'bg-primary lift-glow'
            }`}
            onClick={handleJoin}
          >
            <div className="py-3.5 px-6 flex items-center gap-2">
              <div className="i-mdi-account-plus-outline text-2xl text-primary-foreground" />
              <span className="text-2xl text-primary-foreground font-medium">我要报名</span>
            </div>
          </button>
        )}

        {/* 收款名单海报入口 */}
        {canExportPayment && (
          <div className="flex flex-col gap-2 mt-3">
            <div className="flex flex-row gap-2">
              <div className="w-24 shrink-0 border-2 border-input rounded-lg px-3 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  type="number"
                  placeholder={`人数 ${count}`}
                  value={headcountInput}
                  onInput={(e) => {
                    const ev = e as any
                    setHeadcountInput(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
              <div className="flex-[1.4] min-w-0 border-2 border-input rounded-lg px-3 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  type="digit"
                  placeholder={feeDefaults.venue > 0 ? `场地 ${feeDefaults.venue}` : '场地'}
                  value={venueFee}
                  onInput={(e) => {
                    const ev = e as any
                    setVenueFee(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
              <div className="flex-1 min-w-0 border-2 border-input rounded-lg px-3 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  type="digit"
                  placeholder={feeDefaults.water > 0 ? `水 ${feeDefaults.water}` : '水'}
                  value={waterFee}
                  onInput={(e) => {
                    const ev = e as any
                    setWaterFee(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
              <div className="w-24 shrink-0 border-2 border-input rounded-lg px-3 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  type="number"
                  placeholder="折扣 9"
                  value={feeDiscount}
                  onInput={(e) => {
                    const ev = e as any
                    setFeeDiscount(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow"
              onClick={() => {
                if (venueFee.trim() === '' && waterFee.trim() === '' && feeDefaults.venue <= 0 && feeDefaults.water <= 0) {
                  Taro.showToast({title: '请输入场地费或水费', icon: 'none'})
                  return
                }
                if (count <= 0) {
                  Taro.showToast({title: '暂无报名人员', icon: 'none'})
                  return
                }
                if (!discountValid) {
                  Taro.showToast({title: '折扣须为 1-10 的数字（如 9）', icon: 'none'})
                  return
                }
                setShowPaymentPoster(true)
              }}
            >
              <div className="py-3 px-4 flex items-center gap-2">
                <div className="i-mdi-currency-yen text-2xl" />
                <span className="text-xl font-medium">导出收款海报</span>
              </div>
            </button>
            {(venueFee.trim() !== '' || waterFee.trim() !== '' || feeDefaults.venue > 0 || feeDefaults.water > 0) && count > 0 && (
              <p className="text-center text-base text-muted-foreground">
                {discountValid
                  ? `合计 ${baseFee} 元 · ${effectiveDiscount}折后 ${finalFee} 元 · 人均 ${Math.round((finalFee / effectiveHeadcount) * 100) / 100} 元（共 ${effectiveHeadcount} 人）`
                  : `合计 ${baseFee} 元 · 折扣须为 1-10 的数字（如 9）`}
              </p>
            )}
            <button
              type="button"
              className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-card border-2 border-border"
              onClick={openQrSetup}
            >
              <div className="py-2.5 flex items-center gap-2">
                <div className="i-mdi-qrcode-edit text-2xl text-primary" />
                <span className="text-lg text-foreground">自定义收款码{paymentQrUrl ? '（已设置）' : ''}</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* 席位选择弹窗 */}
      {showSeatPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setShowSeatPicker(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-2xl text-foreground">选择报名席位</h3>
              <button type="button" className="i-mdi-close text-2xl text-muted-foreground" onClick={() => setShowSeatPicker(false)} />
            </div>

            {/* 首选 / 次选位置（队员、队长报名时选择，便于按位置分人） */}
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">首选位置 <span className="text-destructive">*</span></span>
              <div className="flex flex-row gap-2">
                {POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border-2 ${
                      joinPos1 === pos ? 'border-primary bg-primary/10' : 'border-border/60 bg-background'
                    }`}
                    onClick={() => setJoinPos1(pos)}
                  >
                    <div className={`${POSITION_ICONS[pos]} text-2xl ${joinPos1 === pos ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-base ${joinPos1 === pos ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{pos}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">次选位置</span>
              <div className="flex flex-row gap-2">
                <button
                  type="button"
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border-2 ${
                    !joinPos2 ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-background'
                  }`}
                  onClick={() => setJoinPos2('')}
                >
                  <div className={`i-mdi-help-circle-outline text-2xl ${!joinPos2 ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-base ${!joinPos2 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>不限</span>
                </button>
                {POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border-2 ${
                      joinPos2 === pos ? 'border-primary bg-primary/10' : 'border-border/60 bg-background'
                    }`}
                    onClick={() => setJoinPos2(pos)}
                  >
                    <div className={`${POSITION_ICONS[pos]} text-2xl ${joinPos2 === pos ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-base ${joinPos2 === pos ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{pos}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 普通队员可带人 */}
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">带人数量（不含本人）</span>
              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center active:scale-95"
                  onClick={() => {
                    setGuestCount((v) => Math.max(0, v - 1))
                    setGuestInfo((arr) => arr.slice(0, Math.max(0, guestCount - 1)))
                  }}
                >
                  <div className="i-mdi-minus text-2xl text-foreground" />
                </button>
                <span className="w-16 text-center text-2xl font-medium text-foreground">{guestCount}</span>
                <button
                  type="button"
                  className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center active:scale-95"
                  onClick={() => {
                    const remain = maxPlayers - count
                    if (remain <= 0) return Taro.showToast({title: '名额已满', icon: 'none'})
                    setGuestCount((v) => Math.min(remain, v + 1))
                    setGuestInfo((arr) => [...arr, {name: '', position: ''}])
                  }}
                >
                  <div className="i-mdi-plus text-2xl text-foreground" />
                </button>
                <span className="text-base text-muted-foreground">本次共 {1 + guestCount} 人</span>
              </div>
            </div>

            {/* 嘉宾位置录入：每位嘉宾选位置（必选），姓名可选 */}
            {guestCount > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xl text-muted-foreground">嘉宾位置（参与分队）</span>
                {Array.from({length: guestCount}, (_, i) => {
                  const gi = guestInfo[i] || {name: '', position: ''}
                  return (
                    <div key={i} className="bg-background rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base text-muted-foreground shrink-0">嘉宾{i + 1}</span>
                        <div className="flex-1 border-2 border-input rounded-lg px-3 py-1.5 bg-card overflow-hidden">
                          <input
                            className="w-full text-lg text-foreground bg-transparent outline-none"
                            placeholder="名字 / 称呼（可选）"
                            maxLength={12}
                            value={gi.name}
                            onInput={(e) => {
                              const ev = e as any
                              const val = ev.detail?.value ?? ev.target?.value ?? ''
                              setGuestInfo((arr) => {
                                const next = [...arr]
                                while (next.length <= i) next.push({name: '', position: ''})
                                next[i] = {...next[i], name: val}
                                return next
                              })
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-row gap-1.5">
                        {POSITIONS.map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border-2 ${
                              gi.position === pos ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'
                            }`}
                            onClick={() => {
                              setGuestInfo((arr) => {
                                const next = [...arr]
                                while (next.length <= i) next.push({name: '', position: ''})
                                next[i] = {...next[i], position: pos}
                                return next
                              })
                            }}
                          >
                            <div className={`${POSITION_ICONS[pos]} text-xl ${gi.position === pos ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className={`text-base ${gi.position === pos ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                              {positionShort(pos)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-primary/40 bg-primary/5 active:scale-95"
                onClick={() => handleJoinSeat('player', guestCount)}
              >
                <div className="i-mdi-soccer text-2xl text-primary" />
                <div className="flex-1 flex flex-col">
                  <span className="text-xl text-foreground font-medium">普通队员</span>
                  <span className="text-base text-muted-foreground">常规报名席位</span>
                </div>
              </button>
              <button
                type="button"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 active:scale-95 ${captainAvail > 0 ? 'border-violet-500/40 bg-violet-500/5' : 'border-border/50 bg-muted opacity-50'}`}
                onClick={() => (captainAvail > 0 ? handleJoinSeat('captain', guestCount) : Taro.showToast({title: '队长席位已满', icon: 'none'}))}
              >
                <div className="i-mdi-star-circle text-2xl text-violet-600" />
                <div className="flex-1 flex flex-col">
                  <span className="text-xl text-foreground font-medium">队长席位</span>
                  <span className="text-base text-muted-foreground">剩余 {captainAvail} 个</span>
                </div>
              </button>
              <button
                type="button"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 active:scale-95 ${coachAvail > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/50 bg-muted opacity-50'}`}
                onClick={() => (coachAvail > 0 ? handleJoinSeat('coach') : Taro.showToast({title: '主教练席位已满', icon: 'none'}))}
              >
                <div className="i-mdi-whistle text-2xl text-amber-600" />
                <div className="flex-1 flex flex-col">
                  <span className="text-xl text-foreground font-medium">主教练席位</span>
                  <span className="text-base text-muted-foreground">剩余 {coachAvail} 个</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VoteSection({
  rows,
  myVote,
  candidates,
  onVote,
  disabled
}: {
  rows: MatchVoteRow[]
  myVote: string | null
  candidates: {id: string; nickname: string | null; avatar_url: string | null; jersey_number: number | null}[]
  onVote: (candidateId: string) => void
  disabled: boolean
}) {
  const maxV = Math.max(1, ...rows.map((r) => r.votes))
  const hasVoted = !!myVote
  return (
    <div className="flex flex-col gap-3">
      {/* 投票结果条 */}
      {rows.length > 0 ? (
        rows.map((r, idx) => (
          <div key={r.candidate_id} className="flex items-center gap-2">
            <span className={`w-6 text-center font-heading text-lg ${idx === 0 ? 'text-primary' : 'text-muted-foreground'}`}>
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-lg text-foreground truncate">
                  {r.nickname || '队员'}
                  {r.jersey_number != null ? ` #${r.jersey_number}` : ''}
                </span>
                <span className="text-lg text-primary shrink-0">{r.votes}票</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-gold rounded-full"
                  style={{width: `${(r.votes / maxV) * 100}%`}}
                />
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="text-base text-muted-foreground">暂无投票</p>
      )}

      {/* 投票按钮区 */}
      <div className="flex flex-row flex-wrap gap-2 mt-1">
        {candidates.map((c) => {
          const voted = myVote === c.id
          return (
            <button
              key={c.id}
              type="button"
              className={`flex items-center justify-center leading-none break-keep rounded-lg border-2 px-3 py-1.5 ${
                voted ? 'border-primary bg-primary/15' : hasVoted ? 'border-border/40 bg-muted' : 'border-primary/40 bg-card'
              } ${disabled ? 'opacity-50' : ''}`}
              onClick={() => !hasVoted && onVote(c.id)}
            >
              <span className={`text-base ${voted ? 'text-primary' : 'text-foreground'}`}>
                {c.nickname || '队员'}
                {voted ? ' ✓' : ''}
              </span>
            </button>
          )
        })}
      </div>
      {hasVoted && <p className="text-base text-muted-foreground">已投票（每人限投1票，可改投）</p>}
    </div>
  )
}

export default withRouteGuard(ActivityDetail)
