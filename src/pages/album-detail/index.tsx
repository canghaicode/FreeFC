// @title 相册详情
import {useCallback, useMemo, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useBackgroundRefresh, useCachedState} from '@/hooks/useBackgroundRefresh'
import {Image, Swiper, SwiperItem} from '@tarojs/components'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {
  deleteAlbumPhoto,
  deleteTeamAlbum,
  getAlbumPhotos,
  getPicuiStatus,
  getTeamAlbumDetail,
  updateTeamAlbum
} from '@/db/api'
import {chooseAlbumPhotos, uploadAlbumPhotoFile} from '@/utils/picui'
import type {TeamAlbumBase, TeamPhoto} from '@/db/types'

function formatPhotoTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function AlbumDetail() {
  const {user, profile} = useAuth()
  const isAdmin = profile?.role === 'admin'
  const albumId = useMemo(() => Taro.getCurrentInstance().router?.params?.id || '', [])

  const [album, setAlbum] = useCachedState<TeamAlbumBase | null>(`album-detail:${albumId}`, null)
  const [photos, setPhotos] = useCachedState<TeamPhoto[]>(`album-photos:${albumId}`, [])
  const {loading, startRefresh, finishRefresh} = useBackgroundRefresh(albumId ? `album-detail:${albumId}` : 'album-detail')
  const [resolved, setResolved] = useState(false)
  const [picuiReady, setPicuiReady] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)

  const loadData = useCallback(async () => {
    const id = Taro.getCurrentInstance().router?.params?.id || albumId
    if (!id) return
    startRefresh()
    try {
      const [a, list, st] = await Promise.all([
        getTeamAlbumDetail(id),
        getAlbumPhotos(id),
        getPicuiStatus()
      ])
      setAlbum(a)
      setPhotos(list)
      setPicuiReady(!!st?.configured && st?.valid !== false)
      setResolved(true)
    } catch (err) {
      console.error('load album failed:', err)
    } finally {
      finishRefresh()
    }
  }, [albumId])


  useDidShow(() => {
    loadData()
  })

  const canManageAlbum = !!album && (album.created_by === user?.id || isAdmin)
  const currentPhoto = previewOpen ? photos[previewIndex] : null
  const canDeleteCurrent = !!currentPhoto && (currentPhoto.uploaded_by === user?.id || isAdmin)

  const handleChoose = async () => {
    if (!picuiReady) {
      Taro.showToast({title: '队长尚未配置图床服务', icon: 'none'})
      return
    }
    const picked = await chooseAlbumPhotos(9)
    if (!picked.length) return
    setUploading(true)
    setUploadTotal(picked.length)
    setUploadDone(0)
    let ok = 0
    let fail = 0
    for (const p of picked) {
      const r = await uploadAlbumPhotoFile(p, albumId)
      if (r.photo) ok++
      else fail++
      setUploadDone(ok + fail)
    }
    setUploading(false)
    await loadData()
    if (fail === 0) Taro.showToast({title: '上传成功', icon: 'success'})
    else if (ok === 0) Taro.showToast({title: '上传失败，请重试', icon: 'none'})
    else Taro.showToast({title: `${ok}张成功 ${fail}张失败`, icon: 'none'})
  }

  const openEdit = () => {
    if (!album) return
    setEditName(album.name)
    setEditDesc(album.description || '')
    setEditOpen(true)
  }

  const submitEdit = async () => {
    const n = editName.trim()
    if (!n) {
      Taro.showToast({title: '请输入相册名称', icon: 'none'})
      return
    }
    setSaving(true)
    const ok = await updateTeamAlbum(albumId, n, editDesc.trim() || null)
    setSaving(false)
    if (!ok) {
      Taro.showToast({title: '保存失败，请重试', icon: 'none'})
      return
    }
    Taro.showToast({title: '已保存', icon: 'success'})
    setEditOpen(false)
    loadData()
  }

  const handleDeleteAlbum = () => {
    Taro.showModal({
      title: '删除相册',
      content: '将删除相册内全部照片（含图床文件），删除后无法恢复，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return
        Taro.showLoading({title: '删除中'})
        try {
          await deleteTeamAlbum(albumId)
          Taro.hideLoading()
          Taro.showToast({title: '已删除', icon: 'success'})
          setTimeout(() => Taro.navigateBack(), 600)
        } catch (e) {
          Taro.hideLoading()
          Taro.showToast({title: (e as Error).message || '删除失败', icon: 'none'})
        }
      }
    })
  }

  const handleDeletePhoto = () => {
    const p = photos[previewIndex]
    if (!p) return
    Taro.showModal({
      title: '删除照片',
      content: '删除后无法恢复，确定删除这张照片吗？',
      success: async (res) => {
        if (!res.confirm) return
        Taro.showLoading({title: '删除中'})
        try {
          await deleteAlbumPhoto(p.id)
          Taro.hideLoading()
          Taro.showToast({title: '已删除', icon: 'success'})
          const next = photos.filter((x) => x.id !== p.id)
          setPhotos(next)
          if (next.length === 0) setPreviewOpen(false)
          else if (previewIndex >= next.length) setPreviewIndex(next.length - 1)
        } catch (e) {
          Taro.hideLoading()
          Taro.showToast({title: (e as Error).message || '删除失败', icon: 'none'})
        }
      }
    })
  }

  if (!resolved && !album) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (!loading && resolved && !album) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-5">
        <div className="i-mdi-image-off-outline text-5xl text-muted-foreground/50" />
        <p className="text-xl text-muted-foreground">相册不存在或已被删除</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 头部 */}
      <div className="bg-card border-b-2 border-border/60 px-5 pt-6 pb-5 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h1 className="font-heading text-3xl text-foreground truncate">{album?.name || '相册详情'}</h1>
            <p className="text-lg text-muted-foreground">{photos.length} 张照片</p>
          </div>
          {canManageAlbum && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/40"
                onClick={openEdit}
              >
                <div className="py-2 px-3 text-lg text-primary flex items-center gap-1">
                  <div className="i-mdi-pencil-outline text-xl text-primary" />
                  <span>编辑</span>
                </div>
              </button>
              <button
                type="button"
                className="flex items-center justify-center leading-none break-keep rounded-xl border-2 border-destructive/40"
                onClick={handleDeleteAlbum}
              >
                <div className="py-2 px-3 text-lg text-destructive flex items-center gap-1">
                  <div className="i-mdi-trash-can-outline text-xl text-destructive" />
                  <span>删除</span>
                </div>
              </button>
            </div>
          )}
        </div>
        {album?.description && <p className="text-lg text-muted-foreground">{album.description}</p>}
      </div>

      {/* 照片网格 */}
      <div className="flex-1 px-5 pt-5 pb-4">
        {loading ? (
          <p className="text-xl text-muted-foreground text-center py-10">加载中…</p>
        ) : photos.length === 0 ? (
          <div className="bg-card rounded-2xl border-2 border-border/60 py-14 flex flex-col items-center gap-3">
            <div className="i-mdi-image-multiple-outline text-5xl text-muted-foreground/50" />
            <p className="text-lg text-muted-foreground">还没有照片，点击下方按钮上传</p>
          </div>
        ) : (
          <div className="flex flex-wrap">
            {photos.map((p, i) => (
              <div
                key={p.id}
                className="w-1/3 p-[2px]"
                onClick={() => {
                  setPreviewIndex(i)
                  setPreviewOpen(true)
                }}
              >
                <div className="relative rounded-lg overflow-hidden bg-muted" style={{paddingBottom: '100%'}}>
                  <Image
                    src={p.thumbnail_url || p.url}
                    mode="aspectFill"
                    className="absolute inset-0 w-full h-full"
                    lazyLoad
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 上传按钮 */}
      <div className="sticky bottom-4 px-5 pb-4">
        <button
          type="button"
          className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow"
          onClick={handleChoose}
        >
          <div className="py-3.5 px-6 text-xl text-primary-foreground flex items-center gap-2">
            <div className="i-mdi-cloud-upload-outline text-2xl text-primary-foreground" />
            <span>上传照片</span>
          </div>
        </button>
      </div>

      {/* 上传进度浮层 */}
      {uploading && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center">
          <div className="bg-card rounded-2xl border-2 border-border/60 px-6 py-6 flex flex-col items-center gap-4" style={{width: '78%'}}>
            <div className="i-mdi-cloud-upload-outline text-5xl text-primary" />
            <p className="text-xl text-foreground">正在上传 {uploadDone} / {uploadTotal}</p>
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-gold"
                style={{width: `${uploadTotal ? Math.round((uploadDone / uploadTotal) * 100) : 0}%`}}
              />
            </div>
          </div>
        </div>
      )}

      {/* 全屏预览 */}
      {previewOpen && currentPhoto && (
        <div className="fixed inset-0 z-[80] bg-black" onClick={() => setPreviewOpen(false)}>
          <div className="h-screen flex flex-col">
            <div style={{height: '72vh'}} onClick={(e) => e.stopPropagation()}>
              <Swiper
                className="w-full"
                style={{height: '72vh'}}
                current={previewIndex}
                onChange={(e) => setPreviewIndex(Number((e as any).detail?.current) || 0)}
              >
                {photos.map((p) => (
                  <SwiperItem key={p.id}>
                    <div className="w-full h-full flex items-center justify-center">
                      <Image src={p.url} mode="aspectFit" className="w-full h-full" />
                    </div>
                  </SwiperItem>
                ))}
              </Swiper>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6" onClick={(e) => e.stopPropagation()}>
              <p className="text-lg text-white/90">{currentPhoto.uploader_name || '队员'} 上传</p>
              <p className="text-lg text-white/50">{formatPhotoTime(currentPhoto.created_at)}</p>
              <p className="text-lg text-white/40">{previewIndex + 1} / {photos.length}</p>
              {canDeleteCurrent && (
                <button
                  type="button"
                  onClick={handleDeletePhoto}
                  className="mt-2 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-white/30"
                >
                  <div className="py-2.5 px-6 text-lg text-white flex items-center gap-2">
                    <div className="i-mdi-trash-can-outline text-xl text-white" />
                    <span>删除这张照片</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 编辑相册弹窗 */}
      {editOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end"
          onClick={() => {
            if (!saving) setEditOpen(false)
          }}
        >
          <div
            className="w-full bg-background rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-2xl text-foreground">编辑相册</h3>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-lg text-foreground">相册名称</span>
                <span className="text-lg text-destructive">*</span>
              </div>
              <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="请输入相册名称"
                  maxLength={30}
                  value={editName}
                  onInput={(e) => {
                    const ev = e as any
                    setEditName(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-lg text-foreground">相册简介（可选）</span>
              <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                <textarea
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  style={{height: '16vh'}}
                  placeholder="一句话介绍这个相册"
                  maxLength={100}
                  value={editDesc}
                  onInput={(e) => {
                    const ev = e as any
                    setEditDesc(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>

            <div className="flex flex-row gap-3">
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 border-input"
                onClick={() => setEditOpen(false)}
              >
                <div className="py-3 text-xl text-foreground">取消</div>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl ${saving ? 'bg-primary/50' : 'bg-primary'}`}
                onClick={submitEdit}
              >
                <div className="py-3 text-xl text-primary-foreground">{saving ? '保存中…' : '保存'}</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(AlbumDetail)
