const db = require('../../utils/db')

Page({
  data: {
    babyName: '',
    babyAge: '',
    babyId: '',
    showBabyEdit: false,
    editName: '',
    editBirthday: '',
    editGender: 'female',
    showFamily: false,
    familyMembers: [],
    myRole: '',
    feedingIntervalText: '',
    defaultAmountText: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadBabyInfo()
    this.loadFamilyInfo()
    this._loadConfig()
  },

  async _loadConfig() {
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }
    const config = app.globalData.config || {}
    const threshold = config.feedingIntervalThreshold || 180
    const amount = config.defaultFeedingAmount || 0

    const h = Math.floor(threshold / 60)
    const m = threshold % 60
    const intervalText = h > 0 ? `${h}小时${m > 0 ? m + '分钟' : ''}` : `${m}分钟`

    this.setData({
      feedingIntervalText: `超过${intervalText}变红`,
      defaultAmountText: amount ? `${amount}ml` : '未设置'
    })
  },

  async setFeedingInterval() {
    const options = ['1.5小时', '2小时', '2.5小时', '3小时', '3.5小时', '4小时']
    const values = [90, 120, 150, 180, 210, 240]
    wx.showActionSheet({
      itemList: options,
      success: async (res) => {
        const val = values[res.tapIndex]
        await db.saveConfig({ feedingIntervalThreshold: val })
        this._loadConfig()
        wx.showToast({ title: '已设置', icon: 'success' })
      }
    })
  },

  async setDefaultAmount() {
    const options = ['60ml', '90ml', '120ml', '150ml', '180ml', '210ml']
    const values = [60, 90, 120, 150, 180, 210]
    wx.showActionSheet({
      itemList: options,
      success: async (res) => {
        const val = values[res.tapIndex]
        await db.saveConfig({ defaultFeedingAmount: val })
        this._loadConfig()
        wx.showToast({ title: '已设置', icon: 'success' })
      },
      fail: () => {
        wx.showModal({
          title: '自定义奶量',
          placeholderText: '输入毫升数，如 130',
          editable: true,
          success: async (res) => {
            if (res.confirm && res.content) {
              const val = parseInt(res.content)
              if (val > 0 && val <= 500) {
                await db.saveConfig({ defaultFeedingAmount: val })
                this._loadConfig()
                wx.showToast({ title: '已设置', icon: 'success' })
              }
            }
          }
        })
      }
    })
  },

  async loadFamilyInfo() {
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }
    const member = app.globalData.currentMember
    if (member) {
      this.setData({ myRole: member.role })
    }
  },

  async loadBabyInfo() {
    try {
      const res = await db.getBabyInfo()
      if (res.data && res.data.length > 0) {
        const baby = res.data[0]
        const age = this._calcAge(new Date(baby.birthday))
        this.setData({
          babyId: baby._id,
          babyName: baby.name,
          babyAge: age,
          editName: baby.name,
          editBirthday: this._formatDate(new Date(baby.birthday)),
          editGender: baby.gender || 'female'
        })
      }
    } catch (e) {
      console.error(e)
    }
  },

  editBabyInfo() {
    this.setData({ showBabyEdit: true })
  },

  closeBabyEdit() {
    this.setData({ showBabyEdit: false })
  },

  onEditName(e) { this.setData({ editName: e.detail.value }) },
  onBirthdayChange(e) { this.setData({ editBirthday: e.detail.value }) },
  setGender(e) { this.setData({ editGender: e.currentTarget.dataset.val }) },

  async saveBabyInfo() {
    const { editName, editBirthday, editGender, babyId } = this.data
    if (!editName || !editBirthday) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    const data = {
      name: editName,
      birthday: new Date(editBirthday),
      gender: editGender
    }

    try {
      if (babyId) {
        await db.updateBabyInfo(babyId, data)
      } else {
        await db.saveBabyInfo(data)
      }
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.setData({ showBabyEdit: false })
      this.loadBabyInfo()
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  _calcAge(birthday) {
    const now = new Date()
    const diff = now - birthday
    const days = Math.floor(diff / 86400000)
    if (days < 30) return `${days}天`
    const months = Math.floor(days / 30)
    const remainDays = days % 30
    return `${months}个月${remainDays}天`
  },

  _formatDate(d) {
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  },

  goReminder() {
    wx.showToast({ title: '提醒设置（开发中）', icon: 'none' })
  },

  async goFamily() {
    if (this.data.myRole !== '妈妈') {
      wx.showToast({ title: '仅妈妈可查看管理', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '加载中' })
      const res = await wx.cloud.callFunction({ name: 'familyManage', data: { action: 'getMembers' } })
      wx.hideLoading()
      if (res.result && res.result.success) {
        this.setData({ familyMembers: res.result.data, showFamily: true })
      } else {
        wx.showToast({ title: '暂无成员', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  closeFamily() {
    console.log('[mine] closeFamily 触发')
    this.setData({ showFamily: false })
  },

  editMemberRole(e) {
    console.log('[mine] editMemberRole 触发, dataset:', JSON.stringify(e.currentTarget.dataset))
    const { id, role } = e.currentTarget.dataset
    if (!id) {
      wx.showToast({ title: '获取成员信息失败', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆'],
      success: async (res) => {
        const roles = ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆']
        const newRole = roles[res.tapIndex]
        this._doUpdateMemberRole(id, newRole)
      },
      fail: () => {
        wx.showModal({
          title: '自定义角色',
          placeholderText: '输入角色名称',
          editable: true,
          success: (res) => {
            if (res.confirm && res.content && res.content.trim()) {
              this._doUpdateMemberRole(id, res.content.trim())
            }
          }
        })
      }
    })
  },

  async _doUpdateMemberRole(id, newRole) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'familyManage',
        data: { action: 'updateMemberRole', targetId: id, role: newRole, nickname: newRole }
      })
      if (result.result && result.result.success) {
        wx.showToast({ title: '已修改', icon: 'success' })
      } else {
        wx.showToast({ title: result.result.error || '修改失败', icon: 'none' })
      }
      this.goFamily()
    } catch (err) {
      console.error('[mine] 修改失败:', err)
      wx.showToast({ title: '修改失败', icon: 'none' })
    }
  },

  exportData() {
    wx.showToast({ title: '数据导出（开发中）', icon: 'none' })
  },

  goAbout() {
    wx.showModal({
      title: '宝宝喂养记录',
      content: '版本 1.0.0\n用爱记录宝宝的每一天',
      showCancel: false
    })
  },

  noop() { console.log('[mine] noop 触发 (dialog catchtap)') }
})
