const db = require('./db')
const { matchesTodoDate } = require('./todo-schedule')
const { buildFeedingPlan, normalizeFeedingPlanConfig } = require('./feeding-plan')

const TRIGGERED_KEY = 'local_reminder_triggered'
const CHECK_INTERVAL_MS = 60 * 1000
const SNOOZE_MS = 10 * 60 * 1000

let reminderTimer = null
let checking = false
let modalShowing = false
let pendingReminder = null

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function buildDateTime(dateStr, timeStr) {
  const parts = dateStr.split('-').map(n => parseInt(n, 10))
  const timeParts = (timeStr || '09:00').split(':').map(n => parseInt(n, 10))
  return new Date(parts[0], parts[1] - 1, parts[2], timeParts[0] || 0, timeParts[1] || 0, 0, 0)
}

function getTriggeredState() {
  return wx.getStorageSync(TRIGGERED_KEY) || {}
}

function getReminderEntry(dateStr, key) {
  const state = getTriggeredState()
  const entry = state[dateStr] && state[dateStr][key]
  if (!entry) return null
  if (typeof entry === 'number') return { status: 'done', at: entry }
  return entry
}

function getTodoReminderKey(todo, dateStr) {
  if (!todo || !todo._id) return ''
  return `todo:${todo._id}:${dateStr}:${todo.time || ''}`
}

function getFeedingReminderKey(dateStr, nextItem) {
  if (!dateStr || !nextItem || !nextItem.timeLabel) return ''
  return `feeding:${dateStr}:${nextItem.timeLabel}`
}

function getSnoozeCountdownText(dateStr, key, now = new Date()) {
  if (!dateStr || !key) return ''
  const entry = getReminderEntry(dateStr, key)
  if (!entry || entry.status !== 'snoozed' || !entry.until) return ''
  const remaining = entry.until - now.getTime()
  if (remaining <= 0) return ''
  const minutes = Math.max(1, Math.ceil(remaining / 60000))
  return `稍后提醒：${minutes}分钟后`
}

function shouldSkipReminder(dateStr, key, now) {
  const entry = getReminderEntry(dateStr, key)
  if (!entry) return false
  if (entry.status === 'snoozed') {
    return entry.until && entry.until > now.getTime()
  }
  return true
}

function updateReminderEntries(dateStr, entries) {
  const state = getTriggeredState()
  const todayState = state[dateStr] || {}
  ;(entries || []).forEach(entry => {
    todayState[entry.key] = entry.value
  })
  wx.setStorageSync(TRIGGERED_KEY, { [dateStr]: todayState })
}

function notifyReminderStateChanged() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  pages.forEach(page => {
    if (page && typeof page.refreshLocalReminderCountdowns === 'function') {
      page.refreshLocalReminderCountdowns()
    }
  })
}

function isDueNow(scheduledAt, now) {
  return scheduledAt.getTime() <= now.getTime()
}

function vibrate() {
  if (!wx.vibrateShort) return
  try {
    wx.vibrateShort({ type: 'heavy' })
  } catch (e) {
    wx.vibrateShort()
  }
}

function markTriggered(dateStr, keys) {
  updateReminderEntries(dateStr, (keys || []).map(key => ({
    key,
    value: { status: 'done', at: Date.now() }
  })))
  notifyReminderStateChanged()
}

function markSnoozed(dateStr, keys) {
  updateReminderEntries(dateStr, (keys || []).map(key => ({
    key,
    value: { status: 'snoozed', at: Date.now(), until: Date.now() + SNOOZE_MS }
  })))
  notifyReminderStateChanged()
}

function showLocalReminder(title, content, dateStr, keys) {
  vibrate()
  if (modalShowing) {
    pendingReminder = { title, content, dateStr, keys }
    wx.showToast({ title, icon: 'none' })
    return
  }
  modalShowing = true
  wx.showModal({
    title,
    content,
    cancelText: '稍后提醒',
    confirmText: '知道了',
    success(res) {
      if (res.confirm) {
        markTriggered(dateStr, keys)
      } else if (res.cancel) {
        markSnoozed(dateStr, keys)
      }
    },
    complete() {
      modalShowing = false
      if (pendingReminder) {
        const reminder = pendingReminder
        pendingReminder = null
        setTimeout(() => {
          showLocalReminder(reminder.title, reminder.content, reminder.dateStr, reminder.keys)
        }, 300)
      }
    }
  })
}

function todoReminderText(todo) {
  const data = todo.data || {}
  if (todo.type === 'health_med') {
    const dosage = data.dosage ? `${data.dosage}${data.unit || ''}` : ''
    return ['吃药', data.name, dosage].filter(Boolean).join(' ')
  }
  return todo.title || '待办事项'
}

async function checkTodoReminders(now) {
  const dateStr = formatDateStr(now)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 86400000)
  const [todoRes, recordRes] = await Promise.all([
    db.getTodos(),
    db.getRecordsByDateRange(start, end)
  ])

  const completedMap = {}
  ;(recordRes.data || []).forEach(record => {
    if (record.todoId && record.todoDate === dateStr) completedMap[record.todoId] = true
  })

  const dueItems = []
  ;(todoRes.data || []).forEach(todo => {
    if (!todo || todo.enabled === false || !matchesTodoDate(todo, dateStr)) return
    if (completedMap[todo._id]) return
    const scheduledAt = buildDateTime(dateStr, todo.time)
    const key = getTodoReminderKey(todo, dateStr)
    if (!isDueNow(scheduledAt, now) || shouldSkipReminder(dateStr, key, now)) return
    dueItems.push({ key, text: todoReminderText(todo) })
  })

  if (!dueItems.length) return
  const lines = dueItems.slice(0, 4).map(item => `- ${item.text}`)
  const rest = dueItems.length > 4 ? `\n还有 ${dueItems.length - 4} 项待办` : ''
  showLocalReminder('待办到点提醒', `${lines.join('\n')}${rest}`, dateStr, dueItems.map(item => item.key))
}

function mergeRecords(primary = [], fallback = []) {
  const seen = {}
  const merged = []
  primary.concat(fallback).forEach(record => {
    if (!record) return
    const key = record._id || `${record.type}_${record.status || ''}_${record.startTime || ''}`
    if (seen[key]) return
    seen[key] = true
    merged.push(record)
  })
  return merged
}

async function checkFeedingReminder(now) {
  const app = getApp()
  const dateStr = formatDateStr(now)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 86400000)
  const [recordRes, ongoingRes] = await Promise.all([
    db.getRecordsOverlappingDateRange(start, end, { lookbackDays: 2, limit: 120 }),
    db.getOngoingRecords()
  ])
  const baseConfig = app.globalData.config || await db.getConfig()
  const config = normalizeFeedingPlanConfig(baseConfig)
  app.globalData.config = config
  const records = mergeRecords(recordRes.data || [], ongoingRes.data || [])
  const plan = buildFeedingPlan(records, { config, date: now, now })
  const nextItem = plan && plan.planItems && plan.planItems.find(item => item.state === 'next')
  if (!nextItem || !nextItem.time) return

  const scheduledAt = new Date(nextItem.time)
  const key = getFeedingReminderKey(dateStr, nextItem)
  if (!isDueNow(scheduledAt, now) || shouldSkipReminder(dateStr, key, now)) return

  const amount = plan.amount ? `${plan.amount}ml` : ''
  const content = [`计划 ${nextItem.timeLabel} 喂奶`, amount ? `建议奶量 ${amount}` : '', '可以现在记录或开始喂奶。']
    .filter(Boolean)
    .join('\n')
  showLocalReminder('喂奶到点提醒', content, dateStr, [key])
}

async function checkForegroundReminders() {
  if (checking) return
  checking = true
  try {
    const app = getApp()
    if (app.globalData.cloudReadyPromise) {
      await app.globalData.cloudReadyPromise
    }
    const now = new Date()
    await checkTodoReminders(now)
    await checkFeedingReminder(now)
  } catch (e) {
    console.warn('本地提醒检查失败', e)
  } finally {
    checking = false
  }
}

function startForegroundReminderLoop() {
  if (reminderTimer) return
  checkForegroundReminders()
  reminderTimer = setInterval(checkForegroundReminders, CHECK_INTERVAL_MS)
}

function stopForegroundReminderLoop() {
  if (!reminderTimer) return
  clearInterval(reminderTimer)
  reminderTimer = null
}

module.exports = {
  startForegroundReminderLoop,
  stopForegroundReminderLoop,
  checkForegroundReminders,
  getTodoReminderKey,
  getFeedingReminderKey,
  getSnoozeCountdownText
}
