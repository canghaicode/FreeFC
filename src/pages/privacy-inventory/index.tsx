// @title 隐私清单
/**
 * // [compliance] M07 双清单查看入口
 * 已收集个人信息清单 + 第三方信息共享清单
 */

import type React from 'react'
import {useState} from 'react'
import Taro from '@tarojs/taro'


type CollectedItem = {
  type: string
  name: string
  purpose: string
  scene: string
  collected: string
  content: string
}

const COLLECTED: CollectedItem[] = [
  {type: '账号信息', name: '昵称', purpose: '球队成员身份识别', scene: '注册/登录', collected: '是', content: '用户填写的昵称'},
  {type: '账号信息', name: '头像', purpose: '成员形象展示', scene: '注册/登录', collected: '是', content: '用户上传的头像图片'},
  {type: '业务数据', name: '出勤记录', purpose: '统计出勤率与等级', scene: '活动报名/签到', collected: '是', content: '报名与签到状态'},
  {type: '业务数据', name: '比赛数据', purpose: '生成球星卡与能力评分', scene: '填报比赛数据', collected: '是', content: '进球/助攻/防守等数据'},
  {type: '业务数据', name: '能力评分', purpose: '展示六维能力与成长', scene: '球星卡页面', collected: '是', content: '速度/射门/传球等评分'},
  {type: '业务数据', name: '投票记录', purpose: '队内事务表决', scene: '投票中心', collected: '是', content: '投票选项与时间'},
  {type: '业务数据', name: '装备信息', purpose: '装备系统加成计算', scene: '装备页面', collected: '是', content: '已购装备与装备状态'}
]

type ThirdPartyItem = {
  company: string
  service: string
  info: string
  purpose: string
  scene: string
  method: string
  link: string
}

const THIRD_PARTY: ThirdPartyItem[] = [
  {
    company: 'Supabase',
    service: '云数据库与存储服务',
    info: '业务数据、用户上传的图片',
    purpose: '数据存储与读取',
    scene: '所有数据读写操作',
    method: '加密传输（HTTPS）',
    link: 'https://supabase.com/privacy'
  },
  {
    company: '微信开放平台',
    service: '小程序运行环境',
    info: '设备信息、登录凭证',
    purpose: '提供小程序运行与登录能力',
    scene: '应用启动与登录',
    method: '微信官方接口',
    link: 'https://weixin.qq.com/cgi-bin/readtemplate?t=weixin_agreement&s=privacy'
  }
]

const PrivacyInventory: React.FC = () => {
  const [tab, setTab] = useState<'collected' | 'third'>('collected')

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="bg-gradient-primary px-6 py-8">
        <h1 className="font-heading text-3xl text-primary-foreground">隐私信息清单</h1>
        <p className="text-lg text-primary-foreground/80 mt-2">查看本应用收集与共享的个人信息</p>
      </div>

      {/* Tab 切换 */}
      <div className="px-5 -mt-5">
        <div className="bg-card rounded-2xl gold-frame p-1.5 flex flex-row gap-1">
          <button
            type="button"
            className={`flex-1 flex items-center justify-center rounded-xl transition ${tab === 'collected' ? 'bg-primary' : ''}`}
            onClick={() => setTab('collected')}
          >
            <div className="py-2.5">
              <span className={`text-lg ${tab === 'collected' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>已收集信息</span>
            </div>
          </button>
          <button
            type="button"
            className={`flex-1 flex items-center justify-center rounded-xl transition ${tab === 'third' ? 'bg-primary' : ''}`}
            onClick={() => setTab('third')}
          >
            <div className="py-2.5">
              <span className={`text-lg ${tab === 'third' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>第三方共享</span>
            </div>
          </button>
        </div>
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">
        {tab === 'collected'
          ? COLLECTED.map((item, idx) => (
              <div key={idx} className="bg-card rounded-2xl border-2 border-border/60 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-base">{item.type}</span>
                  <span className="text-xl text-foreground font-medium">{item.name}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">使用目的</span>
                    <span className="flex-1 text-lg text-foreground">{item.purpose}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">使用场景</span>
                    <span className="flex-1 text-lg text-foreground">{item.scene}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">收集情况</span>
                    <span className="flex-1 text-lg text-foreground">{item.collected}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">信息内容</span>
                    <span className="flex-1 text-lg text-foreground">{item.content}</span>
                  </div>
                </div>
              </div>
            ))
          : THIRD_PARTY.map((item, idx) => (
              <div key={idx} className="bg-card rounded-2xl border-2 border-border/60 p-4">
                <h3 className="font-heading text-xl text-foreground mb-2">{item.company}</h3>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">服务类型</span>
                    <span className="flex-1 text-lg text-foreground">{item.service}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">共享信息</span>
                    <span className="flex-1 text-lg text-foreground">{item.info}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">使用目的</span>
                    <span className="flex-1 text-lg text-foreground">{item.purpose}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">使用场景</span>
                    <span className="flex-1 text-lg text-foreground">{item.scene}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">共享方式</span>
                    <span className="flex-1 text-lg text-foreground">{item.method}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-base text-muted-foreground min-w-[64px]">隐私政策</span>
                    <span
                      className="flex-1 text-lg text-primary underline break-all"
                      onClick={() => Taro.setClipboardData({data: item.link})}
                    >
                      复制链接
                    </span>
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>
  )
}

export default PrivacyInventory