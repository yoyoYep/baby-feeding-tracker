const QQ_MUSIC_MINIPROGRAM = {
  // Verified from the local WeChat mini program cache after opening QQ Music.
  appId: 'wxada7aab80ba27074',
  path: 'pages/home/home',
  envVersion: 'release'
}

function openQQMusic() {
  if (!QQ_MUSIC_MINIPROGRAM.appId) {
    wx.setClipboardData({
      data: 'QQ音乐',
      success() {
        wx.showModal({
          title: '已复制“QQ音乐”',
          content: '暂时没有可核验的 QQ 音乐小程序 appId。请在微信搜索框粘贴“QQ音乐”，选择小程序进入；拿到真实 appId 后可填回 utils/qq-music.js。',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    })
    return
  }

  if (!wx.navigateToMiniProgram) {
    wx.showToast({ title: '当前微信版本不支持跳转', icon: 'none' })
    return
  }

  wx.navigateToMiniProgram({
    appId: QQ_MUSIC_MINIPROGRAM.appId,
    path: QQ_MUSIC_MINIPROGRAM.path,
    envVersion: QQ_MUSIC_MINIPROGRAM.envVersion,
    fail(err) {
      console.warn('[qq-music] 跳转失败', err)
      wx.showModal({
        title: '暂时无法打开 QQ 音乐',
        content: '可以先在微信搜索“QQ音乐”打开。若后续拿到 QQ 音乐小程序 appId，只需替换 utils/qq-music.js 里的配置。',
        showCancel: false,
        confirmText: '知道了'
      })
    }
  })
}

module.exports = {
  QQ_MUSIC_MINIPROGRAM,
  openQQMusic
}
