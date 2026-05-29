/**
 * 待办重复规则测试
 *
 * 运行方式：node tests/todo-schedule.test.js
 */

const { diffDays, matchesTodoDate, getTodoScheduleText } = require('../miniprogram/utils/todo-schedule')

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

console.log('\n=== 每N天待办 ===')

const medA = {
  enabled: true,
  scheduleType: 'interval',
  startDate: '2026-05-29',
  intervalDays: 2,
  time: '08:00'
}

const medB = {
  enabled: true,
  scheduleType: 'interval',
  startDate: '2026-05-30',
  intervalDays: 2,
  time: '08:00'
}

assert(matchesTodoDate(medA, '2026-05-29'), '药A起始日显示')
assert(!matchesTodoDate(medB, '2026-05-29'), '药B起始日前不显示')
assert(!matchesTodoDate(medA, '2026-05-30'), '药A隔天不显示')
assert(matchesTodoDate(medB, '2026-05-30'), '药B起始日显示')
assert(matchesTodoDate(medA, '2026-05-31'), '药A后天再次显示')
assert(matchesTodoDate(medB, '2026-06-01'), '药B大后天再次显示')

console.log('\n=== 边界 ===')

assert(diffDays('2026-05-29', '2026-06-01') === 3, '跨月日期差正确')
assert(
  !matchesTodoDate({ ...medA, endDate: '2026-05-31' }, '2026-06-02'),
  '超过结束日期不显示'
)
assert(
  getTodoScheduleText(medA) === '2026-05-29 每2天 08:00',
  '每N天文案正确'
)

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('存在失败用例！')
  process.exit(1)
} else {
  console.log('全部通过')
}
