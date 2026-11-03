import Taro from '@tarojs/taro'
import {extractExt, getMimeType} from './upload'
import {uploadAlbumPhoto} from '@/db/api'
import type {TeamPhoto} from '@/db/types'

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

/** weapp：读取本地文件为 base64 */
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

/** weapp：读取本地文件大小（字节），失败返回 0 */
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
    const res: any = await Taro.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed']
    })
    const files: any[] = res?.tempFiles || []
    if (files.length) {
      return files.map((f) => ({path: String(f.tempFilePath || ''), size: Number(f.size) || 0}))
    }
  } catch {
    /* 旧基础库回退 chooseImage */
  }
  try {
    const res: any = await Taro.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera']
    })
    const paths: string[] = res?.tempFilePaths || []
    const sizes: any[] = res?.tempFiles || []
    return paths.map((p, i) => ({path: p, size: Number(sizes[i]?.size) || 0}))
  } catch {
    return []
  }
}

/** 上传单张照片：压缩 → base64 → picui-upload Edge Function 中转至图床 */
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
