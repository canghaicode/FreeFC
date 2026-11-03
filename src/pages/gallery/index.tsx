// @title 群相册
import {useCallback, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {Image} from '@tarojs/components'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {createTeamAlbum, getPicuiStatus, getTeamAlbums} from '@/db/api'
import type {PicuiStatus, TeamAlbum} from '@/db/types'

function Gallery() {
  const {profile} = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [albums, setAlbums] = useCachedState<TeamAlbum[]>('gallery-albums', [])
  const [status, setStatus] = useState<PicuiStatus | null>(null)
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh('gallery')
  const [loaded, setLoaded] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    startRefresh()
    try {
      const [albumList, st] = await Promise.all([getTeamAlbums(), getPicuiStatus()])
      setAlbums(albumList)
      setStatus(st)
      setLoaded(true)
    } catch (err) {
      console.error('load albums failed:', err)
    } finally {
      finishRefresh()
    }
  }, [])


  useDidShow(() => {
    loadData()
  })

  const submitCreate = async () => {
    const n = name.trim()
    if (!n) {
      Taro.showToast({title: '请输入相册名称', icon: 'none'})
      return
    }
    setSubmitting(true)
    const ok = await createTeamAlbum(n, desc.trim() || null)
    setSubmitting(false)
    if (!ok) {
      Taro.showToast({title: '创建失败，请重试', icon: 'none'})
      return
    }
    Taro.showToast({title: '创建成功', icon: 'success'})
    setModalOpen(false)
    setName('')
    setDesc('')
    loadData()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 头部 */}
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-3xl text-foreground">群相册</h1>
            <p className="text-lg text-muted-foreground">记录球队精彩瞬间</p>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/40 shrink-0"
              onClick={() => Taro.navigateTo({url: '/pages/picui-settings/index'})}
            >
              <div className="py-2 px-3 text-lg text-primary flex items-center gap-1">
                <div className="i-mdi-cog-outline text-xl text-primary" />
                <span>图床设置</span>
              </div>
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pt-6 pb-8 flex flex-col gap-4">
        {/* 未配置图床引导 */}
        {status && !status.configured && (
          <div className="bg-card rounded-2xl border-2 border-dashed border-border p-6 flex flex-col items-center gap-3">
            <div className="i-mdi-image-outline text-5xl text-muted-foreground/50" />
            <p className="text-lg text-muted-foreground text-center">
              {isAdmin ? '尚未配置图床服务，配置后全队即可上传照片' : '队长尚未配置图床服务，暂时只能浏览相册'}
            </p>
            {isAdmin && (
              <button
                type="button"
                className="flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow"
                onClick={() => Taro.navigateTo({url: '/pages/picui-settings/index'})}
              >
                <div className="py-2.5 px-6 text-lg text-primary-foreground">去配置图床</div>
              </button>
            )}
          </div>
        )}

        {/* 图床配置异常提示 */}
        {status?.configured && status.valid === false && (
          <div
            className="bg-card rounded-2xl border-2 border-destructive/40 p-4 flex items-center gap-3"
            onClick={() => {
              if (isAdmin) Taro.navigateTo({url: '/pages/picui-settings/index'})
            }}
          >
            <div className="i-mdi-alert-circle-outline text-2xl text-destructive shrink-0" />
            <p className="text-lg text-foreground flex-1 min-w-0">{status.message || '图床配置异常，请联系队长处理'}</p>
            {isAdmin && <div className="i-mdi-chevron-right text-3xl text-muted-foreground shrink-0" />}
          </div>
        )}

        {/* 相册列表 */}
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-2xl text-foreground">球队相册</h3>
          <button
            type="button"
            className="flex items-center justify-center leading-none break-keep rounded-xl bg-primary"
            onClick={() => setModalOpen(true)}
          >
            <div className="py-2 px-4 text-lg text-primary-foreground flex items-center gap-1">
              <div className="i-mdi-plus text-xl text-primary-foreground" />
              <span>新建相册</span>
            </div>
          </button>
        </div>

        {albums.length === 0 ? (
          !loaded || loading ? (
            <p className="text-xl text-muted-foreground text-center py-8">加载中…</p>
          ) : (
            <div className="bg-card rounded-2xl border-2 border-border/60 py-12 flex flex-col items-center gap-2">
              <div className="i-mdi-image-multiple-outline text-5xl text-muted-foreground/50" />
              <p className="text-lg text-muted-foreground">还没有相册，新建第一个吧</p>
            </div>
          )
        ) : (
          albums.map((a) => (
            <div
              key={a.id}
              className="bg-card rounded-2xl border-2 border-border/60 p-4 flex items-center gap-4"
              onClick={() => Taro.navigateTo({url: `/pages/album-detail/index?id=${a.id}`})}
            >
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {a.cover_url ? (
                  <Image src={a.cover_url} mode="aspectFill" className="w-full h-full" />
                ) : (
                  <div className="i-mdi-image-multiple-outline text-3xl text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h4 className="text-xl text-foreground font-bold truncate">{a.name}</h4>
                <p className="text-lg text-muted-foreground">{a.photo_count} 张照片 · {a.creator_name} 创建</p>
                {a.description && <p className="text-lg text-muted-foreground truncate">{a.description}</p>}
              </div>
              <div className="i-mdi-chevron-right text-3xl text-muted-foreground shrink-0" />
            </div>
          ))
        )}
      </div>

      {/* 新建相册弹窗 */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end"
          onClick={() => {
            if (!submitting) setModalOpen(false)
          }}
        >
          <div
            className="w-full bg-background rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-2xl text-foreground">新建相册</h3>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-lg text-foreground">相册名称</span>
                <span className="text-lg text-destructive">*</span>
              </div>
              <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="例如：2026 秋季联赛"
                  maxLength={30}
                  value={name}
                  onInput={(e) => {
                    const ev = e as any
                    setName(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-lg text-foreground">相册简介（可选）</span>
              <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                <textarea
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  style={{height: '18vh'}}
                  placeholder="一句话介绍这个相册"
                  maxLength={100}
                  value={desc}
                  onInput={(e) => {
                    const ev = e as any
                    setDesc(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>

            <div className="flex flex-row gap-3">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-input"
                onClick={() => setModalOpen(false)}
              >
                <div className="py-3 text-xl text-foreground">取消</div>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
                onClick={submitCreate}
              >
                <div className="py-3 text-xl text-primary-foreground">{submitting ? '创建中…' : '创建'}</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(Gallery)
