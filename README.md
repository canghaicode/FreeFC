# 成都自由人FC · 球队管家小程序

基于 Taro + React + TypeScript 的微信球队管理小程序,覆盖活动报名、分队结算、MVP 统计、战术下发闭环、评分排名、群相册、装备系统与球员能力评分等场景。

## 技术栈

- **框架**:Taro 4(vite 编译)+ React 18 + TypeScript
- **样式**:Tailwind CSS(weapp-tailwindcss)+ Sass
- **后端**:Supabase(PostgreSQL、RLS 权限、Edge Functions)
- **工程**:pnpm、Biome

## 目录结构

```
.
├── config/                     # Taro 编译配置(开发/生产/自定义 lint 配置)
├── docs/                       # 需求与产品设计文档
├── scripts/                    # 校验脚本(权限、图标路径、导航、构建测试)
├── src/
│   ├── app.config.ts           # Taro 应用配置:路由、tabBar、分包
│   ├── app.tsx                 # 应用入口(挂载全局 Provider)
│   ├── assets/                 # 静态资源:tabBar 图标、背景图
│   ├── client/                 # Supabase 客户端(全项目统一从这里引入)
│   ├── components/             # 公共组件(头像、雷达图、海报、战术视图等)
│   ├── constants/              # 业务常量(战术线类型、视角模式等)
│   ├── contexts/               # React Context(登录态 AuthContext、隐私授权)
│   ├── db/                     # 数据库访问层:所有 Supabase 调用集中在此
│   ├── hooks/                  # 自定义 Hook(后台刷新、tabBar 页面类等)
│   ├── pages/                  # 页面目录,每个子目录对应 app.config.ts 中的一条路由
│   │   ├── home/               #   首页(活动列表)
│   │   ├── activity-create/    #   发起活动
│   │   ├── activity-detail/    #   活动详情与报名
│   │   ├── activity-edit/      #   编辑活动
│   │   ├── lineup/             #   阵容排布
│   │   ├── tactics-board/      #   战术板(绘制/下发/反馈闭环)
│   │   ├── tactics-manage/     #   战术管理
│   │   ├── squad/              #   球队成员
│   │   ├── profile/            #   我的(个人主页 tab)
│   │   ├── profile-edit/       #   编辑资料
│   │   ├── stats/              #   数据榜单(MVP 等)
│   │   ├── rating/             #   评分中心
│   │   ├── ability/            #   能力评分与 FIFA 技能
│   │   ├── star-card/          #   球星卡
│   │   ├── captain-admin/      #   队长管理台
│   │   ├── home-team/          #   主队管理
│   │   ├── season-manage/      #   赛季管理
│   │   ├── match-report/       #   赛后战报
│   │   ├── vote-center/        #   投票列表
│   │   ├── vote-create/        #   发起投票
│   │   ├── vote-detail/        #   投票详情
│   │   ├── gallery/            #   群相册
│   │   ├── album-detail/       #   相册详情
│   │   ├── equipment/          #   装备系统
│   │   ├── dunku/              #   装备图库(图床上传)
│   │   ├── parking-qr/         #   停车码
│   │   ├── fifa-skills/        #   FIFA 技能图鉴
│   │   ├── picui-settings/     #   图床配置
│   │   ├── login/              #   登录
│   │   ├── account-delete/     #   注销账号
│   │   ├── user-agreement/     #   用户协议(登录前可访问)
│   │   ├── privacy-policy/     #   隐私政策
│   │   └── privacy-inventory/  #   个人信息清单
│   ├── store/                  # 全局状态(预留,见内 README)
│   ├── styles/                 # 全局样式覆写
│   ├── types/                  # TypeScript 全局类型声明
│   └── utils/                  # 工具函数(海报导出、上传、图床)
├── supabase/
│   ├── config.toml             # Supabase 本地/远程配置
│   ├── functions/              # Edge Functions(登录、上传、结算等)
│   └── migrations/             # 数据库迁移脚本(按序号递增,勿改历史文件)
├── .rules/                     # 项目自定义规则(YAML/TS 插件)
├── babel.config.js
├── biome.json
├── build.sh                    # 生产构建脚本
├── package.json
├── postcss.config.js
├── project.config.json         # 微信开发者工具项目配置
├── tailwind.config.js
├── tsconfig.json
└── tsconfig.check.json
```

每个页面目录固定包含 `index.tsx`(页面逻辑与 JSX)和 `index.config.ts`(页面配置:导航栏标题、分享开关等);新增页面需在 `src/app.config.ts` 的 `pages` 数组中登记路由。

`src/pages/user-agreement/` 可在登录前从登录页协议链接直接打开。

## 开发

```bash
pnpm install          # 安装依赖(install 后自动执行 weapp-tw patch)
pnpm run dev          # 开发模式编译微信小程序(--watch)
pnpm run build        # 生产构建,产物输出到 dist/
pnpm run lint         # 代码检查(改完代码请执行)
```

其他命令:`pnpm run dev:h5`(H5 开发模式)、`build.sh`(服务器一键构建)。

## 约定

- 所有数据库调用必须经 `src/db/` 访问层,禁止在页面里直接写 Supabase 查询。
- Supabase 客户端统一从 `@/client/supabase` 引入。
- 路由守卫统一使用 `@/components/RouteGuard` 的 `withRouteGuard`,勿嵌套使用。
- 新增/迁移目录结构后,请同步更新本 README。

## 属性分配与成长规则（00110 / 00111 / 00112 / 00113）

- 基础六维是六个 `40..70` 的整数且合计 `300`；新队员按自身首选位置自动初始化，未设置位置时暂用 `50×6`。`ability_bases` 保存基础值，`ability_allocations` 单独记录成长投入，`profiles.ab_*` 始终是“已保存基础值 + 成长投入”的展示投影，不是默认值回落。
- `save_ability_base` 只允许当前登录用户保存自己的基础六维。基础值发生变化时，服务端在同一事务内清空成长投入并全额退回旧投入点数；重复保存完全相同的基础值是无副作用操作，保留现有投入与余额。
- 位置基础按速度/射门/传球/盘带/防守/体能顺序：门将 `40/40/60/40/70/50`，后卫 `50/40/45/40/65/60`，中场 `45/45/65/55/40/50`，前锋 `60/65/40/55/40/40`。没有手动选择预设入口；弹层仍可自定义微调，保存后生效，保留300ms进出过渡及滚动隔离。
- 有效出勤只统计已确认、已结算且未取消的活动。每项成长上限为 `min(99, 基础值 + min(15 + floor(有效出勤 / 5), 39))`，与首选位置无关。
- 可投入总预算沿用固定参考曲线，不受自定义基础值或位置影响：`central = min(75 + floor(有效出勤 / 5), 99)`，固定修正值为 `[10, 8, 3, 0, -5, -10]`，预算是各项 `max(60, min(99, central + 修正值)) - 60` 合计的一半并向下取整。
- 页面通过 `alloc_points` 即时增减成长投入；减点返还对应点数。首次从未设置位置改为有位置时，仅对未自定义、未投入成长点的均衡基础自动应用位置默认值；以后修改位置不覆盖已保存基础、不重置成长投入、不返还点数。
- 经验等级从 Lv.1 开始，`Lv.L → Lv.(L+1)` 需要 `growth_config.exp_per_level × L` 经验，Lv.L 累计门槛为 `base × L × (L - 1) / 2`；每次升级固定奖励 5 属性点。活跃度等级及其排名独立于经验等级，五档全六维原始加成依次为 `0/0/1/1/2`。
- 装备、技能、活跃度等级的原始加成先合并；每维正加成最多生效 8，六维正加成超过 30 时按比例缩放并以固定维度顺序执行最大余数分配。负加成保留且不抵扣正加成预算，最终单项不超过 99。
- `00111` 已将装备正词条按四分之一四舍五入（最低 1）、技能基础词条由 `2/3` 调整为 `1/2`，装备整套原始总量按品质为 `8/16/24/40`；`00112` 不再次改写这些目录或队员的装备、技能所有权。
- 球星卡、个人页、名单、详情与海报使用统一最终属性口径；品质阈值为青铜 `<55`、白银 `55..61`、黄金 `62..69`、传奇 `≥70`。
- `00112_custom_ability_base.sql` 在迁移前保存旧成长投入、六维投影与自由点快照，然后一次性设置均衡基础值 `50×6`、清空并退回旧成长投入；装备、技能、经验和活跃度保持不变。该迁移不重复计算历史收入，也不改装备或技能目录。
- `00112_custom_ability_base.sql` 必须在完整数据库备份后，以 `psql -v ON_ERROR_STOP=1` 执行；文件自身包含完整事务。迁移后若已有奖励、消费、自定义基础值或新加点发生，回滚必须结合审计快照与后续变化处理；本地构建不等于微信正式版已发布。
- `00113_position_ability_defaults.sql` 修正仍未修改且没有新成长投入的均衡基础，并同步公开六维投影；保留自由点、经验、技能、装备及其他资料。迁移有私有快照与一次性完成标记，重复执行不会覆盖后续自定义分配。
