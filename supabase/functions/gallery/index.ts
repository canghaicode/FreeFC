import {createClient, type SupabaseClient} from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

const BUCKET = 'team-photos'
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
}
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif'
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: CORS})
}
interface GalleryRequest {
  action?: unknown
  albumId?: unknown
  base64?: unknown
  ext?: unknown
  contentType?: unknown
  width?: unknown
  height?: unknown
  originName?: unknown
  photoId?: unknown
}


function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function uploadFormat(rawExt: unknown, rawContentType: unknown): {ext: string; contentType: string} {
  const ext = String(rawExt || '').toLowerCase()
  const contentType = String(rawContentType || '').toLowerCase().split(';')[0]
  if (EXT_MIME[ext] && EXT_MIME[ext] === contentType) {
    return {ext: ext === 'jpeg' ? 'jpg' : ext, contentType}
  }
  if (MIME_EXT[contentType]) return {ext: MIME_EXT[contentType], contentType}
  return {ext: 'jpg', contentType: 'image/jpeg'}
}
function publicStorageUrl(baseUrl: string, storagePath: string): string {
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${encodedPath}`
}



async function removeStorageObjects(admin: SupabaseClient, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100)
    if (chunk.length === 0) continue
    const {error} = await admin.storage.from(BUCKET).remove(chunk)
    if (error) console.error('[gallery] storage cleanup failed:', error.message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: CORS})

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const publicSupabaseUrl = Deno.env.get('SUPABASE_PUBLIC_URL') || supabaseUrl
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({error: '未登录'}, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {headers: {Authorization: authHeader}},
      auth: {persistSession: false}
    })
    const {data: userData, error: userError} = await userClient.auth.getUser()
    if (userError || !userData?.user?.id) return json({error: '登录状态失效，请重新登录'}, 401)
    const uid = userData.user.id

    const admin = createClient(supabaseUrl, serviceRoleKey, {auth: {persistSession: false}})
    const rawBody: unknown = await req.json().catch(() => null)
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      return json({error: '请求参数无效'}, 400)
    }
    const body = rawBody as GalleryRequest
    const action = String(body.action || '')

    const isAdmin = async (): Promise<boolean> => {
      const {data} = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
      return data?.role === 'admin'
    }


    if (action === 'upload') {
      const albumId = String(body?.albumId || '')
      const base64 = typeof body?.base64 === 'string' ? body.base64 : ''
      if (!albumId) return json({error: '缺少相册参数'}, 400)
      if (!base64) return json({error: '缺少图片数据'}, 400)
      if (base64.length > 2.8 * 1024 * 1024) return json({error: '图片过大，请重试'}, 413)

      const {data: album} = await admin.from('team_albums').select('id').eq('id', albumId).maybeSingle()
      if (!album) return json({error: '相册不存在或已被删除'}, 404)

      const bytes = decodeBase64(base64)
      if (bytes.length === 0) return json({error: '图片文件为空'}, 400)
      if (bytes.length > MAX_UPLOAD_BYTES) return json({error: '图片超过 2MB，请重试'}, 413)

      const {ext, contentType} = uploadFormat(body?.ext, body?.contentType)
      const photoId = crypto.randomUUID()
      const storagePath = `${albumId}/${photoId}.${ext}`
      const {error: uploadError} = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
        contentType,
        cacheControl: '31536000, public, immutable',
        upsert: false
      })
      if (uploadError) return json({error: `服务器存储失败：${uploadError.message}`}, 500)

      const publicUrl = publicStorageUrl(publicSupabaseUrl, storagePath)
      const {data: profile} = await admin.from('profiles').select('nickname, username').eq('id', uid).maybeSingle()
      const width = Number.isFinite(Number(body?.width)) && Number(body?.width) > 0 ? Math.round(Number(body.width)) : null
      const height = Number.isFinite(Number(body?.height)) && Number(body?.height) > 0 ? Math.round(Number(body.height)) : null
      const originName = String(body?.originName || '').slice(0, 120) || null
      const {data: photo, error: insertError} = await admin
        .from('team_photos')
        .insert({
          id: photoId,
          album_id: albumId,
          storage_path: storagePath,
          url: publicUrl,
          thumbnail_url: publicUrl,
          origin_name: originName,
          width,
          height,
          size_kb: Math.round((bytes.length / 1024) * 100) / 100,
          uploaded_by: uid,
          uploader_name: profile?.nickname || profile?.username || '队员'
        })
        .select()
        .single()
      if (insertError) {
        await admin.storage.from(BUCKET).remove([storagePath])
        return json({error: `照片记录保存失败：${insertError.message}`}, 500)
      }
      return json({photo})
    }

    if (action === 'delete-photo') {
      const photoId = String(body?.photoId || '')
      if (!photoId) return json({error: '缺少参数'}, 400)
      const {data: photo} = await admin
        .from('team_photos')
        .select('id, storage_path, uploaded_by')
        .eq('id', photoId)
        .maybeSingle()
      if (!photo) return json({error: '照片不存在'}, 404)
      if (photo.uploaded_by !== uid && !(await isAdmin())) return json({error: '仅照片上传者或队长可删除'}, 403)

      const {error: deleteError} = await admin.from('team_photos').delete().eq('id', photoId)
      if (deleteError) return json({error: `删除失败：${deleteError.message}`}, 500)
      if (photo.storage_path) await removeStorageObjects(admin, [photo.storage_path])
      return json({success: true})
    }

    if (action === 'delete-album') {
      const albumId = String(body?.albumId || '')
      if (!albumId) return json({error: '缺少参数'}, 400)
      const {data: album} = await admin.from('team_albums').select('id, created_by').eq('id', albumId).maybeSingle()
      if (!album) return json({error: '相册不存在'}, 404)
      if (album.created_by !== uid && !(await isAdmin())) {
        return json({error: '仅相册创建者或队长可删除相册'}, 403)
      }

      const paths: string[] = []
      let offset = 0
      while (true) {
        const {data: rows, error} = await admin
          .from('team_photos')
          .select('storage_path')
          .eq('album_id', albumId)
          .range(offset, offset + 999)
        if (error) return json({error: `读取相册文件失败：${error.message}`}, 500)
        const page = rows || []
        for (const row of page) if (row.storage_path) paths.push(row.storage_path)
        if (page.length < 1000) break
        offset += page.length
      }

      const {error: deleteError} = await admin.from('team_albums').delete().eq('id', albumId)
      if (deleteError) return json({error: `删除失败：${deleteError.message}`}, 500)
      await removeStorageObjects(admin, paths)
      return json({success: true})
    }


    return json({error: '未知操作'}, 400)
  } catch (error) {
    return json({error: (error as Error).message || '操作失败'}, 500)
  }
})
