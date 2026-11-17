import {createClient} from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
}

// 源站证书与 new.wwldz.com 不匹配。小程序只访问本域名，这里用已验证可用的源站 IP 走 HTTP。
const UPSTREAM = 'http://39.100.251.71/apiwechat/Management/giveCarCouponPost'
const MANAGEMENT_ID = '4753'

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: CORS})
}

function normalizeCarNumber(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 8)
}

function responseMessage(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      for (const key of ['msg', 'message', 'error']) {
        const message = record[key]
        if (typeof message === 'string' && message.trim()) return message.trim()
      }
    }
  } catch {
    // 源站当前返回 HTML 提示页。
  }
  const htmlTitle = trimmed.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]
  return (htmlTitle ?? trimmed)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: CORS})
  if (req.method !== 'POST') return json({error: '仅支持 POST'}, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const authHeader = req.headers.get('Authorization') || ''
    if (!supabaseUrl || !anonKey) return json({error: '服务未配置'}, 500)
    if (!authHeader.startsWith('Bearer ')) return json({error: '未登录'}, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {headers: {Authorization: authHeader}},
      auth: {persistSession: false, autoRefreshToken: false}
    })
    const {data: userData, error: userErr} = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json({error: '登录状态失效'}, 401)

    let body: {car_number?: unknown} = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const carNumber = normalizeCarNumber(body.car_number)
    if (!carNumber) return json({error: '请输入车牌号'}, 400)

    const upstreamUrl = `${UPSTREAM}?car_number=${encodeURIComponent(carNumber)}&management_id=${MANAGEMENT_ID}`
    const upstream = await fetch(upstreamUrl, {method: 'POST', signal: AbortSignal.timeout(12000)})
    const message = responseMessage(await upstream.text()) || (upstream.ok ? '请求完成' : `请求失败（${upstream.status}）`)
    if (!upstream.ok) return json({error: message}, 502)
    return json({message})
  } catch (error) {
    return json({error: error instanceof Error ? error.message : '减免请求失败'}, 502)
  }
})
