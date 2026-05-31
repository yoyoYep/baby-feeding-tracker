const db = require('../../utils/db')
const { normalizeFeedingPlanConfig, getLogicalDayStart, isSameLogicalDay } = require('../../utils/feeding-plan')

Page({
  data: {
    currentDate: null,
    dateText: '今天',
    activeTab: 'day',
    loading: false,
    feedingStats: { count: 0, totalAmount: 0, avgInterval: '-', avgDuration: '-' },
    sleepStats: { totalHours: 0, napCount: 0, nightHours: 0 },
    diaperStats: { peeCount: 0, poopCount: 0, total: 0 },
    weekFeeding: [],
    weekSleep: [],
    weekDiaper: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    if (!this.data.currentDate) {
      const now = new Date()
      this.setData({
        currentDate: now,
        dateText: '今天'
      })
    }
    this.loadStats()
    if (this.data.activeTab === 'week') {
      this.loadWeekData()
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'week') {
      this.loadWeekData()
    }
  },

  prevDay() {
    const d = new Date(this.data.currentDate)
    d.setDate(d.getDate() - 1)
    this.setData({ currentDate: d, dateText: this._getDateText(d) })
    this.loadStats()
  },

  nextDay() {
    const d = new Date(this.data.currentDate)
    const today = new Date()
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    if (isSameLogicalDay(d, today, config.feedingDayStartHour)) return
    d.setDate(d.getDate() + 1)
    this.setData({ currentDate: d, dateText: this._getDateText(d) })
    this.loadStats()
  },

  async loadStats() {
    this.setData({ loading: true })
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }

    const d = this.data.currentDate || new Date()
    const config = normalizeFeedingPlanConfig((app.globalData && app.globalData.config) || {})
    const start = getLogicalDayStart(d, config.feedingDayStartHour)
    const end = new Date(start.getTime() + 86400000)

    try {
      const res = await db.getRecordsOverlappingDateRange(start, end, { lookbackDays: 2, limit: 120 })
      const records = res.data || []
      this._calcFeedingStats(records.filter(r => {
        const t = new Date(r.startTime).getTime()
        return t >= start.getTime() && t < end.getTime()
      }))
      this._calcSleepStats(records, start, end)
      this._calcDiaperStats(records.filter(r => {
        const t = new Date(r.startTime).getTime()
        return t >= start.getTime() && t < end.getTime()
      }))
    } catch (e) {
      console.error('loadStats error:', e)
    }
    this.setData({ loading: false })
  },

  async loadWeekData() {
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }

    try {
      const records = await this._loadRecentDayRecords(7)
      this._calcWeekTrend(records)
    } catch (e) {
      console.error('loadWeekData error:', e)
    }
  },

  async _loadRecentDayRecords(days) {
    const today = new Date()
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const dayStartHour = config.feedingDayStartHour
    const tasks = []
    for (let i = days - 1; i >= 0; i--) {
      const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, dayStartHour)
      const start = getLogicalDayStart(ref, dayStartHour)
      const end = new Date(start.getTime() + 86400000)
      tasks.push(db.getRecordsOverlappingDateRange(start, end, { lookbackDays: 2, limit: 120 }))
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

  _calcFeedingStats(records) {
    const feedings = records.filter(r => r.type === 'feeding' && r.status === 'completed')
    const count = feedings.length
    const totalAmount = feedings.reduce((sum, r) => sum + ((r.data && r.data.amount) || 0), 0)
    let avgInterval = '-'
    if (count >= 2) {
      const times = feedings.map(r => new Date(r.startTime).getTime()).sort()
      let totalGap = 0
      for (let i = 1; i < times.length; i++) totalGap += times[i] - times[i - 1]
      avgInterval = (totalGap / (count - 1) / 3600000).toFixed(1)
    }
    let avgDuration = '-'
    const withDuration = feedings.filter(r => r.startTime && r.endTime)
    if (withDuration.length > 0) {
      const totalMin = withDuration.reduce((sum, r) => sum + (new Date(r.endTime) - new Date(r.startTime)) / 60000, 0)
      avgDuration = Math.round(totalMin / withDuration.length)
    }
    this.setData({ feedingStats: { count, totalAmount, avgInterval, avgDuration } })
  },

  _calcSleepStats(records, start, end) {
    const sleeps = records.filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime)
    let totalMin = 0, napCount = 0, nightMin = 0
    sleeps.forEach(r => {
      const rStart = new Date(r.startTime).getTime()
      const rEnd = new Date(r.endTime).getTime()
      if (rEnd <= rStart) return
      if (rStart >= end.getTime() || rEnd <= start.getTime()) return
      const clippedStart = Math.max(rStart, start.getTime())
      const clippedEnd = Math.min(rEnd, end.getTime())
      const dur = (clippedEnd - clippedStart) / 60000
      totalMin += dur
      if (r.data && r.data.sleepType === 'night') {
        nightMin += dur
      } else {
        napCount++
      }
    })
    this.setData({
      sleepStats: {
        totalHours: (totalMin / 60).toFixed(1),
        napCount,
        nightHours: (nightMin / 60).toFixed(1)
      }
    })
  },

  _calcDiaperStats(records) {
    const diapers = records.filter(r => r.type === 'diaper')
    let peeCount = 0, poopCount = 0
    diapers.forEach(r => {
      const sub = r.data && r.data.subType
      if (sub === 'pee') peeCount++
      else if (sub === 'poop') poopCount++
      else { peeCount++; poopCount++ }
    })
    this.setData({ diaperStats: { peeCount, poopCount, total: diapers.length } })
  },

  _calcWeekTrend(records) {
    const days = []
    const now = new Date()
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const dayStartHour = config.feedingDayStartHour
    for (let i = 6; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, dayStartHour)
      days.push(getLogicalDayStart(ref, dayStartHour))
    }

    const allSleeps = records.filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime)
    const weekFeeding = []
    const weekSleep = []
    const weekDiaper = []

    days.forEach(day => {
      const dayStart = day.getTime()
      const dayEnd = dayStart + 86400000
      const dayRecords = records.filter(r => {
        const t = new Date(r.startTime).getTime()
        return t >= dayStart && t < dayEnd
      })

      const feedings = dayRecords.filter(r => r.type === 'feeding' && r.status === 'completed')
      const totalMl = feedings.reduce((s, r) => s + ((r.data && r.data.amount) || 0), 0)
      weekFeeding.push({ value: totalMl, label: `${day.getMonth() + 1}/${day.getDate()}` })

      let sleepMin = 0
      allSleeps.forEach(r => {
        const rStart = new Date(r.startTime).getTime()
        const rEnd = new Date(r.endTime).getTime()
        if (rEnd <= rStart || rStart >= dayEnd || rEnd <= dayStart) return
        sleepMin += (Math.min(rEnd, dayEnd) - Math.max(rStart, dayStart)) / 60000
      })
      const sleepH = parseFloat((sleepMin / 60).toFixed(1))
      weekSleep.push({ value: sleepH, label: `${day.getMonth() + 1}/${day.getDate()}` })

      const diapers = dayRecords.filter(r => r.type === 'diaper')
      weekDiaper.push({ value: diapers.length, label: `${day.getMonth() + 1}/${day.getDate()}` })
    })

    const maxFeed = Math.max(...weekFeeding.map(d => d.value), 1)
    const maxSleep = Math.max(...weekSleep.map(d => d.value), 1)
    const maxDiaper = Math.max(...weekDiaper.map(d => d.value), 1)

    weekFeeding.forEach(d => { d.percent = Math.round(d.value / maxFeed * 100) })
    weekSleep.forEach(d => { d.percent = Math.round(d.value / maxSleep * 100) })
    weekDiaper.forEach(d => { d.percent = Math.round(d.value / maxDiaper * 100) })

    this.setData({ weekFeeding, weekSleep, weekDiaper })
  },

  _getDateText(d) {
    const today = new Date()
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const dayStartHour = config.feedingDayStartHour
    if (isSameLogicalDay(d, today, dayStartHour)) return '今天'
    const yesterday = new Date(today.getTime() - 86400000)
    if (isSameLogicalDay(d, yesterday, dayStartHour)) return '昨天'
    const ds = getLogicalDayStart(d, dayStartHour)
    return `${ds.getMonth() + 1}月${ds.getDate()}日`
  }
})
