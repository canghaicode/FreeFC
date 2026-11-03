export default definePageConfig({
  navigationBarTitleText: '战术板与首发阵容',
  // 页面为一屏布局（h-screen + overflow-hidden，纵向无滚动需求），
  // 原生层禁页面滚动后 iOS 上拖棋子时页面/橡皮筋都不会动
  disableScroll: true,
  enableShareAppMessage: true,
  enableShareTimeline: true,
})
