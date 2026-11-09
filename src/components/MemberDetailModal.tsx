// @title 队员详情弹层
import {useState} from 'react'
import {ScrollView} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {CachedAvatarImage} from '@/components/Avatar'
import {PlayerPoster} from '@/components/PlayerPoster'
import RadarChart from '@/components/RadarChart'
import {
  ABILITY_DIMENSIONS,
  cardTier,
  DEFAULT_ABILITY,
  footLabel,
  homeTeamOf,
  isNegativeTrait,
  levelFromActivity,
  marketValueOf,
  memberFinalAbilities,
  overallAbility,
  RARITY_STYLES,
  titleOf,
  positionToFutCode
} from '@/constants'
import type {Profile} from '@/db/types'

interface Props {
  member: Profile
  /** 是否当前登录用户本人 */
  isSelf: boolean
  onClose: () => void
}

/** FUT 风格队员详情大卡（名单页 / 球星卡页共用） */
export function MemberDetailModal({member, isSelf, onClose}: Props) {
  const [showPoster, setShowPoster] = useState(false)

  const finalAb = memberFinalAbilities(member)
  const ovr = overallAbility(finalAb) ?? DEFAULT_ABILITY
  const tier = cardTier(ovr)
  const futPos = positionToFutCode(member.preferred_position)
  const team = homeTeamOf(member.home_team)
  const footStr = footLabel(member.preferred_foot)
  const levelDef = levelFromActivity(member.activity)
  const titleDef = titleOf(member.title)

  // 收集特性/特质
  const equippedSkills = (member.member_skills || []).filter((ms) => ms.equipped && ms.skill)
  const traitList: {name: string; isNeg: boolean}[] = []
  for (const ms of equippedSkills.slice(0, 3)) {
    traitList.push({name: ms.skill!.name, isNeg: false})
  }
  if (member.traits && member.traits.length > 0) {
    for (const t of member.traits.slice(0, 4 - traitList.length)) {
      traitList.push({name: t, isNeg: isNegativeTrait(t)})
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-5"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl gold-frame w-full max-w-[90vw] flex flex-col items-center scale-in relative"
        style={{maxHeight: '85vh'}}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="i-mdi-close absolute top-3 right-3 z-10 text-2xl text-muted-foreground" onClick={onClose} />
        <ScrollView scrollY className="w-full" style={{maxHeight: '85vh'}}>
          <div className="flex flex-col items-center p-5 pt-8">
            {/* 大卡面：FUT 游戏特殊卡风格（取消大圆框，大幅半身特写融合，立体金属质感） */}
            <div
              className="relative w-full rounded-2xl overflow-hidden border-2 border-amber-400/60 shadow-2xl bg-gradient-to-b from-[#0F1A2E] via-[#0A1220] to-[#04070D]"
              style={{backgroundImage: 'radial-gradient(circle at 68% 26%, rgba(229,184,66,0.14), transparent 58%)'}}
            >
              {/* 半身立绘大图（取消圆框，接近全实度 + 渐变羽化嵌入） */}
              {member.avatar_url && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <CachedAvatarImage
                    src={member.avatar_url}
                    lazyLoad
                    mode="aspectFill"
                    className="block w-full h-full opacity-90"
                    style={{width: '100%', height: '100%'}}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A1220]/80" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0F1A2E]/70 via-transparent to-transparent" />
                </div>
              )}

              <div className="relative z-10 p-5 flex flex-col">
                {/* 卡面顶部两翼：左侧 OVR + 位置，右侧队长/品质徽章 */}
                <div className="flex items-start justify-between min-h-[140px]">
                  {/* 左侧 FUT 数据柱 */}
                  <div className="flex flex-col items-center">
                    <span className="font-heading text-5xl font-extrabold text-amber-300 leading-none drop-shadow-md">
                      {ovr}
                    </span>
                    <span className="font-heading text-2xl font-bold text-amber-200/90 mt-1">
                      {futPos}
                    </span>
                    <div className="w-8 h-0.5 bg-amber-400/60 my-2" />
                    {/* 左侧垂直 FUT PlayStyles 徽章 */}
                    <div className="flex flex-col gap-1.5 mt-1">
                      {traitList.slice(0, 3).map((item, idx) => (
                        <div
                          key={idx}
                          className={`w-7 h-7 rotate-45 flex items-center justify-center border ${
                            item.isNeg
                              ? 'bg-red-950/70 border-red-500 text-red-300'
                              : 'bg-slate-900/80 border-amber-400 text-amber-200'
                          }`}
                        >
                          <span className="-rotate-45 text-xs font-bold leading-none">
                            {item.name.slice(0, 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 右侧顶部品质与队长角标 */}
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${tier.badgeCls}`}>
                      {tier.name}
                    </span>
                    {member.role === 'admin' && (
                      <span className="px-2 py-0.5 rounded-md bg-gradient-gold text-primary-foreground text-xs font-bold">
                        队长 CAP
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      Lv.{levelDef.level} {levelDef.name}
                    </span>
                  </div>
                </div>

                {/* 姓名与称号（FUT 居中大字） */}
                <div className="mt-8 flex flex-col items-center">
                  <h3 className="font-heading text-3xl font-extrabold text-white tracking-wide drop-shadow-lg text-center">
                    {member.nickname || 'FREEMAN'}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-amber-300">
                    {member.jersey_number != null && (
                      <span className="font-bold">#{member.jersey_number}</span>
                    )}
                    {member.age != null && <span className="font-bold">{member.age}岁</span>}
                    {titleDef && <span>【{titleDef.label}】</span>}
                    <span>{footStr}</span>
                  </div>
                </div>

                {/* 金色水平分割线 */}
                <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-amber-400/80 to-transparent my-3" />

                {/* FUT 经典六维数据横排 (PAC SHO PAS DRI DEF PHY) */}
                <div className="grid grid-cols-6 gap-1 text-center py-2 bg-slate-950/50 rounded-xl border border-amber-400/20">
                  {[
                    {key: 'ab_pace', label: 'PAC'},
                    {key: 'ab_shooting', label: 'SHO'},
                    {key: 'ab_passing', label: 'PAS'},
                    {key: 'ab_dribbling', label: 'DRI'},
                    {key: 'ab_defending', label: 'DEF'},
                    {key: 'ab_stamina', label: 'PHY'}
                  ].map((item) => {
                    const val = finalAb[item.key as keyof typeof finalAb] ?? DEFAULT_ABILITY
                    return (
                      <div key={item.key} className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-bold text-amber-200/80">{item.label}</span>
                        <span className={`font-heading text-xl font-extrabold ${Number(val) >= 88 ? 'text-amber-200' : 'text-white'}`}>
                          {val}
                        </span>
                        <div className="w-7 h-[3px] rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-300 to-amber-500"
                            style={{width: `${Math.min(100, (Number(val) / 99) * 100)}%`}}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 卡面底栏：主队与官方标识 */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded border border-amber-400/40 text-amber-300 font-bold">
                      FREEMEN
                    </span>
                    {team && (
                      <span
                        className="px-2 py-0.5 rounded font-bold"
                        style={{backgroundColor: `${team.color}40`, color: team.text, borderColor: team.color}}
                      >
                        {team.short || team.name}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400 font-medium">官方认证 · OFFICIALLY CERTIFIED</span>
                </div>

                {/* 德转风格身价（由六维能力自动评定） */}
                <div className="mt-2 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-slate-950/60 border border-amber-400/25">
                  <div className="i-mdi-cash-multiple text-base text-amber-300" />
                  <span className="text-xs text-amber-200/80">德转身价</span>
                  <span className="text-lg font-heading font-extrabold text-amber-300 drop-shadow">{marketValueOf(finalAb)}</span>
                </div>
              </div>
            </div>
            <div className="mt-1 w-full">
              <RadarChart data={finalAb} size={250} canvasId="radar-detail" />
            </div>
            {/* 六维数值条 */}
            <div className="w-full flex flex-col gap-2.5 mt-2">
              {ABILITY_DIMENSIONS.map((d) => {
                const v = finalAb[d.key] ?? DEFAULT_ABILITY
                return (
                  <div key={d.key} className="flex items-center gap-2">
                    <div className={`${d.icon} text-xl text-primary w-6`} />
                    <span className="text-lg text-foreground w-12">{d.label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-gold rounded-full transition-all duration-500"
                        style={{width: `${v}%`}}
                      />
                    </div>
                    <span className="text-lg text-muted-foreground w-8 text-right">{v}</span>
                  </div>
                )
              })}
            </div>

            {/* FIFA 特性与技能 */}
            {(() => {
              const equipped = (member.member_skills || []).filter((ms) => ms.equipped && ms.skill)
              const skills = equipped.filter((ms) => ms.skill?.kind === 'skill')
              const traits = equipped.filter((ms) => ms.skill?.kind === 'trait')
              if (equipped.length === 0) return null
              return (
                <div className="w-full mt-3 flex flex-col gap-2">
                  <span className="text-lg text-muted-foreground">FIFA PlayStyles</span>
                  <div className="flex flex-row flex-wrap gap-2">
                    {skills.map((ms) => {
                      const s = ms.skill!
                      const r = RARITY_STYLES[s.rarity || 'bronze']
                      return (
                        <span key={ms.id} className={`px-2 py-1 rounded-md text-base ${r.badgeCls}`}>
                          {s.name}
                        </span>
                      )
                    })}
                  </div>
                  <div className="flex flex-row flex-wrap gap-2">
                    {traits.map((ms) => {
                      const s = ms.skill!
                      const r = RARITY_STYLES[s.rarity || 'bronze']
                      return (
                        <span key={ms.id} className={`px-2 py-1 rounded-md text-base border ${r.ringCls} border-current`}>
                          {s.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            {isSelf && (
              <button
                type="button"
                className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow mt-4"
                onClick={() => {
                  onClose()
                  Taro.switchTab({url: '/pages/ability/index'})
                }}
              >
                <div className="py-3 px-6 flex items-center gap-1">
                  <div className="i-mdi-chart-radar text-xl" />
                  <span className="text-xl text-primary-foreground">编辑我的球星卡</span>
                </div>
              </button>
            )}
            {/* 综合评分入口：跳转评分页并定位本人 */}
            <button
              type="button"
              className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/40 bg-primary/10 lift-glow mt-3"
              onClick={() => Taro.navigateTo({url: `/pages/rating/index?member_id=${member.id}`})}
            >
              <div className="py-3 px-6 flex items-center gap-1.5">
                <div className="i-mdi-star-half-full text-xl text-primary" />
                <span className="text-xl text-primary">{isSelf ? '查看/自评综合评分' : '综合评分 / 打分'}</span>
              </div>
            </button>

            {/* 生成 FIFA 球星海报 */}
            <button
              type="button"
              className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow mt-3"
              onClick={() => setShowPoster(true)}
            >
              <div className="py-3 px-6 flex items-center gap-1.5">
                <div className="i-mdi-image-frame text-xl text-primary-foreground" />
                <span className="text-xl text-primary-foreground">生成球星海报</span>
              </div>
            </button>
          </div>
        </ScrollView>
      </div>
      <PlayerPoster visible={showPoster} member={member} onClose={() => setShowPoster(false)} />
    </div>
  )
}
