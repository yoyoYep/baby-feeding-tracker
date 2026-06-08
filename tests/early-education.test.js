/**
 * 本地早教建议测试
 *
 * 运行方式：node tests/early-education.test.js
 */

const {
  buildStateTags,
  getEarlyEducationSuggestions,
  getPrimaryEarlyEducationSuggestion
} = require('../miniprogram/utils/early-education')

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

console.log('\n=== 本地早教建议 ===')

const postFeeding = getEarlyEducationSuggestions({
  ageMonths: 2,
  lastFeedingEndMinAgo: 12,
  lastSleepEndMinAgo: 40
}, { limit: 5 })

assert(
  postFeeding.length > 0 && postFeeding.every(item => item.id !== 'tummy_time_0_6'),
  '刚喝完奶30分钟内不会推荐趴玩'
)

assert(
  postFeeding[0].intensity === 'quiet',
  '刚喝完奶优先低刺激互动'
)

const activeAwake = getEarlyEducationSuggestions({
  ageMonths: 4,
  lastFeedingEndMinAgo: 75,
  lastSleepEndMinAgo: 45
}, { limit: 4 })

assert(
  activeAwake.some(item => item.id === 'tummy_time_0_6' || item.id === 'reach_grasp_3_7'),
  '清醒活跃窗口会出现大运动或抓握建议'
)

const sleeping = getPrimaryEarlyEducationSuggestion({
  ageMonths: 5,
  ongoingType: 'sleep'
})

assert(
  sleeping && sleeping.id === 'rest_when_sleeping',
  '宝宝睡着时早教建议先暂停'
)

const fever = getEarlyEducationSuggestions({
  ageMonths: 8,
  highestTempC: 37.8,
  lastSleepEndMinAgo: 60
}, { limit: 5 })

assert(
  fever.length > 0 && fever.every(item => item.intensity === 'quiet'),
  '发热或不舒服时只给低刺激建议'
)

const toddler = getEarlyEducationSuggestions({
  ageMonths: 20,
  lastFeedingEndMinAgo: 90,
  lastSleepEndMinAgo: 80
}, { limit: 5 })

assert(
  toddler.every(item => item.id !== 'tummy_time_0_6' && item.id !== 'face_talk_0_3'),
  '大月龄不会混入低月龄建议'
)

const tags = buildStateTags({
  ageMonths: 3,
  lastFeedingEndMinAgo: 10,
  nextPlannedMinutesFromNow: 25,
  highestTempC: 37.6
})

assert(
  tags.within_30min_after_feeding && tags.feeding_soon && tags.unwell && tags.quiet_window,
  '状态标签能同时标记奶后、奶前、健康和安静窗口'
)

console.log('\n========================================')
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('全部通过')
}
