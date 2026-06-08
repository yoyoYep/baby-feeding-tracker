/**
 * 独立时间轴布局测试
 *
 * 运行方式：node tests/timeline-layout.test.js
 */

const {
  HOUR_HEIGHT_RPX,
  POINT_HEIGHT_RPX,
  POINT_GAP_RPX,
  buildTimelineLayout,
  buildTimelineDaySections,
  recordOverlapsRange,
  getRecordEnd
} = require('../miniprogram/utils/timeline-layout')

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

const dayStart = new Date('2026-05-29T00:00:00+08:00')
const dayEnd = new Date('2026-05-30T00:00:00+08:00')
const now = new Date('2026-05-29T12:00:00+08:00')

const records = [
  {
    _id: 'sleep_cross_day',
    type: 'sleep',
    startTime: new Date('2026-05-28T22:30:00+08:00'),
    endTime: new Date('2026-05-29T06:15:00+08:00'),
    status: 'completed'
  },
  {
    _id: 'feeding_duration',
    type: 'feeding',
    startTime: new Date('2026-05-29T08:00:00+08:00'),
    endTime: new Date('2026-05-29T08:22:00+08:00'),
    data: { amount: 120 },
    status: 'completed'
  },
  {
    _id: 'diaper_point',
    type: 'diaper',
    startTime: new Date('2026-05-29T09:15:00+08:00'),
    data: { subType: 'pee', peeCount: 2 },
    status: 'completed'
  },
  {
    _id: 'temp_point',
    type: 'health_temp',
    startTime: new Date('2026-05-29T09:17:00+08:00'),
    data: { value: 37 },
    status: 'completed'
  },
  {
    _id: 'bath_duration',
    type: 'bath',
    startTime: new Date('2026-05-29T18:30:00+08:00'),
    data: { duration: 10, waterTemp: 38 },
    status: 'completed'
  }
]

console.log('\n=== 时间轴布局 ===')

const layout = buildTimelineLayout(records, { dayStart, dayEnd, now })
const sleep = layout.durationItems.find(item => item._id === 'sleep_cross_day')
const feeding = layout.durationItems.find(item => item._id === 'feeding_duration')
const bath = layout.durationItems.find(item => item._id === 'bath_duration')
const diaper = layout.pointItems.find(item => item._id === 'diaper_point')
const temp = layout.pointItems.find(item => item._id === 'temp_point')

assert(layout.recordCount === 5, '显示当天重叠的全部记录')
assert(!!sleep && sleep.topRpx === Math.round((24 * 60 - 6 * 60 - 15) / 60 * HOUR_HEIGHT_RPX) && sleep.isClippedStart, '倒序下跨天睡眠定位到 06:15 所在位置')
assert(!!sleep && sleep.rangeText === '00:00 - 06:15', '跨天睡眠显示裁剪后的当天时间段')
assert(!!sleep && sleep.detailTime === '5月28日 22:30 - 5月29日 06:15', '跨天睡眠详情显示完整起止时间')
assert(!!feeding && feeding.topRpx === Math.round((24 * 60 - 8 * 60 - 22) / 60 * HOUR_HEIGHT_RPX), '倒序下喂奶按结束时间定位到 08:22')
assert(!!feeding && feeding.desc.includes('120ml') && feeding.desc.includes('22分钟'), '喂奶显示奶量和时长')
assert(!!feeding && feeding.displayText === '喂奶', '时段卡片只显示操作名')
assert(!!feeding && feeding.detailLines.some(line => line.label === '奶量' && line.value === '120ml'), '详细数据放入只读弹窗字段')
assert(!!sleep && sleep.laneLeftPct === 0 && sleep.laneWidthPct === 50, '睡眠固定显示在连续区左列')
assert(!!feeding && feeding.laneLeftPct === 50 && feeding.laneWidthPct === 50, '喂奶固定显示在连续区右列')
assert(!!diaper && diaper.timeStr === '09:15' && diaper.title === '小便' && diaper.desc === '2次', '尿便点状记录显示小便次数')
assert(!!diaper && diaper.displayText === '小便', '尿便点状卡片直接显示小便/大便')
assert(!!diaper && diaper.detailLines.some(line => line.label === '小便次数' && line.value === '2次'), '小便次数进入详情字段')
assert(!!bath && bath.rangeText === '18:30 - 18:40', '洗澡 duration 字段按时间段展示')
assert(!!temp && diaper.topRpx - temp.topRpx >= POINT_HEIGHT_RPX + POINT_GAP_RPX, '密集点状记录会向下避让，不互相叠住')
assert(!!temp && temp.staggerX !== diaper.staggerX, '密集点状图标会横向错开')

const medLayout = buildTimelineLayout([{
  _id: 'med_point',
  type: 'health_med',
  startTime: new Date('2026-05-29T10:30:00+08:00'),
  data: { name: '维生素D', dosage: 1, unit: '滴', method: 'oral' },
  status: 'completed'
}], { dayStart, dayEnd, now })
const med = medLayout.pointItems[0]
assert(med.displayText === '维生素D', '用药卡片只显示药品名')
assert(med.detailLines.some(line => line.label === '剂量' && line.value === '1滴'), '用药剂量进入详情字段')

const fixedInstantLayout = buildTimelineLayout([
  {
    _id: 'sleep_instant',
    type: 'sleep',
    startTime: new Date('2026-05-29T11:00:00+08:00'),
    status: 'completed'
  },
  {
    _id: 'feeding_instant',
    type: 'feeding',
    startTime: new Date('2026-05-29T11:30:00+08:00'),
    data: { amount: 90 },
    status: 'completed'
  }
], { dayStart, dayEnd, now })
const instantSleep = fixedInstantLayout.durationItems.find(item => item._id === 'sleep_instant')
const instantFeeding = fixedInstantLayout.durationItems.find(item => item._id === 'feeding_instant')
assert(!!instantSleep && !!instantFeeding && fixedInstantLayout.pointItems.length === 0, '无持续时间的睡眠和喂奶也进入连续区')
assert(instantSleep.laneLeftPct === 0 && instantFeeding.laneLeftPct === 50, '无持续时间的睡眠/喂奶仍按固定左右列展示')

console.log('\n=== 今日倒序可视范围 ===')

const compactLayout = buildTimelineLayout(records, { dayStart, dayEnd, now, visibleEndMinute: 14 * 60 })
const firstHour = compactLayout.hourMarks[0]
assert(compactLayout.dayHeightRpx === 14 * HOUR_HEIGHT_RPX, '今天可从当前附近的双小时刻开始展示')
assert(firstHour && firstHour.label === '12:00', '顶部边界小时刻度隐藏，避免和日期浮标重叠')

console.log('\n=== 多日连续时间轴 ===')

const sections = buildTimelineDaySections(records, { latestDate: dayStart, days: 2, now })
assert(sections.length === 2, '默认可构建两天连续时间轴')
assert(sections[0].dateStr === '2026-05-29' && sections[1].dateStr === '2026-05-28', '多日时间轴按最新日期到更早日期排列')
assert(sections[0].recordCount === 5, '最新日期显示当天所有记录')
assert(sections[1].recordCount === 1, '前一天会接上跨天睡眠记录')
assert(sections[1].hourMarks[0].label !== '24:00', '多日交界处不重复显示下一天顶部 24:00')

const moreSections = buildTimelineDaySections(records, { latestDate: dayStart, days: 3, now })
assert(moreSections.length === 3 && moreSections[2].dateStr === '2026-05-27', '加载更多会继续接上更早日期')

const yesterdaySections = buildTimelineDaySections(records, { latestDate: new Date('2026-05-28T00:00:00+08:00'), days: 2, now })
assert(yesterdaySections[0].dateStr === '2026-05-28' && yesterdaySections[0].recordCount === 1, '直接选择昨天时仍显示昨晚开始的跨天睡眠')

console.log('\n=== 重叠过滤 ===')

assert(
  recordOverlapsRange(records[0], dayStart, dayEnd, now),
  '前一天开始、当天结束的记录会被纳入'
)
assert(
  !recordOverlapsRange({ type: 'diaper', startTime: new Date('2026-05-28T20:00:00+08:00') }, dayStart, dayEnd, now),
  '前一天的点状记录不会出现在当天'
)
assert(
  getRecordEnd(records[4], now).getTime() === new Date('2026-05-29T18:40:00+08:00').getTime(),
  '洗澡记录可由 duration 推导结束时间'
)

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('存在失败用例！')
  process.exit(1)
} else {
  console.log('全部通过')
}
