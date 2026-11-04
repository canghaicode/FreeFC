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
