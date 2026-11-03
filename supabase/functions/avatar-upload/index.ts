import {createClient} from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: CORS})
}

/** 头像中转上传：小程序/H5 将压缩后的图片以 base64 提交，
 *  服务端代写入 avatars 桶（路径强制为请求者 uid 前缀），
 *  彻底绕开 weapp 无 FormData / uploadFile 域名白名单限制。 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: CORS})

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({error: '未登录'}, 401)
    }

    // 校验请求者身份，取 uid（路径强制前缀，客户端不可伪造他人目录）
    const userClient = createClient(supabaseUrl, req.headers.get('apikey') || '', {
      global: {headers: {Authorization: authHeader}},
      auth: {persistSession: false}
    })
    const {data: userData, error: userErr} = await userClient.auth.getUser()
    if (userErr || !userData?.user?.id) {
      return json({error: '登录状态失效，请重新登录'}, 401)
    }
    const uid = userData.user.id

    const body = await req.json().catch(() => null)
    const base64 = body?.base64
    if (!base64 || typeof base64 !== 'string') {
      return json({error: '缺少图片数据'}, 400)
    }
    // 原图约 2MB 上限（base64 后约 2.7MB）
    if (base64.length > 2.7 * 1024 * 1024) {
      return json({error: '图片过大，请重试'}, 413)
    }
    const ext = /^jpg|jpeg|png|gif|webp|avif$/.test(String(body?.ext || '')) ? body.ext : 'jpg'
    const contentType = /^image\/(jpeg|png|gif|webp|avif)$/.test(String(body?.contentType || ''))
      ? body.contentType
      : 'image/jpeg'

    // base64 → 二进制
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

    // 服务端权限写入 Storage（仅访问 Supabase 官方 URL，无第三方出站请求）
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: {persistSession: false}
    })
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const {error: upErr} = await admin.storage.from('avatars').upload(path, bytes, {
      contentType,
      cacheControl: '31536000, immutable',
      upsert: true
    })
    if (upErr) return json({error: `存储失败：${upErr.message}`}, 500)

    return json({path})
  } catch (e) {
    return json({error: (e as Error).message || '上传失败'}, 500)
  }
})
