function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatMinutesText(minutes) {
  const total = Math.max(0, Math.floor(minutes || 0))
  if (total < 60) return `${total}分钟`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

function normalizeClockText(value) {
  const text = String(value || '').replace(/：/g, ':')
  const colonMatch = text.match(/^(\d{1,2}):(\d{1,2})$/)
  if (colonMatch) {
    return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2].padStart(2, '0')}`
  }
  const halfMatch = text.match(/^(\d{1,2})点半$/)
  if (halfMatch) {
    return `${halfMatch[1].padStart(2, '0')}:30`
  }
  const pointMatch = text.match(/^(\d{1,2})点(\d{1,2})?$/)
  if (pointMatch) {
    return `${pointMatch[1].padStart(2, '0')}:${(pointMatch[2] || '00').padStart(2, '0')}`
  }
  return text
}

function extractWakeEstimateText(status) {
  const text = String(status || '').replace(/\s+/g, '')
  if (!text || !/(醒|睡)/.test(text)) return ''
  if (/(已睡|睡了)/.test(text) && !/(预计|大概|可能|还|再|醒)/.test(text)) return ''

  const clockMatch = text.match(/(?:预计|大概|可能|约)?(?:在)?((?:[01]?\d|2[0-3])[:：][0-5]\d|(?:[01]?\d|2[0-3])点(?:[0-5]?\d|半)?)(?:左右)?(?:醒|醒来|睡醒)/)
  if (clockMatch) {
    return `预计${normalizeClockText(clockMatch[1])}醒`
  }

  let durationMatch = text.match(/(?:预计|大概|可能|约|还(?:能|会|要)?睡|再睡|还有|还要)\s*约?(\d+(?:\.\d+)?)(小时|分钟|分)(?:左右)?(?:后)?(?:醒|醒来|睡醒)?/)
  if (!durationMatch && /正在睡/.test(text) && !/(已睡|睡了)/.test(text)) {
    durationMatch = text.match(/约?(\d+(?:\.\d+)?)(小时|分钟|分)/)
  }
  if (!durationMatch) return ''

  const amount = Number(durationMatch[1])
  if (!Number.isFinite(amount) || amount <= 0) return ''
  const unit = durationMatch[2]
  const minutes = unit === '小时' ? Math.round(amount * 60) : Math.round(amount)
  return `预计${formatMinutesText(minutes)}后醒`
}

const INTERNAL_FIELD_PATTERN = /\b(context|ongoing|elapsedMin|careFacts|checks|priority|lastFeedingMinAgo|lastFeedingStartMinAgo|lastSleepEndMinAgo|nextPlannedMinutesFromNow|samePeriodSleepPattern|sleepDebtMin|babyAgeMonths|todaySleepTotalMin|todayNapCount)\b|字段|参数|JSON|数据结构/i

function hasInternalAssistantField(text) {
  return INTERNAL_FIELD_PATTERN.test(String(text || ''))
}

function sanitizeAssistantText(text) {
  const value = String(text || '').trim()
  if (!value || hasInternalAssistantField(value)) return ''
  return value
}

function sanitizeAssistantForDisplay(assistant) {
  if (!assistant) return assistant
  const suggestions = Array.isArray(assistant.suggestions)
    ? assistant.suggestions.map(sanitizeAssistantText).filter(Boolean).slice(0, 2)
    : []
  const reason = sanitizeAssistantText(assistant.reason)
  return {
    ...assistant,
    suggestions,
    reason
  }
}

function getOngoingAssistantStatus(state = {}, now = new Date(), assistantStatus = '') {
  const sleepStart = toDate(state.ongoingSleep && state.ongoingSleep.startTime)
  if (sleepStart) {
    const minutes = Math.floor((now.getTime() - sleepStart.getTime()) / 60000)
    const base = `正在睡觉，已睡${formatMinutesText(minutes)}`
    const estimate = extractWakeEstimateText(assistantStatus)
    return estimate ? `${base}，${estimate}` : base
  }

  const feedingStart = toDate(state.ongoingFeeding && state.ongoingFeeding.startTime)
  if (feedingStart) {
    const minutes = Math.floor((now.getTime() - feedingStart.getTime()) / 60000)
    return `正在喂奶，已用时${formatMinutesText(minutes)}`
  }

  return ''
}

function applyOngoingAssistantStatus(assistant, state = {}, now = new Date()) {
  if (!assistant) return assistant
  const status = getOngoingAssistantStatus(state, now, assistant.status)
  if (!status || assistant.status === status) return assistant
  return { ...assistant, status }
}

module.exports = {
  formatMinutesText,
  extractWakeEstimateText,
  hasInternalAssistantField,
  sanitizeAssistantText,
  sanitizeAssistantForDisplay,
  getOngoingAssistantStatus,
  applyOngoingAssistantStatus
}
