const pages = [
  'pages/home/index',
  'pages/rating/index',
  'pages/stats/index',
  'pages/squad/index',
  'pages/profile/index',
  'pages/login/index',
  'pages/activity-detail/index',
  'pages/activity-create/index',
  'pages/season-manage/index',
  'pages/profile-edit/index',
  'pages/match-report/index',
  'pages/star-card/index',
  'pages/lineup/index',
  'pages/ability/index',
  'pages/vote-center/index',
  'pages/vote-create/index',
  'pages/vote-detail/index',
  'pages/captain-admin/index',
  'pages/fifa-skills/index',
  'pages/home-team/index',
  'pages/tactics-board/index',
  'pages/activity-edit/index',
  'pages/dunku/index',
  'pages/parking-qr/index',
  'pages/equipment/index',
  'pages/tactics-manage/index',
  'pages/user-agreement/index',
  'pages/privacy-policy/index',
  'pages/privacy-inventory/index',
  'pages/account-delete/index',
  'pages/gallery/index',
  'pages/album-detail/index',
  'pages/picui-settings/index'
]

//  To fully leverage TypeScript's type safety and ensure its correctness, always enclose the configuration object within the global defineAppConfig helper function.
export default defineAppConfig({
  pages,
  lazyCodeLoading: 'requiredComponents',
  tabBar: {
    color: '#7A6A45',
    selectedColor: '#2D5016',
    backgroundColor: '#FAF7EF',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '活动',
        iconPath: './assets/icons/home_unselected.png',
        selectedIconPath: './assets/icons/home_selected.png'
      },
      {
        pagePath: 'pages/stats/index',
        text: '数据',
        iconPath: './assets/icons/stats_unselected.png',
        selectedIconPath: './assets/icons/stats_selected.png'
      },
      {
        pagePath: 'pages/ability/index',
        text: '球星卡',
        iconPath: './assets/icons/star_unselected.png',
        selectedIconPath: './assets/icons/star_selected.png'
      },
      {
        pagePath: 'pages/star-card/index',
        text: '球队成员',
        iconPath: './assets/icons/squad_unselected.png',
        selectedIconPath: './assets/icons/squad_selected.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: './assets/icons/profile_unselected.png',
        selectedIconPath: './assets/icons/profile_selected.png'
      }
    ]
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FAF7EF',
    navigationBarTitleText: '球队管家',
    navigationBarTextStyle: 'black'
  }
})
