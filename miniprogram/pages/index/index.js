const db = require('../../utils/db')
const { getPercentile } = require('../../utils/growth-standard')
const { buildFeedingPlan, normalizeFeedingPlanConfig, getLogicalDayStart, getLogicalDateStr, isSameLogicalDay } = require('../../utils/feeding-plan')
const { getFeedingReminderKey, getTodoReminderKey, getSnoozeCountdownText, buildLogicalDateTime, formatTodoReminderText, isTodoCancelled } = require('../../utils/local-reminders')
const { matchesTodoDate } = require('../../utils/todo-schedule')
const { applyOngoingAssistantStatus, sanitizeAssistantText, sanitizeAssistantForDisplay } = require('../../utils/assistant-display')
const { getPrimaryEarlyEducationSuggestion } = require('../../utils/early-education')

const DELAYED_FEEDING_KEY = 'delayed_feeding_start'
const DELAYED_START_MIN_MS = 5000
const RECORD_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'feeding', label: '喂奶' },
  { key: 'sleep', label: '睡眠' },
  { key: 'diaper', label: '尿便' },
  { key: 'supplement', label: '辅食' },
  { key: 'bath', label: '洗澡' },
  { key: 'health', label: '健康' },
  { key: 'growth', label: '生长' }
]
const HEALTH_RECORD_TYPES = {
  health_temp: true,
  health_med: true,
  health_vaccine: true,
  health_custom: true
}

function isRecordMatchedByFilter(record, filter) {
  if (!record || !filter || filter === 'all') return true
  if (filter === 'health') return !!HEALTH_RECORD_TYPES[record.type]
  return record.type === filter
}

Page({
  data: {
    currentDate: null,
    currentDateStr: '',
    dateLabel: '今天',
    isToday: true,
    todayStats: {
      feedingCount: 0,
      totalAmount: 0,
      diaperCount: 0,
      peeCount: 0,
      poopCount: 0,
      sleepHours: 0,
      avgInterval: ''
    },
    babyName: '',
    babyAgeText: '',
    lastFeedingAgo: '',
    lastFeedingLabel: '距上次喂奶',
    feedingOverdue: false,
    ongoingFeeding: null,
    ongoingSleep: null,
    feedingElapsed: '',
    sleepElapsed: '',
    defaultFeedingAmount: 0,
    feedingPlan: null,
    feedingReminderCountdown: '',
    aiAssistant: null,
    aiAssistantLoading: false,
    aiAssistantFactText: '',
    aiAssistantReasonText: '',
    earlyEducationSuggestion: null,
    aiVoiceEnabled: false,
    aiVoiceLoading: false,
    aiVoicePlaying: false,
    delayedFeeding: null,
    delayedFeedingLeft: '',
    timeline: [],
    timelineTotalCount: 0,
    recordCountText: '0条记录',
    recordFilter: 'all',
    recordFilterOptions: RECORD_FILTER_OPTIONS,
    timelineEmptyText: '还没有记录，试试语音快速添加吧~',
    showActions: false,
    showHealthForm: false,
    healthEditId: '',
    healthType: '',
    healthTemp: '',
    healthTempMethod: '',
    healthMedName: '',
    healthMedDosage: '',
    healthMedUnit: 'ml',
    successNotice: '',
    fabX: 0,
    fabY: 0,
    fabInited: false
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    if (!this.data.fabInited) {
      const sysInfo = wx.getWindowInfo()
      this.setData({
        fabX: sysInfo.windowWidth - 70,
        fabY: sysInfo.windowHeight - 180,
        fabInited: true
      })
      this._screenWidth = sysInfo.windowWidth
      this._screenHeight = sysInfo.windowHeight
    }
    if (!this.data.currentDate) {
      const now = new Date()
      this.setData({
        currentDate: now,
        currentDateStr: this._formatDateStr(now),
        dateLabel: '今天',
        isToday: true
      })
    }
    this._checkRoleSetup()
    await this._syncConfig()
    this._refreshHomeData()
  },

  async onPullDownRefresh() {
    await this._refreshHomeData()
    wx.stopPullDownRefresh()
  },

  async _checkRoleSetup() {
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }
    if (app.globalData.needsRoleSetup) {
      wx.navigateTo({ url: '/pages/role-select/role-select' })
    }
  },

  async _syncConfig() {
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }
    const config = await db.getConfig()
    app.globalData.config = config
    this.setData({ defaultFeedingAmount: config.defaultFeedingAmount || 0 })
  },

  async _ensureBabyInfo() {
    const app = getApp()
    if (app.globalData.babyInfo) {
      this._updateBabySummary()
      return
    }
    try {
      const res = await db.getBabyInfo()
      if (res.data && res.data.length > 0) {
        app.globalData.babyInfo = res.data[0]
      }
    } catch (e) {
      console.warn('获取宝宝信息失败', e)
    }
    this._updateBabySummary()
  },

  _updateBabySummary() {
    const baby = getApp().globalData.babyInfo || {}
    const current = this.data.currentDate || new Date()
    const name = baby.name || '宝宝'
    let ageText = ''
    if (baby.birthday) {
      ageText = this._calcBabyAgeText(new Date(baby.birthday), current)
    }
    this.setData({ babyName: name, babyAgeText: ageText })
  },

  _calcBabyAgeText(birthday, date) {
    if (!birthday || isNaN(birthday.getTime())) return ''
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const birth = new Date(birthday.getFullYear(), birthday.getMonth(), birthday.getDate())
    if (target < birth) return '未出生'

    let months = (target.getFullYear() - birth.getFullYear()) * 12 + target.getMonth() - birth.getMonth()
    let anchor = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate())
    if (anchor > target) {
      months -= 1
      anchor = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate())
    }
    const days = Math.floor((target - anchor) / 86400000)
    if (months <= 0) return `${days}天`
    return `${months}个月${days}天`
  },

  async _refreshHomeData() {
    const ongoingLoad = this.loadOngoingRecords().then(() => this._loadDelayedFeeding())
    const dayLoad = this.loadDayData()
    await Promise.all([
      dayLoad,
      ongoingLoad,
      this._calcRecentPattern()
    ])
    await this._loadAssistantTodoContext()
    this._updateFeedingPlan()
    this._startFeedingPlanTimer()
    await this.updateLastFeedingTimer()
    this._updateEarlyEducationSuggestion()
    this._loadAiAssistant()
  },

  onHide() {
    this._clearTimers()
  },

  onUnload() {
    this._clearTimers()
  },

  async loadDayData() {
    try {
      await this._ensureBabyInfo()
      const d = this.data.currentDate || new Date()
      const app = getApp()
      const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
      const dayStartHour = config.feedingDayStartHour
      const start = getLogicalDayStart(d, dayStartHour)
      const end = new Date(start.getTime() + 86400000)
      const prevStart = new Date(start.getTime() - 86400000)

      const [res, prevRes] = await Promise.all([
        db.getRecordsOverlappingDateRange(start, end, { lookbackDays: 2, limit: 120 }),
        db.getRecordsOverlappingDateRange(prevStart, start, { lookbackDays: 2, limit: 120 })
      ])

      const seen = {}
      const merged = []
      ;(res.data || []).concat(prevRes.data || []).forEach(r => {
        const id = r._id || `${r.type}_${r.startTime}_${r.endTime || ''}`
        if (seen[id]) return
        seen[id] = true
        merged.push(r)
      })
      const records = merged.filter(r => this._recordOverlapsRange(r, start, end))

      const stats = this._calcStats(records, start, end)
      const timelineData = this._buildTimelineData(records, start, end)

      this._dayRecords = records
      this._timelineRange = { start, end }
      this.setData({ todayStats: stats, ...timelineData })
    } catch (e) {
      console.error('加载数据失败:', e)
    }
  },

  async loadOngoingRecords() {
    try {
      const res = await db.getOngoingRecords()
      const ongoing = res.data || []

      const feeding = ongoing.find(r => r.type === 'feeding') || null
      const sleep = ongoing.find(r => r.type === 'sleep') || null

      this.setData({ ongoingFeeding: feeding, ongoingSleep: sleep })

      if (feeding) {
        this._clearDelayedFeeding()
      }

      if (feeding || sleep) {
        this._startElapsedTimers()
      } else {
        this._clearElapsedTimer()
        this.setData({ feedingElapsed: '', sleepElapsed: '' })
      }
    } catch (e) {
      console.error('加载进行中记录失败:', e)
    }
  },

  async updateLastFeedingTimer() {
    try {
      if (this._lastFeedingInterval) {
        clearInterval(this._lastFeedingInterval)
        this._lastFeedingInterval = null
      }
      if (this.data.ongoingFeeding && this.data.ongoingFeeding.startTime) {
        this._lastFeedingTime = new Date(this.data.ongoingFeeding.startTime).getTime()
        this._lastCompletedFeedingRecord = null
        this._lastFeedingTimeBasis = 'start'
        this._feedingThreshold = (getApp().globalData.config && getApp().globalData.config.feedingIntervalThreshold) || 180
        this.setData({ lastFeedingLabel: '本次喂奶已开始' })
        this._updateLastFeedingAgo()
        this._lastFeedingInterval = setInterval(() => {
          this._updateLastFeedingAgo()
        }, 60000)
        return
      }

      const res = await db.getLastFeeding()
      if (res.data && res.data.length > 0) {
        const last = res.data[0]
        this._lastCompletedFeedingRecord = last
        this._lastFeedingTime = new Date(last.startTime).getTime()
        this._lastFeedingTimeBasis = 'start'
        this._feedingThreshold = (getApp().globalData.config && getApp().globalData.config.feedingIntervalThreshold) || 180
        this.setData({ lastFeedingLabel: '距上次喂奶' })
        this._updateLastFeedingAgo()
        this._lastFeedingInterval = setInterval(() => {
          this._updateLastFeedingAgo()
        }, 60000)
      } else {
        this._lastFeedingTime = null
        this._lastCompletedFeedingRecord = null
        this._lastFeedingTimeBasis = ''
        this.setData({ lastFeedingAgo: '', feedingOverdue: false, lastFeedingLabel: '距上次喂奶' })
        this._updateAssistantFactText()
        this._updateEarlyEducationSuggestion()
      }
    } catch (e) {
      console.error(e)
    }
  },

  _updateLastFeedingAgo() {
    if (!this._lastFeedingTime) return
    const diff = Date.now() - this._lastFeedingTime
    const minutes = Math.floor(diff / 60000)
    const overdue = minutes >= (this._feedingThreshold || 180)
    this.setData({ lastFeedingAgo: this._formatMinutesText(minutes), feedingOverdue: overdue })
    this._updateAssistantFactText()
    this._updateEarlyEducationSuggestion()
  },

  _formatMinutesText(minutes) {
    const total = Math.max(0, Math.floor(minutes || 0))
    if (total < 60) return `${total}分钟`
    const h = Math.floor(total / 60)
    const m = total % 60
    return `${h}小时${m}分钟`
  },

  _toDate(value) {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  },

  _getRecordEndTime(record) {
    const start = this._toDate(record && record.startTime)
    if (!start) return null

    const explicitEnd = this._toDate(record.endTime)
    if (explicitEnd && explicitEnd.getTime() > start.getTime()) return explicitEnd

    if (record.status === 'ongoing') return new Date()

    if (record.type === 'bath' && record.data && record.data.duration) {
      const minutes = parseInt(record.data.duration, 10)
      if (minutes > 0) return new Date(start.getTime() + minutes * 60000)
    }

    return start
  },

  _getCompletedFeedingEndTime(record) {
    if (!record || record.type !== 'feeding' || record.status !== 'completed') return null
    const start = this._toDate(record.startTime)
    if (!start) return null

    const end = this._toDate(record.endTime)
    if (end && end.getTime() >= start.getTime()) return end
    return start
  },

  _getLastCompletedFeeding(records = []) {
    const feedings = (records || [])
      .filter(record => record && record.type === 'feeding' && record.status === 'completed')
      .map(record => ({ record, end: this._getCompletedFeedingEndTime(record) }))
      .filter(item => item.end)
      .sort((a, b) => b.end.getTime() - a.end.getTime())
    return feedings.length ? feedings[0].record : null
  },

  _getLastCompletedSleep(records = []) {
    const sleeps = (records || [])
      .filter(record => record && record.type === 'sleep' && record.status === 'completed' && record.endTime)
      .map(record => ({ record, end: this._toDate(record.endTime) }))
      .filter(item => item.end)
      .sort((a, b) => b.end.getTime() - a.end.getTime())
    return sleeps.length ? sleeps[0].record : null
  },

  _recordStartsInRange(record, start, end) {
    const time = this._toDate(record && record.startTime)
    if (!time) return false
    return time.getTime() >= start.getTime() && time.getTime() < end.getTime()
  },

  _recordOverlapsRange(record, start, end) {
    const recordStart = this._toDate(record && record.startTime)
    const recordEnd = this._getRecordEndTime(record)
    if (!recordStart || !recordEnd) return false

    const startMs = recordStart.getTime()
    const endMs = recordEnd.getTime()
    if (endMs === startMs) return this._recordStartsInRange(record, start, end)
    return startMs < end.getTime() && endMs > start.getTime()
  },

  _getClippedDurationMinutes(record, start, end) {
    const recordStart = this._toDate(record && record.startTime)
    const recordEnd = this._getRecordEndTime(record)
    if (!recordStart || !recordEnd || recordEnd.getTime() <= recordStart.getTime()) return 0

    const clippedStart = Math.max(recordStart.getTime(), start.getTime())
    const clippedEnd = Math.min(recordEnd.getTime(), end.getTime())
    return Math.max(0, Math.round((clippedEnd - clippedStart) / 60000))
  },

  _getTimelineDisplayTime(record, start, end) {
    const recordStart = this._toDate(record && record.startTime)
    const recordEnd = this._getRecordEndTime(record)
    if (!recordStart) return new Date(0)

    if (recordStart.getTime() < start.getTime() && recordEnd && recordEnd.getTime() > start.getTime()) {
      return new Date(Math.min(recordEnd.getTime(), end.getTime()))
    }
    return recordStart
  },

  _getTimelineEmptyText(filter = this.data.recordFilter) {
    if (filter && filter !== 'all') return '当天没有这类记录'
    return this.data.isToday ? '还没有记录，试试语音快速添加吧~' : '当天没有记录'
  },

  _buildTimelineData(records, start, end, filter = this.data.recordFilter) {
    const totalCount = (records || []).filter(r => this._recordOverlapsRange(r, start, end)).length
    const filteredRecords = (records || []).filter(record => isRecordMatchedByFilter(record, filter))
    const timeline = this._formatTimeline(filteredRecords, start, end)
    return {
      timeline,
      timelineTotalCount: totalCount,
      recordCountText: filter === 'all' ? `${totalCount}条记录` : `${timeline.length}/${totalCount}条记录`,
      timelineEmptyText: this._getTimelineEmptyText(filter)
    }
  },

  _getPeeCount(data = {}) {
    const subType = data.subType || 'pee'
    if (subType === 'poop') return 0
    const count = parseInt(data.peeCount, 10)
    return Number.isFinite(count) && count > 0 ? count : 1
  },

  _getDiaperDisplay(data = {}) {
    const subType = data.subType || 'pee'
    const peeCount = this._getPeeCount(data)
    const statusNames = { watery: '水样', mushy: '糊状', soft: '软便', formed: '条状', pellet: '颗粒' }
    const colorNames = { golden: '金黄', yellowgreen: '黄绿', green: '绿色', dark: '深褐' }
    const title = subType === 'poop' ? '大便' : (subType === 'mixed' ? '大小便' : '小便')
    const icon = subType === 'pee' ? '💧' : (subType === 'mixed' ? '💧' : '🟡')
    const parts = []
    if (subType === 'pee') {
      if (peeCount > 1) parts.push(`${peeCount}次`)
    } else {
      if (subType === 'mixed') parts.push(`小便${peeCount}次`)
      if (data.color) parts.push(colorNames[data.color] || data.color)
      if (data.status) parts.push(statusNames[data.status] || data.status)
      if (data.amount) parts.push(data.amount)
    }
    return {
      title,
      desc: parts.join(' '),
      icon,
      diaperClass: `diaper-${subType}`
    }
  },

  _calcStats(records, start, end) {
    let feedingCount = 0, totalAmount = 0, diaperCount = 0, peeCount = 0, poopCount = 0, sleepMinutes = 0
    const feedingTimes = []

    records.forEach(r => {
      switch (r.type) {
        case 'feeding':
          if (r.status === 'completed' && this._recordStartsInRange(r, start, end)) {
            feedingCount++
            totalAmount += (r.data && r.data.amount) || 0
            feedingTimes.push(new Date(r.startTime).getTime())
          }
          break
        case 'diaper':
          if (this._recordStartsInRange(r, start, end)) {
            diaperCount++
            const subType = r.data && r.data.subType
            if (subType === 'poop') {
              poopCount++
            } else if (subType === 'mixed') {
              peeCount += this._getPeeCount(r.data || {})
              poopCount++
            } else {
              peeCount += this._getPeeCount(r.data || {})
            }
          }
          break
        case 'sleep':
          if ((r.status === 'completed' || r.status === 'ongoing') && this._recordOverlapsRange(r, start, end)) {
            sleepMinutes += this._getClippedDurationMinutes(r, start, end)
          }
          break
      }
    })

    let avgInterval = ''
    if (feedingTimes.length >= 2) {
      feedingTimes.sort((a, b) => a - b)
      let totalGap = 0
      for (let i = 1; i < feedingTimes.length; i++) {
        totalGap += feedingTimes[i] - feedingTimes[i - 1]
      }
      const avgMin = Math.round(totalGap / (feedingTimes.length - 1) / 60000)
      if (avgMin >= 60) {
        avgInterval = `${Math.floor(avgMin / 60)}h${avgMin % 60 > 0 ? avgMin % 60 + 'm' : ''}`
      } else {
        avgInterval = `${avgMin}m`
      }
    }

    return {
      feedingCount,
      totalAmount,
      diaperCount,
      peeCount,
      poopCount,
      sleepHours: (sleepMinutes / 60).toFixed(1),
      avgInterval
    }
  },

  _formatTimeline(records, start, end) {
    return records
      .filter(r => this._recordOverlapsRange(r, start, end))
      .sort((a, b) => this._getTimelineDisplayTime(b, start, end) - this._getTimelineDisplayTime(a, start, end))
      .map(r => {
      const time = this._getTimelineDisplayTime(r, start, end)
      const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
      let title = '', desc = ''
      let icon = ''
      let diaperClass = ''

      switch (r.type) {
        case 'feeding':
          title = '喂奶'
          desc = r.data && r.data.amount ? `${r.data.amount}ml` : ''
          if (r.status === 'ongoing') {
            title = '喂奶中...'
          } else if (r.endTime && r.startTime) {
            const dur = Math.floor((new Date(r.endTime) - new Date(r.startTime)) / 60000)
            if (dur > 0) desc += ` ${this._formatDuration(dur)}`
          }
          break
        case 'diaper': {
          const diaperDisplay = this._getDiaperDisplay(r.data || {})
          title = diaperDisplay.title
          desc = diaperDisplay.desc
          icon = diaperDisplay.icon
          diaperClass = diaperDisplay.diaperClass
          break
        }
        case 'sleep':
          title = r.status === 'ongoing' ? '睡觉中...' : '睡眠'
          if (this._recordOverlapsRange(r, start, end)) {
            const dur = this._getClippedDurationMinutes(r, start, end)
            desc = this._formatDuration(dur)
            if (new Date(r.startTime).getTime() < start.getTime()) desc += ' 从前一天开始'
            const recordEnd = this._getRecordEndTime(r)
            if (recordEnd && recordEnd.getTime() > end.getTime()) desc += ' 延续到下一天'
          }
          break
        case 'supplement':
          title = '辅食'
          desc = r.data && r.data.food || ''
          break
        case 'bath':
          title = '洗澡'
          const bathParts = []
          if (r.data && r.data.waterTemp) bathParts.push(`水温${r.data.waterTemp}°C`)
          if (r.data && r.data.duration) bathParts.push(`${r.data.duration}分钟`)
          desc = bathParts.join(' ')
          break
        case 'health_temp':
          title = '体温'
          desc = r.data && r.data.value ? `${r.data.value}°C` : ''
          break
        case 'health_med':
          title = '用药'
          desc = r.data ? `${r.data.name || ''} ${r.data.dosage || ''}${r.data.unit || ''}` : ''
          break
        case 'health_vaccine':
          title = '疫苗'
          desc = r.data && r.data.name ? r.data.name : ''
          break
        case 'health_custom':
          title = '健康事项'
          desc = r.data && r.data.title ? r.data.title : ''
          break
        case 'growth':
          title = '生长记录'
          const gParts = []
          const app = getApp()
          const baby = app.globalData.babyInfo
          const gender = (baby && baby.gender) || 'male'
          const birth = baby && baby.birthday ? new Date(baby.birthday) : null
          const hasBirth = birth && !isNaN(birth.getTime())
          const monthAge = hasBirth ? (new Date(r.startTime) - birth) / (30.44 * 24 * 60 * 60 * 1000) : null
          if (r.data && r.data.weight) {
            const p = monthAge !== null ? getPercentile(r.data.weight, monthAge, gender, 'weight') : null
            gParts.push(`${r.data.weight}kg${p ? `(${p.label})` : ''}`)
          }
          if (r.data && r.data.height) {
            const p = monthAge !== null ? getPercentile(r.data.height, monthAge, gender, 'length') : null
            gParts.push(`${r.data.height}cm${p ? `(${p.label})` : ''}`)
          }
          if (r.data && r.data.headCirc) {
            const p = monthAge !== null ? getPercentile(r.data.headCirc, monthAge, gender, 'hc') : null
            gParts.push(`头围${r.data.headCirc}cm${p ? `(${p.label})` : ''}`)
          }
          desc = gParts.join(' ')
          break
      }

      return { ...r, title, desc, timeStr, icon, diaperClass, recordedBy: r.recordedBy ? r.recordedBy.nickname || r.recordedBy.role : '' }
    })
  },

  _startElapsedTimers() {
    this._clearElapsedTimer()
    this._elapsedInterval = setInterval(() => {
      if (this.data.ongoingFeeding) {
        const elapsed = Date.now() - new Date(this.data.ongoingFeeding.startTime).getTime()
        this.setData({ feedingElapsed: this._formatElapsed(elapsed) })
      }
      if (this.data.ongoingSleep) {
        const elapsed = Date.now() - new Date(this.data.ongoingSleep.startTime).getTime()
        this.setData({ sleepElapsed: this._formatElapsed(elapsed) })
      }
      this._updateAssistantFactText()
      this._updateEarlyEducationSuggestion()
    }, 1000)
  },

  _formatElapsed(ms) {
    const sec = Math.floor(ms / 1000)
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m}:${s}`
    return `${m}:${s}`
  },

  _formatDelayLeft(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000))
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}小时${m}分`
    if (m > 0) return `${m}分${s.toString().padStart(2, '0')}秒`
    return `${s}秒`
  },

  _formatClock(date) {
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  },

  _formatDuration(minutes) {
    if (minutes < 60) return `${minutes}分钟`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
  },

  _showSuccessNotice(title = '记录成功') {
    if (this._successNoticeTimer) {
      clearTimeout(this._successNoticeTimer)
    }
    this.setData({ successNotice: title })
    this._successNoticeTimer = setTimeout(() => {
      this.setData({ successNotice: '' })
      this._successNoticeTimer = null
    }, 2200)
  },

  _showRecordSaveError(err, fallback = '记录失败') {
    if (db.isRecordOverlapError && db.isRecordOverlapError(err)) {
      wx.showModal({
        title: '输入存在问题',
        content: db.getRecordOverlapErrorContent(err),
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#FF9AA2'
      })
      return
    }
    wx.showToast({ title: fallback, icon: 'none' })
  },

  async _saveVoiceBatchRecords(records = []) {
    const validRecords = records.filter(Boolean)
    if (!validRecords.length) return

    let savedCount = 0
    try {
      for (const record of validRecords) {
        const data = { ...(record.data || {}) }
        delete data.action
        if (record.type === 'feeding' && !data.amount) {
          const defaultAmount = getApp().globalData.config && getApp().globalData.config.defaultFeedingAmount
          if (defaultAmount) data.amount = defaultAmount
        }

        await db.addRecord({
          type: record.type,
          startTime: record.startTime,
          endTime: record.endTime || null,
          data,
          status: record.status || 'completed',
          source: 'voice'
        })

        if (record.type === 'health_med' && data.name) {
          await db.updateMedHistory(data)
        }
        savedCount++
      }

      this._showSuccessNotice(`已记录${savedCount}条`)
      await this._refreshHomeData()
    } catch (e) {
      if (savedCount > 0) {
        this._showSuccessNotice(`已记录${savedCount}条`)
        await this._refreshHomeData()
      }
      this._showRecordSaveError(e, '记录失败')
    }
  },

  _loadDelayedFeeding() {
    try {
      if (this.data.ongoingFeeding) {
        this._clearDelayedFeeding()
        return
      }

      const saved = wx.getStorageSync(DELAYED_FEEDING_KEY)
      const savedTime = typeof saved === 'string' ? saved : saved && saved.startTime

      if (!savedTime) {
        this.setData({ delayedFeeding: null, delayedFeedingLeft: '' })
        return
      }

      const target = new Date(savedTime)
      if (Number.isNaN(target.getTime())) {
        this._clearDelayedFeeding()
        return
      }

      if (target.getTime() <= Date.now()) {
        this._clearDelayedFeeding()
        this._handleFeedingStart({ startTime: target, source: 'delayed' })
        return
      }

      this.setData({
        delayedFeeding: {
          startTime: target.toISOString(),
          timeLabel: this._formatClock(target)
        },
        delayedFeedingLeft: this._formatDelayLeft(target.getTime() - Date.now())
      })
      this._startDelayedFeedingTimer(target)
    } catch (e) {
      console.error('加载延迟喂奶失败:', e)
    }
  },

  async _scheduleDelayedFeeding(startTime) {
    const target = new Date(startTime)

    if (Number.isNaN(target.getTime())) {
      await this._handleFeedingStart({ startTime: new Date(), source: 'voice' })
      return
    }

    if (this.data.ongoingFeeding) {
      wx.showToast({ title: '已有喂奶中', icon: 'none' })
      return
    }

    const diff = target.getTime() - Date.now()
    if (diff <= DELAYED_START_MIN_MS) {
      await this._handleFeedingStart({ startTime: new Date(), source: 'delayed' })
      return
    }

    wx.setStorageSync(DELAYED_FEEDING_KEY, { startTime: target.toISOString() })
    this.setData({
      delayedFeeding: {
        startTime: target.toISOString(),
        timeLabel: this._formatClock(target)
      },
      delayedFeedingLeft: this._formatDelayLeft(diff)
    })
    this._startDelayedFeedingTimer(target)
    wx.showToast({ title: '已设倒计时', icon: 'success' })
  },

  _startDelayedFeedingTimer(target) {
    if (this._delayedFeedingInterval) {
      clearInterval(this._delayedFeedingInterval)
      this._delayedFeedingInterval = null
    }

    const tick = () => {
      if (this.data.ongoingFeeding) {
        this._clearDelayedFeeding()
        return
      }

      const diff = target.getTime() - Date.now()
      if (diff <= 0) {
        if (this._delayedFeedingInterval) {
          clearInterval(this._delayedFeedingInterval)
          this._delayedFeedingInterval = null
        }
        wx.removeStorageSync(DELAYED_FEEDING_KEY)
        this.setData({ delayedFeeding: null, delayedFeedingLeft: '' })
        this._handleFeedingStart({ startTime: target, source: 'delayed' })
        return
      }

      this.setData({ delayedFeedingLeft: this._formatDelayLeft(diff) })
    }

    this._delayedFeedingInterval = setInterval(tick, 1000)
    tick()
  },

  _clearDelayedFeeding() {
    if (this._delayedFeedingInterval) {
      clearInterval(this._delayedFeedingInterval)
      this._delayedFeedingInterval = null
    }
    wx.removeStorageSync(DELAYED_FEEDING_KEY)
    if (this.data.delayedFeeding || this.data.delayedFeedingLeft) {
      this.setData({ delayedFeeding: null, delayedFeedingLeft: '' })
    }
  },

  _clearElapsedTimer() {
    if (this._elapsedInterval) {
      clearInterval(this._elapsedInterval)
      this._elapsedInterval = null
    }
  },

  _clearTimers() {
    this._clearElapsedTimer()
    if (this._lastFeedingInterval) {
      clearInterval(this._lastFeedingInterval)
      this._lastFeedingInterval = null
    }
    if (this._delayedFeedingInterval) {
      clearInterval(this._delayedFeedingInterval)
      this._delayedFeedingInterval = null
    }
    if (this._feedingPlanInterval) {
      clearInterval(this._feedingPlanInterval)
      this._feedingPlanInterval = null
    }
    if (this._successNoticeTimer) {
      clearTimeout(this._successNoticeTimer)
      this._successNoticeTimer = null
    }
    this._stopAiAssistantVoice()
  },

  prevDay() {
    const d = new Date(this.data.currentDate)
    d.setDate(d.getDate() - 1)
    this._setDate(d)
  },

  nextDay() {
    if (this.data.isToday) return
    const d = new Date(this.data.currentDate)
    d.setDate(d.getDate() + 1)
    this._setDate(d)
  },

  onDatePick(e) {
    const d = new Date(e.detail.value)
    this._setDate(d)
  },

  goToday() {
    this._setDate(new Date())
  },

  _setDate(d) {
    const today = new Date()
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const isToday = isSameLogicalDay(d, today, config.feedingDayStartHour)
    this.setData({
      currentDate: d,
      currentDateStr: this._formatDateStr(d),
      dateLabel: this._getDateLabel(d),
      isToday
    })
    this._updateBabySummary()
    this.loadDayData().then(() => {
      this._updateFeedingPlan()
      this._startFeedingPlanTimer()
    })
  },

  _collectFeedingPlanRecords() {
    const map = {}
    const records = []
    const add = (record) => {
      if (!record) return
      const key = record._id || `${record.type}_${record.status}_${record.startTime}`
      if (map[key]) return
      map[key] = true
      records.push(record)
    }
    ;(this._dayRecords || []).forEach(add)
    add(this.data.ongoingFeeding)
    add(this.data.ongoingSleep)
    return records
  },

  _updateFeedingPlan() {
    if (!this.data.isToday) {
      if (this.data.feedingPlan || this.data.feedingReminderCountdown) {
        this.setData({ feedingPlan: null, feedingReminderCountdown: '' })
      }
      return
    }
    const app = getApp()
    const config = normalizeFeedingPlanConfig(app.globalData.config || {})
    app.globalData.config = config
    const plan = buildFeedingPlan(this._collectFeedingPlanRecords(), {
      config,
      date: this.data.currentDate || new Date(),
      now: new Date()
    })
    this.setData({ feedingPlan: plan })
    this._updateFeedingReminderCountdown(plan)
  },

  refreshLocalReminderCountdowns() {
    this._updateFeedingReminderCountdown()
  },

  _updateFeedingReminderCountdown(plan = this.data.feedingPlan) {
    if (!this.data.isToday || !plan || !plan.enabled) {
      if (this.data.feedingReminderCountdown) this.setData({ feedingReminderCountdown: '' })
      return
    }
    const nextItem = (plan.planItems || []).find(item => item.state === 'next')
    const date = this.data.currentDate || new Date()
    const dateStr = this._formatDateStr(date)
    const key = getFeedingReminderKey(dateStr, nextItem)
    const text = getSnoozeCountdownText(dateStr, key)
    if (this.data.feedingReminderCountdown !== text) {
      this.setData({ feedingReminderCountdown: text })
    }
  },

  _startFeedingPlanTimer() {
    if (this._feedingPlanInterval) {
      clearInterval(this._feedingPlanInterval)
      this._feedingPlanInterval = null
    }
    if (!this.data.isToday) return
    this._feedingPlanInterval = setInterval(() => {
      this._updateFeedingPlan()
    }, 60000)
  },

  _formatDateStr(d) {
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    return getLogicalDateStr(d, config.feedingDayStartHour)
  },

  _getDateLabel(d) {
    const today = new Date()
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const dayStartHour = config.feedingDayStartHour
    if (isSameLogicalDay(d, today, dayStartHour)) return '今天'
    const yesterday = new Date(today.getTime() - 86400000)
    if (isSameLogicalDay(d, yesterday, dayStartHour)) return '昨天'
    const ds = getLogicalDayStart(d, dayStartHour)
    return `${ds.getMonth() + 1}月${ds.getDate()}日`
  },

  // 语音记录回调
  async onVoiceRecord(e) {
    const { result } = e.detail
    if (!result) return

    if (result.records && Array.isArray(result.records)) {
      await this._saveVoiceBatchRecords(result.records)
      return
    }

    const rawAction = result.action || (result.data && result.data.action) || null
    let action = rawAction
    if (action === 'wake') action = 'end'
    if (action === 'sleep') action = 'start'

    // start/end 动作始终路由到对应处理器；仅 complete/null 时按完整记录处理
    const hasEndTime = !!result.endTime
    const effectiveAction = (action === 'start' || action === 'end') ? action : (hasEndTime ? null : action)

    if (result.type === 'sleep' && effectiveAction === 'end') {
      await this._handleWakeUp(result)
    } else if (result.type === 'sleep' && effectiveAction === 'start') {
      await this._handleSleepStart(result)
    } else if (result.type === 'feeding' && effectiveAction === 'start') {
      await this._handleFeedingStart(result)
    } else if (result.type === 'feeding' && effectiveAction === 'end') {
      await this._handleFeedingEnd(result)
    } else {
      try {
        const data = { ...(result.data || {}) }
        delete data.action
        if (result.type === 'feeding' && !data.amount) {
          const defaultAmount = getApp().globalData.config && getApp().globalData.config.defaultFeedingAmount
          if (defaultAmount) data.amount = defaultAmount
        }
        await db.addRecord({
          type: result.type,
          startTime: result.startTime,
          endTime: result.endTime || null,
          data,
          status: result.status || 'completed',
          source: 'voice'
        })
        if (result.type === 'health_med' && data.name) {
          await db.updateMedHistory(data)
        }
        this._showSuccessNotice('记录成功')
        await this._refreshHomeData()
      } catch (e) {
        this._showRecordSaveError(e, '记录失败')
      }
    }
  },

  onVoiceEdit(e) {
    const { result } = e.detail
    if (!result) return
    if (result.records && result.records.length > 1) {
      wx.showToast({ title: '多条记录请确认后逐条修改', icon: 'none' })
      return
    }
    getApp().globalData.pendingVoiceRecord = result
    wx.navigateTo({
      url: `/pages/record/record?type=${result.type}&mode=manual&from=voice`
    })
  },

  async _handleFeedingStart(result) {
    const startTime = result.startTime ? new Date(result.startTime) : new Date()

    if (result.source !== 'delayed' && startTime.getTime() - Date.now() > DELAYED_START_MIN_MS) {
      await this._scheduleDelayedFeeding(startTime)
      return
    }

    if (this.data.ongoingFeeding) {
      wx.showToast({ title: '已有喂奶中', icon: 'none' })
      return
    }

    try {
      this._clearDelayedFeeding()
      await db.addRecord({
        type: 'feeding',
        startTime,
        data: {},
        status: 'ongoing',
        source: result.source || 'voice'
      })
      this._showSuccessNotice('开始喂奶')
      await this._refreshHomeData()
    } catch (e) {
      this._showRecordSaveError(e, '记录失败')
    }
  },

  async cancelDelayedFeeding() {
    const confirm = await wx.showModal({
      title: '取消倒计时',
      content: '确定取消这次延迟开始喂奶吗？',
      cancelText: '保留',
      confirmText: '确定',
      confirmColor: '#FF9AA2'
    })
    if (!confirm.confirm) return

    this._clearDelayedFeeding()
    wx.showToast({ title: '已取消', icon: 'success' })
  },

  async cancelOngoingFeeding() {
    await this._cancelOngoingRecord(this.data.ongoingFeeding, '喂奶')
  },

  async cancelOngoingSleep() {
    await this._cancelOngoingRecord(this.data.ongoingSleep, '睡觉')
  },

  async _cancelOngoingRecord(record, label) {
    if (!record) return

    const confirm = await wx.showModal({
      title: `取消${label}`,
      content: `确定取消这次${label}计时吗？取消后不会保存为记录。`,
      cancelText: '保留',
      confirmText: '取消',
      confirmColor: '#F44336'
    })
    if (!confirm.confirm) return

    try {
      await db.deleteRecord(record._id)
      wx.showToast({ title: '已取消', icon: 'success' })
      await this._refreshHomeData()
    } catch (e) {
      wx.showToast({ title: '取消失败', icon: 'none' })
    }
  },

  async _handleFeedingEnd(result) {
    const endTime = result.endTime || result.startTime || new Date()
    const amount = (result.data && result.data.amount) || (getApp().globalData.config && getApp().globalData.config.defaultFeedingAmount) || null
    if (this.data.ongoingFeeding) {
      try {
        const updateData = { endTime, status: 'completed' }
        if (amount) {
          updateData.data = { amount }
        }
        await db.updateRecord(this.data.ongoingFeeding._id, updateData)
        this._showSuccessNotice('喂奶结束')
        await this._refreshHomeData()
      } catch (e) {
        this._showRecordSaveError(e, '操作失败')
      }
    } else if (amount) {
      try {
        await db.addRecord({
          type: 'feeding',
          startTime: result.startTime || endTime,
          endTime,
          data: { amount },
          status: 'completed',
          source: 'voice'
        })
        this._showSuccessNotice('记录成功')
        await this._refreshHomeData()
      } catch (e) {
        this._showRecordSaveError(e, '记录失败')
      }
    } else {
      wx.showToast({ title: '没有进行中的喂奶记录', icon: 'none' })
    }
  },

  async _handleWakeUp(result) {
    const endTime = result.endTime || result.startTime || new Date()
    if (this.data.ongoingSleep) {
      try {
        await db.updateRecord(this.data.ongoingSleep._id, {
          endTime,
          status: 'completed'
        })
        this._showSuccessNotice('已记录醒来')
        await this._refreshHomeData()
      } catch (e) {
        this._showRecordSaveError(e, '操作失败')
      }
    } else if (result.startTime && endTime) {
      try {
        const data = { ...(result.data || {}) }
        delete data.action
        await db.addRecord({
          type: 'sleep',
          startTime: result.startTime,
          endTime,
          data,
          status: 'completed',
          source: 'voice'
        })
        this._showSuccessNotice('记录成功')
        await this._refreshHomeData()
      } catch (e) {
        this._showRecordSaveError(e, '记录失败')
      }
    } else {
      wx.showToast({ title: '没有进行中的睡眠记录', icon: 'none' })
    }
  },

  async _handleSleepStart(result) {
    try {
      await db.addRecord({
        type: 'sleep',
        startTime: result.startTime || new Date(),
        data: { sleepType: (result.data && result.data.sleepType) || 'nap' },
        status: 'ongoing',
        source: result.source || 'voice'
      })
      this._showSuccessNotice('宝宝睡了')
      await this._refreshHomeData()
    } catch (e) {
      this._showRecordSaveError(e, '记录失败')
    }
  },

  // FAB 拖拽
  onFabTouchStart(e) {
    const touch = e.touches[0]
    this._fabStartX = touch.clientX
    this._fabStartY = touch.clientY
    this._fabOriginX = this.data.fabX
    this._fabOriginY = this.data.fabY
    this._fabMoved = false
  },

  onFabTouchMove(e) {
    const touch = e.touches[0]
    const dx = touch.clientX - this._fabStartX
    const dy = touch.clientY - this._fabStartY
    if (!this._fabMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    this._fabMoved = true
    const fabSize = 50
    let x = this._fabOriginX + dx
    let y = this._fabOriginY + dy
    x = Math.max(0, Math.min(x, this._screenWidth - fabSize))
    y = Math.max(0, Math.min(y, this._screenHeight - fabSize - 60))
    this.setData({ fabX: x, fabY: y })
  },

  onFabTouchEnd() {
    if (!this._fabMoved) {
      this.showQuickActions()
      return
    }
    const fabSize = 50
    const margin = 15
    const x = this.data.fabX + fabSize / 2 < this._screenWidth / 2
      ? margin
      : this._screenWidth - fabSize - margin
    this.setData({ fabX: x })
  },

  // 快捷操作
  showQuickActions() {
    this.setData({ showActions: true })
  },

  hideQuickActions() {
    this.setData({ showActions: false })
  },

  async onQuickFeeding() {
    if (this.data.ongoingFeeding) {
      await this._quickFinishFeeding()
      return
    }
    await this._handleFeedingStart({ startTime: new Date(), source: 'quick' })
  },

  async onQuickSleep() {
    if (this.data.ongoingSleep) {
      await this._handleWakeUp({ endTime: new Date(), source: 'quick' })
      return
    }
    await this._handleSleepStart({ startTime: new Date(), source: 'quick', data: { sleepType: 'nap' } })
  },

  async _quickFinishFeeding() {
    await this._syncConfig()
    const amount = this.data.defaultFeedingAmount || (getApp().globalData.config && getApp().globalData.config.defaultFeedingAmount) || 0
    if (!amount) {
      wx.showToast({ title: '请先设置每顿奶量', icon: 'none' })
      this.goToFeeding()
      return
    }
    try {
      const currentData = (this.data.ongoingFeeding && this.data.ongoingFeeding.data) || {}
      await db.updateRecord(this.data.ongoingFeeding._id, {
        endTime: new Date(),
        status: 'completed',
        data: { ...currentData, amount }
      })
      this._showSuccessNotice(`已保存${amount}ml`)
      await this._refreshHomeData()
    } catch (e) {
      this._showRecordSaveError(e, '保存失败')
    }
  },

  quickRecord(e) {
    const type = e.currentTarget.dataset.type
    const diaperType = e.currentTarget.dataset.diaperType
    this.setData({ showActions: false })
    const query = type === 'diaper' && diaperType ? `&diaperType=${diaperType}` : ''
    wx.navigateTo({ url: `/pages/record/record?type=${type}${query}` })
  },

  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' })
  },

  setRecordFilter(e) {
    const filter = e.currentTarget.dataset.filter || 'all'
    if (filter === this.data.recordFilter) return
    const range = this._timelineRange
    const timelineData = range
      ? this._buildTimelineData(this._dayRecords || [], range.start, range.end, filter)
      : {}
    this.setData({
      recordFilter: filter,
      ...timelineData
    })
  },

  goHealth(e) {
    this.setData({ showActions: false })
    wx.navigateTo({ url: '/pages/health/health' })
  },

  goToFeeding() {
    wx.navigateTo({ url: '/pages/record/record?type=feeding&mode=ongoing' })
  },

  goToSleep() {
    wx.navigateTo({ url: '/pages/record/record?type=sleep&mode=ongoing' })
  },

  onTimelineItemMore(e) {
    const { item } = e.detail
    if (item.status === 'ongoing') {
      wx.navigateTo({ url: `/pages/record/record?type=${item.type}&mode=ongoing` })
      return
    }
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/record/record?type=${item.type}&mode=edit&id=${item._id}` })
        } else if (res.tapIndex === 1) {
          this._confirmDelete(item)
        }
      }
    })
  },

  async onSwipeDelete(e) {
    const { item } = e.detail
    this._confirmDelete(item)
  },

  async _confirmDelete(item) {
    const confirm = await wx.showModal({ title: '确认删除', content: '删除后无法恢复', confirmColor: '#F44336' })
    if (confirm.confirm) {
      try {
        await db.deleteRecord(item._id)
        wx.showToast({ title: '已删除', icon: 'success' })
        await this._refreshHomeData()
      } catch (err) {
        wx.showToast({ title: '删除失败', icon: 'none' })
      }
    }
  },

  showGrowthForm() {
    this.setData({ showActions: false })
    wx.navigateTo({ url: '/pages/record/record?type=growth' })
  },

  hideHealthForm() {
    this.setData({ showHealthForm: false })
  },

  onHealthTemp(e) { this.setData({ healthTemp: e.detail.value }) },
  setHealthTempMethod(e) { this.setData({ healthTempMethod: e.currentTarget.dataset.val }) },
  onHealthMedName(e) { this.setData({ healthMedName: e.detail.value }) },
  onHealthMedDosage(e) { this.setData({ healthMedDosage: e.detail.value }) },
  setHealthMedUnit(e) { this.setData({ healthMedUnit: e.currentTarget.dataset.val }) },

  async saveHealth() {
    const { healthType, healthEditId, healthTemp, healthTempMethod, healthMedName, healthMedDosage, healthMedUnit } = this.data
    let data = {}

    if (healthType === 'temp') {
      if (!healthTemp) { wx.showToast({ title: '请输入体温', icon: 'none' }); return }
      data = { value: parseFloat(healthTemp), method: healthTempMethod }
    } else {
      if (!healthMedName) { wx.showToast({ title: '请输入药品名', icon: 'none' }); return }
      data = { name: healthMedName, dosage: healthMedDosage ? parseFloat(healthMedDosage) : null, unit: healthMedUnit }
    }

    try {
      await db.updateRecord(healthEditId, { data })
      this._showSuccessNotice('保存成功')
      this.setData({ showHealthForm: false })
      await this._refreshHomeData()
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  _getBabyAgeMonths(now = new Date()) {
    const app = getApp()
    const babyInfo = (app && app.globalData && app.globalData.babyInfo) || {}
    if (!babyInfo.birthday) return null

    const birth = new Date(babyInfo.birthday)
    if (isNaN(birth.getTime()) || birth.getTime() > now.getTime()) return null
    return Math.round((now.getTime() - birth.getTime()) / (30.44 * 24 * 60 * 60 * 1000) * 10) / 10
  },

  _getNextPlannedMinutesFromNow(now = new Date()) {
    const plan = this.data.feedingPlan
    const nextPlanItem = plan && plan.planItems ? plan.planItems.find(item => item.state === 'next') : null
    const nextPlanTime = this._toDate(nextPlanItem && nextPlanItem.time)
    return nextPlanTime ? Math.max(0, Math.round((nextPlanTime.getTime() - now.getTime()) / 60000)) : null
  },

  _getHighestTodayTemp(records = []) {
    const temps = (records || [])
      .filter(record => record && record.type === 'health_temp')
      .map(record => Number(record.data && record.data.value))
      .filter(value => Number.isFinite(value))
    return temps.length ? Math.max(...temps) : null
  },

  _buildEarlyEducationContext(now = new Date()) {
    const records = this._dayRecords || []
    const lastFeeding = this._getLastCompletedFeeding(records) || this._lastCompletedFeedingRecord
    const lastFeedingEnd = this._getCompletedFeedingEndTime(lastFeeding)
    const lastSleep = this._getLastCompletedSleep(records)
    const lastSleepEnd = this._toDate(lastSleep && lastSleep.endTime)
    const ongoingType = this.data.ongoingSleep ? 'sleep' : (this.data.ongoingFeeding ? 'feeding' : '')

    return {
      now,
      babyAgeMonths: this._getBabyAgeMonths(now),
      ongoingType,
      lastFeedingEndMinAgo: lastFeedingEnd ? Math.round((now.getTime() - lastFeedingEnd.getTime()) / 60000) : null,
      lastSleepEndMinAgo: lastSleepEnd ? Math.round((now.getTime() - lastSleepEnd.getTime()) / 60000) : null,
      nextPlannedMinutesFromNow: this._getNextPlannedMinutesFromNow(now),
      highestTempC: this._getHighestTodayTemp(records)
    }
  },

  _updateEarlyEducationSuggestion(now = new Date()) {
    if (!this.data.isToday) {
      if (this.data.earlyEducationSuggestion) {
        this.setData({ earlyEducationSuggestion: null })
      }
      return null
    }

    const suggestion = getPrimaryEarlyEducationSuggestion(this._buildEarlyEducationContext(now))
    const current = JSON.stringify(this.data.earlyEducationSuggestion || null)
    const next = JSON.stringify(suggestion || null)
    if (current !== next) {
      this.setData({ earlyEducationSuggestion: suggestion || null })
    }
    return suggestion
  },

  // AI 助手
  async _loadAssistantTodoContext() {
    if (!this.data.isToday) {
      this._assistantTodoContext = null
      return
    }

    try {
      const now = new Date()
      const app = getApp()
      const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
      const dayStartHour = config.feedingDayStartHour
      const date = this.data.currentDate || now
      const dateStr = getLogicalDateStr(date, dayStartHour)
      const records = this._dayRecords || []
      const completedMap = {}

      records.forEach(record => {
        if (record.todoId && record.todoDate === dateStr && record.status === 'completed') {
          completedMap[record.todoId] = record
        }
      })

      const todoRes = await db.getTodos()
      const items = (todoRes.data || [])
        .filter(todo => todo && todo.enabled !== false && matchesTodoDate(todo, dateStr))
        .map(todo => {
          const scheduledAt = buildLogicalDateTime(dateStr, todo.time, dayStartHour)
          const done = !!completedMap[todo._id]
          const cancelled = !done && isTodoCancelled(todo, dateStr)
          if (cancelled) return null
          const minutesFromNow = Math.round((scheduledAt.getTime() - now.getTime()) / 60000)
          const reminderKey = getTodoReminderKey(todo, dateStr)
          return {
            id: todo._id,
            type: todo.type || 'health_custom',
            title: formatTodoReminderText(todo),
            time: todo.time || '',
            status: done ? 'done' : (minutesFromNow <= 0 ? 'due' : 'upcoming'),
            minutesFromNow,
            snoozed: !done && !!getSnoozeCountdownText(dateStr, reminderKey, now)
          }
        })
        .filter(Boolean)

      const pending = items.filter(item => item.status !== 'done')
      const dueNow = pending
        .filter(item => item.minutesFromNow <= 0)
        .sort((a, b) => a.minutesFromNow - b.minutesFromNow)
      const upcoming = pending
        .filter(item => item.minutesFromNow > 0)
        .sort((a, b) => a.minutesFromNow - b.minutesFromNow)

      this._assistantTodoContext = {
        date: dateStr,
        summary: {
          total: items.length,
          done: items.filter(item => item.status === 'done').length,
          pending: pending.length,
          due: dueNow.length,
          upcoming: upcoming.length
        },
        dueNow: dueNow.slice(0, 4),
        upcoming: upcoming.slice(0, 3)
      }
    } catch (e) {
      console.warn('加载AI待办上下文失败', e)
      this._assistantTodoContext = null
    }
  },

  async _loadAiAssistant() {
    if (!this.data.isToday) return

    const context = this._buildAssistantContext()
    if (!context) return
    const signature = this._getAssistantContextSignature(context)
    const cache = wx.getStorageSync('ai_assistant_cache')
    if (cache && cache.data && cache.signature === signature && (Date.now() - cache.timestamp < 10 * 60 * 1000)) {
      if (!this.data.aiAssistant) {
        const assistant = this._getAiAssistantForDisplay(cache.data)
        this.setData({
          aiAssistant: assistant,
          aiAssistantReasonText: this._getAiAssistantReasonText(assistant, this.data.aiAssistantFactText)
        })
      }
      return
    }

    this.setData({ aiAssistantLoading: true })
    try {
      if (!context) { this.setData({ aiAssistantLoading: false }); return }

      const res = await wx.cloud.callFunction({ name: 'babyAssistant', data: { context } })
      const result = res.result
      if (result && result.success && result.data) {
        const assistant = this._getAiAssistantForDisplay(result.data)
        this.setData({
          aiAssistant: assistant,
          aiAssistantLoading: false,
          aiAssistantReasonText: this._getAiAssistantReasonText(assistant, this.data.aiAssistantFactText)
        })
        wx.setStorageSync('ai_assistant_cache', { data: result.data, timestamp: Date.now(), signature })
      } else {
        this.setData({ aiAssistantLoading: false })
      }
    } catch (e) {
      console.warn('AI助手请求失败', e)
      this.setData({ aiAssistantLoading: false })
    }
  },

  async refreshAiAssistant() {
    wx.removeStorageSync('ai_assistant_cache')
    this._stopAiAssistantVoice()
    this.setData({ aiAssistant: null, aiAssistantReasonText: '' })
    await this._loadAssistantTodoContext()
    this._loadAiAssistant()
  },

  _getAiAssistantForDisplay(assistant, now = new Date()) {
    const calibrated = applyOngoingAssistantStatus(assistant, {
      ongoingSleep: this.data.ongoingSleep,
      ongoingFeeding: this.data.ongoingFeeding
    }, now)
    return sanitizeAssistantForDisplay(calibrated)
  },

  _normalizeSpeechText(text) {
    return String(text || '')
      .replace(/[·•]/g, '。')
      .replace(/\s+/g, ' ')
      .replace(/([。！？])+/g, '$1')
      .trim()
      .slice(0, 140)
  },

  _isSameAssistantLine(a, b) {
    const clean = (text) => this._normalizeAssistantLine(text)
    return clean(a) && clean(a) === clean(b)
  },

  _normalizeAssistantLine(text) {
    return String(text || '')
      .replace(/(\d+)小时(\d+)分钟/g, (_, h, m) => `${parseInt(h, 10) * 60 + parseInt(m, 10)}分钟`)
      .replace(/(\d+)小时/g, (_, h) => `${parseInt(h, 10) * 60}分钟`)
      .replace(/宝宝刚睡|正在睡觉|已睡|睡觉中/g, '睡')
      .replace(/宝宝/g, '')
      .replace(/[，。,.、\s]/g, '')
      .trim()
  },

  _isRepeatedAssistantReason(reason, factText) {
    const reasonLine = this._normalizeAssistantLine(reason)
    const factLine = this._normalizeAssistantLine(factText)
    if (!reasonLine || !factLine) return false
    if (reasonLine === factLine) return true

    const fragments = String(factText || '')
      .split(/[，。,.、]/)
      .map(item => this._normalizeAssistantLine(item))
      .filter(item => item.length >= 4)
    if (!fragments.length) return false

    const hits = fragments.filter(item => reasonLine.includes(item) || item.includes(reasonLine))
    if (hits.length === fragments.length) return true
    const covered = hits.reduce((sum, item) => sum + item.length, 0)
    return hits.length > 0 && covered / reasonLine.length >= 0.6
  },

  _getAiAssistantReasonText(assistant, factText = this.data.aiAssistantFactText) {
    const reason = sanitizeAssistantText(assistant && assistant.reason)
    if (!reason) return ''
    if (this._isRepeatedAssistantReason(reason, factText)) return ''
    return reason
  },

  _buildAiAssistantSpeechText() {
    const assistant = this.data.aiAssistant
    if (!assistant) return ''
    const parts = []
    if (assistant.status) parts.push(assistant.status)
    ;(assistant.suggestions || []).slice(0, 2).forEach(item => {
      if (item) parts.push(item)
    })
    if (this.data.aiAssistantFactText) parts.push(this.data.aiAssistantFactText)
    const reasonText = this._getAiAssistantReasonText(assistant)
    if (reasonText) {
      parts.push(`依据：${reasonText}`)
    }
    return this._normalizeSpeechText(parts.filter(Boolean).join('。'))
  },

  _hashText(text) {
    let hash = 0
    const source = String(text || '')
    for (let i = 0; i < source.length; i++) {
      hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
    }
    return String(hash).replace('-', 'n')
  },

  _getAiAudioContext() {
    if (this._aiAudio) return this._aiAudio
    const audio = wx.createInnerAudioContext()
    audio.obeyMuteSwitch = false
    audio.onEnded(() => {
      this.setData({ aiVoicePlaying: false })
    })
    audio.onStop(() => {
      this.setData({ aiVoicePlaying: false })
    })
    audio.onError((err) => {
      console.warn('AI语音播放失败', err)
      this.setData({ aiVoiceLoading: false, aiVoicePlaying: false })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })
    this._aiAudio = audio
    return audio
  },

  _stopAiAssistantVoice() {
    if (this._aiAudio) {
      try {
        this._aiAudio.stop()
      } catch (e) {}
    }
    if (this.data.aiVoicePlaying || this.data.aiVoiceLoading) {
      this.setData({ aiVoicePlaying: false, aiVoiceLoading: false })
    }
  },

  _writeAiVoiceFile(filePath, base64Audio) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().writeFile({
        filePath,
        data: base64Audio,
        encoding: 'base64',
        success: resolve,
        fail: reject
      })
    })
  },

  _playAiVoiceFile(filePath) {
    const audio = this._getAiAudioContext()
    audio.stop()
    audio.src = filePath
    audio.play()
    this.setData({ aiVoicePlaying: true, aiVoiceLoading: false })
  },

  async playAiAssistantVoice() {
    if (this.data.aiVoiceLoading) return
    if (this.data.aiVoicePlaying) {
      this._stopAiAssistantVoice()
      return
    }

    const text = this._buildAiAssistantSpeechText()
    if (!text) {
      wx.showToast({ title: '暂无可播报内容', icon: 'none' })
      return
    }

    const key = this._hashText(text)
    this._aiVoiceFiles = this._aiVoiceFiles || {}
    if (this._aiVoiceFiles[key]) {
      this._playAiVoiceFile(this._aiVoiceFiles[key])
      return
    }

    this.setData({ aiVoiceLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'textToSpeech',
        data: { text }
      })
      const result = res.result || {}
      if (!result.success || !result.audio) {
        throw new Error(result.error || '语音合成失败')
      }

      const filePath = `${wx.env.USER_DATA_PATH}/ai_assistant_${key}.mp3`
      await this._writeAiVoiceFile(filePath, result.audio)
      this._aiVoiceFiles[key] = filePath
      this._playAiVoiceFile(filePath)
    } catch (e) {
      console.warn('AI语音合成失败', e)
      this.setData({ aiVoiceLoading: false, aiVoicePlaying: false })
      const msg = String(e && e.message || e || '')
      if (msg.includes('ServerNotOpen') || msg.includes('TTS service is not open')) {
        wx.showModal({
          title: '需开通语音合成',
          content: '腾讯云 TTS 服务还未开通。请在腾讯云语音合成控制台完成开通后，再重新部署 textToSpeech 云函数。',
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({ title: '语音生成失败', icon: 'none' })
      }
    }
  },

  _updateAssistantFactText(now = new Date()) {
    if (!this.data.isToday) {
      if (this.data.aiAssistantFactText || this.data.aiAssistantReasonText) {
        this.setData({ aiAssistantFactText: '', aiAssistantReasonText: '' })
      }
      return ''
    }

    const parts = []
    if (this.data.ongoingFeeding && this.data.ongoingFeeding.startTime) {
      const start = this._toDate(this.data.ongoingFeeding.startTime)
      if (start) {
        parts.push(`正在喂奶 ${this._formatMinutesText(Math.floor((now - start) / 60000))}`)
      }
    } else {
      const lastFeeding = this._getLastCompletedFeeding(this._dayRecords || []) || this._lastCompletedFeedingRecord
      const end = this._getCompletedFeedingEndTime(lastFeeding)
      if (end) {
        parts.push(`距上次喂奶结束 ${this._formatMinutesText(Math.floor((now - end) / 60000))}`)
      }
    }

    if (this.data.ongoingSleep && this.data.ongoingSleep.startTime) {
      const start = this._toDate(this.data.ongoingSleep.startTime)
      if (start) {
        parts.push(`正在睡觉 ${this._formatMinutesText(Math.floor((now - start) / 60000))}`)
      }
    } else {
      const lastSleep = this._getLastCompletedSleep(this._dayRecords || [])
      const sleepEnd = this._toDate(lastSleep && lastSleep.endTime)
      if (sleepEnd) {
        parts.push(`醒了 ${this._formatMinutesText(Math.floor((now - sleepEnd) / 60000))}`)
      }
    }

    const text = parts.join('，')
    const reasonText = this._getAiAssistantReasonText(this.data.aiAssistant, text)
    const patch = {}
    if (this.data.aiAssistantFactText !== text) {
      patch.aiAssistantFactText = text
    }
    if (this.data.aiAssistantReasonText !== reasonText) {
      patch.aiAssistantReasonText = reasonText
    }
    const assistant = this._getAiAssistantForDisplay(this.data.aiAssistant, now)
    if (assistant && assistant !== this.data.aiAssistant) {
      patch.aiAssistant = assistant
    }
    if (Object.keys(patch).length) {
      this.setData(patch)
    }
    return text
  },

  _getAssistantContextSignature(context) {
    const source = JSON.stringify({
      babyAgeMonths: context.babyAgeMonths,
      todayFeedings: context.todayFeedings,
      todaySleeps: context.todaySleeps,
      todayDiapers: context.todayDiapers,
      ongoing: context.ongoing,
      lastFeedingMinBucket: context.lastFeedingMinAgo == null ? null : Math.floor(context.lastFeedingMinAgo / 10),
      lastFeedingStartMinBucket: context.lastFeedingStartMinAgo == null ? null : Math.floor(context.lastFeedingStartMinAgo / 10),
      lastFeedingDurationMin: context.lastFeedingDurationMin,
      lastSleepEndMinBucket: context.lastSleepEndMinAgo == null ? null : Math.floor(context.lastSleepEndMinAgo / 10),
      careFacts: context.careFacts,
      plan: context.plan ? {
        ...context.plan,
        nextPlannedMinutesFromNow: context.plan.nextPlannedMinutesFromNow == null
          ? null
          : Math.floor(context.plan.nextPlannedMinutesFromNow / 10) * 10
      } : null,
      pattern: context.pattern,
      todos: context.todos
    })
    let hash = 0
    for (let i = 0; i < source.length; i++) {
      hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0
    }
    return String(hash)
  },

  _getMinuteOfDay(date) {
    return date.getHours() * 60 + date.getMinutes()
  },

  _formatClockFromMinute(minute) {
    const safe = ((Math.round(minute) % 1440) + 1440) % 1440
    const h = Math.floor(safe / 60)
    const m = safe % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  },

  _buildCareFacts(records, now, values = {}) {
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const dayStart = getLogicalDayStart(now, config.feedingDayStartHour)
    const dayEnd = new Date(dayStart.getTime() + 86400000)
    const sleepRecords = (records || []).filter(r => r.type === 'sleep' && (r.status === 'completed' || r.status === 'ongoing'))
    const todaySleepTotalMin = sleepRecords.reduce((sum, record) => {
      return sum + this._getClippedDurationMinutes(record, dayStart, dayEnd)
    }, 0)
    const napCount = sleepRecords.filter(r => r.status === 'completed' && r.endTime).length
    const pattern = values.pattern || null
    const avgDailySleepMin = pattern && pattern.avgDailySleepMin
    const sleepDebtMin = avgDailySleepMin ? Math.round(avgDailySleepMin - todaySleepTotalMin) : null

    return {
      firstCheckOrder: ['feeding', 'sleep'],
      currentLocalTime: this._formatClock(now),
      awakeSinceLastSleepMin: values.lastSleepEndMinAgo,
      todaySleepTotalMin,
      todayNapCount: napCount,
      recentAvgDailySleepMin: avgDailySleepMin || null,
      sleepDebtMin,
      samePeriodSleepPattern: pattern && pattern.samePeriodSleepPattern || null,
      feeding: {
        lastFeedingStartMinAgo: values.lastFeedingStartMinAgo,
        lastFeedingEndMinAgo: values.lastFeedingMinAgo,
        lastFeedingDurationMin: values.lastFeedingDurationMin,
        nextPlannedMinutesFromNow: values.nextPlannedMinutesFromNow,
        nextPlannedTime: values.nextPlannedTime || ''
      },
      note: '这些是事实和近期规律，不是硬阈值；请结合宝宝年龄、当天睡眠、同一时段规律判断。'
    }
  },

  _buildAssistantContext() {
    const records = this._dayRecords || []
    const now = new Date()
    const app = getApp()
    const babyInfo = app.globalData.babyInfo || {}

    let babyAgeMonths = null
    if (babyInfo.birthday) {
      const birth = new Date(babyInfo.birthday)
      if (!isNaN(birth.getTime())) {
        babyAgeMonths = Math.round((now - birth) / (30.44 * 24 * 60 * 60 * 1000) * 10) / 10
      }
    }

    const fmt = (d) => `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`

    const todayFeedings = records
      .filter(r => r.type === 'feeding' && r.status === 'completed')
      .map(r => {
        const start = this._toDate(r.startTime)
        const end = this._getCompletedFeedingEndTime(r)
        const durationMin = start && end ? Math.max(0, Math.round((end - start) / 60000)) : null
        return {
          start: start ? fmt(start) : '',
          end: end ? fmt(end) : '',
          durationMin,
          amount: (r.data && r.data.amount) || null
        }
      })

    const todaySleeps = records
      .filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime)
      .map(r => {
        const s = new Date(r.startTime)
        const e = new Date(r.endTime)
        return { start: fmt(s), end: fmt(e), durationMin: Math.round((e - s) / 60000) }
      })

    const todayDiapers = records
      .filter(r => r.type === 'diaper')
      .map(r => ({ time: fmt(new Date(r.startTime)), type: (r.data && r.data.subType) || 'unknown', peeCount: this._getPeeCount(r.data || {}) }))

    let ongoing = null
    if (this.data.ongoingSleep) {
      const s = new Date(this.data.ongoingSleep.startTime)
      ongoing = { type: 'sleep', startTime: fmt(s), elapsedMin: Math.round((now - s) / 60000) }
    } else if (this.data.ongoingFeeding) {
      const s = new Date(this.data.ongoingFeeding.startTime)
      ongoing = { type: 'feeding', startTime: fmt(s), elapsedMin: Math.round((now - s) / 60000) }
    }

    let lastFeedingMinAgo = null
    let lastFeedingStartMinAgo = null
    let lastFeedingDurationMin = null
    const lastFeeding = this._getLastCompletedFeeding(records) || this._lastCompletedFeedingRecord
    if (lastFeeding) {
      const start = this._toDate(lastFeeding.startTime)
      const end = this._getCompletedFeedingEndTime(lastFeeding)
      if (end) lastFeedingMinAgo = Math.round((now - end) / 60000)
      if (start) lastFeedingStartMinAgo = Math.round((now - start) / 60000)
      if (start && end) lastFeedingDurationMin = Math.max(0, Math.round((end - start) / 60000))
    }

    let lastSleepEndMinAgo = null
    const lastSleep = [...records].filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime).sort((a, b) => new Date(b.endTime) - new Date(a.endTime))[0]
    if (lastSleep) lastSleepEndMinAgo = Math.round((now - new Date(lastSleep.endTime)) / 60000)

    const plan = this.data.feedingPlan
    const nextPlanItem = plan && plan.planItems ? plan.planItems.find(item => item.state === 'next') : null
    const nextPlanTime = this._toDate(nextPlanItem && nextPlanItem.time)
    const nextPlannedMinutesFromNow = nextPlanTime ? Math.max(0, Math.round((nextPlanTime - now) / 60000)) : null
    const planContext = plan ? {
      targetCount: plan.targetCount,
      amount: plan.amount,
      completedCount: plan.completedCount,
      remainingCount: plan.remainingCount,
      nextPlannedTime: plan.nextTimeLabel || '',
      nextPlannedMinutesFromNow,
      nextPlannedSource: 'client_local_plan'
    } : null

    const pattern = this._recentPattern || null
    const careFacts = this._buildCareFacts(records, now, {
      pattern,
      lastSleepEndMinAgo,
      lastFeedingMinAgo,
      lastFeedingStartMinAgo,
      lastFeedingDurationMin,
      nextPlannedMinutesFromNow,
      nextPlannedTime: planContext && planContext.nextPlannedTime
    })

    return {
      now: now.toISOString(),
      nowLocalTime: fmt(now),
      timezoneOffsetMinutes: -now.getTimezoneOffset(),
      babyAgeMonths,
      todayFeedings,
      todaySleeps,
      todayDiapers,
      ongoing,
      lastFeedingMinAgo,
      lastFeedingStartMinAgo,
      lastFeedingDurationMin,
      lastFeedingReference: 'end',
      lastSleepEndMinAgo,
      careFacts,
      plan: planContext,
      pattern,
      factText: this._updateAssistantFactText(now),
      todos: this._assistantTodoContext || null
    }
  },

  async _calcRecentPattern() {
    if (this._recentPattern && this._recentPatternDate === new Date().toDateString()) return
    try {
      const app = getApp()
      const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
      const dayStartHour = config.feedingDayStartHour
      const now = new Date()
      const threeStart = new Date(getLogicalDayStart(now, dayStartHour).getTime() - 3 * 86400000)
      const todayEnd = new Date(getLogicalDayStart(now, dayStartHour).getTime() + 86400000)

      const res = await db.getRecordsOverlappingDateRange(threeStart, todayEnd, { lookbackDays: 5, limit: 300 })
      const records = (res.data || []).filter(r => {
        const t = new Date(r.startTime).getTime()
        return t >= threeStart.getTime() && t < getLogicalDayStart(now, dayStartHour).getTime()
      })

      const feedings = records.filter(r => r.type === 'feeding' && r.status === 'completed')
      const sleeps = records.filter(r => r.type === 'sleep' && r.status === 'completed' && r.endTime)

      let avgFeedingIntervalMin = null
      if (feedings.length >= 4) {
        const times = feedings.map(r => new Date(r.startTime).getTime()).sort()
        let totalGap = 0
        for (let i = 1; i < times.length; i++) totalGap += times[i] - times[i - 1]
        avgFeedingIntervalMin = Math.round(totalGap / (times.length - 1) / 60000)
      }

      let avgSleepDurationMin = null
      let avgDailySleepMin = null
      if (sleeps.length >= 2) {
        const totalMin = sleeps.reduce((sum, r) => sum + (new Date(r.endTime) - new Date(r.startTime)) / 60000, 0)
        avgSleepDurationMin = Math.round(totalMin / sleeps.length)
      }

      if (sleeps.length >= 1) {
        const dailySleepMap = {}
        sleeps.forEach(r => {
          const start = this._toDate(r.startTime)
          const end = this._toDate(r.endTime)
          if (!start || !end || end <= start) return
          const dateStr = getLogicalDateStr(start, dayStartHour)
          dailySleepMap[dateStr] = (dailySleepMap[dateStr] || 0) + Math.round((end - start) / 60000)
        })
        const totals = Object.keys(dailySleepMap).map(key => dailySleepMap[key])
        if (totals.length) {
          avgDailySleepMin = Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length)
        }
      }

      let avgNapCount = null
      if (sleeps.length >= 1) {
        avgNapCount = Math.round(sleeps.length / 3)
      }

      let avgDailyAmountMl = null
      if (feedings.length >= 1) {
        const totalMl = feedings.reduce((sum, r) => sum + ((r.data && r.data.amount) || 0), 0)
        avgDailyAmountMl = Math.round(totalMl / 3)
      }

      let samePeriodSleepPattern = null
      if (sleeps.length >= 1) {
        const currentMinute = this._getMinuteOfDay(now)
        const sleepInfos = sleeps
          .map(r => {
            const start = this._toDate(r.startTime)
            const end = this._toDate(r.endTime)
            if (!start || !end || end <= start) return null
            return {
              record: r,
              start,
              end,
              startMinute: this._getMinuteOfDay(start),
              dateStr: getLogicalDateStr(start, dayStartHour)
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.start - b.start)

        const completedByDay = {}
        sleepInfos.forEach(item => {
          completedByDay[item.dateStr] = completedByDay[item.dateStr] || []
          completedByDay[item.dateStr].push(item)
        })

        const samePeriod = sleepInfos
          .map(item => {
            const diff = Math.abs(item.startMinute - currentMinute)
            return { ...item, clockDiffMin: Math.min(diff, 1440 - diff) }
          })
          .filter(item => item.clockDiffMin <= 120)

        if (samePeriod.length) {
          const awakeBeforeValues = []
          samePeriod.forEach(item => {
            const daySleeps = completedByDay[item.dateStr] || []
            const prev = daySleeps
              .filter(s => s.end < item.start)
              .sort((a, b) => b.end - a.end)[0]
            if (prev) awakeBeforeValues.push(Math.round((item.start - prev.end) / 60000))
          })
          const avgStartMinute = Math.round(samePeriod.reduce((sum, item) => sum + item.startMinute, 0) / samePeriod.length)
          samePeriodSleepPattern = {
            sampleCount: samePeriod.length,
            usualSleepStartTime: this._formatClockFromMinute(avgStartMinute),
            minutesFromUsualStart: Math.round(currentMinute - avgStartMinute),
            avgAwakeBeforeSleepMin: awakeBeforeValues.length
              ? Math.round(awakeBeforeValues.reduce((sum, value) => sum + value, 0) / awakeBeforeValues.length)
              : null
          }
        }
      }

      this._recentPattern = {
        avgSleepDurationMin,
        avgDailySleepMin,
        avgFeedingIntervalMin,
        avgNapCount,
        avgDailyAmountMl,
        samePeriodSleepPattern
      }
      this._recentPatternDate = now.toDateString()
    } catch (e) {
      console.warn('计算近期规律失败', e)
    }
  }
})
