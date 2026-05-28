App({
  onLaunch() {
    this.globalData.cloudReadyPromise = this.initCloud()
  },

  async initCloud() {
    if (!wx.cloud) {
      console.warn('基础库版本过低，使用本地模式')
      return
    }
    try {
      const { cloudEnvId } = require('./config')
      await wx.cloud.init({ traceUser: true, env: cloudEnvId })
      this.globalData.cloudReady = true
      console.log('云开发已连接')
      await this._checkMember()
      await this._loadConfig()
    } catch (e) {
      this.globalData.cloudReady = false
      console.warn('云开发未开通，使用本地存储模式', e)
    }
  },

  async _checkMember() {
    try {
      const res = await wx.cloud.callFunction({ name: 'familyManage', data: { action: 'getMyInfo' } })
      if (res.result && res.result.success) {
        this.globalData.currentMember = res.result.data
        this.globalData.needsRoleSetup = false
      } else {
        this.globalData.needsRoleSetup = true
      }
    } catch (e) {
      console.warn('获取成员信息失败', e)
      this.globalData.needsRoleSetup = true
    }
  },

  async _loadConfig() {
    try {
      const database = wx.cloud.database()
      const res = await database.collection('config').limit(1).get()
      if (res.data && res.data.length > 0) {
        this.globalData.config = res.data[0]
        wx.setStorageSync('local_config', res.data[0])
      }
    } catch (e) {
      console.warn('加载配置失败', e)
      this.globalData.config = wx.getStorageSync('local_config') || { defaultFeedingAmount: 0, feedingIntervalThreshold: 180 }
    }
  },

  globalData: {
    cloudReady: false,
    cloudReadyPromise: null,
    currentMember: null,
    needsRoleSetup: false,
    userInfo: null,
    babyInfo: null,
    config: { defaultFeedingAmount: 0, feedingIntervalThreshold: 180 }
  }
})
