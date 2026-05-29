/**
 * WHO LMS 生长标准测试
 *
 * 运行方式：node tests/growth-standard.test.js
 */

const { getPercentile, getRefData, BANDS } = require('../miniprogram/utils/growth-standard')

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

function near(value, target, tolerance) {
  return Math.abs(value - target) <= tolerance
}

console.log('\n=== WHO LMS 百分位 ===')

assert(
  near(getPercentile(6.3762, 3, 'male', 'weight').percentile, 50, 0.2),
  '男宝3月龄体重 M 值应约为 P50'
)

assert(
  near(getPercentile(59.8029, 3, 'female', 'length').percentile, 50, 0.2),
  '女宝3月龄身长 M 值应约为 P50'
)

assert(
  near(getPercentile(42.5576, 5, 'male', 'hc').percentile, 50, 0.2),
  '男宝5月龄头围 M 值应约为 P50'
)

assert(
  getPercentile(5, 3, 'male', 'weight').percentile < getPercentile(7, 3, 'male', 'weight').percentile,
  '同月龄同指标数值越大百分位越高'
)

console.log('\n=== 参考线数据 ===')

const ref = getRefData('female', 'weight')
assert(
  BANDS.join(',') === '3,10,25,50,75,90,97',
  '导出7条百分位参考线'
)

assert(
  Object.keys(ref).length === 7 && Object.values(ref).every(line => line.length === 25),
  '每条参考线覆盖0-24月龄'
)

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('存在失败用例！')
  process.exit(1)
} else {
  console.log('全部通过')
}
