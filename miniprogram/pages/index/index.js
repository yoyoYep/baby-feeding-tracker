const db = require('../../utils/db')
const { getPercentile } = require('../../utils/growth-standard')
const { buildFeedingPlan, normalizeFeedingPlanConfig } = require('../../utils/feeding-plan')

const DELAYED_FEEDING_KEY = 'delayed_feeding_start'
const DELAYED_START_MIN_MS = 5000

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
    delayedFeeding: null,
    delayedFeedingLeft: '',
    timeline: [],
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
    await Promise.all([
      this.loadDayData(),
      ongoingLoad
    ])
    this._updateFeedingPlan()
    this._startFeedingPlanTimer()
    await this.updateLastFeedingTimer()
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
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
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

      console.log('[loadDayData] 查看日期:', start.toLocaleDateString(), '主查询:', (res.data || []).length, '补充查询:', (prevRes.data || []).length, '合并后:', merged.length, '过滤后:', records.length)
      if (merged.length !== records.length) {
        const dropped = merged.filter(r => !this._recordOverlapsRange(r, start, end))
        console.log('[loadDayData] 被过滤掉的记录:', dropped.map(r => ({ id: r._id, type: r.type, startTime: r.startTime && new Date(r.startTime).toLocaleString() })))
      }

      const stats = this._calcStats(records, start, end)
      const timeline = this._formatTimeline(records, start, end)

      this._dayRecords = records
      this.setData({ todayStats: stats, timeline })
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
        this._lastFeedingTime = new Date(last.startTime).getTime()
        this._feedingThreshold = (getApp().globalData.config && getApp().globalData.config.feedingIntervalThreshold) || 180
        this.setData({ lastFeedingLabel: '距上次喂奶' })
        this._updateLastFeedingAgo()
        this._lastFeedingInterval = setInterval(() => {
          this._updateLastFeedingAgo()
        }, 60000)
      } else {
        this._lastFeedingTime = null
        this.setData({ lastFeedingAgo: '', feedingOverdue: false, lastFeedingLabel: '距上次喂奶' })
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
    if (minutes < 60) {
      this.setData({ lastFeedingAgo: `${minutes}分钟`, feedingOverdue: overdue })
    } else {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      this.setData({ lastFeedingAgo: `${h}小时${m}分钟`, feedingOverdue: overdue })
    }
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

  _calcStats(records, start, end) {
    let feedingCount = 0, totalAmount = 0, diaperCount = 0, sleepMinutes = 0
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
          if (this._recordStartsInRange(r, start, end)) diaperCount++
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
        case 'diaper':
          const subNames = { pee: '小便', poop: '大便', mixed: '大小便' }
          title = '换尿布'
          desc = subNames[r.data && r.data.subType] || ''
          break
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

      return { ...r, title, desc, timeStr, recordedBy: r.recordedBy ? r.recordedBy.nickname || r.recordedBy.role : '' }
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
    const isToday = d.toDateString() === today.toDateString()
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
      if (this.data.feedingPlan) this.setData({ feedingPlan: null })
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
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  },

  _getDateLabel(d) {
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return '今天'
    const yesterday = new Date(today.getTime() - 86400000)
    if (d.toDateString() === yesterday.toDateString()) return '昨天'
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  // 语音记录回调
  async onVoiceRecord(e) {
    const { result } = e.detail
    if (!result) return

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
        wx.showToast({ title: '记录失败', icon: 'none' })
      }
    }
  },

  onVoiceEdit(e) {
    const { result } = e.detail
    if (!result) return
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
      wx.showToast({ title: '记录失败', icon: 'none' })
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
        wx.showToast({ title: '操作失败', icon: 'none' })
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
        wx.showToast({ title: '记录失败', icon: 'none' })
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
        wx.showToast({ title: '操作失败', icon: 'none' })
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
        wx.showToast({ title: '记录失败', icon: 'none' })
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
      wx.showToast({ title: '记录失败', icon: 'none' })
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
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  quickRecord(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ showActions: false })
    wx.navigateTo({ url: `/pages/record/record?type=${type}` })
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
  }
})
