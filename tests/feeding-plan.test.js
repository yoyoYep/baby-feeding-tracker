/**
 * 喂奶计划本地规则测试
 *
 * 运行方式：node tests/feeding-plan.test.js
 */

const {
  buildFeedingPlan,
  normalizeFeedingPlanConfig,
  calcRealisticMax,
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

console.log('\n=== 时间紧张提前预警 ===')

;(() => {
  // 21:00 还剩 3 顿，间隔 150 分钟到 23:30 能排 2 顿（21:00 和 23:30）
  const records = [
    feeding('f1', '2026-05-29', '06:30'),
    feeding('f2', '2026-05-29', '09:30'),
    feeding('f3', '2026-05-29', '12:30'),
    feeding('f4', '2026-05-29', '18:30')
  ]
  const plan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '21:00'),
    config: { feedingDailyTargetCount: 7, feedingMinInterval: 150 }
  })
  assert(plan.status === 'tight', '时间紧张时 status 为 tight')
  assert(plan.realisticMax < plan.remainingCount, 'realisticMax 小于剩余顿数')
  assert(plan.realisticMax === 2, '21:00 到 23:30 间隔 150 分钟最多排 2 顿')
  assert(plan.warning.includes('最多能排'), '警告包含可执行信息')
  assert(plan.warning.includes('3'), '警告提示还需的顿数')
})()

;(() => {
  // 14:00 已喂 2 顿，剩余 5 顿，到 23:30 有 570 分钟，够排 4 顿
  const records = [
    feeding('f1', '2026-05-29', '06:30'),
    feeding('f2', '2026-05-29', '11:30')
  ]
  const plan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '14:00'),
    config: { feedingDailyTargetCount: 7, feedingMinInterval: 150 }
  })
  assert(plan.status === 'tight', '下午已能预判紧张')
  assert(plan.realisticMax === 4, '14:00 到 23:30 间隔 150 分钟可排 4 顿')
  assert(plan.warning.includes('5'), '警告里有还需 5 顿')
  assert(plan.warning.includes('4'), '警告里有最多 4 顿')
  assert(plan.planItems.filter(item => item.source === 'rule').length === 4, '只排出能排的 4 顿')
})()

;(() => {
  // 充裕情况：12:00 已喂 3 顿，剩余 4 顿，完全排得下
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
  assert(plan.status !== 'tight', '时间充裕时不标记 tight')
  assert(plan.realisticMax === 4, '充裕时 realisticMax 等于剩余顿数')
  assert(!plan.warning, '无警告')
})()

;(() => {
  // 极端场景：最后一顿 22:00，下一顿 00:30 落入勿扰被推到 06:00 > 23:30
  const records = [
    feeding('f1', '2026-05-29', '07:00'),
    feeding('f2', '2026-05-29', '10:00'),
    feeding('f3', '2026-05-29', '13:00'),
    feeding('f4', '2026-05-29', '16:00'),
    feeding('f5', '2026-05-29', '22:00')
  ]
  const plan = buildFeedingPlan(records, {
    date: at('2026-05-29', '00:00'),
    now: at('2026-05-29', '23:05'),
    config: { feedingDailyTargetCount: 7, feedingMinInterval: 150 }
  })
  assert(plan.status === 'tight', '22:00+150分钟推入勿扰后极端紧张')
  assert(plan.realisticMax === 0, '下一顿被推到勿扰之后，当天无法安排')
  assert(plan.warning.includes('无法再安排'), '极端场景建议明天提前')
})()

;(() => {
  // calcRealisticMax 单元测试
  const config = normalizeFeedingPlanConfig({ feedingMinInterval: 150 })
  // 从 21:00(1260) 到 23:30(1410) = 150 分钟 → 1 + floor(150/150) = 2
  assert(calcRealisticMax(1260, config) === 2, 'calcRealisticMax: 150分钟窗口排2顿')
  // 从 14:00(840) 到 23:30(1410) = 570 分钟 → 1 + floor(570/150) = 4
  assert(calcRealisticMax(840, config) === 4, 'calcRealisticMax: 570分钟窗口排4顿')
  // 从 06:00(360) 到 23:30(1410) = 1050 分钟 → 1 + floor(1050/150) = 8
  assert(calcRealisticMax(360, config) === 8, 'calcRealisticMax: 1050分钟窗口排8顿')
})()

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('存在失败用例！')
  process.exit(1)
} else {
  console.log('全部通过')
}
