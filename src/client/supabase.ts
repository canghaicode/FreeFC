// @ts-nocheck

import {createClient} from '@supabase/supabase-js'
import Taro, {showToast} from '@tarojs/taro'

const supabaseUrl: string = process.env.TARO_APP_SUPABASE_URL!
const supabaseAnonKey: string = process.env.TARO_APP_SUPABASE_ANON_KEY || 'TOKEN'
const appId: string = process.env.TARO_APP_APP_ID!

let noticed = false
const publicSupabaseOrigin = String(process.env.TARO_APP_SUPABASE_URL || '').replace(/\/+$/, '')
const legacySupabaseOrigins = ['http://139.199.227.46', 'http://47.103.58.94']

/** 将数据库中历史保存的 HTTP 资源地址切换到当前 HTTPS 网关。 */
function normalizeLegacyAssetUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    if (!publicSupabaseOrigin) return value
    return legacySupabaseOrigins.reduce(
      (result, origin) => result.split(origin).join(publicSupabaseOrigin),
      value
    )
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = normalizeLegacyAssetUrls(value[i])
    }
    return value
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      record[key] = normalizeLegacyAssetUrls(record[key])
    }
  }
  return value
}
export const customFetch: typeof fetch = async (url: string, options: RequestInit) => {
  let headers: HeadersInit = options.headers || {}
  const {method = 'GET', body} = options

  if (options.headers instanceof Map) {
    headers = Object.fromEntries(options.headers)
  }

  const res = await Taro.request({
    url,
    method: method as keyof Taro.request.Method,
    header: headers,
    data: body,
    responseType: 'text'
  })
  const normalizedData = normalizeLegacyAssetUrls(res.data)

  // 全局启停提示
  if (res.statusCode > 300 && res.data?.code === 'SupabaseNotReady' && !noticed) {
    const tip = res.data.message || res.data.msg || '服务端报错'
    noticed = true
    showToast({
      title: tip,
      icon: 'error',
      duration: 5000
    })
  }

  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    json: async () => normalizedData,
    text: async () => JSON.stringify(normalizedData),
    data: normalizedData, // 兼容小程序的返回格式
    headers: {
      // HTTP 响应头大小写不敏感（RFC 7230），但 Taro.request 返回的 res.header
      // key 保留服务器原始大小写（如 'Content-Range'），而 Supabase SDK 查询时
      // 使用小写（如 'content-range'），必须遍历做不敏感匹配。
      get: (key: string) => {
        if (!res.header || !key) return null
        const lowerKey = key.toLowerCase()
        for (const [k, v] of Object.entries(res.header)) {
          if (k.toLowerCase() === lowerKey) return v as string
        }
        return null
      }
    }
  } as unknown as Response
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch
  },
  auth: {
    storageKey: `${appId}-auth-token`
  }
})
