import {createClient} from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

/** picui.cn 官方 API 地址（硬编码；图床 Token 仅发往该官方域，绝不下发前端） */
const PICUI_API = 'https://picui.cn/api/v1'

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: CORS})
}

/** 群相册照片上传：小程序/H5 将压缩后的图片以 base64 提交，
 *  服务端使用球队图床 Token 以 multipart 转发至 picui.cn 官方上传接口，
 *  上传成功后写入照片元数据（team_photos）。 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: CORS})

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({error: '未登录'}, 401)
    }

    // 校验请求者身份
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
    const albumId = String(body?.albumId || '')
    if (!base64 || typeof base64 !== 'string') {
      return json({error: '缺少图片数据'}, 400)
    }
    if (!albumId) {
      return json({error: '缺少相册参数'}, 400)
    }
    // 原图约 2MB 上限（base64 后约 2.7MB）
    if (base64.length > 2.7 * 1024 * 1024) {
      return json({error: '图片过大，请重试'}, 413)
    }
    const ext = /^jpg|jpeg|png|gif|webp|avif$/.test(String(body?.ext || '')) ? body.ext : 'jpg'
    const contentType = /^image\/(jpeg|png|gif|webp|avif)$/.test(String(body?.contentType || ''))
      ? body.contentType
      : 'image/jpeg'
    const originName = String(body?.originName || '').slice(0, 120)
    const width =
      Number.isFinite(Number(body?.width)) && Number(body?.width) > 0 ? Math.round(Number(body?.width)) : null
    const height =
      Number.isFinite(Number(body?.height)) && Number(body?.height) > 0 ? Math.round(Number(body?.height)) : null

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: {persistSession: false}
    })

    // 读取球队图床配置（Token 仅用于调用 picui.cn 官方 API）
    const {data: config} = await admin.from('picui_config').select('token').eq('id', 1).maybeSingle()
    if (!config?.token) {
      return json({error: '队长尚未配置图床服务，暂无法上传照片'}, 400)
    }

    // 校验相册存在
    const {data: album} = await admin.from('team_albums').select('id').eq('id', albumId).maybeSingle()
    if (!album) {
      return json({error: '相册不存在或已被删除'}, 404)
    }

    // base64 → 二进制 → multipart 转发 picui 官方上传接口（公开权限，直链可展示）
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const filename = `album-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const form = new FormData()
    form.append('file', new Blob([bytes], {type: contentType}), filename)
    form.append('permission', '1')

    const picuiRes = await fetch(`${PICUI_API}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      },
      body: form
    })
    const picuiJson = await picuiRes.json().catch(() => null)
    if (!picuiRes.ok || !picuiJson?.status || !picuiJson?.data?.links?.url) {
      // 诊断日志（不含 Token）
      console.log(
        '[picui-upload] upload failed:',
        JSON.stringify({status: picuiRes.status, body: JSON.stringify(picuiJson).slice(0, 200)})
      )
      return json({error: `图床上传失败：${picuiJson?.message || picuiRes.status}`}, 502)
    }
    const d = picuiJson.data

    // 上传者昵称快照
    const {data: me} = await admin.from('profiles').select('nickname, username').eq('id', uid).maybeSingle()

    const record = {
      album_id: albumId,
      picui_key: String(d.key || ''),
      url: String(d.links.url),
      thumbnail_url: d.links.thumbnail_url ? String(d.links.thumbnail_url) : String(d.links.url),
      origin_name: originName || (d.origin_name ? String(d.origin_name).slice(0, 120) : null),
      width,
      height,
      size_kb: Number.isFinite(Number(d.size)) ? Number(d.size) : null,
      uploaded_by: uid,
      uploader_name: me?.nickname || me?.username || '队员'
    }
    const {data: inserted, error: insErr} = await admin.from('team_photos').insert(record).select().single()
    if (insErr) {
      // 数据库写入失败时清理图床文件，避免孤儿文件
      await fetch(`${PICUI_API}/images/${encodeURIComponent(String(d.key || ''))}`, {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${config.token}`, Accept: 'application/json'}
      }).catch(() => {})
      return json({error: `照片记录保存失败：${insErr.message}`}, 500)
    }

    return json({photo: inserted})
  } catch (e) {
    return json({error: (e as Error).message || '上传失败'}, 500)
  }
})
