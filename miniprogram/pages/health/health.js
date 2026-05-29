const db = require('../../utils/db')

Page({
  data: {
    activeTab: 'temp',
    lastTemp: null,
    lastTempAgo: '',
    tempLevel: 'normal',

    // 体温表单
    tempValue: '',
    tempMethod: 'ear',
    tempHistory: [],

    // 用药表单
    medName: '',
    medDosage: '',
    medUnit: 'ml',
    medMethod: 'oral',
    medNote: '',
    medHistory: [],
    todayMeds: []
  },

  onShow() {
    this.loadTempHistory()
    this.loadMedHistory()
    this.loadTodayMeds()
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  // === 体温 ===
  onTempInput(e) { this.setData({ tempValue: e.detail.value }) },
  setTempMethod(e) { this.setData({ tempMethod: e.currentTarget.dataset.val }) },

  async saveTempRecord() {
    const { tempValue, tempMethod } = this.data
    if (!tempValue) {
      wx.showToast({ title: '请输入体温', icon: 'none' })
      return
    }
    const value = parseFloat(tempValue)
    if (value < 34 || value > 43) {
      wx.showToast({ title: '体温数值异常', icon: 'none' })
      return
    }

    try {
      await db.addRecord({
        type: 'health_temp',
        startTime: new Date(),
        data: { value, method: tempMethod },
        status: 'completed',
        source: 'manual'
      })
      wx.showToast({ title: '记录成功', icon: 'success' })
      this.setData({ tempValue: '' })
      this.loadTempHistory()
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async loadTempHistory() {
    try {
      const wxDb = wx.cloud.database()
      const _ = wxDb.command
      const now = new Date()
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

      const res = await wxDb.collection('records')
        .where({
          type: 'health_temp',
          startTime: _.gte(threeDaysAgo)
        })
        .orderBy('startTime', 'desc')
        .limit(20)
        .get()

      const methodNames = { forehead: '额温', ear: '耳温', armpit: '腋温' }
      const history = (res.data || []).map(r => ({
        ...r,
        methodText: methodNames[r.data.method] || '',
        timeStr: this._formatDateTime(new Date(r.startTime)),
        level: this._getTempLevel(r.data.value)
      }))

      const lastTemp = history.length > 0 ? history[0] : null
      let lastTempAgo = ''
      let tempLevel = 'normal'
      if (lastTemp) {
        const diff = Math.floor((Date.now() - new Date(lastTemp.startTime).getTime()) / 60000)
        lastTempAgo = diff < 60 ? `${diff}分钟前` : `${Math.floor(diff / 60)}小时前`
        tempLevel = this._getTempLevel(lastTemp.data.value)
      }

      this.setData({ tempHistory: history, lastTemp: lastTemp ? lastTemp.data : null, lastTempAgo, tempLevel })
    } catch (e) {
      console.error(e)
    }
  },

  _getTempLevel(value) {
    if (value >= 38.5) return 'high_fever'
    if (value >= 37.5) return 'low_fever'
    return 'normal'
  },

  // === 用药 ===
  onMedNameInput(e) { this.setData({ medName: e.detail.value }) },
  onMedDosageInput(e) { this.setData({ medDosage: e.detail.value }) },
  setMedUnit(e) { this.setData({ medUnit: e.currentTarget.dataset.val }) },
  setMedMethod(e) { this.setData({ medMethod: e.currentTarget.dataset.val }) },
  onMedNoteInput(e) { this.setData({ medNote: e.detail.value }) },

  quickSelectMed(e) {
    const index = e.currentTarget.dataset.index
    const med = this.data.medHistory[index]
    if (med) {
      this.setData({
        medName: med.name,
        medDosage: String(med.lastDosage),
        medUnit: med.lastUnit,
        medMethod: med.lastMethod || 'oral'
      })
    }
  },

  async saveMedRecord() {
    const { medName, medDosage, medUnit, medMethod, medNote } = this.data
    if (!medName) {
      wx.showToast({ title: '请输入药品名称', icon: 'none' })
      return
    }
    if (!medDosage) {
      wx.showToast({ title: '请输入剂量', icon: 'none' })
      return
    }

    const dosage = parseFloat(medDosage)
    try {
      await db.addRecord({
        type: 'health_med',
        startTime: new Date(),
        data: { name: medName, dosage, unit: medUnit, method: medMethod },
        status: 'completed',
        source: 'manual',
        note: medNote
      })

      await db.updateMedHistory({ name: medName, dosage, unit: medUnit, method: medMethod })

      wx.showToast({ title: '记录成功', icon: 'success' })
      this.setData({ medName: '', medDosage: '', medNote: '' })
      this.loadMedHistory()
      this.loadTodayMeds()
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async loadMedHistory() {
    try {
      const res = await db.getMedHistory(5)
      this.setData({ medHistory: res.data || [] })
    } catch (e) {
      console.error(e)
    }
  },

  async loadTodayMeds() {
    try {
      const wxDb = wx.cloud.database()
      const _ = wxDb.command
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      const res = await wxDb.collection('records')
        .where({
          type: 'health_med',
          startTime: _.gte(todayStart)
        })
        .orderBy('startTime', 'desc')
        .get()

      const methodNames = { oral: '口服', external: '外用', nebulize: '雾化', rectal: '塞肛' }
      const meds = (res.data || []).map(r => ({
        ...r,
        methodText: methodNames[r.data.method] || '',
        timeStr: this._formatTime(new Date(r.startTime))
      }))

      this.setData({ todayMeds: meds })
    } catch (e) {
      console.error(e)
    }
  },

  // 语音
  async onVoiceRecord(e) {
    const { result } = e.detail
    if (!result) return
    try {
      await db.addRecord({
        type: result.type,
        startTime: result.startTime,
        data: result.data || {},
        status: 'completed',
        source: 'voice'
      })
      if (result.type === 'health_med' && result.data.name) {
        await db.updateMedHistory(result.data)
      }
      wx.showToast({ title: '记录成功', icon: 'success' })
      this.loadTempHistory()
      this.loadMedHistory()
      this.loadTodayMeds()
    } catch (e) {
      wx.showToast({ title: '记录失败', icon: 'none' })
    }
  },

  _formatTime(date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  },

  _formatDateTime(date) {
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    const timeStr = this._formatTime(date)
    if (isToday) return `今天 ${timeStr}`
    const yesterday = new Date(today.getTime() - 86400000)
    if (date.toDateString() === yesterday.toDateString()) return `昨天 ${timeStr}`
    return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`
  }
})
