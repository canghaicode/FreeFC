// @title 选择主队
import {useCallback, useState} from 'react'
import Taro from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {setHomeTeam} from '@/db/api'
import {HOME_LEAGUES, homeTeamsByLeague} from '@/constants'

function HomeTeamSelect() {
  const {profile, refreshProfile} = useAuth()
  const [selected, setSelected] = useState<string | null>(profile?.home_team ?? null)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const ok = await setHomeTeam(selected || '')
      if (ok) {
        await refreshProfile()
        Taro.showToast({title: '已保存', icon: 'success'})
        setTimeout(() => Taro.navigateBack(), 500)
      } else {
        Taro.showToast({title: '保存失败，请重试', icon: 'none'})
      }
    } finally {
      setSaving(false)
    }
  }, [selected, saving, refreshProfile])

  return (
    <div className="min-h-screen bg-background flex flex-col pb-8">
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-1">
        <h1 className="font-heading text-3xl text-foreground">选择主队</h1>
        <p className="text-lg text-muted-foreground">选择你支持的足球俱乐部，展示在球星卡上</p>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-6 pb-4">
        {HOME_LEAGUES.map((league) => {
          const teams = homeTeamsByLeague(league)
          if (teams.length === 0) return null
          return (
            <div key={league} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="font-heading text-xl text-foreground">{league}</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {teams.map((t) => {
                  const active = selected === t.name
                  return (
                    <div
                      key={t.name}
                      className={`bg-card rounded-2xl border-2 p-4 flex items-center gap-3 ${active ? 'border-primary lift-glow' : 'border-border/60'}`}
                      onClick={() => setSelected(active ? null : t.name)}
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border-2 border-border/40"
                        style={{backgroundColor: t.color, color: t.text}}
                      >
                        <span className="font-heading text-lg drop-shadow">{t.short}</span>
                      </div>
                      <span className="text-lg text-foreground font-bold flex-1 min-w-0 truncate">{t.name}</span>
                      {active && <div className="i-mdi-check-circle text-2xl text-primary shrink-0" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-5 pt-6">
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${saving ? 'bg-primary/50' : 'bg-primary lift-glow'}`}
          onClick={handleSave}
        >
          <div className="py-3.5 text-2xl text-primary-foreground">{saving ? '保存中…' : '保存主队'}</div>
        </button>
      </div>
    </div>
  )
}

export default withRouteGuard(HomeTeamSelect)