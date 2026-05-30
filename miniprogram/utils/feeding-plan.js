const DEFAULT_FEEDING_PLAN_CONFIG = {
  feedingPlanEnabled: true,
  feedingDailyTargetCount: 7,
  feedingAmount: 110,
  defaultFeedingAmount: 110,
  feedingPlanAmount: 110,
  feedingQuietEnabled: true,
  feedingQuietStart: '00:00',
  feedingQuietEnd: '06:00',
  feedingMinInterval: 150,
  feedingIdealInterval: 180,
  feedingWakeBuffer: 10,
  feedingAiPlanningEnabled: false,
  feedingAiMaxShift: 30
}

function toNumber(value, fallback) {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function normalizeClock(value, fallback) {
  const parsed = parseClock(value)
  return parsed === null ? fallback : minutesToClock(parsed)
}

function normalizeFeedingPlanConfig(config = {}) {
  const legacyDefaultAmount = toNumber(config.defaultFeedingAmount, 0)
  const legacyPlanAmount = toNumber(config.feedingPlanAmount, 0)
  const feedingAmount = Math.min(
    500,
    Math.max(10, toNumber(
      config.feedingAmount,
      legacyDefaultAmount || legacyPlanAmount || DEFAULT_FEEDING_PLAN_CONFIG.feedingAmount
    ))
  )

  return {
    ...config,
    feedingAmount,
    defaultFeedingAmount: feedingAmount,
    feedingPlanEnabled: config.feedingPlanEnabled !== false,
    feedingDailyTargetCount: Math.min(12, Math.max(1, toNumber(config.feedingDailyTargetCount, DEFAULT_FEEDING_PLAN_CONFIG.feedingDailyTargetCount))),
    feedingPlanAmount: feedingAmount,
    feedingQuietEnabled: config.feedingQuietEnabled !== false,
    feedingQuietStart: normalizeClock(config.feedingQuietStart, DEFAULT_FEEDING_PLAN_CONFIG.feedingQuietStart),
    feedingQuietEnd: normalizeClock(config.feedingQuietEnd, DEFAULT_FEEDING_PLAN_CONFIG.feedingQuietEnd),
    feedingMinInterval: Math.min(480, Math.max(60, toNumber(config.feedingMinInterval, DEFAULT_FEEDING_PLAN_CONFIG.feedingMinInterval))),
    feedingIdealInterval: Math.min(480, Math.max(60, toNumber(config.feedingIdealInterval || config.feedingIntervalThreshold, DEFAULT_FEEDING_PLAN_CONFIG.feedingIdealInterval))),
    feedingWakeBuffer: Math.min(60, Math.max(0, toNumber(config.feedingWakeBuffer, DEFAULT_FEEDING_PLAN_CONFIG.feedingWakeBuffer))),
    feedingAiPlanningEnabled: config.feedingAiPlanningEnabled === true,
    feedingAiMaxShift: Math.min(90, Math.max(5, toNumber(config.feedingAiMaxShift, DEFAULT_FEEDING_PLAN_CONFIG.feedingAiMaxShift)))
  }
}

function parseClock(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function minutesToClock(minutes) {
  const safe = ((Math.floor(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function formatDuration(minutes) {
  const safe = Math.max(0, Math.floor(minutes))
  if (safe < 60) return `${safe}分钟`
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

function startOfDay(date) {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

function getMinuteInDay(date, dayStart) {
  return Math.floor((new Date(date).getTime() - dayStart.getTime()) / 60000)
}

function dateFromMinute(dayStart, minute) {
  return new Date(dayStart.getTime() + minute * 60000)
}

function roundUpMinute(minute, step = 5) {
  return Math.ceil(minute / step) * step
}

function isInQuietMinute(minute, config) {
  if (!config.feedingQuietEnabled) return false
  const start = parseClock(config.feedingQuietStart)
  const end = parseClock(config.feedingQuietEnd)
  if (start === null || end === null || start === end) return false
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440
  if (start < end) return m >= start && m < end
  return m >= start || m < end
}

function nextAllowedMinute(minute, config) {
  if (!isInQuietMinute(minute, config)) return minute
  const start = parseClock(config.feedingQuietStart)
  const end = parseClock(config.feedingQuietEnd)
  const dayOffset = Math.floor(minute / 1440) * 1440
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440

  if (start < end) {
    return dayOffset + end
  }
  if (m >= start) {
    return dayOffset + 1440 + end
  }
  return dayOffset + end
}

function getActiveStartMinute(config) {
  if (!config.feedingQuietEnabled) return 0
  const start = parseClock(config.feedingQuietStart)
  const end = parseClock(config.feedingQuietEnd)
  if (start === null || end === null || start === end) return 0
  if (start === 0 || start > end) return end
  return 0
}

function getActiveEndMinute(config) {
  if (!config.feedingQuietEnabled) return 1440
  const start = parseClock(config.feedingQuietStart)
  const end = parseClock(config.feedingQuietEnd)
  if (start === null || end === null || start === end) return 1440
  if (start > end) return start
  return 1440
}

function getLatestPlanMinute(config) {
  return Math.max(getActiveStartMinute(config), getActiveEndMinute(config) - 30)
}

function getRecordTime(record) {
  const date = record && record.startTime ? new Date(record.startTime) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return date
}

function isCompletedFeeding(record) {
  return record && record.type === 'feeding' && record.status === 'completed'
}

function isOngoingFeeding(record) {
  return record && record.type === 'feeding' && record.status === 'ongoing'
}

function isOngoingSleep(record) {
  return record && record.type === 'sleep' && record.status === 'ongoing'
}

function findMorningWake(records, dayStart, config) {
  const activeStart = getActiveStartMinute(config)
  const noon = 12 * 60
  const wakes = (records || [])
    .filter(r => r && r.type === 'sleep' && r.status === 'completed' && r.endTime)
    .map(r => new Date(r.endTime))
    .filter(d => !Number.isNaN(d.getTime()))
    .map(d => getMinuteInDay(d, dayStart))
    .filter(min => min >= activeStart && min <= noon)
    .sort((a, b) => a - b)
  return wakes.length ? wakes[wakes.length - 1] : null
}

function calcRealisticMax(fromMinute, config) {
  const latestMinute = getLatestPlanMinute(config)
  const available = latestMinute - fromMinute
  if (available < 0) return 0
  return 1 + Math.floor(available / config.feedingMinInterval)
}

function chooseInterval(anchorMinute, remainingCount, config) {
  const minInterval = config.feedingMinInterval
  const idealInterval = config.feedingIdealInterval
  const latestMinute = getLatestPlanMinute(config)
  if (remainingCount <= 0) return minInterval
  if (anchorMinute + idealInterval * remainingCount <= latestMinute) return idealInterval
  const fit = Math.floor((latestMinute - anchorMinute) / remainingCount)
  if (!Number.isFinite(fit) || fit <= 0) return minInterval
  return Math.max(minInterval, fit)
}

function getAiSuggestionMinute(aiSuggestion) {
  if (!aiSuggestion) return null
  const direct = parseClock(aiSuggestion.nextTime)
  if (direct !== null) return direct
  if (Array.isArray(aiSuggestion.suggestedTimes) && aiSuggestion.suggestedTimes.length) {
    return parseClock(aiSuggestion.suggestedTimes[0])
  }
  return null
}

function applyAiNextMinute(localMinute, context) {
  const { aiSuggestion, anchorMinute, nowMinute, config, latestMinute } = context
  const base = {
    minute: localMinute,
    ai: {
      involvementPercent: 0,
      applied: false,
      role: 'local_rules_only'
    }
  }

  if (!config.feedingAiPlanningEnabled) return base
  const suggested = getAiSuggestionMinute(aiSuggestion)
  if (suggested === null) {
    base.ai.role = 'ai_enabled_no_suggestion'
    return base
  }
  if (isInQuietMinute(suggested, config) || suggested > latestMinute) {
    base.ai.role = 'ai_rejected_by_quiet_hours'
    return base
  }
  if (anchorMinute !== null && suggested < anchorMinute + config.feedingMinInterval) {
    base.ai.role = 'ai_rejected_by_min_interval'
    return base
  }
  if (nowMinute !== null && suggested < nowMinute) {
    base.ai.role = 'ai_rejected_by_current_time'
    return base
  }
  if (Math.abs(suggested - localMinute) > config.feedingAiMaxShift) {
    base.ai.role = 'ai_rejected_by_max_shift'
    return base
  }

  return {
    minute: suggested,
    ai: {
      involvementPercent: 20,
      applied: true,
      role: 'ai_suggested_local_rules_checked'
    }
  }
}

function buildFeedingPlan(records = [], options = {}) {
  const config = normalizeFeedingPlanConfig(options.config || {})
  const targetCount = config.feedingDailyTargetCount
  const amount = config.feedingPlanAmount
  const date = options.date ? new Date(options.date) : new Date()
  const now = options.now ? new Date(options.now) : new Date()
  const dayStart = startOfDay(date)
  const nowMinute = sameDay(now, date) ? getMinuteInDay(now, dayStart) : null
  const activeStart = getActiveStartMinute(config)
  const defaultAiState = { involvementPercent: 0, applied: false, role: 'local_rules_only' }

  if (!config.feedingPlanEnabled) {
    return {
      enabled: false,
      targetCount,
      amount,
      completedCount: 0,
      remainingCount: targetCount,
      planItems: [],
      estimatedNextTimeLabel: '',
      ai: defaultAiState
    }
  }

  const dayFeedings = (records || [])
    .filter(r => isCompletedFeeding(r) || isOngoingFeeding(r))
    .map(r => ({ record: r, time: getRecordTime(r) }))
    .filter(item => item.time && getMinuteInDay(item.time, dayStart) >= 0 && getMinuteInDay(item.time, dayStart) < 1440)
    .sort((a, b) => a.time - b.time)

  const completed = dayFeedings.filter(item => isCompletedFeeding(item.record))
  const ongoingFeeding = dayFeedings.find(item => isOngoingFeeding(item.record)) || null
  const ongoingSleep = (records || []).find(isOngoingSleep) || null
  const completedCount = completed.length
  const countedForSchedule = completedCount + (ongoingFeeding ? 1 : 0)
  const remainingCount = Math.max(0, targetCount - completedCount)
  const futureCount = Math.max(0, targetCount - countedForSchedule)
  const planItems = []
  let warning = ''
  let aiState = defaultAiState

  completed.forEach((item, index) => {
    const minute = getMinuteInDay(item.time, dayStart)
    planItems.push({
      key: item.record._id || `done_${index}`,
      time: item.time,
      timeLabel: minutesToClock(minute),
      state: 'done',
      source: 'actual',
      amount: (item.record.data && item.record.data.amount) || amount
    })
  })

  if (ongoingFeeding) {
    const minute = getMinuteInDay(ongoingFeeding.time, dayStart)
    planItems.push({
      key: ongoingFeeding.record._id || 'current',
      time: ongoingFeeding.time,
      timeLabel: minutesToClock(minute),
      state: 'current',
      source: 'actual',
      amount
    })
  }

  if (completedCount >= targetCount) {
    return {
      enabled: true,
      status: 'done',
      targetCount,
      amount,
      completedCount,
      remainingCount: 0,
      planItems,
      title: '今日目标已完成',
      nextTimeLabel: '',
      estimatedNextTimeLabel: '',
      reminderText: `已完成 ${completedCount}/${targetCount} 顿`,
      quietText: config.feedingQuietEnabled ? `${config.feedingQuietStart}-${config.feedingQuietEnd}勿扰` : '无勿扰',
      ai: aiState
    }
  }

  let anchorMinute = null
  if (ongoingFeeding) {
    anchorMinute = getMinuteInDay(ongoingFeeding.time, dayStart)
  } else if (completed.length) {
    anchorMinute = getMinuteInDay(completed[completed.length - 1].time, dayStart)
  }

  let nextMinute
  const latestMinute = getLatestPlanMinute(config)
  if (anchorMinute !== null) {
    nextMinute = anchorMinute + chooseInterval(anchorMinute, futureCount, config)
  } else {
    const wakeMinute = findMorningWake(records, dayStart, config)
    const baseMinute = wakeMinute !== null ? wakeMinute + config.feedingWakeBuffer : activeStart
    if (nowMinute !== null) {
      nextMinute = Math.max(roundUpMinute(nowMinute, 5), baseMinute)
    } else {
      nextMinute = baseMinute
    }
  }

  nextMinute = roundUpMinute(nextAllowedMinute(nextMinute, config), 5)

  const realisticMax = calcRealisticMax(nextMinute, config)
  const isTight = futureCount > realisticMax

  if (!ongoingSleep && futureCount > 0) {
    const aiResult = applyAiNextMinute(nextMinute, {
      aiSuggestion: options.aiSuggestion,
      anchorMinute,
      nowMinute,
      config,
      latestMinute
    })
    nextMinute = aiResult.minute
    aiState = aiResult.ai
  }

  for (let i = 0; i < futureCount; i++) {
    if (nextMinute > latestMinute) {
      break
    }
    const state = i === 0 ? 'next' : 'future'
    planItems.push({
      key: `future_${i}_${nextMinute}`,
      time: dateFromMinute(dayStart, nextMinute),
      timeLabel: minutesToClock(nextMinute),
      state,
      source: 'rule',
      amount
    })
    const rest = futureCount - i - 1
    if (rest > 0) {
      nextMinute = roundUpMinute(nextAllowedMinute(nextMinute + chooseInterval(nextMinute, rest, config), config), 5)
    }
  }

  if (isTight) {
    const canFit = realisticMax
    const deadlineLabel = minutesToClock(latestMinute)
    if (canFit <= 0) {
      warning = `还需 ${futureCount} 顿但今天已无法再安排，明天尽量提前开始`
    } else {
      const firstFutureItem = planItems.find(item => item.state === 'next')
      const suggestBefore = firstFutureItem ? firstFutureItem.timeLabel : deadlineLabel
      warning = `还需 ${futureCount} 顿，${deadlineLabel}前最多能排 ${canFit} 顿（间隔${formatDuration(config.feedingMinInterval)}），建议尽早在 ${suggestBefore} 前喂`
    }
  }

  const nextItem = planItems.find(item => item.state === 'next') || null
  let status = 'next'
  let title = '下一顿'
  let reminderText = ''
  let nextTimeLabel = nextItem ? nextItem.timeLabel : ''
  const estimatedNextTimeLabel = nextItem ? nextItem.timeLabel : ''

  if (ongoingFeeding) {
    status = 'feeding'
    title = '喂奶进行中'
    reminderText = nextItem ? `下一顿预计 ${nextItem.timeLabel}` : '结束后会重新计算'
  } else if (ongoingSleep && nextItem) {
    status = 'sleeping'
    title = '宝宝睡着'
    nextTimeLabel = '醒后'
    reminderText = `醒后约${config.feedingWakeBuffer}分钟再提醒`
  } else if (!nextItem && isTight) {
    status = 'tight'
    title = '今日计划偏紧'
    reminderText = warning || '建议手动确认下一顿'
  } else if (nextItem && isTight) {
    status = 'tight'
    title = '计划偏紧'
    if (nowMinute !== null && nowMinute >= getMinuteInDay(nextItem.time, dayStart)) {
      reminderText = `现在可以喂，今天最多还能排 ${realisticMax} 顿`
    } else {
      reminderText = `下一顿 ${nextItem.timeLabel}，今天最多还能排 ${realisticMax} 顿`
    }
  } else if (nextItem && nowMinute !== null && nowMinute >= getMinuteInDay(nextItem.time, dayStart)) {
    status = 'due'
    title = '现在可以喂'
    reminderText = `距离计划 ${nextItem.timeLabel} 已到点`
  } else if (nextItem && nowMinute !== null) {
    const diff = getMinuteInDay(nextItem.time, dayStart) - nowMinute
    reminderText = `${formatDuration(diff)}后提醒`
  } else if (nextItem) {
    reminderText = `预计 ${nextItem.timeLabel}`
  } else {
    status = 'tight'
    title = '今日计划偏紧'
    reminderText = warning || '建议手动确认下一顿'
  }

  return {
    enabled: true,
    status,
    targetCount,
    amount,
    completedCount,
    remainingCount,
    realisticMax: isTight ? realisticMax : remainingCount,
    planItems,
    title,
    nextTimeLabel,
    estimatedNextTimeLabel,
    reminderText,
    warning,
    quietText: config.feedingQuietEnabled ? `${config.feedingQuietStart}-${config.feedingQuietEnd}勿扰` : '无勿扰',
    ai: aiState
  }
}

module.exports = {
  DEFAULT_FEEDING_PLAN_CONFIG,
  normalizeFeedingPlanConfig,
  buildFeedingPlan,
  calcRealisticMax,
  parseClock,
  minutesToClock,
  isInQuietMinute,
  nextAllowedMinute
}
