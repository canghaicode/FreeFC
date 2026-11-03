import {useEffect, useState} from 'react'
import type {ComponentProps} from 'react'
import {Image} from '@tarojs/components'
import Taro from '@tarojs/taro'

const SIZES = {
  sm: 'w-10 h-10 text-lg',
  md: 'w-12 h-12 text-xl',
  lg: 'w-20 h-20 text-3xl',
  xl: 'w-28 h-28 text-4xl',
  '2xl': 'w-36 h-36 text-5xl'
} as const

const avatarImagePaths = new Map<string, string>()
const avatarImageTasks = new Map<string, Promise<string | null>>()

function cacheAvatarImage(url: string): Promise<string | null> {
  const cached = avatarImagePaths.get(url)
  if (cached) return Promise.resolve(cached)
  const pending = avatarImageTasks.get(url)
  if (pending) return pending
  if (Taro.getEnv() !== 'WEAPP' || !/^https?:\/\//.test(url)) return Promise.resolve(null)

  const task = Taro.getImageInfo({src: url})
    .then((info) => {
      const localPath = info.path || null
      if (localPath) avatarImagePaths.set(url, localPath)
      return localPath
    })
    .catch(() => null)
    .finally(() => avatarImageTasks.delete(url))
  avatarImageTasks.set(url, task)
  return task
}

type CachedAvatarImageProps = Omit<ComponentProps<typeof Image>, 'src'> & {src: string}

/** 微信端首次显示后记录本地临时路径；后续页面同步复用，不再重新请求远程头像。 */
export function CachedAvatarImage({src, onLoad, onError, ...props}: CachedAvatarImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(() => avatarImagePaths.get(src) ?? src)

  useEffect(() => {
    setResolvedSrc(avatarImagePaths.get(src) ?? src)
  }, [src])

  return (
    <Image
      {...props}
      src={resolvedSrc}
      onLoad={(event) => {
        onLoad?.(event)
        if (resolvedSrc === src) void cacheAvatarImage(src)
      }}
      onError={(event) => {
        if (resolvedSrc !== src) {
          avatarImagePaths.delete(src)
          setResolvedSrc(src)
          return
        }
        onError?.(event)
      }}
    />
  )
}

interface AvatarProps {
  url?: string | null
  name?: string | null
  size?: keyof typeof SIZES
}

/** 队员头像：有头像显示图片，否则显示昵称首字 */
export function Avatar({url, name, size = 'md'}: AvatarProps) {
  if (url) {
    return <CachedAvatarImage src={url} mode="aspectFill" className={`rounded-full ${SIZES[size]}`} lazyLoad />
  }
  const initial = (name || '队').slice(0, 1)
  return (
    <div className={`rounded-full bg-secondary flex items-center justify-center ${SIZES[size]}`}>
      <span className="font-heading text-primary">{initial}</span>
    </div>
  )
}
