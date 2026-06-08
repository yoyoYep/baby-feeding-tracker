function resolveTime(timeStr, contextText = '') {
  const now = new Date()
  if (timeStr instanceof Date) return timeStr
  timeStr = typeof timeStr === 'string' ? timeStr.replace(/：/g, ':').trim() : timeStr

  if (!timeStr || timeStr === 'now') return now

  let match = timeStr.match(/^now-(\d+)m$/)
  if (match) return new Date(now.getTime() - parseInt(match[1]) * 60 * 1000)

  match = timeStr.match(/^now-(\d+)h$/)
  if (match) return new Date(now.getTime() - parseInt(match[1]) * 60 * 60 * 1000)

  match = timeStr.match(/^now\+(\d+)m$/)
  if (match) return new Date(now.getTime() + parseInt(match[1]) * 60 * 1000)

  match = timeStr.match(/^now\+(\d+)h$/)
  if (match) return new Date(now.getTime() + parseInt(match[1]) * 60 * 60 * 1000)

  // "today 01:30"
  match = timeStr.match(/^today\s+(\d{1,2}):(\d{2})$/)
  if (match) {
    const t = new Date(now)
    t.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0)
    return t
  }

  // "yesterday" without time
  if (/^yesterday$/.test(timeStr.trim())) {
    const t = new Date(now)
    t.setDate(t.getDate() - 1)
    return t
  }

  match = timeStr.match(/^yesterday\s+(\d{1,2}):(\d{2})$/)
  if (match) {
    const t = new Date(now)
    t.setDate(t.getDate() - 1)
    t.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0)
    return t
  }

  // "前天" / "the day before yesterday"
  if (/^before.?yesterday$/.test(timeStr.trim())) {
    const t = new Date(now)
    t.setDate(t.getDate() - 2)
    return t
  }

  match = timeStr.match(/^before.?yesterday\s+(\d{1,2}):(\d{2})$/)
  if (match) {
    const t = new Date(now)
    t.setDate(t.getDate() - 2)
    t.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0)
    return t
  }

  // "2026年5月28日 07:00" / "2026-5-28 07:00"
  match = timeStr.match(/^(\d{4})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*[号日]?\s+(\d{1,2}):(\d{2})$/)
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), parseInt(match[4]), parseInt(match[5]), 0, 0)
  }

  // "5月28日 07:00"
  match = timeStr.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?\s+(\d{1,2}):(\d{2})$/)
  if (match) {
    return new Date(now.getFullYear(), parseInt(match[1]) - 1, parseInt(match[2]), parseInt(match[3]), parseInt(match[4]), 0, 0)
  }

  // "25 07:00" → 结合原文日期上下文；没有上下文时取最近的25号
  match = timeStr.match(/^(\d{1,2})\s+(\d{1,2}):(\d{2})$/)
  if (match) {
    const day = parseInt(match[1])
    const t = contextText ? getBaseDateFromText(contextText, now) : getRecentDateByDay(day, now)
    if (t.getDate() !== day) {
      const recent = getRecentDateByDay(day, now)
      t.setFullYear(recent.getFullYear(), recent.getMonth(), recent.getDate())
    }
    t.setHours(parseInt(match[2]), parseInt(match[3]), 0, 0)
    return t
  }

  // 纯日期数字 "26" / "26号" / "26日" → 当月26号（保留当前时刻）
  match = timeStr.match(/^(\d{1,2})[号日]?$/)
  if (match) {
    const day = parseInt(match[1])
    if (day >= 1 && day <= 31) {
      const t = contextText ? getBaseDateFromText(contextText, now) : getRecentDateByDay(day, now)
      if (t.getDate() !== day) {
        const recent = getRecentDateByDay(day, now)
        t.setFullYear(recent.getFullYear(), recent.getMonth(), recent.getDate())
      }
      return t
    }
  }

  match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const t = new Date(now)
    t.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0)
    return t
  }

  return now
}

function getFutureFeedingStartTime(text) {
  if (!text || !/后/.test(text)) return null
  if (!/(开始|等会|待会|一会).*(喂|喝|奶)|(喂|喝).*奶/.test(text)) return null

  const { parseTimeExpression } = require('./time-parser')
  const target = parseTimeExpression(text)
  if (target.getTime() - Date.now() > 5000) return target
  return null
}

function parseSmallInteger(value) {
  const text = String(value || '')
  const map = { 一: 1, 二: 2, 两: 2, 三: 3 }
  if (map[text]) return map[text]
  const num = parseInt(text, 10)
  return Number.isFinite(num) ? num : null
}

function parsePeeCount(text) {
  const normalized = String(text || '')
  const match = normalized.match(/(?:尿|小便)[了过]?(一|二|两|三|\d+)\s*次|(?:一|二|两|三|\d+)\s*次(?:尿|小便)/)
  if (!match) return 1
  const count = parseSmallInteger(match[1] || match[2])
  return count && count > 0 ? Math.min(count, 3) : 1
}

function formatParserLocalDateTime(date = new Date()) {
  const y = date.getFullYear()
  const mo = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  return `${y}-${mo}-${d} ${h}:${m}:${s}`
}

function getRecentDateByDay(day, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), day)
  date.setHours(0, 0, 0, 0)
  if (date.getTime() > now.getTime()) {
    date.setMonth(date.getMonth() - 1)
  }
  return date
}

function getBaseDateFromText(text, now = new Date()) {
  const normalized = text.replace(/：/g, ':')
  let match = normalized.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?/)
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
  }

  match = normalized.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?/)
  if (match) {
    return new Date(now.getFullYear(), parseInt(match[1]) - 1, parseInt(match[2]))
  }

  match = normalized.match(/(\d{1,2})\s*[号日]/)
  if (match) {
    return getRecentDateByDay(parseInt(match[1]), now)
  }

  if (/前天/.test(normalized)) {
    const date = new Date(now)
    date.setDate(date.getDate() - 2)
    return date
  }

  if (/昨[天日晚]/.test(normalized)) {
    const date = new Date(now)
    date.setDate(date.getDate() - 1)
    return date
  }

  return new Date(now)
}

function getDateFromSegment(segment, fallbackDate, now = new Date()) {
  if (!segment) return new Date(fallbackDate)
  if (/(\d{4})\s*年|(\d{1,2})\s*月|(\d{1,2})\s*[号日]|今天|昨天|前天/.test(segment)) {
    return getBaseDateFromText(segment, now)
  }
  return new Date(fallbackDate)
}

function getPeriodHint(segment) {
  const match = (segment || '').match(/凌晨|早上|上午|中午|下午|晚上|傍晚/)
  return match ? match[0] : ''
}

function normalizeClockHour(rawHour, period) {
  const text = String(rawHour || '')
  let hour = parseInt(text, 10)
  if (hour > 23 && text.length === 3 && text.endsWith('0')) {
    hour = parseInt(text.slice(0, 2), 10)
  }

  if ((period === '下午' || period === '晚上' || period === '傍晚') && hour < 12) {
    hour += 12
  } else if (period === '凌晨' && hour === 12) {
    hour = 0
  }

  return hour
}

function parseDateTimeSegment(segment, fallbackDate, fallbackPeriod = '', now = new Date()) {
  const normalized = (segment || '').replace(/：/g, ':')
  const clockMatch = normalized.match(/(\d{1,3})\s*:\s*(\d{1,2})/) ||
    normalized.match(/(\d{1,3})\s*[点时]\s*(?:(\d{1,2})\s*分?)?/)
  if (!clockMatch) return null

  const period = getPeriodHint(normalized) || fallbackPeriod
  const hour = normalizeClockHour(clockMatch[1], period)
  const minute = parseInt(clockMatch[2] || '0', 10)
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  const date = getDateFromSegment(normalized, fallbackDate, now)
  date.setHours(hour, minute, 0, 0)
  return date
}

function extractFeedingAmount(text) {
  const normalized = text.replace(/毫升/g, 'ml').replace(/ML/gi, 'ml')
  const mlMatch = normalized.match(/(\d+)\s*ml/)
  if (mlMatch) return parseInt(mlMatch[1], 10)

  const numberReg = /(\d+)/g
  let match
  while ((match = numberReg.exec(normalized)) !== null) {
    const value = parseInt(match[1], 10)
    const tail = normalized.slice(match.index + match[0].length)
    if (/^\s*(分钟|分|小时|个小时|点|时|号|日|天|月|年|:|：)/.test(tail)) continue
    if (value >= 30 && value <= 300) return value
  }
  return null
}

function parseTimeRanges(text, now = new Date()) {
  const normalized = text.replace(/：/g, ':')
  const datePart = '(?:今天|昨天|前天)?\\s*(?:\\d{4}\\s*年)?\\s*(?:\\d{1,2}\\s*月)?\\s*(?:\\d{1,2}\\s*[号日])?'
  const periodPart = '(?:凌晨|早上|上午|中午|下午|晚上|傍晚)?'
  const clockPart = '\\d{1,3}\\s*(?::|[点时])\\s*\\d{1,2}'
  const rangeReg = new RegExp(`(${datePart}\\s*${periodPart}\\s*${clockPart})\\s*(?:到|至|[-~—])\\s*(${datePart}\\s*${periodPart}\\s*${clockPart})`, 'g')
  const baseDate = getBaseDateFromText(normalized, now)
  const ranges = []
  let match

  while ((match = rangeReg.exec(normalized)) !== null) {
    const startText = match[1]
    const endText = match[2]
    const startPeriod = getPeriodHint(startText)
    const start = parseDateTimeSegment(startText, baseDate, '', now)
    const end = parseDateTimeSegment(endText, start || baseDate, getPeriodHint(endText) ? '' : startPeriod, now)
    if (!start || !end) continue
    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1)
    }
    ranges.push({ start, end })
  }

  return ranges
}

function buildBatchResult(records, confidence = 0.88) {
  if (!records.length) return null
  if (records.length === 1) return records[0]
  return {
    type: 'batch',
    records,
    status: 'completed',
    confidence
  }
}

function parseMultiFeedingText(text) {
  const normalized = text.replace(/毫升/g, 'ml').replace(/ML/gi, 'ml')
  if (!/(喂|喝|吃.*奶|奶.*ml|ml.*奶|冲奶|瓶)/.test(normalized)) return null

  const ranges = parseTimeRanges(normalized)
  if (!ranges.length) return null

  const amount = extractFeedingAmount(normalized)
  const records = ranges.map(range => ({
    type: 'feeding',
    data: { amount, action: 'complete' },
    action: 'complete',
    startTime: range.start,
    endTime: range.end,
    status: 'completed',
    confidence: 0.88
  }))

  return buildBatchResult(records)
}

function parseBathText(text, confidence = 0.6) {
  const normalized = text.replace(/毫升/g, 'ml').replace(/ML/gi, 'ml')
  if (!/洗澡|洗了澡|澡洗|冲澡|洗浴/.test(normalized)) return null
  if (/喂|喝|奶/.test(normalized)) return null

  const { parseTimeExpression } = require('./time-parser')
  const data = {}

  let tempMatch = normalized.match(/水温[是有]?\s*(\d+\.?\d*)\s*(?:度|℃|°C)?/i)
  if (!tempMatch) tempMatch = normalized.match(/(\d+\.?\d*)\s*(?:度|℃|°C)/i)
  if (tempMatch) data.waterTemp = parseFloat(tempMatch[1])

  if (/半小时|半个小时/.test(normalized)) {
    data.duration = 30
  } else {
    let durationMatch = normalized.match(/(\d+)\s*分钟(?![前后])/)
    if (durationMatch) {
      data.duration = parseInt(durationMatch[1])
    } else {
      durationMatch = normalized.match(/(\d+)\s*(?:小时|个小时)(?![前后])/)
      if (durationMatch) data.duration = parseInt(durationMatch[1]) * 60
    }
  }

  return {
    type: 'bath',
    data,
    startTime: parseTimeExpression(normalized),
    status: 'completed',
    confidence
  }
}

function canUseCloudParser() {
  try {
    if (typeof getApp !== 'function' || typeof wx === 'undefined') return false
    const app = getApp()
    return !!(app && app.globalData && app.globalData.cloudReady && wx.cloud && wx.cloud.callFunction)
  } catch (e) {
    return false
  }
}

function normalizeCloudParsedRecord(parsed, text, options = {}) {
  if (!parsed || !parsed.type) return null

  let startTime = resolveTime(parsed.startTime, text)
  let endTime = null

  if (parsed.endTime) {
    endTime = resolveTime(parsed.endTime, text)
  }

  // 用 duration 修正时间
  if (parsed.duration) {
    const durationMs = parsed.duration * 60 * 1000
    if (!endTime) {
      // 没有 endTime，根据 startTime 是否为 "now" 决定方向
      const startIsNow = !parsed.startTime || parsed.startTime === 'now'
      if (startIsNow) {
        endTime = new Date()
        startTime = new Date(endTime.getTime() - durationMs)
      } else {
        endTime = new Date(startTime.getTime() + durationMs)
      }
    } else if (Math.abs(endTime - startTime) < 60000) {
      // startTime 和 endTime 几乎相同（都解析成了 now），用 duration 倒推
      endTime = new Date(Math.max(startTime.getTime(), endTime.getTime()))
      startTime = new Date(endTime.getTime() - durationMs)
    }
  }

  // 跨午夜修正：endTime 比 startTime 早，说明是跨天（如23:00→01:30）
  if (startTime && endTime && endTime < startTime) {
    const diffHours = (startTime - endTime) / (1000 * 60 * 60)
    if (diffHours > 12) {
      // endTime 在 startTime 之前超过12小时，把 startTime 往前推一天
      startTime.setDate(startTime.getDate() - 1)
    }
  }

  const action = (parsed.data && parsed.data.action) || parsed.action || null
  const futureFeedingStart = options.allowFutureStart !== false && parsed.type === 'feeding' ? getFutureFeedingStartTime(text) : null

  if (futureFeedingStart) {
    startTime = futureFeedingStart
    endTime = null
    parsed.status = 'ongoing'
    parsed.data = parsed.data || {}
    parsed.data.action = 'start'
    parsed.data.amount = null
  }

  const data = { ...(parsed.data || {}) }
  if (parsed.type === 'diaper') {
    const subType = data.subType || 'pee'
    data.subType = subType
    if (subType === 'poop') {
      data.peeCount = 0
    } else {
      const count = parseInt(data.peeCount, 10)
      data.peeCount = Number.isFinite(count) && count > 0 ? Math.min(count, 3) : 1
    }
  }

  return {
    type: parsed.type,
    data,
    action: futureFeedingStart ? 'start' : action,
    startTime,
    endTime,
    status: parsed.status || 'completed',
    confidence: 0.95
  }
}

async function parseVoiceText(text) {
  if (!text || text.trim() === '') return null

  if (canUseCloudParser()) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'parseRecord',
        data: {
          text,
          now: new Date().toISOString(),
          localNow: formatParserLocalDateTime(new Date()),
          timezoneOffsetMinutes: new Date().getTimezoneOffset()
        }
      })

      if (res.result && res.result.success) {
        const parsed = res.result.data

        if (parsed.records && Array.isArray(parsed.records)) {
          const records = parsed.records
            .map(item => normalizeCloudParsedRecord(item, text, { allowFutureStart: false }))
            .filter(Boolean)
          if (records.length) return buildBatchResult(records, 0.95)
        }

        const bathOverride = parseBathText(text, 0.95)
        if (bathOverride) return bathOverride

        return normalizeCloudParsedRecord(parsed, text)
      }
    } catch (e) {
      console.warn('云函数解析失败，回退到本地解析', e)
    }
  }

  const multiFeeding = parseMultiFeedingText(text)
  if (multiFeeding) return multiFeeding

  return localParse(text)
}

function localParse(text) {
  const { parseTimeExpression } = require('./time-parser')
  const normalized = text.replace(/毫升/g, 'ml').replace(/ML/gi, 'ml')

  if (/喂|喝|吃.*奶|奶.*ml|ml.*奶|冲奶|瓶/.test(normalized)) {
    const time = parseTimeExpression(normalized)
    let amount = null
    const mlMatch = normalized.match(/(\d+)\s*ml/)
    if (mlMatch) {
      amount = parseInt(mlMatch[1])
    } else {
      const numberReg = /(\d+)/g
      let match
      while ((match = numberReg.exec(normalized)) !== null) {
        const value = parseInt(match[1])
        const tail = normalized.slice(match.index + match[0].length)
        if (/^\s*(分钟|分|小时|个小时|点|时|号|日|天|月)/.test(tail)) continue
        if (value >= 30 && value <= 300) {
          amount = value
          break
        }
      }
    }
    let action = 'complete'
    if (/开始喂|开始喝/.test(normalized) && !amount) action = 'start'
    else if (/喂完|喝完|喂好|吃完|结束/.test(normalized)) action = 'end'
    const status = action === 'start' ? 'ongoing' : 'completed'
    return { type: 'feeding', data: { amount, action }, action, startTime: time, status, confidence: 0.6 }
  }

  if (/尿[布片不了过]?|拉|大便|小便|换[了过]|屎|便便|粑粑/.test(normalized)) {
    const time = parseTimeExpression(normalized)
    let subType = 'mixed'
    if (/小便|尿/.test(normalized) && !/大便|拉|屎|粑粑/.test(normalized)) subType = 'pee'
    else if (/大便|拉|屎|粑粑/.test(normalized) && !/小便/.test(normalized)) subType = 'poop'

    let color = ''
    if (/黄绿/.test(normalized)) color = 'yellowgreen'
    else if (/金黄/.test(normalized)) color = 'golden'
    else if (/绿/.test(normalized)) color = 'green'
    else if (/深褐|褐色/.test(normalized)) color = 'dark'

    let amount = ''
    if (/较多|很多/.test(normalized)) amount = '较多'
    else if (/少[量点]/.test(normalized)) amount = '少量'
    else if (/适量/.test(normalized)) amount = '适量'

    let status = ''
    if (/水样|稀/.test(normalized)) status = 'watery'
    else if (/糊状|糊糊/.test(normalized)) status = 'mushy'
    else if (/软便|软的/.test(normalized)) status = 'soft'
    else if (/条状|成形/.test(normalized)) status = 'formed'
    else if (/颗粒|硬/.test(normalized)) status = 'pellet'

    const peeCount = subType === 'poop' ? 0 : parsePeeCount(normalized)
    return { type: 'diaper', data: { subType, peeCount, status, color, amount }, startTime: time, status: 'completed', confidence: 0.6 }
  }

  if (/睡[着了觉]|醒[了来]|入睡|起[来床]/.test(normalized)) {
    const time = parseTimeExpression(normalized)
    const action = /醒[了来]|起[来床]/.test(normalized) ? 'end' : 'start'
    return { type: 'sleep', data: { sleepType: 'nap', action }, action, startTime: time, status: action === 'end' ? 'completed' : 'ongoing', confidence: 0.6 }
  }

  const bath = parseBathText(normalized)
  if (bath) return bath

  // 体温
  if (/体温|温度|度/.test(normalized)) {
    const time = parseTimeExpression(normalized)
    const match = normalized.match(/(3[4-9]|4[0-3])\.?\d*/)
    const value = match ? parseFloat(match[0]) : null
    if (value) {
      return { type: 'health_temp', data: { value, method: '' }, startTime: time, status: 'completed', confidence: 0.6 }
    }
  }

  // 用药
  if (/吃[了过]?药|用[了过]?药|服[了过]|布洛芬|退烧|蒙脱石|益生菌|头孢|阿莫西林/.test(normalized)) {
    const time = parseTimeExpression(normalized)
    let name = ''
    const medMatch = normalized.match(/(布洛芬|美林|泰诺林|蒙脱石散|益生菌|头孢|阿莫西林|退烧药|感冒药|咳嗽药)/)
    if (medMatch) name = medMatch[1]
    let dosage = null, unit = 'ml'
    const doseMatch = normalized.match(/(\d+\.?\d*)\s*(ml|毫升|包|片|滴|粒)/)
    if (doseMatch) {
      dosage = parseFloat(doseMatch[1])
      unit = doseMatch[2] === '毫升' ? 'ml' : doseMatch[2]
    }
    return { type: 'health_med', data: { name, dosage, unit, method: 'oral' }, startTime: time, status: 'completed', confidence: 0.5 }
  }

  // 生长记录（体重/身高/头围）
  if (/体重|身高|身长|头围|斤|公斤|千克/.test(normalized)) {
    const time = parseTimeExpression(normalized)
    const data = {}
    let wMatch = normalized.match(/体重[是有]?\s*(\d+\.?\d*)\s*(kg|公斤|千克|斤|克|g)/i)
    if (!wMatch) wMatch = normalized.match(/(\d+\.?\d*)\s*(kg|公斤|千克|斤|克|g)/i)
    if (wMatch) {
      let w = parseFloat(wMatch[1])
      const unit = wMatch[2].toLowerCase()
      if (unit === '克' || unit === 'g') w = w / 1000
      else if (unit === '斤') w = w / 2
      data.weight = parseFloat(w.toFixed(2))
    }
    let hMatch = normalized.match(/(?:身高|身长)[是有]?\s*(\d+\.?\d*)\s*(?:cm|厘米)?/i)
    if (!hMatch) hMatch = normalized.match(/(\d+\.?\d*)\s*(?:cm|厘米)/i)
    if (hMatch) data.height = parseFloat(hMatch[1])
    const hcMatch = normalized.match(/头围[是有]?\s*(\d+\.?\d*)\s*(?:cm|厘米)?/i)
    if (hcMatch) data.headCirc = parseFloat(hcMatch[1])
    if (data.weight || data.height || data.headCirc) {
      return { type: 'growth', data, startTime: time, status: 'completed', confidence: 0.6 }
    }
  }

  // 辅食
  if (/辅食|米粉|[泥糊]|蛋黄|果泥|菜泥/.test(normalized)) {
    const time = parseTimeExpression(normalized)
    let food = ''
    const foodMatch = normalized.match(/(米粉|南瓜泥|红薯泥|蛋黄|苹果泥|香蕉泥|胡萝卜泥|西兰花泥|土豆泥|山药泥)/)
    if (foodMatch) food = foodMatch[1]
    return { type: 'supplement', data: { food, amount: '适量', reaction: '' }, startTime: time, status: 'completed', confidence: 0.5 }
  }

  return null
}

function getConfirmText(result) {
  if (!result) return '未能识别，请手动记录'

  if (result.records && Array.isArray(result.records)) {
    const lines = result.records.map((record, index) => `${index + 1}. ${getConfirmText(record)}`)
    return `共 ${result.records.length} 条记录\n${lines.join('\n')}`
  }

  const typeNames = {
    feeding: '喂奶', diaper: '尿便', sleep: '睡眠',
    health_temp: '体温', health_med: '用药', supplement: '辅食',
    growth: '生长记录', bath: '洗澡'
  }

  let desc = typeNames[result.type] || '记录'

  switch (result.type) {
    case 'feeding':
      if (result.action === 'start') {
        desc = '开始喂奶'
      } else if (result.action === 'end') {
        desc = '结束喂奶'
        desc += result.data.amount ? ` ${result.data.amount}ml` : ''
      } else {
        desc += result.data.amount ? ` ${result.data.amount}ml` : ''
      }
      break
    case 'diaper':
      const subTypeNames = { pee: '小便', poop: '大便', mixed: '大小便' }
      const colorNames = { golden: '金黄', yellowgreen: '黄绿', green: '绿色', dark: '深褐' }
      const statusNames = { watery: '水样', mushy: '糊状', soft: '软便', formed: '条状', pellet: '颗粒' }
      desc = subTypeNames[result.data.subType] || desc
      if (result.data.subType !== 'poop' && result.data.peeCount > 1) desc += ` ${result.data.peeCount}次`
      if (result.data.color) desc += ` ${colorNames[result.data.color] || result.data.color}`
      if (result.data.status) desc += ` ${statusNames[result.data.status] || result.data.status}`
      if (result.data.amount) desc += ` ${result.data.amount}`
      break
    case 'sleep':
      const sleepAction = result.action || (result.data && result.data.action)
      if (sleepAction === 'end' || sleepAction === 'wake') {
        desc = '宝宝醒了'
      } else if (sleepAction === 'start' || sleepAction === 'sleep') {
        desc = '宝宝睡着了'
      } else {
        desc = '睡眠'
      }
      break
    case 'health_temp':
      desc += result.data.value ? ` ${result.data.value}°C` : ''
      break
    case 'bath':
      desc = '洗澡'
      if (result.data.waterTemp) desc += ` 水温${result.data.waterTemp}°C`
      if (result.data.duration) desc += ` ${result.data.duration}分钟`
      break
    case 'health_med':
      desc += result.data.name ? ` ${result.data.name}` : ''
      if (result.data.dosage) desc += ` ${result.data.dosage}${result.data.unit}`
      break
    case 'growth':
      desc = '生长记录'
      const parts = []
      if (result.data.weight) parts.push(`${result.data.weight}kg`)
      if (result.data.height) parts.push(`${result.data.height}cm`)
      if (result.data.headCirc) parts.push(`头围${result.data.headCirc}cm`)
      if (parts.length) desc += ' ' + parts.join(' ')
      break
    case 'supplement':
      desc += result.data.food ? ` ${result.data.food}` : ''
      break
  }

  const displayAction = result.action || (result.data && result.data.action)
  let timeDisplay = ''
  if (displayAction === 'end' || displayAction === 'wake') {
    timeDisplay = formatTime(result.endTime || result.startTime)
  } else if (displayAction === 'start' || displayAction === 'sleep') {
    timeDisplay = formatTime(result.startTime)
  } else if (result.endTime && result.startTime && result.endTime > result.startTime) {
    timeDisplay = formatTime(result.startTime) + ' ~ ' + formatTime(result.endTime)
  } else {
    timeDisplay = formatTime(result.endTime || result.startTime)
  }
  return `${desc}（${timeDisplay}）`
}

function formatTime(date) {
  if (!date) return '现在'
  const now = new Date()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const dateStr = `${month}月${day}日`

  const { isSameLogicalDay, normalizeFeedingPlanConfig } = require('./feeding-plan')
  const app = getApp()
  const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
  if (isSameLogicalDay(date, now, config.feedingDayStartHour)) return `今天 ${h}:${m}`
  return `${dateStr} ${h}:${m}`
}

module.exports = { parseVoiceText, getConfirmText }
