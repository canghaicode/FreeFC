/**
 * 一次性资产转存：将队长微信收款码从临时 CDN 转存到项目 Supabase Storage。
 * 原因：临时 CDN 链接会过期（响应头 expires 约 3 天），且小程序端 downloadFile
 * 受域名白名单限制；转存到项目自有 Storage 后永久有效且域名必然在白名单内。
 * 调用一次即可，图片永久驻留 Storage。
 */

import {createClient} from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// 源图：平台临时 CDN（匿名公开访问，无任何凭据）
const SOURCE_URL =
  'https://miaoda-conversation-file.cdn.bcebos.com/user-ekxo3uclrw1s/app-ekxp48jlavpd/20260928/3a0e656013b32fb8f3ef95f85f4ebfa8_1790567095497.png'

const STORAGE_PATH = 'posters/wechat-pay-qr.png'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: corsHeaders})
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const admin = createClient(supabaseUrl, serviceRoleKey)

    // 拉取源图（目标为源图自身官方 CDN 域名，匿名 GET，无凭据）
    const res = await fetch(SOURCE_URL)
    if (!res.ok) {
      return new Response(JSON.stringify({error: '源图片拉取失败'}), {
        status: 502,
        headers: {...corsHeaders, 'Content-Type': 'application/json'}
      })
    }
    const blob = await res.blob()

    // 上传到 minicode bucket（service role，仅访问 Supabase 官方地址）
    const {error: upErr} = await admin.storage
      .from('minicode')
      .upload(STORAGE_PATH, blob, {contentType: 'image/png', upsert: true})
    if (upErr) {
      return new Response(JSON.stringify({error: '上传失败'}), {
        status: 500,
        headers: {...corsHeaders, 'Content-Type': 'application/json'}
      })
    }

    const {data} = admin.storage.from('minicode').getPublicUrl(STORAGE_PATH)
    return new Response(JSON.stringify({url: data.publicUrl}), {
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    })
  } catch {
    return new Response(JSON.stringify({error: '服务异常'}), {
      status: 500,
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    })
  }
})