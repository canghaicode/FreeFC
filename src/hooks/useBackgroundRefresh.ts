import {useCallback, useState} from 'react'

const readyPages = new Set<string>()
const snapshots = new Map<string, unknown>()

/** 首次进入显示加载占位；返回时保留已渲染内容。 */
export function useBackgroundRefresh(pageKey: string) {
  const [loading, setLoading] = useState(() => !readyPages.has(pageKey))

  const startRefresh = () => {
    if (!readyPages.has(pageKey)) setLoading(true)
  }

  const finishRefresh = () => {
    readyPages.add(pageKey)
    setLoading(false)
  }

  return {loading, startRefresh, finishRefresh}
}

/** 页面重新挂载后仍能立即显示上次数据，避免返回时先闪“加载中”。 */
export function useCachedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => (snapshots.has(key) ? (snapshots.get(key) as T) : initial))
  const setCached = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(prev) : next
      snapshots.set(key, resolved)
      return resolved
    })
  }, [key])
  return [value, setCached] as const
}
