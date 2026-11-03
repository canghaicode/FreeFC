import {useState} from 'react'
import {Image} from '@tarojs/components'
const logoBg = '/assets/logo-bg.jpg'

/** 远程队徽地址（供分享海报 Canvas 绘制使用） */
export const LOGO_URL = 'https://miaoda-conversation-file.cdn.bcebos.com/user-ekxo3uclrw1s/app-ekxp48jlavpd/20260923/f487b3b24ed9311f115616c7702869b4_1790155063719.jpg'

/** 全局队徽虚化背景（成都自由人 FC）
 *  使用本地资源渲染，避免 CDN 瞬时抖动触发图片加载错误；万一失败则静默卸载 */
export function LogoBg() {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <Image
        src={logoBg}
        mode="aspectFit"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.09]"
        style={{width: '120vw', height: '120vw'}}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
