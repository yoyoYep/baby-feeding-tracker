const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { apiKey: DEEPSEEK_API_KEY } = require('./secret')

const SYSTEM_PROMPT = `你是一个专业婴儿智能照护助手。根据提供的宝宝当前数据、喂奶计划和今日待办，推断宝宝此刻最可能的状态，并给出1-2条具体可执行的提醒。

规则：
1. status：一句话（≤25字）描述宝宝当前最可能的状态
2. suggestions：1-2条具体可执行建议（每条≤20字）
3. reason：一句话简短依据（≤30字）
4. priority：当前最该关注的事，取值 feeding/sleep/diaper/todo/play/wait
5. 每次必须先完成 checks.feeding 和 checks.sleep，再决定 priority；不要先给玩耍/待办建议
6. checks.feeding 要只使用 plan.nextPlannedMinutesFromNow、lastFeedingStartMinAgo、lastFeedingMinAgo 和喂奶计划判断，不要自己用时间字符串相减
7. checks.sleep 要结合 careFacts：awakeSinceLastSleepMin、todaySleepTotalMin、recentAvgDailySleepMin、sleepDebtMin、samePeriodSleepPattern、babyAgeMonths；不要使用固定清醒窗口一刀切
8. 如果宝宝正在进行某项活动（如正在睡觉），优先描述该活动并预估剩余时间
9. “要喝奶”和“要睡觉”是最高优先级提醒事件；喂奶只有在已到点或很快到点时才压过睡觉，如果距下次喂奶超过30分钟且 checks.sleep.needed=true，应先睡
10. 只有 today todos 的 dueNow/upcoming 中实际存在待办时，才提醒完成对应待办；尤其是吃药、体温、疫苗。没有 health_med 待办时严禁建议吃药/喂药/用药；没有洗澡/洗浴待办时严禁建议洗澡
11. 如果喂奶计划和待办同时到点，把两者合并成同一组行动建议，先说喂奶
12. lastFeedingMinAgo 表示距离上次喂奶结束的分钟数，不是开始时间；lastFeedingDurationMin 表示上次喂奶持续多久
13. plan.nextPlannedMinutesFromNow 是客户端本地规则算好的“距下次计划喂奶分钟数”；不要用 now 的 ISO 时间和 nextPlannedTime 字符串自行相减
14. 如果 lastFeedingMinAgo 在 0-30 分钟内，不能说宝宝饿了，也不能建议剧烈运动、趴玩、跳跳椅、大幅摇晃、游泳、洗澡、翻滚训练；可以建议竖抱/斜抱、拍嗝、安静互动、观察吐奶
15. 对已设置的吃药、喂药、喝药、用药、洗澡待办，要避开吃奶前后30分钟；如果 lastFeedingMinAgo <30 或 plan.nextPlannedMinutesFromNow <=30，不要建议立刻执行
16. 如果距下次计划喂奶还有较久，且上次刚喝完不久，不要把“刚醒”直接推断为“可能饿了”
17. 基于数据推断，不要编造没有依据的内容
18. 语气亲切简洁，像一个有经验的月嫂在提醒你
19. 如果信息不足无法推断，就给出基于已知信息最合理的建议

只返回JSON，不要有任何其他文字：
{"status":"...","suggestions":["...","..."],"reason":"...","priority":"...","checks":{"feeding":{"needed":false,"reason":"..."},"sleep":{"needed":false,"reason":"..."}}}`

const POST_FEEDING_REST_MINUTES = 30
const FEEDING_NEED_WINDOW_MINUTES = 30
const FEEDING_OVERRIDES_SLEEP_MINUTES = 15
const FEEDING_CARE_SPACING_MINUTES = 30
const POST_FEEDING_BLOCKED_WORDS = [
  '剧烈运动',
  '运动',
  '趴玩',
  '趴着玩',
  '跳跳椅',
  '大幅摇晃',
  '摇晃',
  '游泳',
  '洗澡',
  '翻滚训练',
  '翻滚',
  '翻身训练',
  '大动作'
]
const POST_FEEDING_SAFE_SUGGESTIONS = ['先竖抱拍嗝', '安静观察吐奶']
const MED_CARE_WORDS = ['吃药', '喂药', '喝药', '用药', '药']
const BATH_CARE_WORDS = ['洗澡', '洗浴']
const FEEDING_SPACING_CARE_WORDS = MED_CARE_WORDS.concat(BATH_CARE_WORDS)

function formatDuration(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0))
  if (safe < 60) return `${safe}分钟`
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

function isWithinPostFeedingRest(context) {
  const minutes = Number(context && context.lastFeedingMinAgo)
  return Number.isFinite(minutes) && minutes >= 0 && minutes < POST_FEEDING_REST_MINUTES
}

function hasPostFeedingBlockedActivity(text) {
  const value = String(text || '')
  return POST_FEEDING_BLOCKED_WORDS.some(word => value.includes(word))
}

function hasHungryText(text) {
  const value = String(text || '')
  return value.includes('饿') || value.includes('饥')
}

function hasSleepText(text) {
  const value = String(text || '')
  return value.includes('困') || value.includes('睡') || value.includes('小睡') || value.includes('哄睡') || value.includes('入睡')
}

function hasFeedingText(text) {
  const value = String(text || '')
  return value.includes('喝奶') || value.includes('喂奶') || value.includes('吃奶')
}

function hasFeedingFirstText(text) {
  const value = String(text || '')
  return /先.*(?:喝奶|喂奶|吃奶)/.test(value) || value.includes('喂完奶') || value.includes('喝完奶')
}

function hasFeedingSpacingCareText(text) {
  const value = String(text || '')
  return FEEDING_SPACING_CARE_WORDS.some(word => value.includes(word))
}

function hasMedCareText(text) {
  const value = String(text || '')
  return MED_CARE_WORDS.some(word => value.includes(word))
}

function hasBathCareText(text) {
  const value = String(text || '')
  return BATH_CARE_WORDS.some(word => value.includes(word))
}

function getTodoText(todo) {
  return [
    todo && todo.type,
    todo && todo.title,
    todo && todo.text
  ].filter(Boolean).join(' ')
}

function getActiveTodoItems(context) {
  const todos = context && context.todos
  if (!todos) return []
  return []
    .concat(Array.isArray(todos.dueNow) ? todos.dueNow : [])
    .concat(Array.isArray(todos.upcoming) ? todos.upcoming : [])
    .filter(item => item && item.status !== 'done' && item.status !== 'cancelled')
}

function isMedTodoItem(todo) {
  const text = getTodoText(todo)
  return (todo && todo.type === 'health_med') || hasMedCareText(text)
}

function isBathTodoItem(todo) {
  return hasBathCareText(getTodoText(todo))
}

function hasActiveMedTodo(context) {
  return getActiveTodoItems(context).some(isMedTodoItem)
}

function hasActiveBathTodo(context) {
  return getActiveTodoItems(context).some(isBathTodoItem)
}

function hasUnsupportedCareText(text, context) {
  if (!text) return false
  if (hasMedCareText(text) && !hasActiveMedTodo(context)) return true
  if (hasBathCareText(text) && !hasActiveBathTodo(context)) return true
  return false
}

function getFeedingSpacingSafeSuggestion(context) {
  const labels = []
  if (hasActiveMedTodo(context)) labels.push('用药')
  if (hasActiveBathTodo(context)) labels.push('洗澡')
  if (!labels.length) return ''
  return `${labels.join('或')}避开奶前后30分`
}

function isWithinFeedingCareSpacing(context) {
  const lastFeedingMinAgo = Number(context && context.lastFeedingMinAgo)
  const nextFeedingMin = getNextFeedingMinutes(context)
  const afterFeeding = Number.isFinite(lastFeedingMinAgo) && lastFeedingMinAgo >= 0 && lastFeedingMinAgo < FEEDING_CARE_SPACING_MINUTES
  const beforeFeeding = nextFeedingMin !== null && nextFeedingMin <= FEEDING_CARE_SPACING_MINUTES
  return afterFeeding || beforeFeeding
}

function normalizeCheck(check) {
  if (!check || typeof check !== 'object') return { needed: false, reason: '' }
  return {
    needed: check.needed === true,
    reason: String(check.reason || '').slice(0, 40)
  }
}

function normalizeChecks(checks) {
  return {
    feeding: normalizeCheck(checks && checks.feeding),
    sleep: normalizeCheck(checks && checks.sleep)
  }
}

function applyPostFeedingGuard(parsed, context) {
  if (!isWithinPostFeedingRest(context)) return parsed

  const originalSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const safeSuggestions = originalSuggestions
    .filter(item => item && !hasPostFeedingBlockedActivity(item))
    .slice(0, 2)

  POST_FEEDING_SAFE_SUGGESTIONS.forEach(item => {
    if (safeSuggestions.length < 2 && !safeSuggestions.includes(item)) {
      safeSuggestions.push(item)
    }
  })

  return {
    ...parsed,
    status: hasHungryText(parsed.status) ? '刚喝完奶，先安静观察' : parsed.status,
    suggestions: safeSuggestions,
    reason: hasHungryText(parsed.reason) ? '距上次喂奶结束不久' : (parsed.reason || '刚吃完奶，先安静观察'),
    priority: parsed.priority === 'feeding' || parsed.priority === 'play' ? 'wait' : parsed.priority,
    checks: {
      ...(parsed.checks || {}),
      feeding: { needed: false, reason: '刚喝完奶不久' }
    }
  }
}

function getNextFeedingMinutes(context) {
  const minutes = Number(context && context.plan && context.plan.nextPlannedMinutesFromNow)
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null
}

function fixNextFeedingDurationText(text, nextMinutes) {
  if (nextMinutes === null) return text
  const value = String(text || '')
  const durationText = formatDuration(nextMinutes)
  return value.replace(/距下次(?:计划)?(?:喝奶|喂奶)(?:还有|约)?\s*\d+(?:\.\d+)?\s*(?:小时|h|H)(?:\d+\s*(?:分钟|分|m|M))?/g, `距下次喂奶还有${durationText}`)
    .replace(/距下次(?:计划)?(?:喝奶|喂奶)(?:还有|约)?\s*\d+\s*(?:分钟|分|m|M)/g, `距下次喂奶还有${durationText}`)
}

function applyNextFeedingGuard(parsed, context) {
  const nextMinutes = getNextFeedingMinutes(context)
  if (nextMinutes === null) return parsed

  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map(item => fixNextFeedingDurationText(item, nextMinutes))
    : []

  return {
    ...parsed,
    status: fixNextFeedingDurationText(parsed.status, nextMinutes),
    suggestions,
    reason: fixNextFeedingDurationText(parsed.reason, nextMinutes)
  }
}

function applyTodoScopeGuard(parsed, context) {
  const originalSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const suggestions = originalSuggestions
    .filter(item => item && !hasUnsupportedCareText(item, context))
    .slice(0, 2)
  const statusUnsupported = hasUnsupportedCareText(parsed.status, context)
  const reasonUnsupported = hasUnsupportedCareText(parsed.reason, context)
  const changed = statusUnsupported || reasonUnsupported || suggestions.length !== originalSuggestions.filter(Boolean).slice(0, 2).length
  if (!changed) return parsed

  if (!suggestions.length) {
    suggestions.push('先观察宝宝状态')
  }

  return {
    ...parsed,
    status: statusUnsupported ? '按当前记录照护' : parsed.status,
    suggestions,
    reason: reasonUnsupported ? '仅提醒已设置的待办' : parsed.reason,
    priority: parsed.priority === 'todo' && !getActiveTodoItems(context).length ? 'wait' : parsed.priority
  }
}

function applyFeedingCareSpacingGuard(parsed, context) {
  if (!isWithinFeedingCareSpacing(context)) return parsed

  const originalSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const safeSuggestions = originalSuggestions
    .filter(item => item && !hasFeedingSpacingCareText(item))
    .slice(0, 2)
  const spacingSuggestion = getFeedingSpacingSafeSuggestion(context)

  if (spacingSuggestion && safeSuggestions.length < 2 && !safeSuggestions.includes(spacingSuggestion)) {
    safeSuggestions.push(spacingSuggestion)
  }

  const careReason = spacingSuggestion || '吃奶前后先避开额外照护'
  return {
    ...parsed,
    suggestions: safeSuggestions,
    reason: hasFeedingSpacingCareText(parsed.reason) ? careReason : (parsed.reason || (spacingSuggestion ? careReason : '')),
    checks: {
      ...(parsed.checks || {}),
      todo: { needed: false, reason: careReason }
    }
  }
}

function applyPriorityGuard(parsed, context) {
  const nextMinutes = getNextFeedingMinutes(context)
  const checks = normalizeChecks(parsed.checks)
  if (checks.feeding.needed && nextMinutes !== null && nextMinutes > FEEDING_NEED_WINDOW_MINUTES) {
    checks.feeding = {
      needed: false,
      reason: `距下次喂奶还有${formatDuration(nextMinutes)}`
    }
  }
  const allText = [
    parsed.status,
    parsed.reason,
    ...(Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
  ].join(' ')

  if (checks.feeding.needed || checks.sleep.needed) {
    if (checks.sleep.needed && (!checks.feeding.needed || (nextMinutes !== null && nextMinutes > FEEDING_OVERRIDES_SLEEP_MINUTES))) {
      const originalSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      const suggestions = originalSuggestions.filter(item => item && !hasFeedingFirstText(item)).slice(0, 2)
      if (suggestions.length < 1) suggestions.push('先安静哄睡')
      if (suggestions.length < 2) suggestions.push('降低环境刺激')
      return { ...parsed, priority: 'sleep', suggestions, checks }
    }
    if (parsed.priority === 'feeding' && checks.feeding.needed) return { ...parsed, checks }
    if (parsed.priority === 'sleep' && checks.sleep.needed) return { ...parsed, checks }
    if (checks.feeding.needed && !checks.sleep.needed) return { ...parsed, priority: 'feeding', checks }
    if (checks.sleep.needed && !checks.feeding.needed) return { ...parsed, priority: 'sleep', checks }
    return { ...parsed, priority: nextMinutes !== null && nextMinutes <= FEEDING_OVERRIDES_SLEEP_MINUTES ? 'feeding' : 'sleep', checks }
  }

  if (nextMinutes !== null && nextMinutes <= FEEDING_OVERRIDES_SLEEP_MINUTES && hasFeedingText(allText)) {
    return { ...parsed, priority: 'feeding', checks }
  }
  if (hasSleepText(allText)) {
    return { ...parsed, priority: 'sleep', checks }
  }
  return { ...parsed, checks }
}

function applySafetyGuards(parsed, context) {
  return applyPriorityGuard(
    applyFeedingCareSpacingGuard(
      applyTodoScopeGuard(
        applyNextFeedingGuard(
          applyPostFeedingGuard(parsed, context),
          context
        ),
        context
      ),
      context
    ),
    context
  )
}

function callDeepSeek(context) {
  return new Promise((resolve, reject) => {
    const userMessage = JSON.stringify(context)
    const postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 300,
      stream: false
    })

    const options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content)
          } else {
            reject(new Error('API响应异常: ' + data.slice(0, 200)))
          }
        } catch (e) {
          reject(e)
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(20000, () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    req.write(postData)
    req.end()
  })
}

exports.main = async (event) => {
  const { context } = event

  if (!context) {
    return { success: false, error: '缺少上下文数据' }
  }

  try {
    const response = await callDeepSeek(context)
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = applySafetyGuards(JSON.parse(cleaned), context)
    return {
      success: true,
      data: {
        status: parsed.status || '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 2) : [],
        reason: parsed.reason || '',
        priority: ['feeding', 'sleep', 'diaper', 'todo', 'play', 'wait'].includes(parsed.priority) ? parsed.priority : 'wait',
        checks: normalizeChecks(parsed.checks)
      },
      updatedAt: Date.now()
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
