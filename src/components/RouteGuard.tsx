import {useEffect, useRef, useState} from 'react'
import Taro from '@tarojs/taro'
import {useAuth} from '@/contexts/AuthContext'
import {LogoBg} from '@/components/LogoBg'

// Public pages that don't require authentication
const PUBLIC_PAGE_PATHS = [
  '/pages/login/index',
  '/pages/user-agreement/index',
  '/pages/privacy-policy/index',
  '/pages/privacy-inventory/index'
]

const LOGIN_PAGE_PATH = '/pages/login/index'

// Storage key for saving redirect path after login
export const STORAGE_KEY_REDIRECT_PATH = 'loginRedirectPath'

const TAB_BAR_PATHS = [
  'pages/home/index',
  'pages/stats/index',
  'pages/ability/index',
  'pages/star-card/index',
  'pages/profile/index'
]

/** 投票/相册/发布：静态标题先停在 Free loding，未登录或无权限直接回活动页 */
const GATED_TITLES: {path: string; title: string; adminOnly?: boolean}[] = [
  {path: 'pages/vote-center/index', title: '投票中心'},
  {path: 'pages/vote-create/index', title: '发起投票'},
  {path: 'pages/vote-detail/index', title: '投票详情'},
  {path: 'pages/gallery/index', title: '群相册'},
  {path: 'pages/album-detail/index', title: '相册详情'},
  {path: 'pages/picui-settings/index', title: '图床设置'},
  {path: 'pages/activity-create/index', title: '发布活动', adminOnly: true},
  {path: 'pages/activity-edit/index', title: '编辑活动', adminOnly: true}
]

function gatedTitle(path: string): {title: string; adminOnly: boolean} | null {
  const normalized = normalizePath(path).split('?')[0]
  const item = GATED_TITLES.find((entry) => normalized.includes(entry.path))
  if (!item) return null
  return {title: item.title, adminOnly: !!item.adminOnly}
}

function normalizePath(path: string): string {
  return path.replace(/^\//, '')
}

function isTabBarPage(path: string): boolean {
  if (!path) return true
  const normalized = normalizePath(path)
  return TAB_BAR_PATHS.some((p) => normalized.includes(p))
}

function isPublicPage(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\//, '').split('?')[0]
  return (
    normalized.includes('user-agreement') ||
    normalized.includes('privacy-policy') ||
    normalized.includes('privacy-inventory') ||
    normalized.includes('login/index')
  )
}

function visibleRoute(): string {
  const pages = Taro.getCurrentPages()
  const top = pages[pages.length - 1]
  if (!top || typeof top !== 'object') return ''
  if (typeof top.route === 'string' && top.route) return top.route
  if (typeof top.__route__ === 'string' && top.__route__) return top.__route__
  return ''
}

/**
 * 未登录引导视图：避免在未登录状态下返回 null 导致页面只显示原生 TabBar 却彻底白屏
 */
function LoginPrompt({onGoLogin}: {onGoLogin: () => void}) {
  const {signInWithWechat} = useAuth()
  const [wechatLoading, setWechatLoading] = useState(false)
  const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

  const handleWechatQuickLogin = async () => {
    if (wechatLoading) return
    setWechatLoading(true)
    try {
      const res = await signInWithWechat()
      if (res.error) {
        Taro.showToast({title: res.error.message || '微信登录失败，请使用账号登录', icon: 'none'})
        onGoLogin()
      } else {
        Taro.showToast({title: '登录成功', icon: 'success'})
      }
    } catch {
      onGoLogin()
    } finally {
      setWechatLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background relative flex flex-col justify-center items-center px-6 pb-20">
      <LogoBg />
      <div className="relative z-10 w-full max-w-sm bg-card rounded-2xl gold-frame p-6 flex flex-col items-center text-center shadow-lg">
        <div className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center shadow-gold mb-4">
          <div className="i-mdi-shield-account text-3xl text-primary-foreground" />
        </div>

        <h2 className="font-heading text-2xl text-foreground">欢迎来到成都自由人 FC</h2>
        <p className="text-lg text-muted-foreground mt-2 leading-relaxed">
          登录后即可查看赛季活动详情、报名接龙、球星卡及全队数据统计
        </p>

        <div className="w-full flex flex-col gap-3 mt-6">
          {isWeapp && (
            <button
              type="button"
              className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-gradient-gold lift-glow"
              onClick={handleWechatQuickLogin}>
              <div className="py-3 px-4 flex items-center justify-center gap-2">
                <div className="i-mdi-wechat text-2xl text-primary-foreground" />
                <span className="text-xl font-medium text-primary-foreground">
                  {wechatLoading ? '微信登录中…' : '微信一键登录'}
                </span>
              </div>
            </button>
          )}

          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl bg-primary lift-glow"
            onClick={onGoLogin}>
            <div className="py-3 px-4 flex items-center justify-center gap-2">
              <div className="i-mdi-account-key text-xl text-primary-foreground" />
              <span className="text-xl text-primary-foreground">账号密码登录 / 注册</span>
            </div>
          </button>
        </div>

        <p className="text-sm text-muted-foreground/70 mt-4">内置测试账号：admin / admin123456</p>
      </div>
    </div>
  )
}

/**
 * Route guard component for authentication protection
 * @warning DO NOT use this component in app.tsx! Wrap pages with withRouteGuard HOC
 *
 * 彻底避免空白方案：
 * 1. TabBar 页面（首页、数据、球星卡、球队成员、我的）无论是否登录，均直接渲染页面内容（children）
 *    未登录时在页面顶部显示优雅轻量提示条，引导登录，绝不拦截或返回 null，彻底避免只剩原生 TabBar 的空白！
 * 2. 私密页面（如创建活动、赛季管理等）在未登录时安全重定向至登录页
 */
function RouteGuard({children}: {children: React.ReactNode}) {
  const {user, profile, loading} = useAuth()
  const pagePathRef = useRef('')
  const instancePath = Taro.getCurrentInstance()?.router?.path || ''
  // 只记录本页首次路径。后台页面重渲染时 getCurrentInstance 指向前台页，不能拿它决定跳转。
  if (!pagePathRef.current && instancePath) pagePathRef.current = instancePath
  const path = pagePathRef.current
  const isTabBar = isTabBarPage(path)
  const isPublic = isPublicPage(path)
  const gated = gatedTitle(path)
  const pageTitle = gated?.title ?? null
  const loginUsername = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || ''
  const isAdminAccount = String(loginUsername).trim().toLowerCase() === 'admin'
  const lacksPageRole = !!gated?.adminOnly && profile?.role !== 'admin'
  const gatedBlocked = !!gated && !loading && (!user || isAdminAccount || lacksPageRole)

  useEffect(() => {
    if (!gatedBlocked) return
    Taro.switchTab({url: '/pages/home/index'})
  }, [gatedBlocked])

  useEffect(() => {
    if (!pageTitle || loading || !user || isAdminAccount || lacksPageRole) return
    Taro.setNavigationBarTitle({title: pageTitle})
  }, [pageTitle, loading, user, isAdminAccount, lacksPageRole])

  useEffect(() => {
    if (loading || user || isTabBar || isPublic || !path || pageTitle) return
    const visible = visibleRoute()
    // 只有当前可见页才允许跳登录。协议页在前台时，底下的页面不能再把它盖掉。
    if (!visible || isPublicPage(visible) || isTabBarPage(visible) || normalizePath(visible) !== normalizePath(path)) return
    try {
      Taro.setStorageSync(STORAGE_KEY_REDIRECT_PATH, path)
    } catch {
      // 忽略本地存储偶发异常
    }
    Taro.navigateTo({url: LOGIN_PAGE_PATH})
  }, [user, loading, isTabBar, isPublic, path, pageTitle])

  if (pageTitle && (loading || !user || isAdminAccount || lacksPageRole)) {
    return <div className="min-h-screen bg-background" />
  }

  if (!user && !isTabBar && !isPublic) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="i-mdi-loading animate-spin text-5xl text-primary" />
        <p className="text-xl text-muted-foreground mt-4">正在前往登录…</p>
      </div>
    )
  }

  return (
    <>
      {!user && isTabBar && !loading && (
        <div
          className="sticky top-0 z-50 bg-primary/95 backdrop-blur text-primary-foreground px-4 py-2.5 flex items-center justify-between shadow-md"
          onClick={() => Taro.navigateTo({url: LOGIN_PAGE_PATH})}
        >
          <div className="flex items-center gap-2">
            <div className="i-mdi-information-outline text-xl" />
            <span className="text-lg">当前未登录，点击登录体验完整功能</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gradient-gold text-primary-foreground text-base font-medium">
            登录
          </div>
        </div>
      )}
      {children}
    </>
  )
}

/**
 * HOC to wrap a component with route guard
 * Usage: export default withRouteGuard(PageComponent)
 */
export function withRouteGuard<P extends object>(Component: React.ComponentType<P>) {
  return function GuardedComponent(props: P) {
    return (
      <RouteGuard>
        <Component {...props} />
      </RouteGuard>
    )
  }
}