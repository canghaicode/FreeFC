// @title 球队章程

import {Image, ScrollView} from '@tarojs/components'
import Taro from '@tarojs/taro'
import type {ReactNode} from 'react'
import {LOGO_URL} from '@/components/LogoBg'
import {withRouteGuard} from '@/components/RouteGuard'
import './index.scss'

const CHAPTERS = [
  {id: 'identity', label: '身份'},
  {id: 'culture', label: '文化'},
  {id: 'rules', label: '规则'},
  {id: 'org', label: '组织'},
  {id: 'matches', label: '约球'},
  {id: 'fund', label: '基金'},
  {id: 'succession', label: '继任'},
  {id: 'appendix', label: '附则'},
] as const

const VALUES = [
  {title: '纯粹', text: '享受足球和团队带来的支撑，不做舆论之争，专注球场和自我提升。'},
  {title: '尊重', text: '尊重球队、队友、对手、规则，以及裁判（如有）。'},
  {title: '包容', text: '无论水平高低，只要热爱足球、认同球队文化，都是兄弟姐妹。'},
  {title: '担当', text: '享受权利，承担义务。球队的事，就是每个人的事。'},
]

const STYLE_POINTS = [
  '不埋怨，多鼓励。失误是足球的一部分。队友失误，拉他一把，比责怪他更能赢得尊重。',
  '不黏球，多传球。我们踢的是团队足球，不是个人秀。分享球权，让每个人都能参与进来。',
  '不斗气，多交流。场上喊一声「我的」，比事后争论更有用。沟通，是最好的战术。',
  '不伤人，多保护。安全第一。任何恶意的、危险的、带有报复性质的动作，在本球队绝不允许。一旦发现，直接请出。',
]

const RED_LINES = [
  '场上恶意伤人、蓄意报复。',
  '与队友发生肢体冲突。',
  '严重侮辱、歧视、骚扰其他队员。',
  '破坏球队氛围、恶意破坏公共财物或球队装备。',
  '其他经管理组多数认定，严重违背球队宗旨及价值观的行为。',
]

const FUND_SPLITS = [
  {name: '福利基金', share: '约 43%', amount: '预计 1300', width: '43%', note: '给全体正式队员发放福利。首期主要是每场 9 折场地费。'},
  {name: '活动基金', share: '约 17%', amount: '预计 500', width: '17%', note: '购买药品、足球、分队背心、赛季奖励等公共物资。'},
  {name: '运营基金', share: '约 40%', amount: '预计 1200', width: '40%', note: '支持为爱发电的贡献者，如队长、管理员、摄影。'},
]

function jumpTo(id: string) {
  Taro.pageScrollTo({selector: `#charter-${id}`, duration: 240})
}

function Chapter({id, index, title, children}: {id: string; index: string; title: string; children: ReactNode}) {
  return (
    <div id={`charter-${id}`} className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
      <div>
        <p className="text-base text-primary">{index}</p>
        <h2 className="font-heading text-2xl text-foreground mt-1">{title}</h2>
      </div>
      <div className="vine-divider" />
      {children}
    </div>
  )
}

function Article({no, title, children}: {no: string; title: string; children: ReactNode}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xl text-foreground">
        <span className="text-primary">{no}</span>
        <span> {title}</span>
      </h3>
      {children}
    </div>
  )
}

function Points({items}: {items: string[]}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={item} className="flex items-start gap-2">
          <span className="text-lg text-primary shrink-0">{index + 1}.</span>
          <p className="text-lg text-muted-foreground leading-relaxed">{item}</p>
        </div>
      ))}
    </div>
  )
}

function CharterPage() {
  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="bg-gradient-primary px-6 pt-8 pb-16">
        <p className="text-base text-primary-foreground/70">章程 1.1</p>
        <h1 className="font-heading text-3xl text-primary-foreground mt-2">自由人 FC</h1>
        <p className="text-lg text-primary-foreground/80 mt-1">Chengdu Liberty Football Club</p>
        <p className="text-xl text-primary-foreground mt-4">Live For Passion</p>
        <p className="text-base text-primary-foreground/70 mt-1">为热爱而生</p>
      </div>

      <div className="px-5 -mt-8 flex flex-col gap-4">
        <div className="bg-card rounded-2xl gold-frame p-5 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Image src={LOGO_URL} mode="aspectFit" className="w-16 h-16 rounded-2xl bg-muted shrink-0" />
            <div className="min-w-0">
              <h2 className="font-heading text-2xl text-foreground">成都自由人足球俱乐部</h2>
              <p className="text-base text-muted-foreground mt-1">Chengdu Liberty FC · 队徽第一次征集暂定</p>
            </div>
          </div>
          <div className="flex flex-row flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full bg-primary/10 text-base text-primary">2026.05.29 成立</span>
            <span className="px-3 py-1 rounded-full bg-accent/20 text-base text-accent-foreground">2026.08.17 生效</span>
            <span className="px-3 py-1 rounded-full bg-muted text-base text-muted-foreground">2026.10.14 更新</span>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed">
            由足球爱好者自发组建、自主管理的非营利性草根足球社群。资金来自球队运营、对外合作和队员自筹，全部用于公共支出和可持续发展。
          </p>
        </div>

        <ScrollView scrollX className="whitespace-nowrap">
          <div className="flex flex-row gap-2 pb-1">
            {CHAPTERS.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                className="shrink-0 rounded-full border-2 border-primary/30 bg-card px-4 py-2"
                onClick={() => jumpTo(chapter.id)}
              >
                <span className="text-lg text-primary">{chapter.label}</span>
              </button>
            ))}
          </div>
        </ScrollView>

        <Chapter id="identity" index="第一章" title="球队身份">
          <Article no="第一条" title="球队名称">
            <p className="text-lg text-muted-foreground leading-relaxed">正式队名：成都自由人足球俱乐部</p>
            <p className="text-lg text-muted-foreground leading-relaxed">英文全称：Chengdu Liberty Football Club</p>
            <p className="text-lg text-muted-foreground leading-relaxed">英文缩写：Chengdu Liberty FC</p>
          </Article>
          <Article no="第二条" title="球队 LOGO">
            <p className="text-lg text-muted-foreground leading-relaxed">第一次征集暂定。</p>
          </Article>
          <Article no="第三条" title="成立时间">
            <p className="text-lg text-muted-foreground leading-relaxed">2026 年 5 月 29 日。</p>
          </Article>
          <Article no="第四条" title="球队性质">
            <p className="text-lg text-muted-foreground leading-relaxed">
              本球队是由足球爱好者自发组建、自主管理的非营利性草根足球社群。球队资金来源于球队运营、对外合作及队员自筹，全部用于球队公共支出和可持续发展。
            </p>
          </Article>
        </Chapter>

        <Chapter id="culture" index="第二章" title="球队文化">
          <Article no="第五条" title="球队宗旨">
            <p className="text-lg text-muted-foreground leading-relaxed">
              Live For Passion（为热爱而生），致力于让更多球迷有更好的运动体验。
            </p>
          </Article>
          <Article no="第六条" title="核心价值观">
            <div className="flex flex-row flex-wrap gap-2">
              {VALUES.map((value) => (
                <div key={value.title} className="w-[48%] bg-muted/50 rounded-xl p-3">
                  <h4 className="font-heading text-xl text-foreground">{value.title}</h4>
                  <p className="text-base text-muted-foreground leading-relaxed mt-1">{value.text}</p>
                </div>
              ))}
            </div>
          </Article>
          <Article no="第七条" title="球风倡议">
            <Points items={STYLE_POINTS} />
            <div className="rounded-xl bg-accent/15 px-3 py-3">
              <p className="text-lg text-foreground leading-relaxed">
                无论哪位队员取得进球，必须与其他队友击掌庆祝，队友需热情回应。若无主动击掌或回应，罚守门一轮。
              </p>
            </div>
          </Article>
        </Chapter>

        <Chapter id="rules" index="第三章" title="球队规则">
          <Article no="第八条" title="队员身份">
            <div className="flex flex-col gap-2">
              <div className="rounded-xl border-2 border-border/60 p-3">
                <h4 className="text-xl text-foreground">兴趣成员</h4>
                <p className="text-lg text-muted-foreground leading-relaxed mt-1">
                  新入群、尚未参与过活动的成员。至少参加一次队内训练，并参加一次队内活动（可享受 9 折优惠）后，可转为正式队员，拥有赛季徽章。
                </p>
              </div>
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                <h4 className="text-xl text-primary">正式队员</h4>
                <p className="text-lg text-muted-foreground leading-relaxed mt-1">
                  享受 9 折场地费优惠，拥有参与对外比赛、队内投票等正式队员专属权益。
                </p>
              </div>
            </div>
          </Article>
          <Article no="第九条" title="队员权利">
            <Points
              items={[
                '以 9 折优惠价格参加队内组织的所有活动。',
                '优先报名参加球队对外友谊赛及其他赛事。',
                '参与球队重大事务的讨论与建议。',
                '有权查阅球队公共基金的收支账目。',
                '自愿退出球队。',
              ]}
            />
          </Article>
          <Article no="第十条" title="队员义务">
            <Points
              items={[
                '遵守本章程及球队其他管理规定。',
                '积极参与球队活动，维护球队团结与声誉。',
                '按时缴纳活动费用，参加活动当天缴纳。',
                '在活动中听从队长及相应负责人的合理调度。',
                '对外代表球队时，维护球队形象。',
              ]}
            />
          </Article>
          <Article no="第十一条" title="纪律红线">
            <div className="rounded-xl bg-destructive/10 border-2 border-destructive/30 p-3 flex flex-col gap-2">
              <p className="text-lg text-destructive leading-relaxed">以下行为，一经发现，直接取消队员身份并请出球队。</p>
              {RED_LINES.map((line) => (
                <p key={line} className="text-lg text-foreground leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </Article>
          <Article no="第十二条" title="退出机制">
            <Points
              items={[
                '自愿退出：队员可在任何时候选择退出。已购赛季卡按原价扣除已消费部分后，退还余款。',
                '劝退：对于从不参加活动，或行为与本球队文化严重不符的队员，球队管理有权协商后劝退。',
                '清退：对触碰球队红线、拒不退出的球员，球队管理有权强制退队。',
              ]}
            />
          </Article>
        </Chapter>

        <Chapter id="org" index="第四章" title="球队组织架构">
          <Article no="第十三条" title="管理组成员">
            <p className="text-lg text-muted-foreground leading-relaxed">
              球队管理由球队队长、球队管理员、场上队长等若干核心共建伙伴组成，是球队的最高日常决策机构。
            </p>
          </Article>
          <Article no="第十四条" title="队长">
            <p className="text-lg text-muted-foreground leading-relaxed">
              队长是球队的代表人，由创始队长或经程序选出的继任队长担任。
            </p>
            <Points
              items={[
                '协商制定球队发展战略与活动策划，总统筹。',
                '负责对外联络，包括场地谈判、对外约战、争取赞助与合作。',
                '管理球队公共基金的收支与公示。',
                '维护球队核心价值观，处理重大队内事务。',
                '主持球队管理协商讨论。',
              ]}
            />
          </Article>
          <Article no="第十五条" title="球队管理">
            <p className="text-lg text-muted-foreground leading-relaxed">
              根据球队发展需要设定，可由队长兼任或授权其他队员担任。
            </p>
            <Points
              items={[
                '球队群运营：确认场地信息、发布报名接龙和投票、更新数据文档、接收新成员。',
                '球队社群运营：帮助成员建立友谊，促进和维护社群氛围。',
                '球队教练团：组织线下活动，从技术、战术、后勤支持球队发展。',
                '球队记录：费用收取与统计，记录球队重大核心事件。',
              ]}
            />
          </Article>
          <Article no="第十六条" title="其他核心成员">
            <Points
              items={[
                '摄影：为活动拍摄、录像，留下精彩瞬间，并支持球队对外形象展示。',
                '媒体运营：在社交媒体展示球队形象、吸纳新成员、增加球队收入（如有可能）。',
                '其他角色：根据发展需要，队长可临时增设其他核心成员。',
                '场上队长：过去 2 个月内有 2 次以上出场、球品可靠、具备一定比赛经验者，可申请或由球队管理共同认定。授予队长袖标，在比赛现场组织球队成员。',
              ]}
            />
          </Article>
        </Chapter>

        <Chapter id="matches" index="第五章" title="约球制度">
          <Article no="第十六条" title="队内活动">
            <Points
              items={[
                '球队每周固定组织队内活动，具体时段和场地由群运营提前在群内公布。',
                '参加活动须在报名接龙内按时报名。报名截止后统计名单，根据活动组织形式确定分队方式。',
                '活动费用按场地实际费用 AA 计算，正式队员享受 9 折优惠。',
              ]}
            />
          </Article>
          <Article no="第十七条" title="对外比赛">
            <Points
              items={[
                '由队长负责联系和确认对外友谊赛或其他赛事。',
                '对外比赛的参与名额，优先向正式队员开放。',
                '对外比赛的费用及相关安排，由队长赛前公布。',
                '对外 7 人及以上场地比赛中，现场由场上队长负责组织协同。场上队长有权在报名发布时保留 2 个名额，用作战术补充。',
              ]}
            />
          </Article>
        </Chapter>

        <Chapter id="fund" index="第六章" title="球队基金制度">
          <Article no="第十八条" title="基金来源">
            <p className="text-lg text-muted-foreground leading-relaxed">
              首期资金由首任队长 Leo（何明）个人垫付 1 万元，与场地方达成「充 1 万送 3000」的长期合作而产生。基金有风险。后续资金可由继任队长按同样模式续充，或通过赞助、捐赠等其他合法方式获得。
            </p>
          </Article>
          <Article no="第十九条" title="基金分配">
            <p className="text-lg text-muted-foreground leading-relaxed">
              每个充值周期（从费用充值到余额归 0）产生的赠金及其他收入，按以下比例分配。机动备用金按需保留，应对突发开支；周期结束未用则顺延至下一周期。
            </p>
            <div className="flex flex-col gap-3">
              {FUND_SPLITS.map((item) => (
                <div key={item.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg text-foreground">{item.name}</span>
                    <span className="text-base text-primary shrink-0">{item.share} · {item.amount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-gold rounded-full" style={{width: item.width}} />
                  </div>
                  <p className="text-base text-muted-foreground leading-relaxed">{item.note}</p>
                </div>
              ))}
            </div>
          </Article>
          <Article no="第二十条" title="运营基金">
            <p className="text-lg text-muted-foreground leading-relaxed">主要用于贡献奖励，不指定个人。当个充值周期结束后，根据贡献发放。</p>
            <Points
              items={[
                '队长：每周期预算 800 元。履行队长职责、管理垫资风险、统筹球队发展运营。',
                '群运营：每周期预算 300 元。确认场地、发接龙、收钱、球队记录。',
                '摄影、媒体运营：每周期预算 200 元。现场拍照、录视频、提供素材。',
              ]}
            />
          </Article>
          <Article no="第二十一条" title="财务公开">
            <p className="text-lg text-muted-foreground leading-relaxed">
              所有基金收支实时记录于公开的在线账本，任何队员均可随时查看。每一笔支出在球队群内公示。
            </p>
          </Article>
          <Article no="第二十二条" title="垫资与回收">
            <p className="text-lg text-muted-foreground leading-relaxed">
              队长垫付的本金，是球队与场地方达成合作的周转资金。合作终止时，该本金可全额收回。奖励补贴是对队长投入精力的合理补贴。继任队长应充分理解此模式的风险与回报，自愿承担相应责任。
            </p>
          </Article>
        </Chapter>

        <Chapter id="succession" index="第七章" title="队长继任制度">
          <Article no="第二十三条" title="继任资格">
            <Points
              items={[
                '热爱足球，是球队正式队员，对球队有深厚感情。',
                '认同本球队的宗旨、文化与制度。',
                '有意愿、有能力承担队长的垫资责任与管理职责。',
                '获得 1/4 以上球队成员投票支持。',
              ]}
            />
          </Article>
          <Article no="第二十四条" title="继任模式">
            <div className="flex flex-col gap-2">
              {[
                ['A', '全责模式', '个人垫付 100%。'],
                ['B', '共担模式', '个人垫付不低于 20%，剩余部分由球队管理或核心队员众筹。'],
                ['C', '基金模式', '由球队公共基金垫付（如有），管理酬劳全部回流公共基金。'],
              ].map(([mark, name, text]) => (
                <div key={mark} className="flex items-start gap-3 rounded-xl bg-muted/40 p-3">
                  <span className="w-8 h-8 rounded-full bg-gradient-gold text-primary-foreground flex items-center justify-center font-heading text-lg shrink-0">
                    {mark}
                  </span>
                  <div>
                    <h4 className="text-xl text-foreground">{name}</h4>
                    <p className="text-lg text-muted-foreground leading-relaxed mt-1">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Article>
          <Article no="第二十五条" title="交接程序">
            <Points
              items={[
                '队长卸任前，应提前与继任者完成交接。',
                '交接内容包括球队基金账本、场地方联系方式、管理组权限、相关账号密码等。',
                '队长卸任后，原垫付本金由其本人收回。继任队长按所选择模式注入新的垫资，开启新周期。',
              ]}
            />
          </Article>
        </Chapter>

        <Chapter id="appendix" index="第八章" title="附则">
          <Article no="第二十六条" title="章程修订">
            <p className="text-lg text-muted-foreground leading-relaxed">
              本章程由球队管理负责解释和修订。重大修订须经球队管理多数同意，并向全体正式队员公示。
            </p>
          </Article>
          <Article no="第二十七条" title="生效日期">
            <p className="text-lg text-muted-foreground leading-relaxed">
              本章程自 2026 年 8 月 17 日起生效，试行一个周期。试行期满后，根据实际情况修订完善。
            </p>
          </Article>
          <Article no="第二十八条" title="队长留言">
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-lg text-foreground leading-relaxed">
                当时建群的时候只是想找到志同道合的队友，一起玩得开心一点，没想到竟然真的有建队的一天。期间也会有感到麻烦的时候，是当初那群「没事，等你慢慢来」的老哥、「遇到自由人太好了」的新队员给了我继续的力量。没准「自由人」可以成为一个百年俱乐部？感谢足球、感谢热爱，热爱可抵岁月漫长。
              </p>
              <p className="text-base text-muted-foreground mt-3">首任队长 何明 · 未完待续</p>
            </div>
          </Article>
          <Article no="第二十九条" title="球队瞬间">
            <p className="text-lg text-muted-foreground leading-relaxed">
              2026 年 9 月 23 日，管理员 Seven 手搓了我们自己的小程序。甭管有多少 bug，自家的娃到底是要可爱一些。
            </p>
          </Article>
        </Chapter>

        <p className="text-base text-muted-foreground text-center pb-4">首任队长 何明 · 章程 1.1 · 2026 年 10 月 14 日更新</p>
      </div>
    </div>
  )
}

export default withRouteGuard(CharterPage)
