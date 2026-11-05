// @title 隐私政策
/**
 * // [compliance] M02 隐私政策查看入口（全文）
 * 路径：个人中心 → 隐私政策（≤4层）
 */

import type React from 'react'

const SECTIONS = [
  {
    title: '一、引言',
    body: '欢迎使用自由人FC球队管家小程序（以下简称"本应用"）。我们非常重视您的个人信息和隐私保护。本《隐私政策》旨在向您说明我们如何收集、使用、存储和保护您的个人信息。请您在使用本应用前，仔细阅读并充分理解本政策的全部内容。'
  },
  {
    title: '二、我们收集的信息',
    body: '为提供球队管理服务，我们可能收集以下信息：\n1. 账号信息：您注册时填写的昵称、头像；\n2. 业务数据：您的出勤记录、比赛数据、能力评分、赛后匿名表现评分、投票记录、装备信息等；赛后匿名评分会保存评分账号用于资格校验和防止重复提交，但不会向队员或应用内管理员展示评分人身份；\n3. 设备信息：为保障服务正常运行所需的设备标识等基础信息。'
  },
  {
    title: '三、信息的使用',
    body: '我们收集的信息将用于：\n1. 提供球队管理、数据统计、海报生成、赛后匿名评分及自动分队等基本业务功能；\n2. 改善和优化产品功能与用户体验；\n3. 保障账号与数据安全。我们不会将您的个人信息用于本政策未载明的其他用途。'
  },
  {
    title: '四、信息的存储与保护',
    body: '您的个人信息存储于安全的服务器中，我们采取合理的技术和管理措施保护您的信息安全，防止信息泄露、丢失或被篡改。我们仅保留为提供服务所必需的期限。'
  },
  {
    title: '五、信息的共享',
    body: '除法律法规要求或为完成服务所必需外，我们不会向第三方共享您的个人信息。涉及第三方服务（如图片存储服务）时，我们仅共享完成该服务所必需的最少信息，并要求其承担保密义务。'
  },
  {
    title: '六、您的权利',
    body: '您有权访问、更正或删除您的个人信息，有权撤回授权同意。如需行使上述权利，可通过"个人中心 → 账号注销"或联系球队管理员处理。'
  },
  {
    title: '七、未成年人保护',
    body: '若您是未成年人，请在监护人陪同下阅读本政策并使用本应用，监护人应帮助您理解相关内容。'
  },
  {
    title: '八、政策更新',
    body: '我们可能会适时修订本隐私政策，修订后的政策将在本应用中公布。若政策发生重大变更，我们将通过适当方式提醒您重新阅读并同意。'
  }
]

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="bg-gradient-primary px-6 py-8">
        <h1 className="font-heading text-3xl text-primary-foreground">隐私政策</h1>
        <p className="text-lg text-primary-foreground/80 mt-2">最后更新：2026年11月</p>
      </div>
      <div className="px-5 py-5 flex flex-col gap-5">
        {SECTIONS.map((s) => (
          <div key={s.title} className="bg-card rounded-2xl border-2 border-border/60 p-4">
            <h2 className="font-heading text-xl text-foreground mb-2">{s.title}</h2>
            <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PrivacyPolicy