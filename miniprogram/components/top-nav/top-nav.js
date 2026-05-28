Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    showBack: {
      type: Boolean,
      value: false
    },
    rightText: {
      type: String,
      value: ''
    },
    fallbackUrl: {
      type: String,
      value: '/pages/index/index'
    }
  },

  data: {
    statusBarHeight: 0,
    navBarHeight: 44
  },

  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const statusBarHeight = windowInfo.statusBarHeight || 0
      let navBarHeight = 44
      try {
        const menu = wx.getMenuButtonBoundingClientRect()
        navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height
      } catch (e) {}
      this.setData({ statusBarHeight, navBarHeight })
    }
  },

  methods: {
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
        return
      }

      const url = this.properties.fallbackUrl || '/pages/index/index'
      if (url.includes('/pages/index/') || url.includes('/pages/stats/') || url.includes('/pages/mine/')) {
        wx.switchTab({ url })
      } else {
        wx.redirectTo({ url })
      }
    },

    tapRight() {
      this.triggerEvent('righttap')
    }
  }
})
