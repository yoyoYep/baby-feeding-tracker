const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { apiKey: DEEPSEEK_API_KEY } = require('./secret')

const SYSTEM_PROMPT = `你是一个宝宝喂养记录解析助手。用户会用自然语言描述宝宝的喂养、换尿布、睡眠、洗澡、辅食、体温、用药等事件。

请将用户输入解析为JSON格式，严格按以下schema返回，不要返回任何其他内容。

最重要的时间输出规则：
- 你会在用户消息里收到“当前客户端本地时间”。所有相对日期（今天、昨天、前天、上个月28号、上周等）都必须基于这个客户端本地时间计算。
- startTime 和 endTime 必须输出完整本地日期时间字符串，格式固定为 "YYYY-MM-DD HH:mm"；endTime 不存在时输出 null。
- 禁止输出 "now"、"today 12:10"、"yesterday 12:10"、"28 12:10"、"12:10" 这类简写时间。
- 如果用户说“5月28号”，应输出当前客户端本地年份下的完整日期，例如 "2026-05-28 12:10"。
- 如果用户说“上个月28号”，应输出当前客户端本地时间的上一个自然月的28号，例如当前为 2026-06-01 时输出 "2026-05-28 12:10"。
- 如果用户只说“28号”且没有月份，优先按当前客户端本地月份解释；如果这个日期明显在未来且语境是已发生记录，可以按最近已经过去的28号解释。

如果一句话包含多条独立记录，必须返回 records 数组，不要只返回第一条。多条记录可以是多个时间段，也可以是多个时间点；可以是任意 type，例如 feeding、diaper、sleep、bath、health_temp、health_med、supplement、growth。

{
  "records": [
    {
      "type": "feeding|diaper|sleep|supplement|bath|health_temp|health_med|growth",
      "startTime": "YYYY-MM-DD HH:mm",
      "endTime": "YYYY-MM-DD HH:mm或null",
      "duration": 数字(分钟)或null,
      "data": { ... },
      "status": "completed|ongoing"
    }
  ]
}

单条记录仍按以下schema返回：

{
  "type": "feeding|diaper|sleep|supplement|bath|health_temp|health_med|growth",
  "startTime": "YYYY-MM-DD HH:mm",
  "endTime": "YYYY-MM-DD HH:mm或null",
  "duration": 数字(分钟)或null,
  "data": { ... },
  "status": "completed|ongoing"
}

各type的data字段：
- feeding: {"amount": 数字(ml)或null, "action": "start|end|complete"}
  - "开始喂奶/宝宝喝奶了"（仅表示开始，无时长无奶量）→ action="start", amount=null
  - "2分钟后开始喂奶/半小时后开始喝奶" → action="start", amount=null, startTime=基于当前客户端本地时间计算后的完整日期时间
  - "喂奶结束/喝完了/喂完了" → action="end", amount=数字(如果提到了奶量)
  - "刚喝了120ml奶"（已经喝完的完整记录）→ action="complete", amount=120
  - 重要：如果同时提到了开始时间和时长/结束时间（如"8点开始喝奶喝了20分钟"），必须设action="complete"，不能设"start"
- diaper: {"subType": "pee|poop|mixed", "peeCount": 0|1|2|3, "status": "watery|mushy|soft|formed|pellet|", "color": "golden|yellowgreen|green|dark|", "amount": "少量|适量|较多|"}
  - subType映射: 小便/尿→"pee", 大便/拉/粑粑→"poop", 大小便/混合→"mixed"
  - peeCount表示同一片尿片内小便次数；"尿了两次/小便2次" → peeCount=2；"小便三次以上" → peeCount=3；未说明但有小便时默认1；纯大便时为0
  - color映射: 金黄/金黄色→"golden", 黄绿/黄绿色→"yellowgreen", 绿/绿色→"green", 深褐/褐色/深色→"dark"
  - status映射: 水样/稀→"watery", 糊状/糊糊→"mushy", 软便/软的→"soft", 条状/成形→"formed", 颗粒/硬/干→"pellet"
  - amount: 用户说"多/较多/很多"→"较多", "少/一点点"→"少量", "适量/正常"→"适量"
  - 示例: "拉了大便黄绿色糊状的量较多" → subType="poop", peeCount=0, color="yellowgreen", status="mushy", amount="较多"
  - 示例: "尿片里小便两次" → subType="pee", peeCount=2
  - 示例: "大小便都有，小便两次，大便黄绿色糊状" → subType="mixed", peeCount=2, color="yellowgreen", status="mushy"
- sleep: {"sleepType": "nap|night", "action": "start|end|complete"}
  - "宝宝睡着了/开始睡觉" → action="start"
  - "宝宝醒了/睡醒了" → action="end"
  - 同时提到了入睡和醒来时间（如"30分钟前睡的，2分钟前醒了"）→ action="complete"，同时设置startTime和endTime
- supplement: {"food": "食物名", "amount": "量描述", "reaction": "like|dislike|allergy|"}
- bath: {"waterTemp": 数字(水温°C)或null, "duration": 数字(分钟)或null}
  - "刚给宝宝洗澡了/洗澡了" → type="bath", startTime=当前客户端本地日期时间
  - "晚上8点洗澡" → type="bath", startTime=当天20:00的完整日期时间
  - "洗澡洗了10分钟" → type="bath", duration=10
  - "洗澡水温38度" → type="bath", data.waterTemp=38
- health_temp: {"value": 数字, "method": "forehead|ear|armpit|"}
- health_med: {"name": "药名", "dosage": 数字, "unit": "ml|包|片|滴|粒"}
- growth: {"weight": 数字(kg), "height": 数字(cm), "headCirc": 数字(cm)}
  - 注意单位换算：用户说"5300g"要转为5.3kg，"53cm"保持不变
  - "体重5.3kg" → weight=5.3
  - "身高65厘米" → height=65
  - "头围42cm" → headCirc=42
  - 可以同时包含多项，如"体重5.3kg身高65cm"
  - "26号体重5公斤" → startTime=26号的完整日期时间, data={weight: 5}
  - "昨天体重5.2kg身高65cm" → startTime=昨天的完整日期时间, data={weight: 5.2, height: 65}

时间规则：
- "刚刚/刚才" → 当前客户端本地日期时间
- "X分钟前" → 当前客户端本地时间减去X分钟后的完整日期时间
- "X小时前" → 当前客户端本地时间减去X小时后的完整日期时间
- "X分钟后" → 当前客户端本地时间加上X分钟后的完整日期时间
- "X小时后" → 当前客户端本地时间加上X小时后的完整日期时间
- "下午两点" → 当天14:00的完整日期时间
- "上午9点半" → 当天09:30的完整日期时间
- "今天早上X点" → 今天对应时间的完整日期时间
- "今天下午X点" → 今天对应时间的完整日期时间
- "昨天"（不带具体时间） → 昨天当前时刻的完整日期时间
- "昨天晚上8点" → 昨天20:00的完整日期时间
- "昨天下午3点" → 昨天15:00的完整日期时间
- "前天" → 前天当前时刻的完整日期时间
- "前天上午10点" → 前天10:00的完整日期时间
- "上个月28号早上7点" → 上一个自然月28号07:00的完整日期时间
- "25号早上7点" → 按当前客户端本地月份或最近已过去的25号，输出完整日期时间
- "3号下午2点" → 按当前客户端本地月份或最近已过去的3号，输出完整日期时间
- "26号"（不带具体时间）→ 26号当前时刻的完整日期时间
- 没提到时间 → 当前客户端本地日期时间
- 重要：如果action是"end"（如"5分钟前喂完了"），时间应放到endTime字段，startTime设为null
- 重要：如果action是"start"且时间是未来（如"2分钟后开始喂奶"），保持action="start"，不要改成complete
- 重要：当用户描述跨时间段事件（如"昨晚X点睡到今天早上Y点"），必须同时设置startTime和endTime，分别解析各自的时间表达
- 重要：多条记录里的每条记录都要继承用户说的日期、类型和共同字段。
- 重要：如果多个时间点共享同一个动作（如“5月28号12:10和14:39都换了尿片”），返回 records 数组两条 diaper，startTime 分别为完整日期时间 "YYYY-05-28 12:10" 和 "YYYY-05-28 14:39"，endTime 为 null。
- 重要：如果多个时间段共享同一个动作（如“5月28号12:10到12:30和14:39到15:10都喝了100ml奶”），返回 records 数组两条 feeding，amount 都为 100，startTime/endTime 都使用完整日期时间。
- 重要：如果用户省略第二条的日期，沿用第一条或整句话中的日期；如果省略第二条的事件类型/奶量/尿布类型/药品/体温等字段，沿用整句话中共同描述的字段。
- 重要：用户口误或 ASR 误识别成 “120:30” 这类三位小时且末尾是 0 时，应结合上下文修正为 “12:30”，不要当成无效时间。

跨天睡眠示例：
- "昨天晚上23点睡到今天早上1点半" → startTime=昨天23:00的完整日期时间, endTime=今天01:30的完整日期时间, action="complete"
- "昨晚11点睡到早上6点" → startTime=昨天23:00的完整日期时间, endTime=今天06:00的完整日期时间, action="complete"
- "10点睡的，1点半醒了" → startTime=根据上下文推断后的完整日期时间, endTime=根据上下文推断后的完整日期时间, action="complete"

时长规则：
- "喝了30分钟" → duration设为30
- "喝了半小时" → duration设为30
- "喝了1小时" → duration设为60
- 如果用户同时说了开始时间和时长（如"两点喝的，喝了30分钟"），则startTime=当天14:00的完整日期时间, duration=30, endTime=当天14:30的完整日期时间
- 重要：如果事件是过去时态（"刚刚喂了/刚喝完/喝了20分钟"），说明事件刚结束，endTime 应为当前客户端本地日期时间，startTime 应为当前客户端本地时间减去时长后的完整日期时间
- 示例："刚刚喂了奶喝了20分钟" → startTime=当前客户端本地时间减20分钟后的完整日期时间, endTime=当前客户端本地日期时间, duration=20, action="complete"
- 示例："刚喝完奶喝了半小时" → startTime=当前客户端本地时间减30分钟后的完整日期时间, endTime=当前客户端本地日期时间, duration=30, action="complete"
- 如果能从时长推算出endTime，就填endTime
- 没提到时长 → duration设为null, endTime设为null

只返回JSON，不要解释。`

function buildUserPrompt(text, context = {}) {
  const localNow = context.localNow || context.now || ''
  const timezoneOffsetMinutes = context.timezoneOffsetMinutes
  const timezoneText = timezoneOffsetMinutes !== undefined && timezoneOffsetMinutes !== null
    ? `UTC${timezoneOffsetMinutes <= 0 ? '+' : '-'}${String(Math.floor(Math.abs(timezoneOffsetMinutes) / 60)).padStart(2, '0')}:${String(Math.abs(timezoneOffsetMinutes) % 60).padStart(2, '0')}`
    : ''

  return [
    localNow ? `当前客户端本地时间：${localNow}` : '',
    timezoneText ? `客户端时区：${timezoneText}` : '',
    `用户输入：${text}`
  ].filter(Boolean).join('\n')
}

function callDeepSeek(text, context = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(text, context) }
      ],
      temperature: 0,
      stream: false
    })

    const options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content)
          } else {
            reject(new Error('API响应异常: ' + data))
          }
        } catch (e) {
          reject(e)
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    req.write(postData)
    req.end()
  })
}

exports.main = async (event) => {
  const { text, now, localNow, timezoneOffsetMinutes } = event

  if (!text || text.trim() === '') {
    return { success: false, error: '输入为空' }
  }

  try {
    const response = await callDeepSeek(text, { now, localNow, timezoneOffsetMinutes })
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return { success: true, data: parsed }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
