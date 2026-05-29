const { getPercentile } = require('./growth-standard')

const HOUR_HEIGHT_RPX = 96
const DAY_MINUTES = 24 * 60
const DAY_HEIGHT_RPX = 24 * HOUR_HEIGHT_RPX
const MIN_BLOCK_HEIGHT_RPX = 58
const POINT_HEIGHT_RPX = 78
const POINT_GAP_RPX = 12
const MAX_LANES = 2

const TYPE_META = {
  feeding: { title: '喂奶', icon: '🍼' },
  sleep: { title: '睡眠', icon: '💤' },
  diaper: { title: '换尿布', icon: '🧷' },
  supplement: { title: '辅食', icon: '🥣' },
  bath: { title: '洗澡', icon: '🛁' },
  health_temp: { title: '体温', icon: '🌡️' },
  health_med: { title: '用药', icon: '💊' },
  health_vaccine: { title: '疫苗', icon: '💉' },
  health_custom: { title: '健康事项', icon: '🏥' },
  growth: { title: '生长记录', icon: '📏' }
}

const METHOD_NAMES = {
  forehead: '额温',
  ear: '耳温',
  armpit: '腋温',
  oral: '口服',
  external: '外用',
  nebulize: '雾化',
  rectal: '塞肛'
}

const SLEEP_TYPE_NAMES = {
  nap: '小睡',
  night: '夜觉'
}

const SLEEP_QUALITY_NAMES = {
  good: '好',
  normal: '一般',
  poor: '差'
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatClock(date) {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function formatShortDateTime(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${formatClock(date)}`
}

function formatDetailTime(start, end) {
  if (!end || end.getTime() <= start.getTime()) return formatClock(start)
  if (start.toDateString() === end.toDateString()) {
    return `${formatClock(start)} - ${formatClock(end)}`
  }
  return `${formatShortDateTime(start)} - ${formatShortDateTime(end)}`
}

function formatDuration(minutes) {
  if (minutes < 1) return ''
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

function getRecordStart(record) {
  return toDate(record && record.startTime)
}

function getRecordEnd(record, now = new Date()) {
  const start = getRecordStart(record)
  if (!start) return null

  const explicitEnd = toDate(record.endTime)
  if (explicitEnd && explicitEnd.getTime() > start.getTime()) {
    return explicitEnd
  }

  if (record.status === 'ongoing') {
    return now.getTime() > start.getTime() ? now : start
  }

  if (record.type === 'bath' && record.data && record.data.duration) {
    const minutes = parseInt(record.data.duration, 10)
    if (minutes > 0) {
      return new Date(start.getTime() + minutes * 60000)
    }
  }

  return start
}

function recordOverlapsRange(record, rangeStart, rangeEnd, now = new Date()) {
  const start = getRecordStart(record)
  const end = getRecordEnd(record, now)
  if (!start || !end) return false

  const startMs = start.getTime()
  const endMs = end.getTime()
  const rangeStartMs = rangeStart.getTime()
  const rangeEndMs = rangeEnd.getTime()

  if (endMs === startMs) {
    return startMs >= rangeStartMs && startMs < rangeEndMs
  }

  return startMs < rangeEndMs && endMs > rangeStartMs
}

function minutesFromDayStart(date, dayStart) {
  return Math.max(0, Math.min(DAY_MINUTES, (date.getTime() - dayStart.getTime()) / 60000))
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function formatDateStr(date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

function getDateLabel(date, now = new Date()) {
  const target = startOfDay(date)
  const today = startOfDay(now)
  const yesterday = addDays(today, -1)
  if (target.toDateString() === today.toDateString()) return '今天'
  if (target.toDateString() === yesterday.toDateString()) return '昨天'
  return `${target.getMonth() + 1}月${target.getDate()}日`
}

function normalizeVisibleEndMinute(visibleEndMinute) {
  const minute = visibleEndMinute || DAY_MINUTES
  return Math.max(60, Math.min(DAY_MINUTES, minute))
}

function normalizeVisibleStartMinute(visibleStartMinute, visibleEndMinute) {
  const endMinute = normalizeVisibleEndMinute(visibleEndMinute)
  const minute = visibleStartMinute === undefined || visibleStartMinute === null ? 0 : visibleStartMinute
  return Math.max(0, Math.min(endMinute - 60, minute))
}

function getVisibleEndMinuteForDay(dayStart, now = new Date()) {
  if (dayStart.toDateString() !== startOfDay(now).toDateString()) {
    return DAY_MINUTES
  }

  const minutes = now.getHours() * 60 + now.getMinutes()
  const roundedHour = Math.min(24, Math.max(2, Math.ceil(minutes / 120) * 2))
  return roundedHour * 60
}

function minuteToTopRpx(minute, visibleEndMinute, visibleStartMinute = 0) {
  const endMinute = normalizeVisibleEndMinute(visibleEndMinute)
  const startMinute = normalizeVisibleStartMinute(visibleStartMinute, endMinute)
  const clampedMinute = Math.max(startMinute, Math.min(endMinute, minute))
  return Math.round((endMinute - clampedMinute) / 60 * HOUR_HEIGHT_RPX)
}

function getRecordMinuteExtent(record, dayStart, dayEnd, now = new Date()) {
  if (!recordOverlapsRange(record, dayStart, dayEnd, now)) return null

  const start = getRecordStart(record)
  const end = getRecordEnd(record, now)
  if (!start || !end) return null

  const clippedStart = new Date(Math.max(start.getTime(), dayStart.getTime()))
  const clippedEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()))
  const startMinute = minutesFromDayStart(clippedStart, dayStart)
  const endMinute = minutesFromDayStart(clippedEnd, dayStart)
  return {
    startMinute,
    endMinute: endMinute > startMinute ? endMinute : startMinute
  }
}

function getAutoVisibleRange(records, dayStart, dayEnd, now, defaultEndMinute) {
  const extents = (records || [])
    .map(record => getRecordMinuteExtent(record, dayStart, dayEnd, now))
    .filter(Boolean)

  const isToday = dayStart.toDateString() === startOfDay(now).toDateString()
  if (isToday) {
    const nowMinute = minutesFromDayStart(now, dayStart)
    extents.push({ startMinute: nowMinute, endMinute: nowMinute })
  }

  if (!extents.length) {
    return { visibleStartMinute: 0, visibleEndMinute: defaultEndMinute }
  }

  const minMinute = Math.min(...extents.map(item => item.startMinute))
  const maxMinute = Math.max(...extents.map(item => item.endMinute))
  const padding = 45
  const visibleStartMinute = Math.max(0, Math.floor((minMinute - padding) / 120) * 120)
  const paddedEnd = Math.min(defaultEndMinute, Math.ceil((maxMinute + padding) / 120) * 120)
  const visibleEndMinute = Math.max(visibleStartMinute + 120, paddedEnd)

  return {
    visibleStartMinute,
    visibleEndMinute: normalizeVisibleEndMinute(visibleEndMinute)
  }
}

function getRecordedBy(record) {
  if (!record.recordedBy) return ''
  return record.recordedBy.nickname || record.recordedBy.role || ''
}

function getGrowthDesc(record, babyInfo) {
  const data = record.data || {}
  const parts = []
  const gender = (babyInfo && babyInfo.gender) || 'male'
  const birth = babyInfo && babyInfo.birthday ? toDate(babyInfo.birthday) : null
  const start = getRecordStart(record)
  const monthAge = birth && start ? (start.getTime() - birth.getTime()) / (30.44 * 24 * 60 * 60 * 1000) : null

  if (data.weight) {
    const p = monthAge !== null ? getPercentile(data.weight, monthAge, gender, 'weight') : null
    parts.push(`${data.weight}kg${p ? `(${p.label})` : ''}`)
  }
  if (data.height) {
    const p = monthAge !== null ? getPercentile(data.height, monthAge, gender, 'length') : null
    parts.push(`${data.height}cm${p ? `(${p.label})` : ''}`)
  }
  if (data.headCirc) {
    const p = monthAge !== null ? getPercentile(data.headCirc, monthAge, gender, 'hc') : null
    parts.push(`头围${data.headCirc}cm${p ? `(${p.label})` : ''}`)
  }

  return parts.join(' ')
}

function getRecordDisplay(record, context = {}) {
  const data = record.data || {}
  const meta = TYPE_META[record.type] || { title: '记录', icon: '•' }
  let title = meta.title
  let desc = ''

  switch (record.type) {
    case 'feeding': {
      title = record.status === 'ongoing' ? '喂奶中' : '喂奶'
      const parts = []
      if (data.amount) parts.push(`${data.amount}ml`)
      if (context.durationMinutes > 0) parts.push(formatDuration(context.durationMinutes))
      desc = parts.join(' ')
      break
    }
    case 'sleep':
      title = record.status === 'ongoing' ? '睡觉中' : '睡眠'
      desc = context.durationMinutes > 0 ? formatDuration(context.durationMinutes) : ''
      break
    case 'diaper': {
      const subNames = { pee: '小便', poop: '大便', mixed: '大小便' }
      desc = subNames[data.subType] || ''
      break
    }
    case 'supplement':
      desc = data.food || ''
      break
    case 'bath': {
      const parts = []
      if (data.waterTemp) parts.push(`水温${data.waterTemp}°C`)
      if (data.duration) parts.push(`${data.duration}分钟`)
      desc = parts.join(' ')
      break
    }
    case 'health_temp':
      desc = data.value ? `${data.value}°C` : ''
      break
    case 'health_med':
      desc = `${data.name || ''} ${data.dosage || ''}${data.unit || ''}`.trim()
      break
    case 'health_vaccine':
      desc = data.name || ''
      break
    case 'health_custom':
      desc = data.title || ''
      break
    case 'growth':
      desc = getGrowthDesc(record, context.babyInfo)
      break
  }

  return { title, desc, icon: meta.icon }
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') return ''
  return String(value)
}

function pushLine(lines, label, value) {
  const text = compactValue(value)
  if (text) lines.push({ label, value: text })
}

function getCardText(record, display) {
  const data = record.data || {}
  if (record.type === 'health_med') return data.name || '用药'
  return display.title
}

function getDetailLines(record, context = {}) {
  const data = record.data || {}
  const lines = []

  switch (record.type) {
    case 'feeding':
      pushLine(lines, '奶量', data.amount ? `${data.amount}ml` : '')
      pushLine(lines, '时长', context.durationMinutes > 0 ? formatDuration(context.durationMinutes) : '')
      break
    case 'sleep':
      pushLine(lines, '时长', context.durationMinutes > 0 ? formatDuration(context.durationMinutes) : '')
      pushLine(lines, '类型', SLEEP_TYPE_NAMES[data.sleepType] || data.sleepType)
      pushLine(lines, '入睡方式', data.sleepMethod)
      pushLine(lines, '质量', SLEEP_QUALITY_NAMES[data.quality] || data.quality)
      pushLine(lines, '夜醒次数', data.wakeCount !== undefined && data.wakeCount !== null ? `${data.wakeCount}次` : '')
      break
    case 'diaper': {
      const subNames = { pee: '小便', poop: '大便', mixed: '大小便' }
      pushLine(lines, '类型', subNames[data.subType] || data.subType)
      pushLine(lines, '状态', data.status)
      pushLine(lines, '颜色', data.color)
      pushLine(lines, '量', data.amount)
      break
    }
    case 'supplement':
      pushLine(lines, '食物', data.food)
      pushLine(lines, '食用量', data.amount)
      pushLine(lines, '反应', data.reaction)
      break
    case 'bath':
      pushLine(lines, '水温', data.waterTemp ? `${data.waterTemp}°C` : '')
      pushLine(lines, '时长', data.duration ? `${data.duration}分钟` : '')
      break
    case 'health_temp':
      pushLine(lines, '体温', data.value ? `${data.value}°C` : '')
      pushLine(lines, '方式', METHOD_NAMES[data.method] || data.method)
      break
    case 'health_med':
      pushLine(lines, '药品', data.name)
      pushLine(lines, '剂量', data.dosage ? `${data.dosage}${data.unit || ''}` : '')
      pushLine(lines, '方式', METHOD_NAMES[data.method] || data.method)
      break
    case 'health_vaccine':
      pushLine(lines, '疫苗', data.name)
      break
    case 'health_custom':
      pushLine(lines, '事项', data.title)
      break
    case 'growth':
      pushLine(lines, '体重', data.weight ? `${data.weight}kg` : '')
      pushLine(lines, '身高', data.height ? `${data.height}cm` : '')
      pushLine(lines, '头围', data.headCirc ? `${data.headCirc}cm` : '')
      pushLine(lines, '百分位', getGrowthDesc(record, context.babyInfo))
      break
  }

  pushLine(lines, '备注', record.note)
  return lines
}

function assignLanes(items) {
  const laneEnds = []
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)

  sorted.forEach(item => {
    let lane = laneEnds.findIndex(endMinute => endMinute <= item.startMinute)
    if (lane < 0) lane = laneEnds.length
    if (lane >= MAX_LANES) lane = MAX_LANES - 1
    laneEnds[lane] = item.endMinute
    item.lane = lane
  })

  const laneCount = Math.max(1, Math.min(MAX_LANES, laneEnds.length))
  items.forEach(item => {
    item.laneLeftPct = Math.round((item.lane * 100 / laneCount) * 100) / 100
    item.laneWidthPct = Math.round((100 / laneCount) * 100) / 100
  })
}

function avoidPointOverlap(items) {
  const minStep = POINT_HEIGHT_RPX + POINT_GAP_RPX
  const sorted = [...items].sort((a, b) => a.naturalTopRpx - b.naturalTopRpx || b.minute - a.minute)
  let nextTop = 0
  let clusterIndex = 0
  let lastNaturalTop = null

  sorted.forEach(item => {
    if (lastNaturalTop !== null && Math.abs(item.naturalTopRpx - lastNaturalTop) < minStep) {
      clusterIndex += 1
    } else {
      clusterIndex = 0
    }
    lastNaturalTop = item.naturalTopRpx

    const top = Math.max(item.naturalTopRpx, nextTop)
    item.topRpx = Math.max(0, top)
    item.staggerX = (clusterIndex % 2) * 18
    nextTop = item.topRpx + minStep
  })
}

function buildHourMarks(visibleEndMinute = DAY_MINUTES, options = {}) {
  const marks = []
  const endHour = Math.ceil(normalizeVisibleEndMinute(visibleEndMinute) / 60)
  const firstHour = endHour % 2 === 0 ? endHour : endHour + 1
  const visibleStartMinute = normalizeVisibleStartMinute(options.visibleStartMinute, visibleEndMinute)
  const startHour = Math.max(0, Math.floor(visibleStartMinute / 60))

  for (let hour = Math.min(24, firstHour); hour >= startHour; hour -= 2) {
    if (options.hideTopBoundary && hour === Math.min(24, firstHour)) continue
    marks.push({
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      topRpx: minuteToTopRpx(hour * 60, visibleEndMinute, visibleStartMinute)
    })
  }
  return marks
}

function buildTimelineLayout(records, options = {}) {
  const dayStart = options.dayStart || new Date()
  const dayEnd = options.dayEnd || new Date(dayStart.getTime() + 86400000)
  const now = options.now || new Date()
  const babyInfo = options.babyInfo || null
  const visibleEndMinute = normalizeVisibleEndMinute(options.visibleEndMinute)
  const visibleStartMinute = normalizeVisibleStartMinute(options.visibleStartMinute, visibleEndMinute)
  const baseDayHeightRpx = Math.round((visibleEndMinute - visibleStartMinute) / 60 * HOUR_HEIGHT_RPX)
  const durationItems = []
  const pointItems = []
  const sourceRecords = records || []

  sourceRecords.forEach(record => {
    if (!recordOverlapsRange(record, dayStart, dayEnd, now)) return

    const start = getRecordStart(record)
    const end = getRecordEnd(record, now)
    const actualDurationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    const clippedStart = new Date(Math.max(start.getTime(), dayStart.getTime()))
    const clippedEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()))
    const startMinute = minutesFromDayStart(clippedStart, dayStart)
    const endMinute = minutesFromDayStart(clippedEnd, dayStart)
    const display = getRecordDisplay(record, { durationMinutes: actualDurationMinutes, babyInfo })
    const displayText = getCardText(record, display)
    const detailLines = getDetailLines(record, { durationMinutes: actualDurationMinutes, babyInfo })
    const base = {
      ...record,
      title: display.title,
      desc: display.desc,
      displayText,
      detailTitle: display.title,
      detailLines,
      icon: display.icon,
      recordedByText: getRecordedBy(record),
      startClock: formatClock(start),
      timeStr: formatClock(start),
      typeClass: record.type,
      isClippedStart: start.getTime() < dayStart.getTime(),
      isClippedEnd: end.getTime() > dayEnd.getTime()
    }

    if (endMinute > startMinute) {
      const rawHeight = (endMinute - startMinute) / 60 * HOUR_HEIGHT_RPX
      const topRpx = minuteToTopRpx(endMinute, visibleEndMinute, visibleStartMinute)
      const maxHeight = baseDayHeightRpx - topRpx
      durationItems.push({
        ...base,
        startMinute,
        endMinute,
        topRpx,
        heightRpx: Math.max(1, Math.min(maxHeight, Math.max(MIN_BLOCK_HEIGHT_RPX, Math.round(rawHeight)))),
        rangeText: `${formatClock(clippedStart)} - ${formatClock(clippedEnd)}`,
        detailTime: formatDetailTime(start, end),
        edgeText: base.isClippedStart ? '从前一天开始' : (base.isClippedEnd ? '延续到下一天' : '')
      })
      return
    }

    const minute = minutesFromDayStart(start, dayStart)
    const rawTop = minuteToTopRpx(minute, visibleEndMinute, visibleStartMinute) - Math.round(POINT_HEIGHT_RPX / 2)
    pointItems.push({
      ...base,
      minute,
      detailTime: formatClock(start),
      naturalTopRpx: Math.max(0, Math.min(baseDayHeightRpx - POINT_HEIGHT_RPX, rawTop)),
      topRpx: Math.max(0, Math.min(baseDayHeightRpx - POINT_HEIGHT_RPX, rawTop)),
      heightRpx: POINT_HEIGHT_RPX
    })
  })

  assignLanes(durationItems)
  avoidPointOverlap(pointItems)
  durationItems.sort((a, b) => a.topRpx - b.topRpx || a.lane - b.lane)
  pointItems.sort((a, b) => a.topRpx - b.topRpx)
  const contentHeightRpx = Math.max(
    baseDayHeightRpx,
    ...durationItems.map(item => item.topRpx + item.heightRpx),
    ...pointItems.map(item => item.topRpx + item.heightRpx)
  )

  return {
    dayHeightRpx: contentHeightRpx,
    visibleStartMinute,
    visibleEndMinute,
    hourMarks: buildHourMarks(visibleEndMinute, { hideTopBoundary: true, visibleStartMinute }),
    durationItems,
    pointItems,
    recordCount: durationItems.length + pointItems.length
  }
}

function buildTimelineDaySections(records, options = {}) {
  const now = options.now || new Date()
  const latestDate = options.latestDate ? new Date(options.latestDate) : now
  const days = Math.max(1, options.days || 2)
  const babyInfo = options.babyInfo || null
  const latestDayStart = startOfDay(latestDate)
  const sections = []

  for (let i = 0; i < days; i++) {
    const dayStart = addDays(latestDayStart, -i)
    const dayEnd = addDays(dayStart, 1)
    let visibleEndMinute = getVisibleEndMinuteForDay(dayStart, now)
    let visibleStartMinute = 0
    if (options.autoCrop !== false) {
      const range = getAutoVisibleRange(records, dayStart, dayEnd, now, visibleEndMinute)
      visibleStartMinute = range.visibleStartMinute
      visibleEndMinute = range.visibleEndMinute
    }
    const layout = buildTimelineLayout(records, {
      dayStart,
      dayEnd,
      now,
      babyInfo,
      visibleEndMinute,
      visibleStartMinute,
      hideTopBoundary: i > 0
    })

    sections.push({
      ...layout,
      date: dayStart,
      dateStr: formatDateStr(dayStart),
      dateLabel: getDateLabel(dayStart, now),
      showNowMarker: now.getTime() >= dayStart.getTime() && now.getTime() < dayEnd.getTime(),
      nowTopRpx: now.getTime() >= dayStart.getTime() && now.getTime() < dayEnd.getTime()
        ? minuteToTopRpx(minutesFromDayStart(now, dayStart), visibleEndMinute, visibleStartMinute)
        : 0
    })
  }

  return sections
}

module.exports = {
  HOUR_HEIGHT_RPX,
  DAY_HEIGHT_RPX,
  POINT_HEIGHT_RPX,
  POINT_GAP_RPX,
  buildTimelineLayout,
  buildTimelineDaySections,
  recordOverlapsRange,
  getRecordEnd,
  startOfDay,
  addDays,
  formatDateStr,
  getDateLabel,
  getVisibleEndMinuteForDay,
  formatClock,
  formatDuration
}
