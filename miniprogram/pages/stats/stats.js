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
    weekFeedingDuration: [],
    weekSleep: [],
    weekDiaper: [],
    monthRangeText: '',
    monthSummary: {
      activeDays: 0,
      feedingCount: 0,
      totalAmount: 0,
      avgDailyAmount: 0,
      avgFeedingDuration: '-',
      totalSleepHours: '0.0',
      avgSleepHours: '0.0',
      peeCount: 0,
      poopCount: 0
    },
    monthFeeding: [],
    monthSleep: [],
    monthDiaper: [],
    monthChartScrollLeft: 0
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
    if (this.data.activeTab === 'week') {
      this.loadWeekData()
    } else if (this.data.activeTab === 'month') {
      this.loadMonthData()
    } else {
      this.loadStats()
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'week') {
      this.loadWeekData()
    } else if (tab === 'month') {
      this.loadMonthData()
    } else if (tab === 'day') {
      this.loadStats()
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
    this.setData({ loading: true })
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
    this.setData({ loading: false })
  },

  async loadMonthData() {
    this.setData({ loading: true, monthChartScrollLeft: 0 })
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }

    try {
      const records = await this._loadRecentDayRecords(30)
      this._calcMonthTrend(records)
    } catch (e) {
      console.error('loadMonthData error:', e)
    }
    this.setData({ loading: false }, () => {
      if (this.data.activeTab === 'month') this._scrollMonthChartsToEnd()
    })
  },

  _scrollMonthChartsToEnd() {
    const applyScroll = () => {
      this.setData({ monthChartScrollLeft: 99999 })
    }
    if (typeof wx !== 'undefined' && wx.nextTick) {
      wx.nextTick(applyScroll)
    } else {
      setTimeout(applyScroll, 0)
    }
  },

  _getRecentDayStarts(days) {
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const dayStartHour = config.feedingDayStartHour
    const currentDayStart = getLogicalDayStart(new Date(), dayStartHour)
    const dayStarts = []
    for (let i = days - 1; i >= 0; i--) {
      dayStarts.push(new Date(currentDayStart.getTime() - i * 86400000))
    }
    return dayStarts
  },

  async _loadRecentDayRecords(days) {
    const dayStarts = this._getRecentDayStarts(days)
    if (!dayStarts.length) return []

    const tasks = dayStarts.map(start => async () => {
      const end = new Date(start.getTime() + 86400000)
      return db.getRecordsOverlappingDateRange(start, end, { lookbackDays: 2, limit: 180 })
    })
    const results = []
    for (let i = 0; i < tasks.length; i += 5) {
      const batch = tasks.slice(i, i + 5)
      const batchResults = await Promise.all(batch.map(task => task()))
      results.push(...batchResults)
    }

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
    const feedingDurations = feedings
      .map(r => this._getFeedingDurationMin(r))
      .filter(min => min > 0)
    if (feedingDurations.length > 0) {
      const totalMin = feedingDurations.reduce((sum, min) => sum + min, 0)
      avgDuration = Math.round(totalMin / feedingDurations.length)
    }
    this.setData({ feedingStats: { count, totalAmount, avgInterval, avgDuration } })
  },

  _getFeedingDurationMin(record) {
    if (!record) return 0
    const explicitDuration = record.data && Number(record.data.duration)
    if (Number.isFinite(explicitDuration) && explicitDuration > 0) return explicitDuration
    if (!record.startTime || !record.endTime) return 0
    const start = new Date(record.startTime).getTime()
    const end = new Date(record.endTime).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
    return (end - start) / 60000
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

  _countDiaperTypes(records) {
    let peeCount = 0, poopCount = 0
    ;(records || []).forEach(r => {
      const sub = r.data && r.data.subType
      const count = parseInt(r.data && r.data.peeCount, 10)
      const safePeeCount = Number.isFinite(count) && count > 0 ? count : 1
      if (sub === 'pee') peeCount += safePeeCount
      else if (sub === 'poop') poopCount++
      else { peeCount += safePeeCount; poopCount++ }
    })
    return { peeCount, poopCount }
  },

  _calcDiaperStats(records) {
    const diapers = records.filter(r => r.type === 'diaper')
    const { peeCount, poopCount } = this._countDiaperTypes(diapers)
    this.setData({ diaperStats: { peeCount, poopCount, total: diapers.length } })
  },

  _calcWeekTrend(records) {
    const days = this._getRecentDayStarts(7)

    const allSleeps = records.filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime)
    const weekFeeding = []
    const weekFeedingDuration = []
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

      const feedingDurations = feedings
        .map(r => this._getFeedingDurationMin(r))
        .filter(min => min > 0)
      const avgFeedingDuration = feedingDurations.length
        ? Math.round(feedingDurations.reduce((s, min) => s + min, 0) / feedingDurations.length)
        : 0
      weekFeedingDuration.push({ value: avgFeedingDuration, label: `${day.getMonth() + 1}/${day.getDate()}` })

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
      const { peeCount, poopCount } = this._countDiaperTypes(diapers)
      weekDiaper.push({
        value: diapers.length,
        pee: peeCount,
        poop: poopCount,
        displayText: peeCount || poopCount ? `${peeCount}/${poopCount}` : '',
        label: `${day.getMonth() + 1}/${day.getDate()}`
      })
    })

    const maxFeed = Math.max(...weekFeeding.map(d => d.value), 1)
    const maxFeedingDuration = Math.max(...weekFeedingDuration.map(d => d.value), 1)
    const maxSleep = Math.max(...weekSleep.map(d => d.value), 1)
    const maxDiaper = Math.max(...weekDiaper.map(d => Math.max(d.pee, d.poop)), 1)

    weekFeeding.forEach(d => { d.percent = Math.round(d.value / maxFeed * 100) })
    weekFeedingDuration.forEach(d => { d.percent = Math.round(d.value / maxFeedingDuration * 100) })
    weekSleep.forEach(d => { d.percent = Math.round(d.value / maxSleep * 100) })
    weekDiaper.forEach(d => {
      d.peePercent = Math.round(d.pee / maxDiaper * 100)
      d.poopPercent = Math.round(d.poop / maxDiaper * 100)
    })

    this.setData({ weekFeeding, weekFeedingDuration, weekSleep, weekDiaper })
  },

  _getDayRecords(records, dayStart, dayEnd) {
    return (records || []).filter(r => {
      const t = new Date(r.startTime).getTime()
      return t >= dayStart && t < dayEnd
    })
  },

  _getDaySleepMinutes(sleeps, dayStart, dayEnd) {
    let sleepMin = 0
    ;(sleeps || []).forEach(r => {
      const rStart = new Date(r.startTime).getTime()
      const rEnd = new Date(r.endTime).getTime()
      if (rEnd <= rStart || rStart >= dayEnd || rEnd <= dayStart) return
      sleepMin += (Math.min(rEnd, dayEnd) - Math.max(rStart, dayStart)) / 60000
    })
    return sleepMin
  },

  _formatRangeLabel(start, end) {
    if (!start || !end) return ''
    return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`
  },

  _calcMonthTrend(records) {
    const days = this._getRecentDayStarts(30)
    const allSleeps = records.filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime)
    const monthFeeding = []
    const monthSleep = []
    const monthDiaper = []
    const feedingDurations = []

    let activeDays = 0
    let feedingCount = 0
    let totalAmount = 0
    let totalSleepMin = 0
    let feedingAmountDays = 0
    let sleepDays = 0
    let peeCount = 0
    let poopCount = 0

    days.forEach(day => {
      const dayStart = day.getTime()
      const dayEnd = dayStart + 86400000
      const label = `${day.getMonth() + 1}/${day.getDate()}`
      const dayRecords = this._getDayRecords(records, dayStart, dayEnd)
      const feedings = dayRecords.filter(r => r.type === 'feeding' && r.status === 'completed')
      const diapers = dayRecords.filter(r => r.type === 'diaper')
      const sleepMin = this._getDaySleepMinutes(allSleeps, dayStart, dayEnd)
      const sleepH = parseFloat((sleepMin / 60).toFixed(1))
      const totalMl = feedings.reduce((sum, r) => sum + ((r.data && r.data.amount) || 0), 0)
      const dayDurations = feedings
        .map(r => this._getFeedingDurationMin(r))
        .filter(min => min > 0)
      const diaperCounts = this._countDiaperTypes(diapers)

      feedingCount += feedings.length
      totalAmount += totalMl
      totalSleepMin += sleepMin
      if (totalMl > 0) feedingAmountDays++
      if (sleepMin > 0) sleepDays++
      peeCount += diaperCounts.peeCount
      poopCount += diaperCounts.poopCount
      feedingDurations.push(...dayDurations)
      if (dayRecords.length > 0 || sleepMin > 0) activeDays++

      monthFeeding.push({ value: totalMl, label })
      monthSleep.push({ value: sleepH, label })
      monthDiaper.push({
        value: diapers.length,
        pee: diaperCounts.peeCount,
        poop: diaperCounts.poopCount,
        displayText: diaperCounts.peeCount || diaperCounts.poopCount ? `${diaperCounts.peeCount}/${diaperCounts.poopCount}` : '',
        label
      })
    })

    const maxFeed = Math.max(...monthFeeding.map(d => d.value), 1)
    const maxSleep = Math.max(...monthSleep.map(d => d.value), 1)
    const maxDiaper = Math.max(...monthDiaper.map(d => Math.max(d.pee, d.poop)), 1)

    monthFeeding.forEach(d => { d.percent = Math.round(d.value / maxFeed * 100) })
    monthSleep.forEach(d => { d.percent = Math.round(d.value / maxSleep * 100) })
    monthDiaper.forEach(d => {
      d.peePercent = Math.round(d.pee / maxDiaper * 100)
      d.poopPercent = Math.round(d.poop / maxDiaper * 100)
    })

    const avgFeedingDuration = feedingDurations.length
      ? Math.round(feedingDurations.reduce((sum, min) => sum + min, 0) / feedingDurations.length)
      : '-'
    const start = days[0]
    const end = days[days.length - 1]

    this.setData({
      monthRangeText: this._formatRangeLabel(start, end),
      monthSummary: {
        activeDays,
        feedingCount,
        totalAmount,
        avgDailyAmount: Math.round(totalAmount / Math.max(1, feedingAmountDays)),
        avgFeedingDuration,
        totalSleepHours: (totalSleepMin / 60).toFixed(1),
        avgSleepHours: (totalSleepMin / 60 / Math.max(1, sleepDays)).toFixed(1),
        peeCount,
        poopCount
      },
      monthFeeding,
      monthSleep,
      monthDiaper
    })
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
