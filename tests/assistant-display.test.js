/**
 * AI 助手进行中状态显示测试
 *
 * 运行方式：node tests/assistant-display.test.js
 */

const {
  extractWakeEstimateText,
  hasInternalAssistantField,
  sanitizeAssistantText,
  sanitizeAssistantForDisplay,
  getOngoingAssistantStatus,
  applyOngoingAssistantStatus
} = require('../miniprogram/utils/assistant-display')

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

console.log('\n=== AI 助手进行中状态 ===')

const now = new Date('2026-06-01T16:00:00+08:00')

assert(
  getOngoingAssistantStatus({
    ongoingSleep: { startTime: new Date('2026-06-01T15:01:00+08:00') }
  }, now, '预计17:45醒') === '正在睡觉，已睡59分钟，预计17:45醒',
  '正在睡觉时使用本地计时，同时保留预计醒来时间'
)

assert(
  getOngoingAssistantStatus({
    ongoingFeeding: { startTime: new Date('2026-06-01T12:54:00+08:00') }
  }, now) === '正在喂奶，已用时3小时6分钟',
  '正在喂奶时使用本地计时的已用时长'
)

const assistant = applyOngoingAssistantStatus(
  { status: '正在睡觉，约18分钟', suggestions: ['醒后再喂奶'] },
  { ongoingSleep: { startTime: new Date('2026-06-01T15:01:00+08:00') } },
  now
)

assert(
  assistant.status === '正在睡觉，已睡59分钟，预计18分钟后醒',
  'AI 返回的模糊剩余时间会被改成预计醒来文案'
)

assert(
  assistant.suggestions[0] === '醒后再喂奶',
  '校准状态不影响建议内容'
)

assert(
  extractWakeEstimateText('已睡约18分钟') === '',
  '已睡多久不会被误当成预计醒来时间'
)

assert(
  hasInternalAssistantField('ongoing显示正在睡觉，elapsedMin=10'),
  '能识别 AI 返回的内部字段名'
)

assert(
  sanitizeAssistantText('ongoing显示正在睡觉，elapsedMin=10') === '',
  '内部字段依据不会展示给用户'
)

const sanitized = sanitizeAssistantForDisplay({
  status: '正在睡觉',
  suggestions: ['保持安静', 'checks.sleep.needed=true'],
  reason: 'ongoing显示正在睡觉，elapsedMin=10'
})

assert(
  sanitized.suggestions.length === 1 && sanitized.suggestions[0] === '保持安静' && sanitized.reason === '',
  'AI 展示内容会过滤建议和依据里的内部字段'
)

console.log('\n========================================')
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('全部通过')
}
