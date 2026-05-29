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

    let runtimeConfig = {}
    try {
      runtimeConfig = require('./config')
    } catch (e) {
      console.warn('未找到云开发配置，使用本地存储模式')
      this._loadLocalConfig()
      return
    }

    const { cloudEnvId, enableCloud = true } = runtimeConfig
    if (!enableCloud || !cloudEnvId || cloudEnvId === '你的云开发环境ID') {
      console.warn('云开发未启用，使用本地存储模式')
      this._loadLocalConfig()
      return
    }

    if (this._isTouristAppId()) {
      console.warn('当前为游客 AppID，跳过云开发初始化')
      this._loadLocalConfig()
      return
    }

    try {
      await wx.cloud.init({ traceUser: true, env: cloudEnvId })
      this.globalData.cloudReady = true
      const cloudUsable = await this._checkMember()
      if (!cloudUsable) {
        this.globalData.cloudReady = false
        this._loadLocalConfig()
        return
      }
      await this._loadConfig()
      console.log('云开发已连接')
    } catch (e) {
      this.globalData.cloudReady = false
      console.warn('云开发未开通，使用本地存储模式', e)
      this._loadLocalConfig()
    }
  },

  _isTouristAppId() {
    if (!wx.getAccountInfoSync) return false
    try {
      const accountInfo = wx.getAccountInfoSync()
      const miniProgram = accountInfo && accountInfo.miniProgram
      return miniProgram && miniProgram.appId === 'touristappid'
    } catch (e) {
      return false
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
      return true
    } catch (e) {
      console.warn('云开发调用不可用，使用本地存储模式', e)
      this.globalData.currentMember = null
      this.globalData.needsRoleSetup = false
      return false
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
