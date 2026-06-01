/**
 * 喂奶/睡眠同类型重叠校验测试
 *
 * 运行方式：node tests/record-overlap.test.js
 */

const {
  findSameTypeOverlap,
  createRecordOverlapError,
  isRecordOverlapError
} = require('../miniprogram/utils/record-overlap')

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

const records = [
  {
    _id: 'feeding_1',
    type: 'feeding',
    startTime: new Date('2026-05-29T10:00:00+08:00'),
    endTime: new Date('2026-05-29T10:30:00+08:00'),
    status: 'completed'
  },
  {
    _id: 'sleep_1',
    type: 'sleep',
    startTime: new Date('2026-05-29T10:10:00+08:00'),
    endTime: new Date('2026-05-29T10:40:00+08:00'),
    status: 'completed'
  }
]

console.log('\n=== 同类型重叠校验 ===')

assert(
  findSameTypeOverlap({
    type: 'feeding',
    startTime: new Date('2026-05-29T10:20:00+08:00'),
    endTime: new Date('2026-05-29T10:45:00+08:00'),
    status: 'completed'
  }, records)._id === 'feeding_1',
  '新增喂奶与已有喂奶时间段重叠时会命中冲突'
)

assert(
  !findSameTypeOverlap({
    type: 'feeding',
    startTime: new Date('2026-05-29T10:40:00+08:00'),
    endTime: new Date('2026-05-29T11:00:00+08:00'),
    status: 'completed'
  }, records),
  '喂奶与睡眠重叠不会互相拦截'
)

assert(
  findSameTypeOverlap({
    type: 'feeding',
    startTime: new Date('2026-05-29T10:15:00+08:00'),
    status: 'completed'
  }, records)._id === 'feeding_1',
  '无持续时间的喂奶落在已有喂奶时段内也会命中冲突'
)

assert(
  !findSameTypeOverlap({
    type: 'feeding',
    startTime: new Date('2026-05-29T10:30:00+08:00'),
    endTime: new Date('2026-05-29T10:45:00+08:00'),
    status: 'completed'
  }, records),
  '新喂奶刚好从已有喂奶结束时开始不算重叠'
)

const err = createRecordOverlapError({ type: 'sleep' })
assert(isRecordOverlapError(err) && /睡眠/.test(err.content), '重叠错误会携带可展示的输入问题提示')

console.log(`\n${'='.repeat(40)}`)
console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
if (failed > 0) {
  console.log('存在失败用例！')
  process.exit(1)
} else {
  console.log('全部通过')
}
