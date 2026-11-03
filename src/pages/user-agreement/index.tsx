// @title 用户协议
/**
 * 登录页用户协议查看入口。
 * 该页面不要求登录，保证用户可以在注册或登录前阅读协议。
 */

import type React from 'react'

const SECTIONS = [
  {
    title: '一、协议范围',
    body: '本协议适用于您使用自由人FC球队管家小程序及相关服务的过程。您点击同意、注册账号或继续使用本应用，即表示您已阅读并同意本协议。'
  },
  {
    title: '二、账号使用',
    body: '您应提供真实、准确、完整的注册信息，并妥善保管账号和密码。账号仅限本人使用，不得转让、出租或以其他方式交由他人使用。发现账号异常时，请及时联系球队管理员。'
  },
  {
    title: '三、活动报名与使用规范',
    body: '您应根据实际情况报名、取消活动并遵守活动公告及球队约定。发布或提交的内容不得违反法律法规、公共秩序或他人合法权益，不得利用本应用从事骚扰、欺诈或其他不当行为。'
  },
  {
    title: '四、数据与隐私',
    body: '我们会按照《隐私政策》处理您在使用服务过程中产生的个人信息。请在使用本应用前同时阅读《隐私政策》，了解信息收集、使用、存储、共享及您的相关权利。'
  },
  {
    title: '五、服务变更与中止',
    body: '我们会持续维护和改进服务，但可能因系统维护、网络故障、第三方服务变化或其他合理原因调整、中断部分功能。发生重要变更时，我们会通过应用内适当方式提示。'
  },
  {
    title: '六、协议更新',
    body: '我们可能根据业务变化或法律法规要求更新本协议。更新后的协议将在本应用中公布；如您继续使用服务，视为接受更新后的协议。'
  }
]

const UserAgreement: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="bg-gradient-primary px-6 py-8">
        <h1 className="font-heading text-3xl text-primary-foreground">用户协议</h1>
        <p className="text-lg text-primary-foreground/80 mt-2">自由人FC球队管家</p>
      </div>
      <div className="px-5 py-5 flex flex-col gap-5">
        {SECTIONS.map((section) => (
          <div key={section.title} className="bg-card rounded-2xl border-2 border-border/60 p-4">
            <h2 className="font-heading text-xl text-foreground mb-2">{section.title}</h2>
            <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default UserAgreement
