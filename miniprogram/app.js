const { normalizeFeedingPlanConfig } = require('./utils/feeding-plan')
const db = require('./utils/db')

App({
  onLaunch() {
    this.globalData.cloudReadyPromise = this.initCloud()
  },

  async initCloud() {
    if (!wx.cloud) {
      console.warn('基础库版本过低，使用本地模式')
      this._loadLocalConfig()
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
      this._loadLocalConfig()
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
      this.globalData.config = await db.getConfig()
    } catch (e) {
      console.warn('加载配置失败', e)
      this._loadLocalConfig()
    }
  },

  _loadLocalConfig() {
    this.globalData.config = normalizeFeedingPlanConfig(wx.getStorageSync('local_config') || {})
  },

  globalData: {
    cloudReady: false,
    cloudReadyPromise: null,
    currentMember: null,
    needsRoleSetup: false,
    userInfo: null,
    babyInfo: null,
    config: normalizeFeedingPlanConfig({ feedingIntervalThreshold: 180 })
  }
})
