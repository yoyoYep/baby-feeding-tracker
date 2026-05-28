Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', iconPath: '/images/tab-home.png', selectedIconPath: '/images/tab-home-active.png' },
      { pagePath: '/pages/stats/stats', text: '统计', iconPath: '/images/tab-stats.png', selectedIconPath: '/images/tab-stats-active.png' },
      { pagePath: '/pages/mine/mine', text: '我的', iconPath: '/images/tab-mine.png', selectedIconPath: '/images/tab-mine-active.png' }
    ]
  },
  methods: {
    switchTab(e) {
      const idx = e.currentTarget.dataset.index
      const item = this.data.list[idx]
      wx.switchTab({ url: item.pagePath })
    }
  }
})
