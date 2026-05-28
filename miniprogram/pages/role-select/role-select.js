Page({
  data: {
    selectedRole: '',
    customNickname: '',
    displayName: ''
  },

  selectRole(e) {
    this.setData({ selectedRole: e.currentTarget.dataset.role })
  },

  onCustomInput(e) {
    this.setData({ customNickname: e.detail.value })
  },

  onDisplayNameInput(e) {
    this.setData({ displayName: e.detail.value })
  },

  async confirm() {
    const { selectedRole, customNickname, displayName } = this.data
    if (!selectedRole) return

    const nickname = selectedRole === '其他' ? (customNickname || '其他') : selectedRole

    try {
      wx.showLoading({ title: '设置中...' })
      const res = await wx.cloud.callFunction({
        name: 'familyManage',
        data: { action: 'register', role: selectedRole, nickname, displayName: displayName || '' }
      })
      wx.hideLoading()

      if (res.result && res.result.success) {
        const app = getApp()
        app.globalData.currentMember = res.result.data
        app.globalData.needsRoleSetup = false
        wx.showToast({ title: '设置成功', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1000)
      } else {
        wx.showToast({ title: '设置失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error(e)
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  }
})
