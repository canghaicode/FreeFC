import {titleOf} from '@/constants'

/**
 * 荣誉类（条件）称号的特制颜色框：金/银/铜靴、助攻王、防守铁闸、MVP
 * 在所有展示界面统一使用，醒目且一致。
 */
const HONOR_FRAME: Record<string, string> = {
  golden_boot: 'bg-gradient-gold text-primary-foreground border-amber-300',
  silver_boot: 'bg-gradient-to-r from-slate-300 to-slate-400 text-white border-slate-200',
  bronze_boot: 'bg-gradient-to-r from-orange-400 to-amber-600 text-white border-orange-300',
  assist_king: 'bg-sky-500 text-white border-sky-300',
  defense_wall: 'bg-emerald-500 text-white border-emerald-300',
  mvp: 'bg-violet-500 text-white border-violet-300'
}

interface Props {
  titleKey: string | null | undefined
  size?: 'sm' | 'md'
}

/** 佩戴称号徽章：荣誉类用特制颜色框，自由称号用柔和底色 */
export function TitleBadge({titleKey, size = 'md'}: Props) {
  const def = titleKey ? titleOf(titleKey) : null
  if (!def) return null
  const isHonor = def.type === 'conditional'
  const frame = isHonor ? HONOR_FRAME[def.key] || def.cls : def.cls
  const pad = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
  return (
    <span className={`flex items-center gap-0.5 rounded-md border-2 ${pad} text-base shrink-0 ${frame}`}>
      <div className={`${def.icon} text-base`} />
      {def.label}
    </span>
  )
}