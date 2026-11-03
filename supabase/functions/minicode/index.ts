import {createClient} from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: CORS})
}

function bufToBase64(buf: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/** 小程序码获取（供分享海报嵌入）：
 *  优先读 Storage 缓存（minicode 桶），无缓存则调微信官方接口生成并缓存。
 *  返回 {url, base64}：H5 用 url，weapp 用 base64 写本地临时文件绘入 canvas
 *  （canvas 加载网络图需域名白名单，本地文件无此限制）。 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: CORS})

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({error: '未登录'}, 401)

    // 鉴权（登录用户才可生成，防滥用）
    const userClient = createClient(supabaseUrl, req.headers.get('apikey') || '', {
      global: {headers: {Authorization: authHeader}},
      auth: {persistSession: false}
    })
    const {data: userData, error: userErr} = await userClient.auth.getUser()
    if (userErr || !userData?.user?.id) return json({error: '登录状态失效'}, 401)

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: {persistSession: false}
    })
    const objectPath = 'minicode/minicode.png'
    const {data: pubData} = admin.storage.from('minicode').getPublicUrl(objectPath)
    const url = pubData?.publicUrl || ''

    // 1) 缓存命中
    const {data: cached, error: cacheErr} = await admin.storage.from('minicode').download(objectPath)
    if (!cacheErr && cached) {
      const buf = new Uint8Array(await cached.arrayBuffer())
      if (buf.length > 0) return json({url, base64: bufToBase64(buf)})
    }

    // 2) 调微信官方接口生成（凭证仅发往微信官方域名 api.weixin.qq.com）
    const appId = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_ID')
    const appSecret = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_SECRET')
    if (!appId || !appSecret) return json({error: '小程序凭证未配置'}, 500)

    const tokenRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
    )
    const tokenData = await tokenRes.json()
    if (!tokenData?.access_token) {
      return json({error: `获取access_token失败: ${tokenData?.errmsg || '未知错误'}`}, 500)
    }

    const codeRes = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${tokenData.access_token}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          scene: 'poster',
          page: 'pages/home/index',
          check_path: false,
          env_version: 'release',
          width: 430
        })
      }
    )
    const contentType = codeRes.headers.get('content-type') || ''
    if (!contentType.includes('image')) {
      const errText = await codeRes.text()
      let msg = '小程序码生成失败'
      try {
        const errJson = JSON.parse(errText)
        if (errJson?.errmsg) msg = errJson.errmsg
      } catch { /* 保留默认提示 */ }
      return json({error: msg}, 500)
    }
    const codeBuf = new Uint8Array(await codeRes.arrayBuffer())

    // 3) 缓存至 Storage（upsert，之后请求直接命中）
    const {error: upErr} = await admin.storage
      .from('minicode')
      .upload(objectPath, codeBuf, {contentType: 'image/png', upsert: true})
    if (upErr) return json({error: `缓存失败：${upErr.message}`}, 500)

    return json({url, base64: bufToBase64(codeBuf)})
  } catch (e) {
    return json({error: (e as Error).message || '获取失败'}, 500)
  }
})
