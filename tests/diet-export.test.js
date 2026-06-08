/**
 * 饮食导出格式测试
 *
 * 运行方式：node tests/diet-export.test.js
 */

const {
  buildDietExportRows,
  formatEatingDuration,
  normalizeReaction
} = require('../miniprogram/utils/diet-export')

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

console.log('\n=== 饮食导出行 ===')

const records = [
  {
    _id: 'milk',
    type: 'feeding',
    status: 'completed',
    startTime: new Date('2026-06-04T07:00:00+08:00'),
    endTime: new Date('2026-06-04T07:18:00+08:00'),
    data: { amount: 120 },
    note: '喝完'
  },
  {
    _id: 'late',
    type: 'supplement',
    startTime: new Date('2026-06-04T18:30:00+08:00'),
    data: { food: '苹果泥', amount: '少量', reaction: 'normal' },
    note: '第一次尝试'
  },
  {
    _id: 'skip_diaper',
    type: 'diaper',
    startTime: new Date('2026-06-04T12:00:00+08:00'),
    data: { subType: 'pee' }
  },
  {
    _id: 'early',
    type: 'supplement',
    startTime: new Date('2026-06-04T08:10:00+08:00'),
    endTime: new Date('2026-06-04T08:28:00+08:00'),
    data: { food: '米粉', amount: '适量', reaction: 'like' },
    note: ''
  }
]

const rows = buildDietExportRows(records)

assert(rows.length === 3, '导出喂奶和辅食记录')
assert(rows[0].food === '牛奶' && rows[0].amount === '120ml', '喂奶记录映射为牛奶和毫升数')
assert(rows[1].food === '米粉' && rows[2].food === '苹果泥', '按进食时间升序导出')
assert(rows[1].time === '08:10-08:28', '有结束时间时导出时间段')
assert(rows[2].time === '18:30', '无结束时间时导出开始时间')
assert(rows[1].behavior === '喜欢' && rows[2].behavior === '一般', '反应字段转为中文')
assert(rows[2].note === '第一次尝试', '备注字段进入导出行')

const rangeRows = buildDietExportRows(records, { includeDate: true })
assert(rangeRows[0].time === '6/4 07:00-07:18', '跨日期范围导出时在时间列补充日期')

console.log('\n=== 时间和反应兜底 ===')

assert(
  formatEatingDuration({
    type: 'supplement',
    startTime: new Date('2026-06-04T09:00:00+08:00'),
    data: { duration: 12 }
  }) === '09:00 12分钟',
  '没有结束时间但有 duration 时显示持续分钟'
)

assert(normalizeReaction('轻微皱眉') === '轻微皱眉', '未知反应文案原样保留')

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('存在失败用例！')
  process.exit(1)
} else {
  console.log('全部通过')
}
