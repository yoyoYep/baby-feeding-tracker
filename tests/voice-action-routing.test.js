/**
 * 语音输入 action 路由测试
 * 覆盖场景：开始/结束睡眠、开始/结束喂奶，DeepSeek 路径和本地解析路径
 *
 * 运行方式：node tests/voice-action-routing.test.js
 */

let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.log(`  ✗ ${msg}`)
  }
}

// ========== 模拟 index.js 中的 action 路由逻辑 ==========

function routeAction(result) {
  const rawAction = result.action || (result.data && result.data.action) || null
  let action = rawAction
  if (action === 'wake') action = 'end'
  if (action === 'sleep') action = 'start'

  const hasEndTime = !!result.endTime
  const effectiveAction = (action === 'start' || action === 'end') ? action : (hasEndTime ? null : action)

  if (result.type === 'sleep' && effectiveAction === 'end') return 'handleWakeUp'
  if (result.type === 'sleep' && effectiveAction === 'start') return 'handleSleepStart'
  if (result.type === 'feeding' && effectiveAction === 'start') return 'handleFeedingStart'
  if (result.type === 'feeding' && effectiveAction === 'end') return 'handleFeedingEnd'
  return 'createNewRecord'
}

// ========== 模拟本地解析器 ==========

function localParseSleep(text) {
  const normalized = text
  if (/睡[着了觉]|醒[了来]|入睡|起[来床]/.test(normalized)) {
    const action = /醒[了来]|起[来床]/.test(normalized) ? 'end' : 'start'
    return { type: 'sleep', data: { sleepType: 'nap', action }, action, startTime: new Date(), status: action === 'end' ? 'completed' : 'ongoing', confidence: 0.6 }
  }
  return null
}

function localParseFeeding(text) {
  const normalized = text.replace(/毫升/g, 'ml').replace(/ML/gi, 'ml')
  if (/喂|喝|吃.*奶|奶.*ml|ml.*奶|冲奶|瓶/.test(normalized)) {
    let amount = null
    const match = normalized.match(/(\d+)\s*ml/) || normalized.match(/(\d+)/)
    if (match && parseInt(match[1]) >= 30 && parseInt(match[1]) <= 300) {
      amount = parseInt(match[1])
    }
    let action = 'complete'
    if (/开始喂|开始喝/.test(normalized) && !amount) action = 'start'
    else if (/喂完|喝完|喂好|吃完|结束/.test(normalized)) action = 'end'
    const status = action === 'start' ? 'ongoing' : 'completed'
    return { type: 'feeding', data: { amount, action }, action, startTime: new Date(), status, confidence: 0.6 }
  }
  return null
}

// ========== 测试用例 ==========

console.log('\n=== 睡眠：DeepSeek 路径 ===')

assert(
  routeAction({ type: 'sleep', action: 'start', data: { sleepType: 'nap', action: 'start' }, startTime: new Date(), endTime: null, status: 'ongoing' }) === 'handleSleepStart',
  '"宝宝睡着了" DeepSeek返回 action=start → 应路由到 handleSleepStart'
)

assert(
  routeAction({ type: 'sleep', action: 'end', data: { sleepType: 'nap', action: 'end' }, startTime: new Date(), endTime: new Date(), status: 'completed' }) === 'handleWakeUp',
  '"宝宝醒了" DeepSeek返回 action=end + endTime=now → 应路由到 handleWakeUp（不被 endTime 覆盖）'
)

assert(
  routeAction({ type: 'sleep', action: 'end', data: { sleepType: 'nap', action: 'end' }, startTime: null, endTime: null, status: 'completed' }) === 'handleWakeUp',
  '"宝宝醒了" DeepSeek返回 action=end 无endTime → 应路由到 handleWakeUp'
)

assert(
  routeAction({ type: 'sleep', action: 'complete', data: { sleepType: 'nap', action: 'complete' }, startTime: new Date(Date.now() - 3600000), endTime: new Date(), status: 'completed' }) === 'createNewRecord',
  '"睡了1小时刚醒" DeepSeek返回 action=complete + 有起止时间 → 应创建完整新记录'
)

console.log('\n=== 睡眠：本地解析路径 ===')

;(() => {
  const r = localParseSleep('宝宝睡着了')
  assert(r && r.action === 'start', '"宝宝睡着了" 本地解析 action=start')
  assert(r && r.status === 'ongoing', '"宝宝睡着了" 本地解析 status=ongoing')
  assert(r && routeAction(r) === 'handleSleepStart', '"宝宝睡着了" 本地解析结果路由到 handleSleepStart')
})()

;(() => {
  const r = localParseSleep('宝宝醒了')
  assert(r && r.action === 'end', '"宝宝醒了" 本地解析 action=end')
  assert(r && routeAction(r) === 'handleWakeUp', '"宝宝醒了" 本地解析结果路由到 handleWakeUp')
})()

;(() => {
  const r = localParseSleep('宝宝起来了')
  assert(r && r.action === 'end', '"宝宝起来了" 本地解析 action=end')
  assert(r && routeAction(r) === 'handleWakeUp', '"宝宝起来了" 本地解析结果路由到 handleWakeUp')
})()

;(() => {
  const r = localParseSleep('入睡了')
  assert(r && r.action === 'start', '"入睡了" 本地解析 action=start')
  assert(r && routeAction(r) === 'handleSleepStart', '"入睡了" 本地解析结果路由到 handleSleepStart')
})()

console.log('\n=== 喂奶：DeepSeek 路径 ===')

assert(
  routeAction({ type: 'feeding', action: 'start', data: { amount: null, action: 'start' }, startTime: new Date(), endTime: null, status: 'ongoing' }) === 'handleFeedingStart',
  '"开始喂奶" DeepSeek返回 action=start → 应路由到 handleFeedingStart'
)

assert(
  routeAction({ type: 'feeding', action: 'end', data: { amount: 120, action: 'end' }, startTime: null, endTime: new Date(), status: 'completed' }) === 'handleFeedingEnd',
  '"喂完了喝了120ml" DeepSeek返回 action=end + endTime → 应路由到 handleFeedingEnd（不被 endTime 覆盖）'
)

assert(
  routeAction({ type: 'feeding', action: 'end', data: { amount: null, action: 'end' }, startTime: null, endTime: new Date(), status: 'completed' }) === 'handleFeedingEnd',
  '"喂完了" DeepSeek返回 action=end 无奶量 → 应路由到 handleFeedingEnd'
)

assert(
  routeAction({ type: 'feeding', action: 'complete', data: { amount: 120, action: 'complete' }, startTime: new Date(Date.now() - 600000), endTime: new Date(), status: 'completed' }) === 'createNewRecord',
  '"刚喝了120ml" DeepSeek返回 action=complete + 有起止时间 → 应创建完整新记录'
)

assert(
  routeAction({ type: 'feeding', data: { amount: 90 }, startTime: new Date(), endTime: null, status: 'completed' }) === 'createNewRecord',
  '"喝了90ml奶" 无action无endTime → 应创建完整新记录'
)

console.log('\n=== 喂奶：本地解析路径 ===')

;(() => {
  const r = localParseFeeding('开始喂奶')
  assert(r && r.action === 'start', '"开始喂奶" 本地解析 action=start')
  assert(r && r.status === 'ongoing', '"开始喂奶" 本地解析 status=ongoing')
  assert(r && routeAction(r) === 'handleFeedingStart', '"开始喂奶" 本地解析结果路由到 handleFeedingStart')
})()

;(() => {
  const r = localParseFeeding('开始喝奶')
  assert(r && r.action === 'start', '"开始喝奶" 本地解析 action=start')
  assert(r && routeAction(r) === 'handleFeedingStart', '"开始喝奶" 本地解析结果路由到 handleFeedingStart')
})()

;(() => {
  const r = localParseFeeding('喂完了')
  assert(r && r.action === 'end', '"喂完了" 本地解析 action=end')
  assert(r && routeAction(r) === 'handleFeedingEnd', '"喂完了" 本地解析结果路由到 handleFeedingEnd')
})()

;(() => {
  const r = localParseFeeding('喝完了')
  assert(r && r.action === 'end', '"喝完了" 本地解析 action=end')
  assert(r && routeAction(r) === 'handleFeedingEnd', '"喝完了" 本地解析结果路由到 handleFeedingEnd')
})()

;(() => {
  const r = localParseFeeding('喂完了喝了120ml')
  assert(r && r.action === 'end', '"喂完了喝了120ml" 本地解析 action=end')
  assert(r && r.data.amount === 120, '"喂完了喝了120ml" 本地解析 amount=120')
  assert(r && routeAction(r) === 'handleFeedingEnd', '"喂完了喝了120ml" 本地解析结果路由到 handleFeedingEnd')
})()

;(() => {
  const r = localParseFeeding('喝了90ml奶')
  assert(r && r.action === 'complete', '"喝了90ml奶" 本地解析 action=complete（已完成的完整记录）')
  assert(r && r.data.amount === 90, '"喝了90ml奶" 本地解析 amount=90')
  assert(r && routeAction(r) === 'createNewRecord', '"喝了90ml奶" 本地解析结果路由到 createNewRecord')
})()

console.log('\n=== 旧 action 值兼容（wake/sleep）===')

assert(
  routeAction({ type: 'sleep', data: { action: 'wake' }, startTime: new Date() }) === 'handleWakeUp',
  'action=wake 兼容归一化为 end → handleWakeUp'
)

assert(
  routeAction({ type: 'sleep', data: { action: 'sleep' }, startTime: new Date() }) === 'handleSleepStart',
  'action=sleep 兼容归一化为 start → handleSleepStart'
)

console.log('\n=== 其他类型不受影响 ===')

assert(
  routeAction({ type: 'diaper', data: { subType: 'pee' }, startTime: new Date(), status: 'completed' }) === 'createNewRecord',
  '换尿布记录 → 正常创建新记录'
)

assert(
  routeAction({ type: 'health_temp', data: { value: 37.2 }, startTime: new Date(), endTime: null }) === 'createNewRecord',
  '体温记录 → 正常创建新记录'
)

// ========== 结果汇总 ==========

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('❌ 存在失败用例！')
  process.exit(1)
} else {
  console.log('✅ 全部通过')
}
