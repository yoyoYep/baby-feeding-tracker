const db = require('../../utils/db')
const {
  buildTimelineDaySections,
  startOfDay,
  addDays,
  formatDateStr,
  getDateLabel
} = require('../../utils/timeline-layout')

const DEFAULT_DAYS = 2

Page({
  data: {
    currentDate: null,
    dateStr: '',
    dateLabel: '今天',
    rangeText: '',
    todayStr: '',
    isToday: true,
    loadedDays: DEFAULT_DAYS,
    loading: false,
    daySections: [],
    recordCount: 0,
    durationCount: 0,
    pointCount: 0,
    showDetail: false,
    detailRecord: null
  },

  onLoad(options) {
    const date = options.date ? new Date(options.date) : new Date()
    const currentDate = Number.isNaN(date.getTime()) ? new Date() : date
    this.setData({ todayStr: formatDateStr(new Date()) })
    this._setDateState(currentDate, false)
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({ todayStr: formatDateStr(new Date()) })
    this.loadTimeline()
  },

  async onPullDownRefresh() {
    await this.loadMorePreviousDays()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    this.loadMorePreviousDays()
  },

  async loadTimeline() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      await this._ensureBabyInfo()
      const latestDate = startOfDay(this.data.currentDate || new Date())
      const days = this.data.loadedDays || DEFAULT_DAYS
      const records = await this._loadRecordsForDays(latestDate, days)
      const now = new Date()
      const daySections = buildTimelineDaySections(records, {
        latestDate,
        days,
        now,
        babyInfo: getApp().globalData.babyInfo
      })
      const recordCount = daySections.reduce((sum, section) => sum + section.recordCount, 0)
      const durationCount = daySections.reduce((sum, section) => sum + section.durationItems.length, 0)
      const pointCount = daySections.reduce((sum, section) => sum + section.pointItems.length, 0)

      this.setData({
        daySections,
        recordCount,
        durationCount,
        pointCount,
        rangeText: this._getRangeText(latestDate, days),
        loading: false
      })
    } catch (e) {
      console.error('加载时间轴失败', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async _loadRecordsForDays(latestDate, days) {
    const tasks = []
    for (let i = 0; i < days; i++) {
      const dayStart = addDays(latestDate, -i)
      const dayEnd = addDays(dayStart, 1)
      tasks.push(db.getRecordsOverlappingDateRange(dayStart, dayEnd, { lookbackDays: 7, limit: 120 }))
    }

    const results = await Promise.all(tasks)
    const seen = {}
    const records = []
    results.forEach(res => {
      ;(res.data || []).forEach(record => {
        const key = record._id || `${record.type}_${record.startTime}_${record.endTime || ''}`
        if (seen[key]) return
        seen[key] = true
        records.push(record)
      })
    })
    records.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    return records
  },

  async _ensureBabyInfo() {
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }
    if (app.globalData.babyInfo) return

    try {
      const res = await db.getBabyInfo()
      if (res.data && res.data.length > 0) {
        app.globalData.babyInfo = res.data[0]
      }
    } catch (e) {
      console.warn('获取宝宝信息失败', e)
    }
  },

  prevDay() {
    const d = new Date(this.data.currentDate)
    d.setDate(d.getDate() - 1)
    this._setDateState(d)
  },

  nextDay() {
    if (this.data.isToday) return
    const d = new Date(this.data.currentDate)
    d.setDate(d.getDate() + 1)
    this._setDateState(d)
  },

  goToday() {
    this._setDateState(new Date())
  },

  onDateChange(e) {
    const d = new Date(e.detail.value)
    this._setDateState(d)
  },

  showRecordDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const record = this._findTimelineItem(id)
    if (!record) return
    this.setData({ showDetail: true, detailRecord: record })
  },

  closeRecordDetail() {
    this.setData({ showDetail: false, detailRecord: null })
  },

  _findTimelineItem(id) {
    for (const section of this.data.daySections || []) {
      const duration = (section.durationItems || []).find(item => item._id === id)
      if (duration) return duration
      const point = (section.pointItems || []).find(item => item._id === id)
      if (point) return point
    }
    return null
  },

  async loadMorePreviousDays() {
    if (this.data.loading) return
    this.setData({ loadedDays: (this.data.loadedDays || DEFAULT_DAYS) + 1 })
    await this.loadTimeline()
  },

  _setDateState(date, shouldLoad = true) {
    const current = startOfDay(Number.isNaN(date.getTime()) ? new Date() : date)
    const today = new Date()
    const isToday = current.toDateString() === today.toDateString()
    this.setData({
      currentDate: current,
      dateStr: formatDateStr(current),
      dateLabel: getDateLabel(current, today),
      rangeText: this._getRangeText(current, DEFAULT_DAYS),
      loadedDays: DEFAULT_DAYS,
      isToday,
      daySections: [],
      showDetail: false,
      detailRecord: null
    })
    if (shouldLoad) this.loadTimeline()
  },

  _getRangeText(latestDate, days) {
    const start = addDays(latestDate, -days + 1)
    return `${formatDateStr(start)} - ${formatDateStr(latestDate)}`
  }
})
