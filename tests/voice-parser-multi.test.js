/**
 * 语音输入多条同类型时间段解析测试
 *
 * 运行方式：node tests/voice-parser-multi.test.js
 */

const { parseVoiceText, getConfirmText } = require('../miniprogram/utils/voice-parser')

global.getApp = () => ({ globalData: { config: { feedingDayStartHour: 4 } } })

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

function localHour(date) {
  return date.getHours()
}

function localMinute(date) {
  return date.getMinutes()
}

function localMonth(date) {
  return date.getMonth() + 1
}

;(async () => {
  console.log('\n=== 多条喂奶时间段 ===')

  const result = await parseVoiceText('28号早上12：10到120:30和14:39到15：10都喝了100ml奶')
  const records = result && result.records

  assert(result && result.type === 'batch', '多时间段语音会解析成批量记录')
  assert(records && records.length === 2, '识别出两条喂奶记录')
  assert(records.every(record => record.type === 'feeding' && record.status === 'completed'), '两条记录都是已完成喂奶')
  assert(records.every(record => record.data.amount === 100), '共享同一个奶量 100ml')
  assert(localHour(records[0].startTime) === 12 && localMinute(records[0].startTime) === 10, '第一条开始时间为 12:10')
  assert(localHour(records[0].endTime) === 12 && localMinute(records[0].endTime) === 30, '可纠正 120:30 为 12:30')
  assert(localHour(records[1].startTime) === 14 && localMinute(records[1].startTime) === 39, '第二条开始时间为 14:39')
  assert(localHour(records[1].endTime) === 15 && localMinute(records[1].endTime) === 10, '第二条结束时间为 15:10')

  const confirmText = getConfirmText(result)
  assert(/共 2 条记录/.test(confirmText) && /100ml/.test(confirmText), '确认文案展示批量条数和奶量')

  console.log('\n=== 小便次数 ===')

  const peeResult = await parseVoiceText('刚刚尿了两次')
  assert(peeResult && peeResult.type === 'diaper' && peeResult.data.subType === 'pee', '本地语音可识别小便记录')
  assert(peeResult.data.peeCount === 2, '本地语音可识别同一片尿片小便两次')
  assert(getConfirmText(peeResult).includes('2次'), '确认文案展示小便次数')

  console.log('\n=== DS records 数组兼容 ===')

  global.getApp = () => ({ globalData: { cloudReady: true, config: { feedingDayStartHour: 4 } } })
  global.wx = {
    cloud: {
      callFunction: async ({ data }) => {
        assert(!!data.localNow && data.timezoneOffsetMinutes !== undefined, '调用 DS 时会传当前客户端本地时间和时区')
        return {
          result: {
            success: true,
            data: {
              records: [
                {
                  type: 'diaper',
                  startTime: '2026-05-28 12:10',
                  endTime: null,
                  data: { subType: 'pee' },
                  status: 'completed'
                },
                {
                  type: 'diaper',
                  startTime: '2026-05-28 14:39',
                  endTime: null,
                  data: { subType: 'pee' },
                  status: 'completed'
                }
              ]
            }
          }
        }
      }
    }
  }

  const diaperResult = await parseVoiceText('上个月28号12:10和14:39都换了尿片')
  assert(diaperResult && diaperResult.type === 'batch', '客户端接受 DS 返回的 records 数组')
  assert(diaperResult.records.length === 2 && diaperResult.records.every(record => record.type === 'diaper'), 'DS 可返回两条尿便记录')
  assert(diaperResult.records.every(record => localMonth(record.startTime) === 5), 'DS 返回完整日期时客户端按完整日期展示')
  assert(getConfirmText(diaperResult).includes('共 2 条记录'), 'DS 批量记录共用批量确认文案')

  console.log(`\n${'='.repeat(40)}`)
  console.log(`总计: ${passed + failed} 用例, ${passed} 通过, ${failed} 失败`)
  if (failed > 0) {
    console.log('存在失败用例！')
    process.exit(1)
  } else {
    console.log('全部通过')
  }
})()
