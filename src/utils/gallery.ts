import Taro from '@tarojs/taro'
import {uploadAlbumPhoto} from '@/db/api'
import type {TeamPhoto} from '@/db/types'
import {extractExt, getMimeType} from './upload'

/** 服务端原图上限约 2MB */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** 待上传照片（weapp 临时路径 / H5 blob URL） */
export interface PendingPhoto {
  path: string
  size: number
}

/** 上传结果 */
export interface PhotoUploadResult {
  photo?: TeamPhoto
  error?: string
}
const albumImagePaths = new Map<string, string>()
const albumImageTasks = new Map<string, Promise<string | null>>()


/** 完整下载一张相册图片后返回可直接展示的地址；微信端复用本地临时文件。 */
export function preloadAlbumImage(url: string): Promise<string | null> {
  const cached = albumImagePaths.get(url)
  if (cached) return Promise.resolve(cached)
  const pending = albumImageTasks.get(url)
  if (pending) return pending
  if (!/^https?:\/\//.test(url)) return Promise.resolve(url)

  const task = Taro.getImageInfo({src: url})
    .then((info) => info.path || url)
    .then((source) => {
      if (source) albumImagePaths.set(url, source)
      return source
    })
    .catch(() => null)
    .finally(() => albumImageTasks.delete(url))
  albumImageTasks.set(url, task)
  return task
}

export function invalidateAlbumImage(url: string): void {
  albumImagePaths.delete(url)
}


/** weapp：读取本地文件为 base64 */
function readWeappFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      Taro.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (res) => resolve(String(res.data || '')),
        fail: (error) => reject(new Error(error.errMsg || '读取文件失败'))
      })
    } catch {
      reject(new Error('读取文件失败'))
    }
  })
}

/** weapp：读取本地文件大小（字节），失败返回 0 */
function getWeappFileSize(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const fsm = Taro.getFileSystemManager()
      fsm.getFileInfo({
        filePath,
        success: (res) => resolve(res.size || 0),
        fail: () => resolve(0)
      })
    } catch {
      resolve(0)
    }
  })
}

/** 获取图片宽高（尽力而为，失败返回 0） */
async function getImageSize(src: string): Promise<{width: number; height: number}> {
  try {
    const info = await Taro.getImageInfo({src})
    return {width: info.width || 0, height: info.height || 0}
  } catch {
    return {width: 0, height: 0}
  }
}

/** weapp：图片超限迭代压缩至 2MB 内 */
async function compressWeappImage(filePath: string): Promise<string> {
  let current = filePath
  let size = await getWeappFileSize(current)
  if (size <= 0 || size <= MAX_UPLOAD_BYTES) return current
  for (const quality of [80, 65, 50, 40]) {
    try {
      const res = await Taro.compressImage({src: current, quality})
      if (!res?.tempFilePath) break
      current = res.tempFilePath
      size = await getWeappFileSize(current)
      if (size > 0 && size <= MAX_UPLOAD_BYTES) break
    } catch {
      break
    }
  }
  return current
}

/** H5：File 压缩至 2MB 内（最长边 1600px，canvas 转 JPEG 迭代降质） */
async function compressWebImage(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    let blob: Blob | null = null
    let quality = 0.85
    while (quality >= 0.4) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= MAX_UPLOAD_BYTES) break
      quality -= 0.15
    }
    if (!blob) return file
    return new File([blob], `${Date.now()}.jpg`, {type: 'image/jpeg'})
  } catch {
    return file
  }
}

/** H5：File 转 base64（去掉 data: 前缀） */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/** 多选本地照片（默认最多 9 张，压缩档） */
export async function chooseAlbumPhotos(maxCount = 9): Promise<PendingPhoto[]> {
  try {
    const res = await Taro.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed']
    })
    const files = res?.tempFiles || []
    if (files.length) {
      return files.map((f) => ({path: String(f.tempFilePath || ''), size: Number(f.size) || 0}))
    }
  } catch {
    /* 旧基础库回退 chooseImage */
  }
  try {
    const res = await Taro.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera']
    })
    const paths: string[] = res?.tempFilePaths || []
    const sizes = res?.tempFiles || []
    return paths.map((p, i) => ({path: p, size: Number(sizes[i]?.size) || 0}))
  } catch {
    return []
  }
}

/** 上传单张照片：压缩 → base64 → gallery Edge Function 存入 Supabase Storage */
export async function uploadAlbumPhotoFile(photo: PendingPhoto, albumId: string): Promise<PhotoUploadResult> {
  try {
    const {width, height} = await getImageSize(photo.path)
    let base64 = ''
    let ext = 'jpg'
    let contentType = 'image/jpeg'

    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      // H5：blob URL → File（压缩后转 base64）
      const blob = await (await fetch(photo.path)).blob()
      const raw = new File([blob], 'photo.jpg', {type: blob.type || 'image/jpeg'})
      const file = await compressWebImage(raw)
      ext = extractExt(file.name) || 'jpg'
      contentType = file.type || getMimeType(ext)
      base64 = await fileToBase64(file)
    } else {
      // weapp：超限压缩后读 base64
      const compressed = await compressWeappImage(photo.path)
      ext = extractExt(photo.path, compressed) || 'jpg'
      contentType = getMimeType(ext)
      base64 = await readWeappFileBase64(compressed)
    }

    if (!base64) return {error: '读取图片失败'}
    const result = await uploadAlbumPhoto({base64, ext, contentType, albumId, width, height})
    return {photo: result}
  } catch (e) {
    return {error: (e as Error).message || '上传失败'}
  }
}
