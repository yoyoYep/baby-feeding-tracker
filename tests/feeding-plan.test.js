/**
 * 喂奶计划本地规则测试
 *
 * 运行方式：node tests/feeding-plan.test.js
 */

const {
  buildFeedingPlan,
  normalizeFeedingPlanConfig,
  isInQuietMinute,
  nextAllowedMinute
} = require('../miniprogram/utils/feeding-plan')

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

function at(date, clock) {
  return new Date(`${date}T${clock}:00`)
}

function feeding(id, date, clock, amount = 110) {
  return {
    _id: id,
    type: 'feeding',
    status: 'completed',
    startTime: at(date, clock),
    data: { amount }
  }
}

function sleep(id, date, start, end, status = 'completed') {
  return {
    _id: id,
    type: 'sleep',
    status,
    startTime: at(date, start),
    endTime: status === 'completed' ? at(date, end) : null,
    data: {}
  }
}

console.log('\n=== 配置默认值 ===')

;(() => {
  const config = normalizeFeedingPlanConfig({ defaultFeedingAmount: 120 })
  assert(config.feedingDailyTargetCount === 7, '默认每日 7 顿')
  assert(config.feedingPlanAmount === 120, '未单独设置计划奶量时跟随默认奶量')
  assert(config.defaultFeedingAmount === 120, '默认奶量和计划奶量统一为每顿奶量')
  assert(config.feedingQuietStart === '00:00' && config.feedingQuietEnd === '06:00', '默认 00:00-06:00 勿扰')
})()

;(() => {
  const config = normalizeFeedingPlanConfig({ feedingPlanAmount: 100 })
  assert(config.defaultFeedingAmount === 100 && config.feedingPlanAmount === 100, '兼容旧计划奶量并统一使用')
})()

console.log('\n=== 夜间勿扰 ===')

;(() => {
  const config = normalizeFeedingPlanConfig({})
  assert(isInQuietMinute(2 * 60, config), '02:00 在勿扰区间')
  assert(!isInQuietMinute(7 * 60, config), '07:00 不在勿扰区间')
  assert(nextAllowedMinute(2 * 60, config) === 6 * 60, '勿扰内时间顺延到 06:00')
})()

console.log('\n=== 无记录时从醒后/当前开始 ===')

;(() => {
  const plan = buildFeedingPlan(
    [sleep('s1', '2026-05-29', '02:00', '07:20')],
    { date: at('2026-05-29', '00:00'), now: at('2026-05-29', '07:25'), config: {} }
  )
  assert(plan.completedCount === 0, '无喂奶记录时完成数为 0')
  assert(plan.nextTimeLabel === '07:30', '早上醒后 10 分钟作为第一顿')
  assert(plan.planItems.filter(item => item.source === 'rule').length === 7, '生成 7 个规则计划点')
})()

console.log('\n=== 已喂后重排 ===')

;(() => {
  const records = [
    feeding('f1', '2026-05-29', '06:30'),
    feeding('f2', '2026-05-29', '09:15'),
    feeding('f3', '2026-05-29', '12:05')
  ]
  const plan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '12:10'),
    config: { feedingDailyTargetCount: 7, feedingMinInterval: 150 }
  })
  const future = plan.planItems.filter(item => item.source === 'rule')
  assert(plan.completedCount === 3, '完成数读取当天已喂记录')
  assert(future.length === 4, '剩余 4 顿')
  assert(future[0].timeLabel === '15:00', '下一顿按剩余窗口动态重排并贴近整 5 分钟')
  assert(plan.remainingCount === 4, '剩余顿数正确')
})()

console.log('\n=== 到点和睡眠状态 ===')

;(() => {
  const records = [feeding('f1', '2026-05-29', '09:00')]
  const duePlan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '12:20'),
    config: { feedingDailyTargetCount: 2, feedingMinInterval: 150 }
  })
  assert(duePlan.status === 'due', '计划时间已到时标记为到点')

  const sleepingPlan = buildFeedingPlan([...records, sleep('s1', '2026-05-29', '11:30', '12:00', 'ongoing')], {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '12:20'),
    config: { feedingDailyTargetCount: 2, feedingMinInterval: 150 }
  })
  assert(sleepingPlan.status === 'sleeping', '宝宝睡觉时改为醒后提醒')
  assert(sleepingPlan.nextTimeLabel === '醒后', '睡眠中不显示硬提醒时间')
  assert(sleepingPlan.estimatedNextTimeLabel === '12:00', '睡眠中仍保留下次预估喂奶时间')
})()

console.log('\n=== AI 建议受本地规则约束 ===')

;(() => {
  const records = [feeding('f1', '2026-05-29', '12:05')]
  const ignoredPlan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '12:10'),
    config: { feedingDailyTargetCount: 2, feedingMinInterval: 150 },
    aiSuggestion: { nextTime: '14:45' }
  })
  assert(!ignoredPlan.ai.applied, '默认不启用 AI 建议')

  const appliedPlan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '12:10'),
    config: { feedingDailyTargetCount: 2, feedingMinInterval: 150, feedingAiPlanningEnabled: true },
    aiSuggestion: { nextTime: '14:45' }
  })
  assert(appliedPlan.ai.applied && appliedPlan.ai.involvementPercent === 20, '启用后只接受本地规则校验过的 AI 建议')
  assert(appliedPlan.nextTimeLabel === '14:45', 'AI 建议可以小幅调整下一顿')

  const rejectedPlan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '12:10'),
    config: { feedingDailyTargetCount: 2, feedingMinInterval: 150, feedingAiPlanningEnabled: true },
    aiSuggestion: { nextTime: '13:00' }
  })
  assert(!rejectedPlan.ai.applied, '低于最短间隔的 AI 建议会被拒绝')
})()

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('存在失败用例！')
  process.exit(1)
} else {
  console.log('全部通过')
}
