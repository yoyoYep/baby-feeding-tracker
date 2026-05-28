const db = require('../../utils/db')

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
      this.getTabBar().setData({ selected: 1 })
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
    if (tab === 'week' && this.data.weekFeeding.length === 0) {
      this.loadWeekData()
    }
  },

  goGrowth() {
    wx.navigateTo({ url: '/pages/growth/growth' })
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
    if (d.toDateString() === today.toDateString()) return
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
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const end = new Date(start.getTime() + 86400000)

    try {
      const res = await db.getRecordsByDateRange(start, end)
      const records = res.data || []
      this._calcFeedingStats(records)
      this._calcSleepStats(records)
      this._calcDiaperStats(records)
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
      const res = await db.getRecordsForDays(7)
      const records = res.data || []
      this._calcWeekTrend(records)
    } catch (e) {
      console.error('loadWeekData error:', e)
    }
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

  _calcSleepStats(records) {
    const sleeps = records.filter(r => r.type === 'sleep' && r.status === 'completed')
    let totalMin = 0, napCount = 0, nightMin = 0
    sleeps.forEach(r => {
      if (r.endTime) {
        const dur = (new Date(r.endTime) - new Date(r.startTime)) / 60000
        totalMin += dur
        if (r.data && r.data.sleepType === 'night') {
          nightMin += dur
        } else {
          napCount++
        }
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
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      days.push(d)
    }

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

      const sleeps = dayRecords.filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime)
      let sleepMin = 0
      sleeps.forEach(r => { sleepMin += (new Date(r.endTime) - new Date(r.startTime)) / 60000 })
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
    if (d.toDateString() === today.toDateString()) return '今天'
    const yesterday = new Date(today.getTime() - 86400000)
    if (d.toDateString() === yesterday.toDateString()) return '昨天'
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
})
