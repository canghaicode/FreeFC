import {isNegativeTrait} from '@/constants'

interface Props {
  list: string[] | null | undefined
}

/** 特质标签：正面特质绿色、负面特质红色，统一展示 */
export function TraitTags({list}: Props) {
  if (!list || list.length === 0) return null
  return (
    <div className="flex flex-row flex-wrap gap-1.5">
      {list.map((t) => {
        const neg = isNegativeTrait(t)
        return (
          <span
            key={t}
            className={`px-2 py-0.5 rounded-md text-base border ${
              neg
                ? 'bg-destructive/15 text-destructive border-destructive/30'
                : 'bg-primary/15 text-primary border-primary/30'
            }`}
          >
            {t}
          </span>
        )
      })}
    </div>
  )
}