// @title 赛后匿名表现评分弹窗
import {ScrollView, View} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {useEffect, useMemo, useRef, useState} from 'react'
import {Avatar} from '@/components/Avatar'
import {submitPostMatchRatings} from '@/db/api'
import type {PostMatchRatingForm} from '@/db/api'

interface PostMatchRatingModalProps {
  visible: boolean
  activityId: string
  form: PostMatchRatingForm | null
  onClose: () => void
  onSubmitted: () => void
}

const TEAM_ORDER = ['A', 'B', 'C', 'D', '未分队'] as const
const POSITION_LABEL: Record<string, string> = {
  前锋: '前',
  中场: '中',
  后卫: '后',
  门将: '门',
  ST: '前',
  CM: '中',
  CB: '后',
  GK: '门'
}

export function PostMatchRatingModal({visible, activityId, form, onClose, onSubmitted}: PostMatchRatingModalProps) {
  const [scores, setScores] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [present, setPresent] = useState(false)
  const [sheetOn, setSheetOn] = useState(false)
  const activeForm = form?.eligible && !form.submitted ? form : null
  const heldForm = useRef<PostMatchRatingForm | null>(activeForm)
  if (activeForm) heldForm.current = activeForm
  const viewForm = activeForm ?? heldForm.current
  const canShow = visible && !!activeForm
  useEffect(() => {
    if (activityId) setScores({})
  }, [activityId])

  useEffect(() => {
    if (canShow) {
      setPresent(true)
      const enter = setTimeout(() => setSheetOn(true), 20)
      return () => clearTimeout(enter)
    }
    setSheetOn(false)
    const leave = setTimeout(() => setPresent(false), 320)
    return () => clearTimeout(leave)
  }, [canShow])

  const groups = useMemo(() => {
    const participants = viewForm?.participants || []
    return TEAM_ORDER.map((team) => ({
      team,
      members: participants.filter((member) => (member.team || '未分队') === team)
    })).filter((group) => group.members.length > 0)
  }, [viewForm])

  if (!present || !viewForm) return null

  const scoredCount = Object.keys(scores).length
  const total = viewForm.participants.filter((member) => !member.is_self).length

  const chooseScore = (memberId: string, score: number) => {
    setScores((current) => {
      if (current[memberId] === score) {
        const next = {...current}
        delete next[memberId]
        return next
      }
      return {...current, [memberId]: score}
    })
  }

  const clearScore = (memberId: string) => {
    setScores((current) => {
      if (current[memberId] === undefined) return current
      const next = {...current}
      delete next[memberId]
      return next
    })
  }

  const submit = async () => {
    if (submitting || scoredCount === 0) return
    if (scoredCount < total) {
      const confirm = await Taro.showModal({
        title: '确认提交',
        content: `已评价 ${scoredCount} 人，另外 ${total - scoredCount} 人保持未评分。未评分不会记为0分，提交后本场不能修改。`,
        confirmText: '确认提交'
      })
      if (!confirm.confirm) return
    }

    setSubmitting(true)
    try {
      const ratings = Object.entries(scores).map(([rated_id, score]) => ({rated_id, score}))
      const result = await submitPostMatchRatings(activityId, ratings)
      Taro.showToast({title: result.message, icon: result.ok ? 'success' : 'none'})
      if (result.ok) onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="fixed inset-0 z-[70] flex items-end" catchMove onClick={onClose}>
      <View className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${sheetOn ? 'opacity-100' : 'opacity-0'}`} catchMove />
      <View
        className={`relative w-full bg-card rounded-t-3xl overflow-hidden flex flex-col transition-transform duration-300 ease-out ${sheetOn ? 'translate-y-0' : 'translate-y-full'}`}
        style={{maxHeight: '90vh'}}
        catchMove
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="i-mdi-star-half-full text-3xl text-primary shrink-0" />
              <h3 className="font-heading text-2xl text-foreground">赛后评分</h3>
            </div>
            <button type="button" className="i-mdi-close text-2xl text-muted-foreground shrink-0" onClick={onClose} />
          </div>
          <p className="mt-1 text-base text-muted-foreground">按本场实际表现评分，可留空不评，将影响分队均衡</p>
        </div>

        <ScrollView scrollY className="flex-1 min-h-0" style={{height: '58vh'}}>
          <div className="px-4 py-3 flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.team} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="font-heading text-lg text-primary">{group.team === '未分队' ? group.team : `${group.team}队`}</span>
                  <span className="text-base text-muted-foreground">{group.members.length}人</span>
                </div>
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  {group.members.map((member) => {
                    const score = scores[member.id]
                    const value = score ?? 0
                    const isSelf = member.is_self
                    return (
                      <div key={member.id} className="relative h-16 px-1.5 flex items-center gap-0.5 bg-background border-b border-border/40 last:border-b-0">
                        <div className="h-full shrink-0 flex items-center justify-center mr-1.5"><Avatar url={member.avatar_url} name={member.nickname} size="sm" /></div>
                        <span className="w-[25%] min-w-0 shrink-0 text-sm text-foreground truncate whitespace-nowrap">{member.nickname || '队员'}</span>
                        <span className="absolute left-1/2 -translate-x-1/2 w-6 text-center text-xs text-muted-foreground whitespace-nowrap">
                          {member.jersey_number ?? '--'}·{POSITION_LABEL[member.position || ''] || '未'}
                        </span>
                        {isSelf ? (
                          <span className="ml-auto w-40 text-center text-sm text-muted-foreground">(我)</span>
                        ) : (
                          <>
                            <div className="ml-auto flex items-center shrink-0" aria-label={`给${member.nickname || '队员'}评分`}>
                              {[0, 1, 2, 3, 4].map((index) => {
                                const half = index * 2 + 1
                                const full = half + 1
                                const fillWidth = value >= full ? 'w-full' : value === half ? 'w-1/2' : 'w-0'
                                return (
                                  <div key={index} className="relative w-7 h-10 flex items-center justify-center">
                                    <div className="i-lucide-star text-[1.75rem] text-muted-foreground/35" />
                                    <div className={`absolute left-0 top-0 bottom-0 overflow-hidden ${fillWidth}`}>
                                      <div className="absolute left-0 top-0 w-7 h-10 flex items-center justify-center">
                                        <div className="i-lucide-star text-[1.75rem] text-amber-500" />
                                      </div>
                                    </div>
                                    <div className="absolute left-0 top-0 bottom-0 w-1/2" onClick={() => chooseScore(member.id, half)} />
                                    <div className="absolute right-0 top-0 bottom-0 w-1/2" onClick={() => chooseScore(member.id, full)} />
                                  </div>
                                )
                              })}
                            </div>
                            <button
                              type="button"
                              className={`w-5 h-10 flex items-center justify-end font-heading text-base shrink-0 ${score ? 'text-primary' : 'text-muted-foreground/40'}`}
                              aria-label={score ? `清除${member.nickname || '队员'}的${score}分` : `${member.nickname || '队员'}尚未评分`}
                              onClick={() => clearScore(member.id)}
                            >
                              {score ?? '--'}
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollView>

        <div className="px-5 pt-3 pb-7 border-t border-border/50 bg-card flex flex-col gap-2">
          <div className="flex items-center justify-between text-base">
            <span className="text-muted-foreground">已评 {scoredCount}/{total} 人</span>
            <span className="text-muted-foreground">点击右侧分数可清除</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 rounded-xl border-2 border-border flex items-center justify-center"
              onClick={onClose}
            >
              <span className="py-3 text-xl text-foreground">稍后再评</span>
            </button>
            <button
              type="button"
              disabled={scoredCount === 0 || submitting}
              className={`flex-[1.4] rounded-xl flex items-center justify-center ${scoredCount === 0 || submitting ? 'bg-muted' : 'bg-primary lift-glow'}`}
              onClick={submit}
            >
              <span className={`py-3 text-xl ${scoredCount === 0 || submitting ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
                {submitting ? '提交中…' : '确定提交'}
              </span>
            </button>
          </div>
        </div>
      </View>
    </View>
  )
}
