import { createClient } from 'jsr:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

// 默认账号定义：username -> 密码
const DEFAULT_ACCOUNTS = [
  { username: 'admin', password: 'admin123456', role: 'admin' },
  { username: 'captain', password: 'captain123456', role: 'admin' }
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    // 仅允许持有有效 anon key 的请求调用（一次性初始化用途）
    const apiKey = req.headers.get('apikey') || ''
    if (apiKey !== ANON_KEY) {
      return new Response(JSON.stringify({ message: '无权访问' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const results: { username: string; created: boolean; message: string }[] = []

    for (const acc of DEFAULT_ACCOUNTS) {
      const email = `${acc.username}@miaoda.com`
      const { error } = await admin.auth.admin.createUser({
        email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { username: acc.username, role: acc.role }
      })
      if (error) {
        // 已存在视为成功
        const already = error.message.includes('already been registered')
        results.push({
          username: acc.username,
          created: already,
          message: already ? '账号已存在' : error.message
        })
      } else {
        results.push({ username: acc.username, created: true, message: '创建成功' })
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})