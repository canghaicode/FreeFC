import {Component} from 'react'
import type {ReactNode} from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/**
 * 全局错误边界：捕获任意子组件渲染期异常，避免整页白屏（微信小程序 tabBar 为原生层，
 * 即使 JS 崩溃仍会显示，表现为"只有 tabBar 没内容"）。捕获后展示友好提示与错误信息。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {hasError: false, message: ''}

  static getDerivedStateFromError(error: Error): State {
    return {hasError: true, message: error?.message || String(error || '')}
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error?.message || error, error?.stack || '')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8">
          <div className="i-mdi-alert-circle-outline text-6xl text-destructive" />
          <p className="text-2xl text-foreground mt-4">页面加载异常</p>
          <p className="text-lg text-muted-foreground mt-2 text-center break-all">{this.state.message}</p>
          <p className="text-base text-muted-foreground mt-6">请尝试下拉刷新或重新进入小程序</p>
        </div>
      )
    }
    return this.props.children
  }
}