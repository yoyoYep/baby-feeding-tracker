const CN_NUM_MAP = {
  '零': '0', '一': '1', '二': '2', '两': '2', '三': '3',
  '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
  '十': '10', '十一': '11', '十二': '12'
}

function normalizeCnNumbers(text) {
  let result = text
  result = result.replace(/十([一二三四五六七八九])/g, (_, d) => '1' + CN_NUM_MAP[d])
  result = result.replace(/([二两三四五六七八九])十/g, (_, d) => CN_NUM_MAP[d] + '0')
  result = result.replace(/十/g, '10')
  result = result.replace(/[零一二两三四五六七八九]/g, c => CN_NUM_MAP[c] || c)
  return result
}

function parseTimeExpression(text) {
  const s = normalizeCnNumbers(text)
  const now = new Date()

  if (/刚[刚才]|刚刚/.test(s)) {
    return now
  }

  let match = s.match(/(\d+)\s*分钟后/)
  if (match) {
    return new Date(now.getTime() + parseInt(match[1]) * 60 * 1000)
  }

  match = s.match(/半小时后|半个小时后/)
  if (match) {
    return new Date(now.getTime() + 30 * 60 * 1000)
  }

  match = s.match(/(\d+)\s*小时后|(\d+)\s*个小时后/)
  if (match) {
    const hours = parseInt(match[1] || match[2])
    return new Date(now.getTime() + hours * 60 * 60 * 1000)
  }

  match = s.match(/(\d+)\s*分钟前/)
  if (match) {
    return new Date(now.getTime() - parseInt(match[1]) * 60 * 1000)
  }

  match = s.match(/半小时前|半个小时前/)
  if (match) {
    return new Date(now.getTime() - 30 * 60 * 1000)
  }

  match = s.match(/(\d+)\s*小时前|(\d+)\s*个小时前/)
  if (match) {
    const hours = parseInt(match[1] || match[2])
    return new Date(now.getTime() - hours * 60 * 60 * 1000)
  }

  // 先确定基准日期（今天/昨天/前天/X号）
  let baseDate = new Date(now)
  let hasDate = false

  if (/前天/.test(s)) {
    baseDate.setDate(baseDate.getDate() - 2)
    hasDate = true
  } else if (/昨[天日晚]/.test(s)) {
    baseDate.setDate(baseDate.getDate() - 1)
    hasDate = true
  } else {
    const dayMatch = s.match(/(\d{1,2})\s*[号日]/)
    if (dayMatch) {
      baseDate.setDate(parseInt(dayMatch[1]))
      hasDate = true
    }
  }

  // 再解析时间部分
  match = s.match(/(?:上午|早上|早晨)\s*(\d{1,2})\s*[点时](?:\s*(\d{1,2})\s*分?)?/)
  if (match) {
    baseDate.setHours(parseInt(match[1]), parseInt(match[2] || '0'), 0, 0)
    return baseDate
  }

  match = s.match(/(?:下午|晚上|傍晚)\s*(\d{1,2})\s*[点时](?:\s*(\d{1,2})\s*分?)?/)
  if (match) {
    let h = parseInt(match[1])
    if (h < 12) h += 12
    baseDate.setHours(h, parseInt(match[2] || '0'), 0, 0)
    return baseDate
  }

  match = s.match(/(\d{1,2})\s*[点时]\s*(?:(\d{1,2})\s*分?)?/)
  if (match) {
    const h = parseInt(match[1])
    const m = parseInt(match[2] || '0')
    baseDate.setHours(h, m, 0, 0)
    return baseDate
  }

  // 有日期但无具体时间，返回那天的当前时刻
  if (hasDate) return baseDate

  return now
}

module.exports = { parseTimeExpression }
