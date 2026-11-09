// @title 队长后台
import {useCallback, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useBackgroundRefresh} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {Avatar} from '@/components/Avatar'
import {adminAdjustActivity, adminSetLevel, captainResetProfile, captainSetAbilities, defaultGrowthConfig, getGrowthConfig, getSquadRoster, setMemberRole, updateGrowthConfig} from '@/db/api'
import type {Profile} from '@/db/types'
import {ABILITY_DIMENSIONS, DEFAULT_ABILITY, LEVELS, MIN_BASE_ABILITY, POINTS_PER_LEVEL, setGrowthConfig} from '@/constants'

const CAPTAIN_UID = '3dca509b-4ab0-4b83-ad48-f7865eb8c319'

/** 成长/奖励配置字段定义（min1=必须为正整数，否则允许 0） */
const CFG_FIELDS: {key: string; label: string; group: '基础成长' | '荣誉奖励' | '数据奖励'}[] = [
  {key: 'exp_per_level', label: '升级经验基数（×当前等级）', group: '基础成长'},
  {key: 'points_per_level', label: '每级属性点（固定）', group: '基础成长'},
  {key: 'exp_per_match', label: '每场出勤经验', group: '基础成长'},
  {key: 'activity_per_match', label: '每场出勤活跃度', group: '基础成长'},
    {key: 'squat_target', label: '蹲坑达标人数', group: '基础成长'},
  {key: 'mvp_exp', label: 'MVP 额外经验', group: '荣誉奖励'},
  {key: 'mvp_activity', label: 'MVP 额外活跃度', group: '荣誉奖励'},
  {key: 'defender_exp', label: '最佳防守额外经验', group: '荣誉奖励'},
  {key: 'defender_activity', label: '最佳防守额外活跃度', group: '荣誉奖励'},
  {key: 'goal_exp', label: '每球额外经验', group: '数据奖励'},
  {key: 'goal_activity', label: '每球额外活跃度', group: '数据奖励'},
  {key: 'assist_exp', label: '每次助攻额外经验', group: '数据奖励'},
  {key: 'assist_activity', label: '每次助攻额外活跃度', group: '数据奖励'}
]

const CFG_MIN_1_KEYS = new Set(['exp_per_level', 'points_per_level', 'exp_per_match', 'activity_per_match', 'squat_target'])
const CFG_GROUP_ICONS: Record<string, string> = {
  基础成长: 'i-mdi-trending-up',
  荣誉奖励: 'i-mdi-medal-outline',
  数据奖励: 'i-mdi-soccer'
}

function CaptainAdmin() {
  const {user, profile} = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('captain-admin')
  const [actingUid, setActingUid] = useState<string | null>(null)
  const [abilityTarget, setAbilityTarget] = useState<Profile | null>(null)
  const [abilityForm, setAbilityForm] = useState<Record<string, string>>({})
  const [savingAbilities, setSavingAbilities] = useState(false)
  const [cfg, setCfg] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(defaultGrowthConfig()).map(([k, v]) => [k, String(v)])
    )
  )
  const [savingCfg, setSavingCfg] = useState(false)

  const loadData = useCallback(async () => {
    startRefresh()
    const [squad, config] = await Promise.all([getSquadRoster(), getGrowthConfig()])
    setMembers(squad)
    setCfg({...Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])), points_per_level: String(POINTS_PER_LEVEL)})
    finishRefresh()
  }, [])


  useDidShow(() => {
    loadData()
  })

  const isAdmin = profile?.role === 'admin'

  const handleRoleChange = async (member: Profile, nextRole: 'admin' | 'user') => {
    if (actingUid) return
    if (member.id === CAPTAIN_UID) {
      Taro.showToast({title: 'seven 是永久队长', icon: 'none'})
      return
    }
    const actionText = nextRole === 'admin' ? '提升为队长/管理员' : '降级为普通队员'
    const res = await Taro.showModal({title: '确认操作', content: `确定将「${member.nickname || '该队员'}」${actionText}？`})
    if (!res.confirm) return
    setActingUid(member.id)
    try {
      const result = await setMemberRole(member.id, nextRole)
      Taro.showToast({title: result.message, icon: result.ok ? 'success' : 'none'})
      if (result.ok) await loadData()
    } finally {
      setActingUid(null)
    }
  }

  const handleSetLevel = async (member: Profile) => {
    if (actingUid) return
    const levelNames = LEVELS.map((l) => `${l.level}.${l.name}`)
    const res = await Taro.showActionSheet({itemList: levelNames})
    if (res.tapIndex === undefined) return
    const targetLevel = LEVELS[res.tapIndex].level
    const confirm = await Taro.showModal({
      title: '调整等级',
      content: `调整等级将同步重置「${member.nickname || '该队员'}」当前档位活跃度为 ${LEVELS[res.tapIndex].min}，确定？`,
      confirmColor: '#B03A2E'
    })
    if (!confirm.confirm) return
    setActingUid(member.id)
    try {
      const ok = await adminSetLevel(member.id, targetLevel)
      Taro.showToast({title: ok ? '已调整' : '操作失败', icon: ok ? 'success' : 'none'})
      if (ok) await loadData()
    } finally {
      setActingUid(null)
    }
  }

  const handleAdjustActivity = async (member: Profile) => {
    if (actingUid) return
    const res = await Taro.showActionSheet({itemList: ['+100 活跃度', '-100 活跃度', '+300 活跃度']})
    if (res.tapIndex === undefined) return
    const delta = [100, -100, 300][res.tapIndex]
    setActingUid(member.id)
    try {
      const ok = await adminAdjustActivity(member.id, delta)
      Taro.showToast({title: ok ? '已调整' : '操作失败', icon: ok ? 'success' : 'none'})
      if (ok) await loadData()
    } finally {
      setActingUid(null)
    }
  }

  const handleResetProfile = async (member: Profile) => {
    if (actingUid) return
    const res = await Taro.showModal({
      title: '重置队员资料',
      content: `将「${member.nickname || '该队员'}」的昵称恢复默认，并清空球衣号与场上位置。该队员下次报名时需重新完善资料，确定？`,
      confirmColor: '#B03A2E'
    })
    if (!res.confirm) return
    setActingUid(member.id)
    try {
      const result = await captainResetProfile(member.id)
      Taro.showToast({title: result.message, icon: result.ok ? 'success' : 'none'})
      if (result.ok) await loadData()
    } finally {
      setActingUid(null)
    }
  }

  const handleOpenAbilities = (member: Profile) => {
    const form: Record<string, string> = {}
    for (const dim of ABILITY_DIMENSIONS) {
      form[dim.key] = String((member as any)[dim.key] ?? DEFAULT_ABILITY)
    }
    form.free_points = String(member.free_points ?? 0)
    setAbilityForm(form)
    setAbilityTarget(member)
  }

  const handleSaveAbilities = async () => {
    if (!abilityTarget || savingAbilities) return
    const values: Record<string, number> = {}
    for (const key of [...ABILITY_DIMENSIONS.map((d) => d.key), 'free_points']) {
      const n = parseInt(abilityForm[key] || '', 10)
      if (!Number.isInteger(n)) {
        Taro.showToast({title: '请填写完整数值', icon: 'none'})
        return
      }
      if (key === 'free_points' ? n < 0 : n < MIN_BASE_ABILITY || n > 99) {
        Taro.showToast({title: key === 'free_points' ? '自由点不能为负数' : `能力值须在${MIN_BASE_ABILITY}-99之间`, icon: 'none'})
        return
      }
      values[key] = n
    }
    setSavingAbilities(true)
    try {
      const result = await captainSetAbilities(abilityTarget.id, values)
      Taro.showToast({title: result.message, icon: result.ok ? 'success' : 'none'})
      if (result.ok) {
        setAbilityTarget(null)
        await loadData()
      }
    } finally {
      setSavingAbilities(false)
    }
  }

  const handleSaveCfg = async () => {
    if (savingCfg) return
    const payload: Record<string, number> = {}
    for (const f of CFG_FIELDS) {
      const n = f.key === 'points_per_level' ? POINTS_PER_LEVEL : parseInt(cfg[f.key] || '', 10)
      if (!Number.isInteger(n) || n < 0) {
        Taro.showToast({title: `${f.label}须为非负整数`, icon: 'none'})
        return
      }
      if (CFG_MIN_1_KEYS.has(f.key) && n < 1) {
        Taro.showToast({title: `${f.label}须为正整数`, icon: 'none'})
        return
      }
      payload[f.key] = n
    }
    setSavingCfg(true)
    try {
      const ok = await updateGrowthConfig(payload as Parameters<typeof updateGrowthConfig>[0])
      Taro.showToast({title: ok ? '已保存配置' : '保存失败', icon: ok ? 'success' : 'none'})
      if (ok) {
        setGrowthConfig(payload as Parameters<typeof setGrowthConfig>[0])
      }
    } finally {
      setSavingCfg(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-8">
        <div className="flex flex-col items-center gap-3">
          <div className="i-mdi-lock-outline text-6xl text-muted-foreground/50" />
          <p className="text-xl text-muted-foreground">仅队长/管理员可访问</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8">
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-1">
        <h1 className="font-heading text-3xl text-foreground">队长后台</h1>
        <p className="text-lg text-muted-foreground">管理队员角色 · 调整等级与活跃度</p>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-3">
        {/* 投票中心入口（发起/管理队内事务投票） */}
        <div
          className="bg-card rounded-2xl border-2 border-primary/30 lift-glow p-4 flex items-center gap-4"
          onClick={() => Taro.navigateTo({url: '/pages/vote-center/index'})}
        >
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <div className="i-mdi-vote-outline text-3xl text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-2xl text-foreground">投票中心</h3>
            <p className="text-base text-muted-foreground mt-0.5">发起与管理队内事务投票</p>
          </div>
          <div className="i-mdi-chevron-right text-3xl text-muted-foreground" />
        </div>

        {/* 成长数值配置 */}
        <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="i-mdi-cog-outline text-2xl text-primary" />
            <h2 className="font-heading text-2xl text-foreground">成长数值配置</h2>
          </div>
          <p className="text-base text-muted-foreground">调整后立即生效，影响全队经验/活跃度结算与等级进度</p>
          {(['基础成长', '荣誉奖励', '数据奖励'] as const).map((group) => (
            <div key={group} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className={`${CFG_GROUP_ICONS[group]} text-2xl text-primary`} />
                <span className="text-xl text-foreground font-bold">{group}</span>
              </div>
              {CFG_FIELDS.filter((f) => f.group === group).map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="text-lg text-foreground flex-1">{f.label}</span>
                  <div className="border-2 border-input rounded-lg px-3 py-2 bg-background overflow-hidden w-28">
                    <input
                      type="number"
                      className="w-full text-xl text-foreground bg-transparent outline-none text-center"
                      value={cfg[f.key]}
                      disabled={f.key === 'points_per_level'}
                      onInput={(e) => {
                        const ev = e as any
                        setCfg((p) => ({...p, [f.key]: ev.detail?.value ?? ev.target?.value ?? ''}))
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button
            type="button"
            className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${savingCfg ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
            onClick={handleSaveCfg}
          >
            <div className="py-3 px-6 flex items-center gap-2">
              <div className="i-mdi-content-save-outline text-xl text-primary-foreground" />
              <span className="text-xl text-primary-foreground">{savingCfg ? '保存中…' : '保存配置'}</span>
            </div>
          </button>
        </div>

        {loading ? (
          <p className="text-xl text-muted-foreground text-center py-8">加载中…</p>
        ) : (
          members.map((m) => {
            const isCaptain = m.id === CAPTAIN_UID
            const isSelf = m.id === user?.id
            const acting = actingUid === m.id
            return (
              <div key={m.id} className="bg-card rounded-2xl border-2 border-border/60 p-4">
                <div className="flex items-center gap-3">
                  <Avatar url={m.avatar_url} name={m.nickname} size="md" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xl text-foreground font-bold truncate">{m.nickname || '未命名队员'}</span>
                      {m.role === 'admin' && (
                        <span className="px-2 py-0.5 rounded-md bg-gradient-gold text-primary-foreground text-lg shrink-0">队长</span>
                      )}
                      {isSelf && <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent-foreground text-lg">我</span>}
                    </div>
                    <span className="text-lg text-muted-foreground">活跃度 {m.activity}</span>
                  </div>
                </div>

                {/* 操作区 */}
                <div className="mt-3 flex flex-col gap-2">
                  {/* 角色管理 */}
                  {!isSelf && !isCaptain && (
                    <button
                      type="button"
                      className={`w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 ${
                        m.role === 'admin' ? 'border-muted bg-muted/50' : 'border-primary/30 bg-secondary/30'
                      } ${acting ? 'opacity-60' : ''}`}
                      onClick={() => handleRoleChange(m, m.role === 'admin' ? 'user' : 'admin')}
                    >
                      <div className="py-2.5 flex items-center gap-1.5">
                        <div className={`text-2xl ${m.role === 'admin' ? 'i-mdi-account-arrow-down-outline text-muted-foreground' : 'i-mdi-account-star-outline text-primary'}`} />
                        <span className={`text-xl ${m.role === 'admin' ? 'text-muted-foreground' : 'text-primary'}`}>
                          {acting ? '处理中…' : m.role === 'admin' ? '降级为普通队员' : '提升为队长/管理员'}
                        </span>
                      </div>
                    </button>
                  )}
                  {isCaptain && (
                    <div className="w-full flex items-center justify-center py-2.5 rounded-xl bg-muted/40">
                      <span className="text-lg text-muted-foreground">永久队长 · 不可降级</span>
                    </div>
                  )}

                  {/* 等级调整 */}
                  {!isSelf && (
                    <div className="flex flex-row gap-2">
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/30 ${acting ? 'opacity-60' : ''}`}
                        onClick={() => handleSetLevel(m)}
                      >
                        <div className="py-2.5 flex items-center gap-1.5">
                          <div className="i-mdi-stairs text-2xl text-primary" />
                          <span className="text-lg text-primary">设置等级</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/30 ${acting ? 'opacity-60' : ''}`}
                        onClick={() => handleAdjustActivity(m)}
                      >
                        <div className="py-2.5 flex items-center gap-1.5">
                          <div className="i-mdi-trending-up text-2xl text-primary" />
                          <span className="text-lg text-primary">调整活跃度</span>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* 资料与能力值管理（仅普通队员，管理员与永久队长不可操作） */}
                  {!isSelf && !isCaptain && m.role !== 'admin' && (
                    <div className="flex flex-row gap-2">
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-amber-500/40 bg-amber-500/10 ${acting ? 'opacity-60' : ''}`}
                        onClick={() => handleResetProfile(m)}
                      >
                        <div className="py-2.5 flex items-center gap-1.5">
                          <div className="i-mdi-restore text-2xl text-amber-600" />
                          <span className="text-lg text-amber-600">重置资料</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/40 bg-primary/10 ${acting ? 'opacity-60' : ''}`}
                        onClick={() => handleOpenAbilities(m)}
                      >
                        <div className="py-2.5 flex items-center gap-1.5">
                          <div className="i-mdi-tune text-2xl text-primary" />
                          <span className="text-lg text-primary">调整能力值</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 能力值调整弹窗 */}
      {abilityTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setAbilityTarget(null)}>
          <div
            className="w-full bg-card rounded-t-3xl px-6 pt-6 pb-8 flex flex-col gap-4"
            style={{maxHeight: '85vh', overflowY: 'auto'}}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-2xl text-foreground">调整能力值</h3>
              <button
                type="button"
                className="i-mdi-close text-2xl text-muted-foreground"
                onClick={() => setAbilityTarget(null)}
              />
            </div>
            <p className="text-lg text-muted-foreground">
              正在调整「{abilityTarget.nickname || '未命名队员'}」的六维属性与自由点
            </p>

            <div className="flex flex-col gap-3">
              {ABILITY_DIMENSIONS.map((dim) => (
                <div key={dim.key} className="flex flex-row items-center justify-between gap-3">
                  <span className="w-16 text-xl text-foreground shrink-0">{dim.label}</span>
                  <div className="flex-1 flex flex-row items-center justify-end gap-3">
                    <button
                      type="button"
                      className="w-10 h-10 flex items-center justify-center rounded-full border-2 border-border bg-background"
                      onClick={() =>
                        setAbilityForm((prev) => {
                          const cur = parseInt(prev[dim.key] || String(DEFAULT_ABILITY), 10)
                          return {...prev, [dim.key]: String(Math.max(MIN_BASE_ABILITY, cur - 1))}
                        })
                      }
                    >
                      <div className="i-mdi-minus text-2xl text-muted-foreground" />
                    </button>
                    <span className="w-12 text-center text-2xl font-heading text-primary">
                      {abilityForm[dim.key] || String(DEFAULT_ABILITY)}
                    </span>
                    <button
                      type="button"
                      className="w-10 h-10 flex items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10"
                      onClick={() =>
                        setAbilityForm((prev) => {
                          const cur = parseInt(prev[dim.key] || String(DEFAULT_ABILITY), 10)
                          return {...prev, [dim.key]: String(Math.min(99, cur + 1))}
                        })
                      }
                    >
                      <div className="i-mdi-plus text-2xl text-primary" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-row items-center justify-between gap-3 border-t border-border/40 pt-3">
                <span className="w-16 text-xl text-foreground shrink-0">自由点</span>
                <div className="flex-1 flex flex-row items-center justify-end gap-3">
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center rounded-full border-2 border-border bg-background"
                    onClick={() =>
                      setAbilityForm((prev) => {
                        const cur = parseInt(prev.free_points || '0', 10)
                        return {...prev, free_points: String(Math.max(0, cur - 1))}
                      })
                    }
                  >
                    <div className="i-mdi-minus text-2xl text-muted-foreground" />
                  </button>
                  <span className="w-12 text-center text-2xl font-heading text-primary">
                    {abilityForm.free_points || '0'}
                  </span>
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10"
                    onClick={() =>
                      setAbilityForm((prev) => {
                        const cur = parseInt(prev.free_points || '0', 10)
                        return {...prev, free_points: String(Math.min(200, cur + 1))}
                      })
                    }
                  >
                    <div className="i-mdi-plus text-2xl text-primary" />
                  </button>
                </div>
              </div>
              <p className="text-base text-muted-foreground">能力值范围 {MIN_BASE_ABILITY}-99，低于队员基础值、超出动态上限或预算时服务端会拒绝；自由属性点不能为负数</p>
            </div>

            <div className="flex flex-row gap-3">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-border bg-background"
                onClick={() => setAbilityTarget(null)}
              >
                <div className="py-3 text-xl text-muted-foreground">取消</div>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${savingAbilities ? 'bg-primary/50' : 'bg-primary'}`}
                onClick={handleSaveAbilities}
              >
                <div className="py-3 text-xl text-primary-foreground">保存</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(CaptainAdmin)