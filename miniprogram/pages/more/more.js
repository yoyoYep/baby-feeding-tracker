const { openQQMusic } = require('../../utils/qq-music')

Page({
  data: {
    tools: [
      {
        title: '记录时间轴',
        subtitle: '按时间回看喂奶、睡眠和护理',
        icon: '🕘',
        accent: 'record',
        url: '/pages/timeline/timeline'
      },
      {
        title: '数据统计',
        subtitle: '查看当日统计和最近7天趋势',
        icon: '📊',
        accent: 'stats',
        url: '/pages/stats/stats'
      },
      {
        title: '生长曲线',
        subtitle: '查看身高、体重、头围趋势',
        icon: '📏',
        accent: 'growth',
        url: '/pages/growth/growth'
      },
      {
        title: 'QQ 音乐',
        subtitle: '跳转到 QQ 音乐听歌和安抚音乐',
        icon: '🎵',
        accent: 'music',
        action: 'qqMusic'
      }
    ]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  goTool(e) {
    const { url, action } = e.currentTarget.dataset
    if (action === 'qqMusic') {
      openQQMusic()
      return
    }
    if (!url) return
    wx.navigateTo({ url })
  }
})
