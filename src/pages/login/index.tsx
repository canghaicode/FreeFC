// @title 登录
import {useState} from 'react'
import Taro from '@tarojs/taro'
import {useAuth} from '@/contexts/AuthContext'
import {STORAGE_KEY_REDIRECT_PATH} from '@/components/RouteGuard'

const TAB_BAR_PATHS = [
  '/pages/home/index',
  '/pages/stats/index',
  '/pages/ability/index',
  '/pages/star-card/index',
  '/pages/profile/index'
]

export default function Login() {
  const {signInWithUsername, signUpWithUsername, signInWithWechat} = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /** 登录成功后回到进入前的页面 */
  const redirectAfterLogin = () => {
    let stored = ''
    try {
      stored = (Taro.getStorageSync(STORAGE_KEY_REDIRECT_PATH) as string) || ''
      Taro.removeStorageSync(STORAGE_KEY_REDIRECT_PATH)
    } catch {
      // 忽略存储读取异常
    }
    const path = stored.startsWith('/') ? stored : `/${stored}`
    if (!stored || path.includes('login') || TAB_BAR_PATHS.some((p) => path.includes(p))) {
      const target = !stored || path.includes('login') ? '/pages/home/index' : path
      Taro.switchTab({
        url: target,
        fail: () => {
          Taro.switchTab({url: '/pages/home/index'})
        }
      })
    } else {
      Taro.redirectTo({
        url: path,
        fail: () => {
          Taro.switchTab({url: '/pages/home/index'})
        }
      })
    }
  }

  const checkAgreed = (): boolean => {
    if (!agreed) {
      Taro.showToast({title: '请先勾选用户协议', icon: 'none'})
      return false
    }
    return true
  }

  const handleUsernameSubmit = async () => {
    if (submitting) return
    if (!checkAgreed()) return
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) {
      Taro.showToast({title: '用户名需2-20位字母、数字或下划线', icon: 'none'})
      return
    }
    if (password.length < 6) {
      Taro.showToast({title: '密码至少6位', icon: 'none'})
      return
    }
    setSubmitting(true)
    try {
      const result =
        mode === 'login'
          ? await signInWithUsername(username, password)
          : await signUpWithUsername(username, password)
      if (result.error) {
        Taro.showToast({title: result.error.message || '操作失败', icon: 'none'})
        return
      }
      if (mode === 'register') {
        Taro.showToast({title: '注册成功', icon: 'success'})
      }
      redirectAfterLogin()
    } finally {
      setSubmitting(false)
    }
  }

  const handleWechatLogin = async () => {
    if (submitting) return
    if (!checkAgreed()) return
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
      Taro.showToast({title: '网页端请使用用户名密码登录', icon: 'none'})
      return
    }
    setSubmitting(true)
    try {
      const result = await signInWithWechat()
      if (result.error) {
        Taro.showToast({title: result.error.message || '微信登录失败', icon: 'none'})
        return
      }
      redirectAfterLogin()
    } finally {
      setSubmitting(false)
    }
  }
  const handleSkipLogin = () => {
    try {
      Taro.removeStorageSync(STORAGE_KEY_REDIRECT_PATH)
    } catch {
      // 忽略清理跳转记录异常
    }
    Taro.switchTab({
      url: '/pages/home/index',
      fail: () => Taro.reLaunch({url: '/pages/home/index'})
    })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 拱形顶饰（新艺术运动海报式） */}
      <div className="bg-gradient-primary arch-top px-6 pt-16 pb-14 rounded-b-[2.5rem]">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center shadow-gold float-slow">
            <div className="i-mdi-soccer text-4xl text-primary-foreground" />
          </div>
        </div>
        <h1 className="font-heading text-4xl text-primary-foreground text-center mt-4">球队管家</h1>
        <p className="text-xl text-primary-foreground/80 text-center mt-2">报名接龙 · 赛季数据 · 一站管理</p>
      </div>

      <div className="px-5 -mt-6 flex-1 pb-8">
        <div className="bg-card rounded-2xl gold-frame p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-2xl text-foreground">
              {mode === 'login' ? '账号登录' : '注册新账号'}
            </h2>
            <button
              type="button"
              className="flex items-center leading-none"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              <span className="text-xl text-primary gold-underline">
                {mode === 'login' ? '去注册' : '去登录'}
              </span>
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">用户名</span>
              <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="字母、数字或下划线"
                  value={username}
                  onInput={(e) => {
                    const ev = e as any
                    setUsername(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xl text-muted-foreground">密码</span>
              <div className="border-2 border-input rounded-xl px-4 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="至少6位"
                  type="password"
                  {...{password: true}}
                  value={password}
                  onInput={(e) => {
                    const ev = e as any
                    setPassword(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              className={`w-full flex items-center justify-center leading-none break-keep rounded-xl mt-1 ${
                submitting ? 'bg-primary/50' : 'bg-primary lift-glow'
              }`}
              onClick={handleUsernameSubmit}
            >
              <div className="py-3 px-6 text-xl text-primary-foreground">
                {submitting ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
              </div>
            </button>
          </div>

          <div className="vine-divider my-5" />

          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-primary/30 bg-secondary/40 lift-glow"
            onClick={handleWechatLogin}
          >
            <div className="py-3 px-4 flex items-center justify-center gap-2">
              <div className="i-mdi-wechat text-2xl text-primary" />
              <span className="text-xl text-primary">微信一键登录</span>
            </div>
          </button>

          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl border border-dashed border-primary/40 mt-3"
            onClick={() => {
              setUsername('admin')
              setPassword('admin123456')
              setAgreed(true)
              setMode('login')
              Taro.showToast({title: '已填入体验账号', icon: 'none'})
            }}
          >
            <div className="py-2.5 px-4 flex items-center justify-center gap-2">
              <div className="i-mdi-account-check text-xl text-primary" />
              <span className="text-lg text-primary">一键填入管理员测试账号</span>
            </div>
          </button>
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none break-keep rounded-xl border-2 border-border/60 bg-card mt-3"
            onClick={handleSkipLogin}
          >
            <div className="py-2.5 px-4 flex items-center justify-center gap-2">
              <div className="i-mdi-arrow-left text-xl text-muted-foreground" />
              <span className="text-lg text-muted-foreground">暂不登录</span>
            </div>
          </button>

          <div className="flex items-start gap-2 mt-5">
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                agreed ? 'bg-primary border-2 border-primary' : 'border-2 border-border bg-card'
              }`}
              onClick={() => setAgreed(!agreed)}
            >
              {agreed && <div className="i-mdi-check text-lg text-primary-foreground" />}
            </div>
            <div className="flex flex-wrap text-lg text-muted-foreground">
              <span onClick={() => setAgreed(!agreed)}>我已阅读并同意</span>
              <span
                className="text-primary underline"
                onClick={() => Taro.navigateTo({url: '/pages/user-agreement/index'})}
              >
                《用户协议》
              </span>
              <span>和</span>
              <span
                className="text-primary underline"
                onClick={() => Taro.navigateTo({url: '/pages/privacy-policy/index'})}
              >
                《隐私政策》
              </span>
            </div>
          </div>
        </div>

        <p className="text-lg text-muted-foreground text-center mt-6">
          新队员注册后，请在「我的」中完善号码与位置
        </p>
      </div>
    </div>
  )
}
