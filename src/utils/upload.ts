import Taro from "@tarojs/taro";
import { supabase } from "@/client/supabase";

/**
 * MIME type mappings for common file extensions
 */
export const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  json: 'application/json',
  xml: 'application/xml',
  csv: 'text/csv'
} as const

/**
 * File input type for WeChat MiniProgram
 */
export interface MiniProgramFileInput {
  name: string
  type: string
  size: number
  tempFilePath: string
}


/**
 * Options for selecting media files
 */
export interface SelectMediaOptions {
  /** Maximum number of files to select */
  count?: number
  /** Media types to select */
  mediaType?: ('image' | 'video' | 'mix')[]
  /** Source type for file selection */
  sourceType?: ('album' | 'camera')[]
  /** Maximum video duration in seconds (MiniProgram only) */
  maxDuration?: number
  /** Camera mode (MiniProgram only) */
  camera?: 'back' | 'front'
}

/**
 * Options for selecting message files
 */
export interface SelectMessageFileOptions {
  /** Maximum number of files to select */
  count?: number
  /** File type filter */
  type?: 'all' | 'video' | 'image' | 'file'
  /** File extensions to allow */
  extension?: string[]
}

/** File upload configuration options */
export interface FileInputOptions {
  bucket: string
  userId?: string
}

/** 存储桶单文件上限（1MB），超限自动压缩 */
const MAX_FILE_SIZE = 1024 * 1024
/** 头像 URL 每次上传都会变化，可安全长期缓存。 */
const AVATAR_CACHE_CONTROL = '31536000, immutable'


/** Supported file data types */
export type FileBody =
  | ArrayBuffer
  | ArrayBufferView
  | Buffer
  | File
  | string

/** File input type (MiniProgram or Web) */
export type FileInput = MiniProgramFileInput | File


/**
 * Generate unique storage file name
 */
export function generateFileName(ext: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}.${ext}`
}

/**
 * Get MIME type for a file extension
 */
export function getMimeType(ext: string): string {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream'
}

/**
 * 健壮提取文件扩展名：weapp 临时路径（如 wxfile://tmp_xxx）可能没有扩展名，
 * 此时整段路径会被 split('.') 误当作扩展名，导致 MIME 错误与畸形存储路径。
 * 无法识别时按 jpg 处理（chooseMedia 图片场景默认值）。
 */
export function extractExt(...candidates: (string | undefined | null)[]): string {
  for (const c of candidates) {
    if (!c) continue
    const m = /\.([a-zA-Z0-9]{1,5})$/.exec(c)
    if (m) return m[1].toLowerCase()
  }
  return 'jpg'
}

/** 读取 weapp 本地文件大小（字节），失败返回 0 */
function getWeappFileSize(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const fsm = Taro.getFileSystemManager()
      fsm.getFileInfo({
        filePath,
        success: (res: any) => resolve(res.size || 0),
        fail: () => resolve(0)
      })
    } catch {
      resolve(0)
    }
  })
}

/** weapp 图片超限自动压缩：迭代降低质量，仍超限再限制最长边 1080px */
async function compressWeappImage(
  file: MiniProgramFileInput
): Promise<{file: MiniProgramFileInput; compressed: boolean}> {
  let size = await getWeappFileSize(file.tempFilePath)
  // 无法读取大小时（部分基础库/平台），保守放行原图上传
  if (size <= 0 || size <= MAX_FILE_SIZE) return {file, compressed: false}

  let current = file.tempFilePath
  let currentSize = size
  let compressed = false
  for (const quality of [80, 65, 50, 35]) {
    try {
      const res = await Taro.compressImage({src: current, quality})
      if (!res?.tempFilePath) break
      current = res.tempFilePath
      compressed = true
      currentSize = await getWeappFileSize(current)
      if (currentSize > 0 && currentSize <= MAX_FILE_SIZE) break
    } catch {
      break
    }
  }
  if (currentSize > MAX_FILE_SIZE) {
    try {
      const res = await Taro.compressImage({src: current, quality: 45, compressedWidth: 1080})
      if (res?.tempFilePath) {
        current = res.tempFilePath
        compressed = true
      }
    } catch {
      /* 忽略：交由服务端大小校验兜底 */
    }
  }
  return {file: {...file, tempFilePath: current, size: currentSize || file.size}, compressed}
}

/** H5 图片超限自动压缩：最长边限制 1080px，canvas 转 WEBP 并迭代降质至 1MB 内 */
async function compressWebImage(file: File): Promise<{file: File; compressed: boolean}> {
  if (file.size <= MAX_FILE_SIZE) return {file, compressed: false}
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1080 / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return {file, compressed: false}
    ctx.drawImage(bitmap, 0, 0, w, h)
    let blob: Blob | null = null
    let quality = 0.8
    while (quality >= 0.3) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
      if (blob && blob.size <= MAX_FILE_SIZE) break
      quality -= 0.15
    }
    bitmap.close?.()
    if (!blob) return {file, compressed: false}
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
    return {file: new File([blob], `${baseName}.webp`, {type: 'image/webp'}), compressed: true}
  } catch {
    return {file, compressed: false}
  }
}

/**
 * weapp: 读取本地文件为 base64
 */
function readWeappFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      Taro.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (res) => resolve(String(res.data || '')),
        fail: (e) => reject(new Error((e as any)?.errMsg || '读取文件失败'))
      })
    } catch {
      reject(new Error('读取文件失败'))
    }
  })
}

/**
 * weapp: 通过 Edge Function 中转上传头像
 *
 * 直传 Storage 需要域名在微信「uploadFile 合法域名」白名单中（真机会被拦截，
 * 开发者工具不拦——这是「工具里好的、真机不行」的典型原因），而 Edge Function
 * 走普通 request 通道（登录/数据库查询同通道，白名单必然已配置）。
 * 图片以 base64 JSON 提交，服务端校验身份后代写入 avatars 桶（uid 前缀路径）。
 */
async function uploadAvatarViaEdge(
  file: MiniProgramFileInput,
  bucket: string
): Promise<{path: string}> {
  if (bucket !== 'avatars') throw new Error('不支持的存储桶')
  const base64 = await readWeappFileBase64(file.tempFilePath)
  if (!base64) throw new Error('读取图片失败')
  const ext = extractExt(file.name, file.tempFilePath)
  const contentType = file.type || getMimeType(ext)
  const {data, error} = await supabase.functions.invoke('avatar-upload', {
    body: {base64, ext, contentType}
  })
  if (error) throw new Error(error.message || '上传失败')
  const resp = data as {path?: string; error?: string} | null
  if (resp?.error) throw new Error(resp.error)
  if (!resp?.path) throw new Error('上传失败')
  return {path: resp.path}
}

/**
 * weapp 直传 Supabase Storage REST API（Edge Function 失败时的回退通道）
 *
 * 小程序运行时没有 FormData/Blob，supabase-js 的 storage.upload 无法在 weapp
 * 构造 multipart 请求体（body 变成垃圾数据/直接抛错），历史上导致所有头像
 * 上传失败。这里改用微信原生 Taro.uploadFile 直传 REST 端点：
 *   POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
 * 携带用户 access_token 满足 RLS，x-upsert 处理同名覆盖。
 */
async function uploadViaWeapp(
  filePath: string,
  bucket: string,
  storagePath: string
): Promise<{path: string}> {
  const supabaseUrl = String(process.env.TARO_APP_SUPABASE_URL || '')
  const anonKey = String(process.env.TARO_APP_SUPABASE_ANON_KEY || '')
  if (!supabaseUrl) throw new Error('缺少 Supabase 配置')

  const {data: sessionData} = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('登录状态失效，请重新登录')

  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`
  const res = await Taro.uploadFile({
    url,
    filePath,
    name: 'file',
    header: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'x-upsert': 'true',
      ...(bucket === 'avatars' ? {'cache-control': `max-age=${AVATAR_CACHE_CONTROL}`} : {})
    }
  })

  if (res.statusCode < 200 || res.statusCode >= 300) {
    let message = `上传失败(${res.statusCode})`
    try {
      const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      if (body?.message) message = body.message
      else if (body?.error) message = body.error
    } catch {
      /* 保留默认提示 */
    }
    throw new Error(message)
  }

  return {path: storagePath}
}

/**
 * Upload file to Supabase Storage
 * Supports both Web (File) and WeChat MiniProgram (tempFilePath) environments
 * 图片超限自动压缩；upsert 模式同名覆盖
 */
export async function uploadToSupabase(
  file: FileInput,
  options: FileInputOptions
): Promise<{ success: boolean; data?: any; error?: string; compressed?: boolean; sizeText?: string }> {
  try {
    const { bucket, userId } = options

    // 图片超限自动压缩（weapp: compressImage 迭代 / H5: canvas 转 WEBP）
    let prepared: FileInput = file
    let compressed = false
    const mime = String((file as any).type || '')
    if (mime.startsWith('image/')) {
      if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
        const r = await compressWebImage(file as File)
        prepared = r.file
        compressed = r.compressed
      } else {
        const r = await compressWeappImage(file as MiniProgramFileInput)
        prepared = r.file
        compressed = r.compressed
      }
    }

    // Generate storage path（weapp 临时路径可能无扩展名，健壮提取）
    const ext = extractExt((prepared as any).name, (prepared as any).tempFilePath)
    const storageName = `${userId || 'public'}/${generateFileName(ext)}`

    let data: any
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      // H5：浏览器原生 FormData，storage-js 可靠
      const contentType = (prepared as any).type || getMimeType(ext)
      const r = await supabase.storage.from(bucket).upload(storageName, prepared as File, {
        contentType,
        upsert: true,
        ...(bucket === 'avatars' ? {cacheControl: AVATAR_CACHE_CONTROL} : {})
      })
      if (r.error) throw r.error
      data = r.data
    } else if (mime.startsWith('image/') && bucket === 'avatars') {
      // weapp 图片：优先 Edge Function 中转（不依赖 uploadFile 域名白名单），
      // 失败时回退 Taro.uploadFile 直传
      try {
        data = await uploadAvatarViaEdge(prepared as MiniProgramFileInput, bucket)
      } catch (edgeErr) {
        console.warn('Edge Function 上传失败，回退直传:', edgeErr)
        data = await uploadViaWeapp((prepared as MiniProgramFileInput).tempFilePath, bucket, storageName)
      }
      // 压缩后的准确大小（供提示）
      const bytes = await getWeappFileSize((prepared as MiniProgramFileInput).tempFilePath)
      if (bytes > 0) (prepared as MiniProgramFileInput).size = bytes
    } else {
      // weapp 其他文件：Taro.uploadFile 直传 REST API（storage-js 在小程序不可用）
      data = await uploadViaWeapp((prepared as MiniProgramFileInput).tempFilePath, bucket, storageName)
      // 压缩后的准确大小（供提示）
      const bytes = await getWeappFileSize((prepared as MiniProgramFileInput).tempFilePath)
      if (bytes > 0) (prepared as MiniProgramFileInput).size = bytes
    }

    // 人类可读的最终文件大小（压缩时用于提示）
    let sizeText = ''
    const bytes = Number((prepared as any).size) || 0
    if (bytes > 0) {
      sizeText =
        bytes >= MAX_FILE_SIZE
          ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
          : `${Math.max(1, Math.round(bytes / 1024))}KB`
    }

    return { success: true, data, compressed, sizeText }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Upload failed'
    }
  }
}

/**
 * Select media files (images/videos) from device
 */
export async function selectMediaFiles(
  options: SelectMediaOptions = {}
): Promise<(MiniProgramFileInput | File)[]> {
  const {
    count = 1,
    mediaType = ['image', 'video'],
    sourceType = ['album', 'camera'],
    maxDuration,
    camera = 'back'
  } = options

  try {
    const result = await Taro.chooseMedia({
      count,
      mediaType,
      sourceType,
      maxDuration,
      camera
    })

    if (!result.tempFiles?.length) {
      return []
    }

    return result.tempFiles.map((file: any) => {
      // Web environment: return File object directly
      if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
        return file.originalFileObj as File
      }

      // MiniProgram environment: construct file metadata
      const tempFilePath = file.tempFilePath
      // weapp 临时路径可能无扩展名（如 wxfile://tmp_xxx），默认按 jpg 处理
      const ext = extractExt(tempFilePath)
      const name = generateFileName(ext)
      const type = getMimeType(ext)

      return {
        name,
        type,
        size: file.size,
        tempFilePath
      } as MiniProgramFileInput
    })
  } catch (error: any) {
    console.error('Failed to select media files:', error)
    return []
  }
}

/**
 * Select a message file (document) from WeChat chat or local storage
 */
export async function selectMessageFile(
  options: SelectMessageFileOptions = {}
): Promise<MiniProgramFileInput | File | null> {
  const {
    count = 1,
    type = 'file',
    extension = ['pdf']
  } = options

  try {
    // Web environment: use native file input
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      return new Promise<File | null>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = extension.map(ext => `.${ext}`).join(',')
        input.onchange = (e: Event) => {
          const target = e.target as HTMLInputElement
          const selectedFile = target.files?.[0]
          input.remove()
          resolve(selectedFile || null)
        }
        // Handle user cancellation
        input.oncancel = () => {
          input.remove()
          resolve(null)
        }
        input.click()
      })
    }

    // MiniProgram environment: use chooseMessageFile API
    const result = await Taro.chooseMessageFile({
      count,
      type,
      extension
    })
    if (!result.tempFiles?.length) {
      return null
    }
    const file = result.tempFiles[0]
    const ext = file.name?.split('.').pop() || extension[0]
    return {
      name: file.name,
      type: getMimeType(ext),
      size: file.size,
      tempFilePath: file.path
    } as MiniProgramFileInput
  } catch (error: any) {
    console.error('Failed to select message file:', error)
    return null
  }
}
