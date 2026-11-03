/** 球员综合评分弹窗：1-10分（0.5步长）+ 预设标签 + 文字评论，明细可滚动 */
import {useCallback, useEffect, useRef, useState} from 'react'
import Taro from '@tarojs/taro'
import {ScrollView, View} from '@tarojs/components'
import {Avatar} from '@/components/Avatar'
import {getPlayerRatings, submitPlayerRating} from '@/db/api'
import {RATING_TAGS, RATING_TAG_KINDS} from '@/constants'
import type {PlayerRatingDetailRow, RatingMemberRow} from '@/db/api'

interface RatingModalProps {
  visible: boolean
  member: RatingMemberRow | null
  currentUserId: string | null
  onClose: () => void
  /** 提交成功后回调（供外部刷新列表平均分） */
  onRated?: () => void | Promise<void>
}


export function RatingModal({visible, member, currentUserId, onClose, onRated}: RatingModalProps) {
  const [ratings, setRatings] = useState<PlayerRatingDetailRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [myScore, setMyScore] = useState<number>(6.0)
  const [myTags, setMyTags] = useState<string[]>([])
  const [myComment, setMyComment] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [present, setPresent] = useState(false)
  const [sheetOn, setSheetOn] = useState(false)
  const ignoreScrollUntil = useRef(0)
  const heldMember = useRef<RatingMemberRow | null>(member)
  if (member) heldMember.current = member
  const viewMember = member ?? heldMember.current

  const memberId = member?.id
  const loadData = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    const list = await getPlayerRatings(memberId)
    setRatings(list)
    setLoading(false)
  }, [memberId])

  useEffect(() => {
    if (visible && memberId) {
      setFormOpen(false)
      setMyTags([])
      setMyComment('')
      loadData()
    }
  }, [visible, memberId, loadData])

  useEffect(() => {
    if (visible) {
      setPresent(true)
      const enter = setTimeout(() => setSheetOn(true), 20)
      return () => clearTimeout(enter)
    }
    setSheetOn(false)
    const leave = setTimeout(() => setPresent(false), 320)
    return () => clearTimeout(leave)
  }, [visible])

  if (!present || !viewMember) return null

  const isSelf = viewMember.id === currentUserId

  const toggleTag = (label: string) => {
    setMyTags((prev) => (prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]))
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    const ok = await submitPlayerRating(viewMember.id, myScore, myTags, myComment)
    if (ok) {
      Taro.showToast({title: isSelf ? '自评已提交' : '评分已提交', icon: 'success'})
      setMyComment('')
      setFormOpen(false)
      await loadData()
      await onRated?.()
    } else {
      Taro.showToast({title: '提交失败', icon: 'none'})
    }
    setSubmitting(false)
  }

  return (
    <View className="fixed inset-0 z-[60] flex flex-col justify-end" catchMove onClick={onClose}>
      <View className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${sheetOn ? 'opacity-100' : 'opacity-0'}`} catchMove />
      <View
        className={`relative w-full bg-background rounded-t-3xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${sheetOn ? 'translate-y-0' : 'translate-y-full'}`}
        style={{height: '82vh'}}
        catchMove
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="shrink-0 px-5 pt-5 pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar url={viewMember.avatar_url} name={viewMember.nickname} size="sm" />
            <span className="text-2xl text-foreground truncate">{viewMember.nickname || '队员'}</span>
            {isSelf && <span className="text-base text-primary shrink-0">自评</span>}
          </div>
          <button type="button" className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-muted" onClick={onClose}>
            <div className="i-mdi-close text-xl text-muted-foreground" />
          </button>
        </div>

        {/* 平均分卡片 */}
        <div className="shrink-0 px-5">
          <div className="bg-card gold-frame rounded-2xl p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-lg text-muted-foreground">综合平均分</span>
              <span className="text-base text-muted-foreground/70">共 {viewMember.rating_count} 人评分（不含自评）</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-5xl text-primary leading-none">{viewMember.avg_rating == null ? '--' : viewMember.avg_rating.toFixed(1)}</span>
              <span className="text-xl text-muted-foreground">/ 10</span>
            </div>
          </div>
        </div>

        {/* 中部：评分明细（独立滚动区） */}
        <div
          className="relative mt-3 px-5 flex-1 min-h-0 overflow-hidden"
          onClick={() => setFormOpen(false)}
          onTouchMove={() => {
            if (Date.now() < ignoreScrollUntil.current) return
            setFormOpen(false)
          }}
        >
          <ScrollView
            scrollY
            className="h-full"
            enhanced
            showScrollbar={false}
            onScroll={() => {
              if (Date.now() < ignoreScrollUntil.current) return
              setFormOpen(false)
            }}
          >
            <div className="flex flex-col gap-2 pb-24">
              {loading ? (
                <p className="text-lg text-muted-foreground text-center py-6">加载中…</p>
              ) : ratings.length === 0 ? (
                <p className="text-lg text-muted-foreground text-center py-6">暂无评分，来打第一个分吧</p>
              ) : (
                ratings.map((r) => (
                  <div key={r.id} className="bg-card rounded-xl border-2 border-border/60 p-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar url={r.rater?.avatar_url} name={r.rater?.nickname} size="sm" />
                      <span className="text-lg text-foreground flex-1 truncate">{r.rater?.nickname || '队员'}</span>
                      {r.rater_id === viewMember.id && <span className="text-base text-muted-foreground">自评，不计均分</span>}
                      <span className="font-heading text-2xl text-primary">{Number(r.score).toFixed(1)}</span>
                    </div>
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-row flex-wrap gap-1.5">
                        {r.tags.map((t) => {
                          const tag = RATING_TAGS.find((x) => x.label === t)
                          const kind = tag ? RATING_TAG_KINDS.find((k) => k.key === tag.kind) : null
                          return (
                            <span key={t} className={`px-2 py-0.5 rounded-md text-base border ${kind ? kind.cls : 'bg-muted text-muted-foreground border-border/60'}`}>
                              {t}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {r.comment && <p className="text-base text-muted-foreground break-keep">{r.comment}</p>}
                  </div>
                ))
              )}
            </div>
          </ScrollView>
          <div
            className={`absolute inset-x-0 bottom-0 z-10 max-h-full overflow-y-auto border-t-2 border-border/60 px-5 pt-3 pb-4 bg-background flex flex-col gap-2.5 transition-transform duration-300 ease-out ${formOpen ? 'translate-y-0' : 'translate-y-full'}`}
            style={{pointerEvents: formOpen ? 'auto' : 'none'}}
            onClick={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xl text-foreground">{isSelf ? '我的自评' : '我来评分'}</span>
              <div className="flex items-baseline gap-1">
                <span className="font-heading text-4xl text-primary leading-none">{myScore.toFixed(1)}</span>
                <span className="text-base text-muted-foreground">/ 10</span>
              </div>
            </div>
            <ScrollView scrollX className="w-full shrink-0" enhanced showScrollbar={false}>
              <div className="flex flex-row gap-1.5 px-0.5">
                {Array.from({length: 19}, (_, i) => 1 + i * 0.5).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`shrink-0 flex items-center justify-center rounded-lg border-2 ${
                      Math.abs(myScore - s) < 0.01 ? 'border-primary bg-primary/15' : 'border-border/60 bg-card'
                    }`}
                    onClick={() => setMyScore(s)}
                  >
                    <div className="py-2 px-2.5">
                      <span className={`text-lg ${Math.abs(myScore - s) < 0.01 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        {s.toFixed(1)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollView>
            <div className="flex flex-col gap-1.5">
              {RATING_TAG_KINDS.map((kind) => (
                <div key={kind.key} className="flex flex-row items-start gap-1.5">
                  <span className="text-base text-muted-foreground w-9 shrink-0 pt-1">{kind.label}</span>
                  <div className="flex flex-row flex-wrap gap-1.5 flex-1">
                    {RATING_TAGS.filter((t) => t.kind === kind.key).map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        className={`px-2 py-1 rounded-md text-base border active:scale-95 ${
                          myTags.includes(t.label) ? kind.cls : 'border-border/60 bg-card text-muted-foreground'
                        }`}
                        onClick={() => toggleTag(t.label)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-2 border-input rounded-xl px-4 py-2.5 bg-card">
              <input
                className="w-full text-lg text-foreground bg-transparent outline-none"
                placeholder="写句评语（可选）"
                maxLength={50}
                value={myComment}
                onInput={(e) => {
                  const ev = e as {detail?: {value?: string}; target?: {value?: string}}
                  setMyComment(ev.detail?.value ?? ev.target?.value ?? '')
                }}
              />
            </div>
            <button
              type="button"
              className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${submitting ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
              onClick={handleSubmit}
            >
              <div className="py-3 text-xl text-primary-foreground">{submitting ? '提交中…' : '提交评分'}</div>
            </button>
          </div>
        </div>
        <div
          className={`absolute inset-x-0 bottom-0 z-20 border-t-2 border-border/60 px-5 pt-3 pb-5 bg-background transition-transform duration-300 ease-out ${formOpen ? 'translate-y-full' : 'translate-y-0'}`}
          style={{pointerEvents: formOpen ? 'none' : 'auto'}}
        >
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow"
            onClick={(e) => {
              e.stopPropagation()
              ignoreScrollUntil.current = Date.now() + 400
              setFormOpen(true)
            }}
          >
            <div className="py-3 text-xl text-primary-foreground">{isSelf ? '我的自评' : '我来评分'}</div>
          </button>
        </div>
      </View>
    </View>
  )
}