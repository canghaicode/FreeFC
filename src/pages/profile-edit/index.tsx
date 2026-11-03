// @title 编辑资料

import {Button, Input, Picker} from '@tarojs/components'
import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useEffect, useRef, useState} from 'react'
import {CachedAvatarImage} from '@/components/Avatar'
import {withRouteGuard} from '@/components/RouteGuard'
import {FEET, isConditionalTitle, NEGATIVE_TRAITS, POSITIONS, POSITIVE_TRAITS, TITLES, titleOf } from '@/constants'
import {useAuth} from '@/contexts/AuthContext'
import {getMySeasonHonors, getSeasons, updateOwnProfile } from '@/db/api'
import {type FileInput, selectMediaFiles, uploadToSupabase } from '@/utils/upload'

function ProfileEdit() {
  const {profile, user, refreshProfile} = useAuth()
  const [nickname, setNickname] = useState('')
  const [jerseyNumber, setJerseyNumber] = useState('')
  const [age, setAge] = useState('')
  const [preferredPosition, setPreferredPosition] = useState<string>('')
  const [secondaryPosition, setSecondaryPosition] = useState<string>('')
  const [preferredFoot, setPreferredFoot] = useState<string>('right')
  const [footSkill, setFootSkill] = useState(5)
  const [weakFootSkill, setWeakFootSkill] = useState(5)
  const [traits, setTraits] = useState<string[]>([])
  const [title, setTitle] = useState<string | null>(null)
  const [earnedHonors, setEarnedHonors] = useState<string[]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  /** H5 预览用的 objectURL，卸载时释放 */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  /** 微信未同意隐私协议时，type=nickname 会降级成普通键盘 */
  const [nicknameReady, setNicknameReady] = useState(() => Taro.getEnv() !== 'WEAPP')
  const [nicknameFocus, setNicknameFocus] = useState(false)
  /** 头像上传进行中为 true：拦截外部资料刷新对头像预览的覆盖 */
  const avatarDirtyRef = useRef(false)
  /** 表单是否已用服务端资料初始化（仅一次，防止中途刷新覆盖编辑内容） */
  const initedRef = useRef(false)

  const loadData = useCallback(() => {
    if (profile && !initedRef.current) {
      initedRef.current = true
      setNickname((profile.nickname as string) || '')
      setJerseyNumber(
        profile.jersey_number !== null && profile.jersey_number !== undefined
          ? String(profile.jersey_number)
          : ''
      )
      setAge(profile.age !== null && profile.age !== undefined ? String(profile.age) : '')
      setPreferredPosition((profile.preferred_position as string) || '')
      setSecondaryPosition((profile.secondary_position as string) || '')
      setPreferredFoot((profile.preferred_foot as string) || 'right')
      setFootSkill(typeof profile.foot_skill === 'number' ? profile.foot_skill : 5)
      setWeakFootSkill(typeof profile.weak_foot_skill === 'number' ? profile.weak_foot_skill : 5)
      setTraits(Array.isArray(profile.traits) ? (profile.traits as string[]) : [])
      setTitle((profile.title as string) || null)
    }
    // 头像始终跟随服务端（上传中除外，避免预览被旧值覆盖）
    if (!avatarDirtyRef.current) {
      setAvatarUrl((profile?.avatar_url as string) || null)
    }
  }, [profile])

  /** 加载本赛季已解锁的条件称号，并自动卸下失效的条件称号 */
  const loadHonors = useCallback(async () => {
    if (!profile?.id) return
    const seasons = await getSeasons()
    const active = seasons.find((s) => s.is_active) || seasons[0]
    if (!active) {
      setEarnedHonors([])
      return
    }
    const honors = await getMySeasonHonors(active.id, profile.id)
    setEarnedHonors(honors)
    setTitle((cur) => (cur && isConditionalTitle(cur) && !honors.includes(cur) ? null : cur))
  }, [profile])

  useEffect(() => {
    loadHonors()
  }, [loadHonors])

  // 用服务端资料初始化表单（含头像）；profile 变化时同步头像（上传中除外）
  useEffect(() => {
    loadData()
  }, [loadData])

  // 释放 H5 objectURL，避免内存泄漏
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useDidShow(() => {
    refreshProfile()
  })

  /** 立即上传并保存头像（选图即生效，不依赖保存按钮） */
  const saveAvatarNow = async (file: FileInput) => {
    if (uploading) return
    avatarDirtyRef.current = true
    setUploading(true)
    // 立即预览
    if ('tempFilePath' in file) {
      setAvatarUrl(file.tempFilePath)
    } else {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setAvatarUrl(url)
    }
    Taro.showLoading({title: '正在上传头像…', mask: true})
    let toast: {title: string; icon: 'success' | 'none'; duration?: number} | null = null
    try {
      const {supabase} = await import('@/client/supabase')
      const {data: userData} = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        toast = {title: '登录状态失效，请重新登录', icon: 'none'}
        return
      }
      const result = await uploadToSupabase(file, {bucket: 'avatars', userId})
      if (!result.success || !result.data?.path) {
        toast = {title: '头像上传失败，请重试', icon: 'none'}
        return
      }
      const {data: urlData} = supabase.storage.from('avatars').getPublicUrl(result.data.path)
      const finalUrl = urlData.publicUrl
      // 上传成功立即写入个人资料，全队各处即刻生效
      const ok = await updateOwnProfile({avatar_url: finalUrl})
      if (!ok) {
        toast = {title: '头像保存失败，请重试', icon: 'none'}
        return
      }
      setAvatarUrl(finalUrl)
      await refreshProfile()
      toast = result.compressed && result.sizeText
        ? {title: `已压缩至${result.sizeText}，头像已更新`, icon: 'none', duration: 2000}
        : {title: '头像已更新', icon: 'success'}
    } finally {
      avatarDirtyRef.current = false
      setUploading(false)
      Taro.hideLoading()
      if (toast) Taro.showToast(toast)
    }
  }

  /** 相册/拍照选图入口 */
  const chooseAvatar = async () => {
    if (uploading) return
    const files = await selectMediaFiles({mediaType: ['image'], count: 1})
    const file = files?.[0]
    if (!file) return
    await saveAvatarNow(file)
  }

  /** 微信官方头像入口（weapp 专属：openType="chooseAvatar"） */
  const handleWechatAvatar = async (e: any) => {
    const url: string | undefined = e?.detail?.avatarUrl
    if (!url || uploading) return
    const file: FileInput = {name: 'avatar.jpg', type: 'image/jpeg', size: 0, tempFilePath: url}
    await saveAvatarNow(file)
  }

  useEffect(() => {
    if (Taro.getEnv() !== 'WEAPP') return
    const wxApi = (globalThis as any).wx
    if (!wxApi?.getPrivacySetting) {
      setNicknameReady(true)
      return
    }
    wxApi.getPrivacySetting({
      success: (res: {needAuthorization?: boolean}) => {
        if (!res.needAuthorization) setNicknameReady(true)
      },
      fail: () => setNicknameReady(true)
    })
  }, [])

  const handleSave = async () => {
    if (saving) return
    if (!/^\d*$/.test(jerseyNumber) || !/^\d*$/.test(age)) {
      Taro.showToast({title: '球衣号码和年龄只能输入数字', icon: 'none'})
      return
    }
    const number = jerseyNumber === '' ? null : parseInt(jerseyNumber, 10)
    if (number !== null && (number < 0 || number > 999)) {
      Taro.showToast({title: '号码需为0-999的整数', icon: 'none'})
      return
    }
    if (preferredPosition && secondaryPosition && preferredPosition === secondaryPosition) {
      Taro.showToast({title: '复选位置不能与首选相同', icon: 'none'})
      return
    }
    const ageNumber = age === '' ? null : parseInt(age, 10)
    if (ageNumber !== null && (ageNumber < 10 || ageNumber > 99)) {
      Taro.showToast({title: '年龄需为10-99的整数', icon: 'none'})
      return
    }

    setSaving(true)
    try {
      // 头像已即时保存，此处仅提交基础资料
      const ok = await updateOwnProfile({
        nickname: nickname.trim() || null,
        jersey_number: number,
        age: ageNumber,
        preferred_position: preferredPosition || null,
        secondary_position: secondaryPosition || null,
        preferred_foot: preferredFoot,
        foot_skill: footSkill,
        weak_foot_skill: weakFootSkill,
        traits,
        title
      })
      if (ok) {
        Taro.showToast({title: '保存成功', icon: 'success'})
        await refreshProfile()
        setTimeout(() => Taro.navigateBack(), 600)
      } else {
        Taro.showToast({title: '保存失败，请重试', icon: 'none'})
      }
    } finally {
      setSaving(false)
    }
  }

  const fieldCls = 'border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden'
  const buttonDisabled = saving || uploading
  const isWeapp = Taro.getEnv() === 'WEAPP'
  const loginUsername = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || ''
  const isAdminAccount = String(loginUsername).trim().toLowerCase() === 'admin'

  return (
    <div className="min-h-screen bg-background px-5 py-6 flex flex-col gap-4">
      <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
        <h2 className="font-heading text-2xl text-foreground">个人资料</h2>
        <div className="vine-divider" />

        {/* 头像（选图即上传即保存） */}
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <CachedAvatarImage src={avatarUrl} mode="aspectFill" className="w-20 h-20 rounded-full" lazyLoad />
          ) : (
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
              <span className="font-heading text-3xl text-primary">{(nickname || '队').slice(0, 1)}</span>
            </div>
          )}
          <div className="flex flex-col gap-2 flex-1">
            {isWeapp && (
              <Button
                openType="chooseAvatar"
                onChooseAvatar={handleWechatAvatar}
                className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow"
              >
                <div className="py-2.5 px-5 flex items-center gap-1.5">
                  <div className="i-mdi-wechat text-2xl text-primary-foreground" />
                  <span className="text-xl text-primary-foreground">使用微信头像</span>
                </div>
              </Button>
            )}
            {!isAdminAccount && (
              <button
                type="button"
                className={`w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/30 ${
                  uploading ? 'opacity-60' : 'lift-glow'
                }`}
                onClick={chooseAvatar}
              >
                <div className="py-2.5 px-5 flex items-center gap-1.5">
                  <div className="i-mdi-camera-outline text-2xl text-primary" />
                  <span className="text-xl text-primary">{uploading ? '上传中…' : '相册选图'}</span>
                </div>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">昵称</span>
          <div className="border-2 border-input rounded-xl px-4 bg-background">
            {isWeapp && !nicknameReady ? (
              <Button
                id="agree-privacy-btn"
                openType="agreePrivacyAuthorization"
                className="w-full text-xl text-foreground bg-transparent text-left"
                style={{height: '48px', lineHeight: '48px', padding: 0, margin: 0, border: 'none', background: 'transparent'}}
                onAgreePrivacyAuthorization={() => {
                  setNicknameReady(true)
                  setNicknameFocus(true)
                }}
              >
                {nickname || '点击同意并使用微信昵称'}
              </Button>
            ) : (
              <Input
                className="w-full text-xl text-foreground bg-transparent"
                style={{height: '48px', width: '100%'}}
                type="nickname"
                alwaysEmbed
                focus={nicknameFocus}
                placeholder="点击使用微信昵称"
                value={nickname}
                onInput={(e) => setNickname(e.detail.value)}
                onBlur={(e) => {
                  setNickname(e.detail.value)
                  setNicknameFocus(false)
                }}
                onNickNameReview={(e) => {
                  const detail = (e as any).detail
                  if (detail && detail.pass === false) setNickname('')
                }}
              />
            )}
          </div>
          <span className="text-base text-muted-foreground">
            {isWeapp && !nicknameReady ? '需先同意微信隐私协议，键盘上方才会出现微信昵称' : '键盘上方点选微信昵称'}
          </span>
        </div>

        <div className="flex flex-row gap-4">
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">球衣号码</span>
            <div className={fieldCls}>
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                type="number"
                placeholder="如 10"
                maxLength={3}
                value={jerseyNumber}
                onInput={(e) => {
                  const ev = e as any
                  setJerseyNumber(String(ev.detail?.value ?? ev.target?.value ?? '').replace(/\D/g, '').slice(0, 3))
                }}
              />
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-xl text-muted-foreground">年龄</span>
            <div className={fieldCls}>
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                type="number"
                placeholder="如 28"
                maxLength={2}
                value={age}
                onInput={(e) => {
                  const ev = e as any
                  setAge(String(ev.detail?.value ?? ev.target?.value ?? '').replace(/\D/g, '').slice(0, 2))
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">首选位置</span>
          <Picker
            mode="selector"
            range={['', ...POSITIONS]}
            value={Math.max(0, ['', ...POSITIONS].indexOf(preferredPosition))}
            onChange={(e) => setPreferredPosition((['', ...POSITIONS] as string[])[Number(e.detail.value)] || '')}
          >
            <div className={`${fieldCls} flex items-center justify-between`}>
              <span className={`text-xl ${preferredPosition ? 'text-foreground' : 'text-muted-foreground'}`}>
                {preferredPosition || '选择位置'}
              </span>
              <div className="i-mdi-chevron-down text-2xl text-primary" />
            </div>
          </Picker>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xl text-muted-foreground">复选位置（第二位置，可不选）</span>
          <Picker
            mode="selector"
            range={['无', ...POSITIONS]}
            value={Math.max(0, ['无', ...POSITIONS].indexOf(secondaryPosition))}
            onChange={(e) => setSecondaryPosition((['无', ...POSITIONS] as string[])[Number(e.detail.value)] || '')}
          >
            <div className={`${fieldCls} flex items-center justify-between`}>
              <span className={`text-xl ${secondaryPosition ? 'text-foreground' : 'text-muted-foreground'}`}>
                {secondaryPosition || '无'}
              </span>
              <div className="i-mdi-chevron-down text-2xl text-primary" />
            </div>
          </Picker>
        </div>

        {/* 惯用脚 + 双脚能力值 */}
        <div className="flex flex-col gap-3">
          <span className="text-xl text-muted-foreground">惯用脚</span>
          <div className="flex flex-row gap-3">
            {FEET.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 ${
                  preferredFoot === f.value ? 'border-primary bg-primary/15' : 'border-input bg-background'
                }`}
                onClick={() => setPreferredFoot(f.value)}
              >
                <div className="py-2.5 text-xl text-foreground">{f.label}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-row gap-4 mt-1">
            <div className="flex-1 flex flex-col gap-2">
              <span className="text-lg text-muted-foreground">惯用脚能力值（1-10）</span>
              <Picker
                mode="selector"
                range={Array.from({length: 10}, (_, i) => String(i + 1))}
                value={Math.max(0, footSkill - 1)}
                onChange={(e) => setFootSkill(Number(e.detail.value) + 1)}
              >
                <div className={`${fieldCls} flex items-center justify-between`}>
                  <span className="text-xl text-foreground">{footSkill}</span>
                  <div className="i-mdi-chevron-down text-2xl text-primary" />
                </div>
              </Picker>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <span className="text-lg text-muted-foreground">非惯用脚能力值（1-10）</span>
              <Picker
                mode="selector"
                range={Array.from({length: 10}, (_, i) => String(i + 1))}
                value={Math.max(0, weakFootSkill - 1)}
                onChange={(e) => setWeakFootSkill(Number(e.detail.value) + 1)}
              >
                <div className={`${fieldCls} flex items-center justify-between`}>
                  <span className="text-xl text-foreground">{weakFootSkill}</span>
                  <div className="i-mdi-chevron-down text-2xl text-primary" />
                </div>
              </Picker>
            </div>
          </div>
        </div>

        {/* 正面特质（多选） */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl text-muted-foreground">正面特质（可多选）</span>
            <span className="text-base text-muted-foreground/70">展示在球星卡</span>
          </div>
          <div className="flex flex-row flex-wrap gap-2">
            {POSITIVE_TRAITS.map((t) => {
              const on = traits.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  className={`px-3 py-2 rounded-xl border-2 text-lg leading-none break-keep ${
                    on ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background text-foreground'
                  }`}
                  onClick={() => setTraits(on ? traits.filter((x) => x !== t) : [...traits, t])}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        {/* 负面特质（多选） */}
        <div className="flex flex-col gap-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xl text-muted-foreground">负面特质（可多选）</span>
            <span className="text-base text-muted-foreground/70">展示在球星卡</span>
          </div>
          <div className="flex flex-row flex-wrap gap-2">
            {NEGATIVE_TRAITS.map((t) => {
              const on = traits.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  className={`px-3 py-2 rounded-xl border-2 text-lg leading-none break-keep ${
                    on ? 'border-destructive bg-destructive/15 text-destructive' : 'border-input bg-background text-foreground'
                  }`}
                  onClick={() => setTraits(on ? traits.filter((x) => x !== t) : [...traits, t])}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        {/* 佩戴称号 */}
        <div className="flex flex-col gap-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xl text-muted-foreground">佩戴称号</span>
            <span className="text-base text-muted-foreground/70">展示在球星卡与报名名单</span>
          </div>
          {title && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30">
              <span className="text-lg text-muted-foreground">当前：</span>
              <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-md text-base ${titleOf(title)?.cls}`}>
                <div className={`${titleOf(title)?.icon} text-base`} />
                {titleOf(title)?.label}
              </span>
              <button type="button" className="ml-auto flex items-center gap-0.5 text-lg text-destructive" onClick={() => setTitle(null)}>
                <div className="i-mdi-close-circle-outline text-xl" />
                取消
              </button>
            </div>
          )}
          <div className="flex flex-row flex-wrap gap-2">
            {TITLES.map((t) => {
              const earned = t.type === 'free' || earnedHonors.includes(t.key)
              const active = title === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl border-2 text-lg leading-none break-keep ${
                    active
                      ? 'border-primary bg-primary/15 text-primary'
                      : earned
                        ? 'border-input bg-background text-foreground'
                        : 'border-border/50 bg-muted/50 text-muted-foreground/60'
                  }`}
                  onClick={() => {
                    if (!earned) {
                      Taro.showToast({title: '未达成解锁条件', icon: 'none'})
                      return
                    }
                    setTitle(active ? null : t.key)
                  }}
                >
                  {!earned && <div className="i-mdi-lock-outline text-base" />}
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 我的球星卡入口（六维能力统一在球星卡 Tab 编辑，保持单一数据源） */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-primary/30 bg-secondary/20 active:bg-muted/50"
          onClick={() => Taro.switchTab({url: '/pages/ability/index'})}
        >
          <div className="i-mdi-chart-radar text-3xl text-primary" />
          <div className="flex-1 min-w-0">
            <span className="text-xl text-foreground">我的球星卡</span>
            <p className="text-base text-muted-foreground mt-0.5">球星模板 · 六维能力 · 球星卡预览</p>
          </div>
          <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
        </div>
      </div>

      <button
        type="button"
        className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${
          buttonDisabled ? 'bg-primary/50' : 'bg-primary lift-glow'
        }`}
        onClick={handleSave}
      >
        <div className="py-3.5 px-6 text-2xl text-primary-foreground font-medium">
          {saving ? '保存中…' : '保存'}
        </div>
      </button>
    </div>
  )
}

export default withRouteGuard(ProfileEdit)
