const REACTION_LABELS = {
  like: '喜欢',
  normal: '一般',
  dislike: '不喜欢',
  allergy: '过敏'
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value.toDate === 'function') {
    const d = value.toDate()
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDateInput(date) {
  const d = toDate(date) || new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatDateTitle(date) {
  const d = toDate(date) || new Date()
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    text: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  }
}

function formatClock(date) {
  const d = toDate(date)
  if (!d) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatShortDate(date) {
  const d = toDate(date)
  if (!d) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getDurationMinutes(record) {
  if (!record) return 0
  const explicit = record.data && Number(record.data.duration)
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit)

  const start = toDate(record.startTime)
  const end = toDate(record.endTime)
  if (!start || !end || end.getTime() <= start.getTime()) return 0
  return Math.round((end.getTime() - start.getTime()) / 60000)
}

function formatEatingDuration(record, options = {}) {
  if (!record) return ''
  const start = toDate(record.startTime)
  if (!start) return ''

  const prefix = options.includeDate ? `${formatShortDate(start)} ` : ''
  const end = toDate(record.endTime)
  if (end && end.getTime() > start.getTime()) {
    const endText = options.includeDate && formatShortDate(end) !== formatShortDate(start)
      ? `${formatShortDate(end)} ${formatClock(end)}`
      : formatClock(end)
    return `${prefix}${formatClock(start)}-${endText}`
  }

  const duration = getDurationMinutes(record)
  if (duration > 0) return `${prefix}${formatClock(start)} ${duration}分钟`
  return `${prefix}${formatClock(start)}`
}

function normalizeReaction(value) {
  if (!value) return ''
  return REACTION_LABELS[value] || value
}

function isDietRecord(record) {
  if (!record) return false
  if (record.type === 'supplement') return true
  return record.type === 'feeding' && record.status !== 'ongoing'
}

function buildDietRecordRow(record, options = {}) {
  const data = record.data || {}
  if (record.type === 'feeding') {
    return {
      time: formatEatingDuration(record, options),
      food: data.food || data.milkType || '牛奶',
      amount: data.amount ? `${data.amount}ml` : '',
      behavior: normalizeReaction(data.reaction),
      note: record.note || ''
    }
  }

  return {
    time: formatEatingDuration(record, options),
    food: data.food || '',
    amount: data.amount || '',
    behavior: normalizeReaction(data.reaction),
    note: record.note || ''
  }
}

function buildDietExportRows(records = [], options = {}) {
  const maxRows = options.maxRows || 18
  return (records || [])
    .filter(isDietRecord)
    .sort((a, b) => {
      const at = (toDate(a.startTime) || new Date(0)).getTime()
      const bt = (toDate(b.startTime) || new Date(0)).getTime()
      return at - bt
    })
    .slice(0, maxRows)
    .map(record => buildDietRecordRow(record, options))
}

function createBlankSuggestionLines(count = 5) {
  return Array.from({ length: count }, () => '')
}

module.exports = {
  REACTION_LABELS,
  buildDietExportRows,
  buildDietRecordRow,
  createBlankSuggestionLines,
  formatClock,
  formatDateInput,
  formatDateTitle,
  formatEatingDuration,
  formatShortDate,
  getDurationMinutes,
  isDietRecord,
  normalizeReaction,
  toDate
}
