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

/** 浏览器风格 UA（图床 WAF 可能拦截无 UA / 非浏览器 UA 的服务端请求） */
const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

/** 清洗用户提交的 Token：去全部空白（含中段折行）、全角竖线转半角、去误粘贴的 Bearer 前缀 */
function sanitizeToken(raw: unknown): string {
  return String(raw || '')
    .replace(/\s+/g, '')
    .replace(/｜/g, '|')
    .replace(/^bearer/i, '')
}

/** 校验结果 */
type TokenCheck =
  | {ok: true; profile: Record<string, unknown>}
  | {ok: false; kind: 'invalid' | 'network' | 'parse'; message: string}

/** 调用 picui.cn 官方 /profile 校验 Token：带超时与浏览器 UA，细分失败原因 */
async function checkPicuiToken(token: string): Promise<TokenCheck> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let res: Response
  try {
    res = await fetch(`${PICUI_API}/profile`, {
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': BROWSER_UA},
      signal: controller.signal
    })
  } catch (e) {
    clearTimeout(timer)
    // 诊断日志（不含 Token）
    console.log('[picui] profile fetch error:', (e as Error).name, (e as Error).message)
    return {ok: false, kind: 'network', message: '无法连接图床服务（网络超时），请稍后重试'}
  }
  clearTimeout(timer)

  const text = await res.text().catch(() => '')
  let j: any = null
  try {
    j = text ? JSON.parse(text) : null
  } catch {
    j = null
  }
  // 诊断日志：状态码 / 内容类型 / 响应前缀（响应中不含 Token），用于排查 WAF 拦截
  console.log(
    '[picui] profile check:',
    JSON.stringify({status: res.status, contentType: res.headers.get('content-type'), bodyPreview: text.slice(0, 150)})
  )

  if (!j) {
    return {
      ok: false,
      kind: 'parse',
      message: `图床服务响应异常（HTTP ${res.status}），可能是网络或风控拦截，请稍后重试`
    }
  }
  if (!res.ok || !j?.status) {
    const hint = j?.message ? String(j.message) : `HTTP ${res.status}`
    return {
      ok: false,
      kind: 'invalid',
      message: `Token 无效（${hint}），请从 picui.cn「个人中心」完整复制，形如 1|xxxx，不要带 Bearer 前缀`
    }
  }
  return {ok: true, profile: j.data || {}}
}

/** picui 图床配置信息（脱敏后返回，不含 Token） */
function pickProfile(d: Record<string, unknown>) {
  return {
    username: typeof d.username === 'string' ? d.username : '',
    name: typeof d.name === 'string' ? d.name : null,
    capacity: Number(d.capacity) || 0,
    size: Number(d.size) || 0,
    image_num: Number(d.image_num) || 0,
    album_num: Number(d.album_num) || 0
  }
}

/** 群相册图床管理：账号状态查询 / 保存 Token（仅队长）/ 删除照片 / 删除相册。
 *  球队图床 Token 仅存于服务端数据库，只发往 picui.cn 官方 API。 */
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
    const action = String(body?.action || '')

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: {persistSession: false}
    })

    /** 查询当前请求者是否队长 */
    const isAdmin = async (): Promise<boolean> => {
      const {data: me} = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
      return me?.role === 'admin'
    }

    if (action === 'status') {
      const {data: config} = await admin
        .from('picui_config')
        .select('token, updated_at')
        .eq('id', 1)
        .maybeSingle()
      if (!config?.token) return json({configured: false})
      const check = await checkPicuiToken(config.token)
      if (!check.ok) {
        const message =
          check.kind === 'invalid'
            ? 'Token 已失效，请队长重新配置'
            : check.kind === 'network'
              ? '无法连接图床服务，请稍后重试'
              : '图床服务暂时不可用，请稍后再试'
        return json({configured: true, valid: false, message})
      }
      return json({
        configured: true,
        valid: true,
        profile: pickProfile(check.profile),
        updated_at: config.updated_at
      })
    }

    if (action === 'save-token') {
      if (!(await isAdmin())) return json({error: '仅队长可配置图床'}, 403)
      // 清洗：去 Bearer 前缀/折行/全角竖线等粘贴痕迹
      const token = sanitizeToken(body?.token)
      if (!token) return json({error: '请输入 Token'}, 400)
      if (token.length > 300) return json({error: 'Token 格式不正确'}, 400)
      // 保存前先调用 picui.cn 官方接口校验 Token 有效性
      const check = await checkPicuiToken(token)
      if (!check.ok) return json({error: check.message}, check.kind === 'invalid' ? 400 : 502)
      const profile = pickProfile(check.profile)
      const {error: upErr} = await admin
        .from('picui_config')
        .upsert({id: 1, token, updated_by: uid, updated_at: new Date().toISOString()}, {onConflict: 'id'})
      if (upErr) return json({error: `保存失败：${upErr.message}`}, 500)
      return json({success: true, profile})
    }

    if (action === 'delete-photo') {
      const photoId = String(body?.photoId || '')
      if (!photoId) return json({error: '缺少参数'}, 400)
      const {data: photo} = await admin
        .from('team_photos')
        .select('id, picui_key, uploaded_by')
        .eq('id', photoId)
        .maybeSingle()
      if (!photo) return json({error: '照片不存在'}, 404)
      if (photo.uploaded_by !== uid && !(await isAdmin())) {
        return json({error: '仅照片上传者或队长可删除'}, 403)
      }
      // 尽力清理图床文件（失败不阻断记录删除）
      const {data: config} = await admin.from('picui_config').select('token').eq('id', 1).maybeSingle()
      if (config?.token) {
        await fetch(`${PICUI_API}/images/${encodeURIComponent(photo.picui_key)}`, {
          method: 'DELETE',
          headers: {Authorization: `Bearer ${config.token}`, Accept: 'application/json'}
        }).catch(() => {})
      }
      const {error: delErr} = await admin.from('team_photos').delete().eq('id', photoId)
      if (delErr) return json({error: `删除失败：${delErr.message}`}, 500)
      return json({success: true})
    }

    if (action === 'delete-album') {
      const albumId = String(body?.albumId || '')
      if (!albumId) return json({error: '缺少参数'}, 400)
      const {data: album} = await admin
        .from('team_albums')
        .select('id, created_by')
        .eq('id', albumId)
        .maybeSingle()
      if (!album) return json({error: '相册不存在'}, 404)
      if (album.created_by !== uid && !(await isAdmin())) {
        return json({error: '仅相册创建者或队长可删除相册'}, 403)
      }
      // 先清理相册内图床文件（上限 1000 张保护），再删除相册（级联清理照片记录）
      const {data: config} = await admin.from('picui_config').select('token').eq('id', 1).maybeSingle()
      if (config?.token) {
        const {data: keys} = await admin
          .from('team_photos')
          .select('picui_key')
          .eq('album_id', albumId)
          .limit(1000)
        for (const p of keys ?? []) {
          await fetch(`${PICUI_API}/images/${encodeURIComponent(p.picui_key)}`, {
            method: 'DELETE',
            headers: {Authorization: `Bearer ${config.token}`, Accept: 'application/json'}
          }).catch(() => {})
        }
      }
      const {error: delErr} = await admin.from('team_albums').delete().eq('id', albumId)
      if (delErr) return json({error: `删除失败：${delErr.message}`}, 500)
      return json({success: true})
    }

    return json({error: '未知操作'}, 400)
  } catch (e) {
    return json({error: (e as Error).message || '操作失败'}, 500)
  }
})
