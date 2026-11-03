import {createClient} from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: corsHeaders})
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader = req.headers.get('Authorization') || ''

    // 用用户 JWT 校验身份
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {headers: {Authorization: authHeader}}
    })
    const {data: userData, error: userErr} = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({error: '未登录或登录已失效'}), {
        status: 401,
        headers: {...corsHeaders, 'Content-Type': 'application/json'}
      })
    }

    const userId = userData.user.id

    // 使用 service role 删除 auth 用户（级联删除业务数据由 RLS/外键处理）
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const {error: deleteErr} = await adminClient.auth.admin.deleteUser(userId)
    if (deleteErr) {
      return new Response(JSON.stringify({error: '注销失败，请稍后重试'}), {
        status: 500,
        headers: {...corsHeaders, 'Content-Type': 'application/json'}
      })
    }

    return new Response(JSON.stringify({success: true}), {
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    })
  } catch (e) {
    return new Response(JSON.stringify({error: '服务异常'}), {
      status: 500,
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    })
  }
})