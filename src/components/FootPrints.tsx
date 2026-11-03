import {footLabel} from '@/constants'

interface Props {
  foot: string | null | undefined
  mainSkill: number | null | undefined
  weakSkill: number | null | undefined
}

/**
 * FIFA 式惯用脚展示：左右两个脚印，脚印内显示数值，
 * 惯用脚脚印高亮（金色），非惯用脚为暗色。
 */
export function FootPrints({foot, mainSkill, weakSkill}: Props) {
  const isRight = (foot || 'right') === 'right'
  const main = typeof mainSkill === 'number' ? mainSkill : 5
  const weak = typeof weakSkill === 'number' ? weakSkill : 5
  // 物理左右：左侧=左脚，右侧=右脚
  const left = {value: isRight ? weak : main, main: !isRight}
  const right = {value: isRight ? main : weak, main: isRight}

  const cell = (value: number, main: boolean, mirror: boolean) => (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
          main ? 'bg-gradient-gold text-primary-foreground shadow-elegant' : 'bg-black/30 text-white/80'
        }`}
      >
        <div className={`${mirror ? 'i-mdi-foot-print -scale-x-100' : 'i-mdi-foot-print'} text-3xl`} />
      </div>
      <span className={`font-heading text-xl ${main ? 'text-amber-300' : 'text-white/70'}`}>{value}</span>
    </div>
  )

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-row items-end gap-4">
        {cell(left.value, left.main, false)}
        {cell(right.value, right.main, true)}
      </div>
      <span className="text-base text-white/70">{footLabel(foot || 'right')}</span>
    </div>
  )
}