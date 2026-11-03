// @title 装备系统
import {useCallback, useMemo, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {LogoBg} from '@/components/LogoBg'
import {exchangeActivityToPoints, getEquipmentCatalog, getMyEquipment, purchaseEquipment, sellEquipment, toggleEquipment} from '@/db/api'
import type {EquipmentCatalog, MemberEquipment} from '@/db/types'
import {
  ABILITY_DIMENSIONS,
  EQUIPMENT_EFFECTS,
  EQUIPMENT_RARITY,
  EQUIPMENT_SLOTS,
  ACTIVITY_PER_POINT,
  equipmentEffectOf,
  type AbilityKey,
  type EquipmentSlotKey
} from '@/constants'

const SLOT_LABEL: Record<EquipmentSlotKey, string> = {
  boots: '球鞋',
  shinpad: '护腿',
  gloves: '手套',
  jersey: '球衣',
  socks: '球袜',
  kneepad: '护膝',
  wristband: '护腕',
  supplement: '补剂'
}

function EquipmentPage() {
  const {profile, refreshProfile} = useAuth()
  const [catalog, setCatalog] = useState<EquipmentCatalog[]>([])
  const [mine, setMine] = useState<MemberEquipment[]>([])
  const [activeSlot, setActiveSlot] = useState<EquipmentSlotKey>('boots')
  const [actingId, setActingId] = useState<string | null>(null)
  const [exchanging, setExchanging] = useState(false)
  const [exchangePoints, setExchangePoints] = useState(1)

  const loadData = useCallback(async () => {
    const [cat, my] = await Promise.all([getEquipmentCatalog(), getMyEquipment()])
    setCatalog(cat)
    setMine(my)
  }, [])


  useDidShow(() => {
    refreshProfile()
    loadData()
  })

  const activityPoints = profile?.activity ?? 0

  // 我拥有的装备 id -> MemberEquipment
  const ownedMap = useMemo(() => {
    const m = new Map<string, MemberEquipment>()
    for (const me of mine) m.set(me.equipment_id, me)
    return m
  }, [mine])

  // 当前槽位装备列表
  const slotItems = useMemo(() => catalog.filter((c) => c.slot === activeSlot), [catalog, activeSlot])

  // 当前已装备的装备（用于高亮）
  const equippedInSlot = useMemo(() => {
    return mine.find((me) => me.equipped && me.equipment?.slot === activeSlot)
  }, [mine, activeSlot])

  const handlePurchase = async (item: EquipmentCatalog) => {
    if (actingId) return
    if (activityPoints < item.cost) {
      Taro.showToast({title: '活跃度不足', icon: 'none'})
      return
    }
    const res = await Taro.showModal({
      title: '兑换装备',
      content: `消耗 ${item.cost} 活跃度兑换「${item.name}」？`
    })
    if (!res.confirm) return
    setActingId(item.id)
    try {
      const r = await purchaseEquipment(item.id)
      Taro.showToast({title: r.message || '兑换失败', icon: r.ok ? 'success' : 'none'})
      if (r.ok) {
        await Promise.all([refreshProfile(), loadData()])
      }
    } finally {
      setActingId(null)
    }
  }

  const handleToggle = async (me: MemberEquipment) => {
    if (actingId) return
    setActingId(me.id)
    try {
      const r = await toggleEquipment(me.id)
      Taro.showToast({title: r.message || '操作失败', icon: r.ok ? 'success' : 'none'})
      if (r.ok) await loadData()
    } finally {
      setActingId(null)
    }
  }

  const handleSell = async (me: MemberEquipment) => {
    if (actingId) return
    const cost = me.equipment?.cost ?? 0
    const res = await Taro.showModal({
      title: '原价出售',
      content: `出售「${me.equipment?.name || '该装备'}」将全额返还 ${cost} 活跃度${me.equipped ? '，且会自动卸下' : ''}，确认出售？`
    })
    if (!res.confirm) return
    setActingId(me.id)
    try {
      const r = await sellEquipment(me.id)
      Taro.showToast({title: r.message || '出售失败', icon: r.ok ? 'success' : 'none'})
      if (r.ok) {
        await Promise.all([refreshProfile(), loadData()])
      }
    } finally {
      setActingId(null)
    }
  }

  const handleExchange = async () => {
    if (exchanging) return
    const cost = ACTIVITY_PER_POINT * exchangePoints
    if (activityPoints < cost) {
      Taro.showToast({title: '活跃度不足', icon: 'none'})
      return
    }
    setExchanging(true)
    try {
      const r = await exchangeActivityToPoints(exchangePoints)
      Taro.showToast({title: r.message || '兑换失败', icon: r.ok ? 'success' : 'none'})
      if (r.ok) {
        await Promise.all([refreshProfile(), loadData()])
      }
    } finally {
      setExchanging(false)
    }
  }

  const bonusLabel = (bonuses: Record<string, number>) => {
    return Object.entries(bonuses)
      .map(([k, v]) => {
        const dim = ABILITY_DIMENSIONS.find((d) => d.key === (k as AbilityKey))
        return dim ? `${dim.label}+${v}` : ''
      })
      .filter(Boolean)
      .join(' ')
  }

  return (
    <div className="h-screen bg-background flex flex-col relative">
      <LogoBg />
      <div className="flex-1 overflow-y-auto pb-8 relative z-10">
        {/* 页头 */}
        <div className="bg-gradient-primary px-5 pt-10 pb-12 rounded-b-[2.5rem]">
          <h1 className="font-heading text-3xl text-primary-foreground">装备系统</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="i-mdi-treasure-chest text-2xl text-primary-foreground/80" />
            <p className="text-xl text-primary-foreground/80">活跃度兑换装备 · 装备专属特效</p>
          </div>
        </div>

        <div className="px-5 -mt-6 flex flex-col gap-4">
          {/* 活跃度与兑换入口 */}
          <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="i-mdi-lightning-bolt text-2xl text-primary" />
                <span className="text-xl text-foreground">我的活跃度</span>
              </div>
              <span className="font-heading text-3xl text-primary">{activityPoints}</span>
            </div>

            {/* 活跃度兑换属性点 */}
            <div className="rounded-xl bg-primary/10 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="i-mdi-swap-horizontal text-xl text-primary" />
                <span className="text-lg text-foreground">活跃度兑换属性点</span>
              </div>
              <p className="text-base text-muted-foreground">每 {ACTIVITY_PER_POINT} 活跃度兑换 1 自由属性点</p>
              <div className="flex flex-row items-center gap-3">
                <div className="flex flex-row items-center rounded-lg border-2 border-input overflow-hidden bg-background">
                  <button
                    type="button"
                    className="w-12 h-11 flex items-center justify-center bg-background"
                    onClick={() => setExchangePoints((p) => Math.max(1, p - 1))}
                  >
                    <span className="text-2xl text-foreground">-</span>
                  </button>
                  <div className="w-14 h-11 flex items-center justify-center bg-muted/50">
                    <span className="text-xl font-heading text-foreground">{exchangePoints}</span>
                  </div>
                  <button
                    type="button"
                    className="w-12 h-11 flex items-center justify-center bg-background"
                    onClick={() => setExchangePoints((p) => Math.min(10, p + 1))}
                  >
                    <span className="text-2xl text-foreground">+</span>
                  </button>
                </div>
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${
                    exchanging || activityPoints < ACTIVITY_PER_POINT * exchangePoints ? 'bg-primary/50' : 'bg-primary lift-glow'
                  }`}
                  onClick={handleExchange}
                >
                  <div className="py-3 px-4 flex items-center gap-2">
                    <div className="i-mdi-star-four-points text-2xl text-primary-foreground" />
                    <span className="text-xl text-primary-foreground font-medium">
                      兑换 {exchangePoints} 点（{ACTIVITY_PER_POINT * exchangePoints} 活跃度）
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* 槽位切换（8 槽分两行） */}
          <div className="flex flex-col gap-2">
            {[EQUIPMENT_SLOTS.slice(0, 4), EQUIPMENT_SLOTS.slice(4)].map((row, ri) => (
              <div key={ri} className="flex flex-row gap-2">
                {row.map((s) => {
                  const hasEquipped = mine.some((me) => me.equipped && me.equipment?.slot === s.key)
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`flex-1 flex flex-col items-center justify-center leading-none break-keep rounded-xl py-3 ${
                        activeSlot === s.key ? 'bg-primary' : 'bg-card border-2 border-border'
                      }`}
                      onClick={() => setActiveSlot(s.key)}
                    >
                      <div className={`${s.icon} text-2xl ${activeSlot === s.key ? 'text-primary-foreground' : 'text-primary'}`} />
                      <span className={`text-base mt-1 ${activeSlot === s.key ? 'text-primary-foreground' : 'text-foreground'}`}>
                        {s.label}
                      </span>
                      {hasEquipped && (
                        <div className="w-2 h-2 rounded-full bg-amber-400 mt-1" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* 当前槽位装备列表 */}
          <div className="flex flex-col gap-3">
            {slotItems.map((item) => {
              const owned = ownedMap.get(item.id)
              const isEquipped = !!owned?.equipped
              const rarity = EQUIPMENT_RARITY[item.rarity] || EQUIPMENT_RARITY.bronze
              const effect = equipmentEffectOf(item.effect)
              const canAfford = activityPoints >= item.cost
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl p-4 flex flex-col gap-3 ${
                    isEquipped ? `${rarity.badgeCls} effect-glow ${effect?.glowCls || ''}` : 'bg-card gold-frame'
                  }`}
                >
                  <div className="flex flex-row items-center gap-3">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${rarity.badgeCls}`}>
                      <div className={`${item.icon} text-3xl ${item.rarity === 'silver' ? 'text-slate-900' : 'text-primary-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-heading text-2xl ${isEquipped ? 'text-primary-foreground' : 'text-foreground'}`}>
                          {item.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-sm ${rarity.badgeCls} ${item.rarity === 'silver' ? 'text-slate-900' : 'text-primary-foreground'}`}>
                          {rarity.label}
                        </span>
                      </div>
                      <span className={`text-base ${isEquipped ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {bonusLabel(item.bonuses)}
                      </span>
                    </div>
                  </div>

                  {/* 专属特效 */}
                  {effect && (
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isEquipped ? 'bg-black/20' : 'bg-primary/10'}`}>
                      <div className={`${effect.icon} text-xl ${isEquipped ? 'text-primary-foreground' : 'text-primary'}`} />
                      <div className="flex flex-col">
                        <span className={`text-base font-medium ${isEquipped ? 'text-primary-foreground' : 'text-primary'}`}>
                          {effect.label}
                        </span>
                        <span className={`text-sm ${isEquipped ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          {effect.desc}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex flex-row items-center gap-3">
                    {!owned ? (
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${
                          actingId === item.id || !canAfford ? 'bg-primary/50' : 'bg-gradient-gold lift-glow'
                        }`}
                        onClick={() => handlePurchase(item)}
                      >
                        <div className="py-2.5 px-4 flex items-center gap-2">
                          <div className="i-mdi-lightning-bolt text-xl" />
                          <span className="text-lg font-medium">{item.cost} 活跃度兑换</span>
                        </div>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${
                            actingId === owned.id ? 'bg-muted' : isEquipped ? 'bg-destructive/80' : 'bg-primary lift-glow'
                          }`}
                          onClick={() => handleToggle(owned)}
                        >
                          <div className="py-2.5 px-4 flex items-center gap-2">
                            <div className={`text-xl ${isEquipped ? 'text-primary-foreground' : 'text-primary-foreground'}`}>
                              <div className={isEquipped ? 'i-mdi-power' : 'i-mdi-check-circle'} />
                            </div>
                            <span className="text-lg font-medium text-primary-foreground">
                              {actingId === owned.id ? '处理中…' : isEquipped ? '卸下' : '装备'}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="w-32 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-destructive/40 bg-card"
                          onClick={() => handleSell(owned)}
                        >
                          <div className="py-2.5 px-2 flex items-center gap-1">
                            <div className="i-mdi-cash-refund text-xl text-destructive" />
                            <span className="text-lg font-medium text-destructive">原价出售</span>
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 已装备概览 */}
          <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="i-mdi-tshirt-crew text-2xl text-primary" />
              <h2 className="font-heading text-2xl text-foreground">当前装备</h2>
            </div>
            <div className="flex flex-row flex-wrap gap-2">
              {EQUIPMENT_SLOTS.map((s) => {
                const me = mine.find((m) => m.equipped && m.equipment?.slot === s.key)
                return (
                  <div key={s.key} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                    <div className={`${s.icon} text-xl text-primary`} />
                    <div className="flex flex-col">
                      <span className="text-sm text-muted-foreground">{SLOT_LABEL[s.key]}</span>
                      <span className="text-base text-foreground">{me?.equipment?.name || '未装备'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <p className="text-base text-muted-foreground text-center">
            活跃度通过出勤与活动结算获得 · 装备加成与专属特效实时生效
          </p>
        </div>
      </div>
    </div>
  )
}

export default withRouteGuard(EquipmentPage)