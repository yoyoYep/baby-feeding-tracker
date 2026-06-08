# 宝宝喂养记录小程序 - 开发交接文档

## 项目概况

- **项目位置**：`C:\Users\hzgujie\baby-feeding-tracker\`
- **Git 状态**：当前目录已是 Git 仓库，分支 `main` 跟踪 `origin/main`
- **远端仓库**：`https://github.com/yoyoYep/baby-feeding-tracker`
- **当前版本**：v0.9-dev
- **最新提交**：
  - `83fb8b0 feat: improve record timeline and voice entry`
  - `5523309 feat: add AI care assistant and logical day`
  - `a232751 docs: update handover and requirements`
  - `8ed50cb feat: add in-app reminders with snooze`
  - `4609af3 feat: add QQ Music mini program jump`
  - `ec49daf Improve feeding plan and record overlap handling`
- **当前状态**：核心功能完成 + 每日待办 P0 + 独立记录时间轴 + 首页记录筛选 + 喂奶计划 P0 + 程序内提醒（默认关闭，可配置） + QQ 音乐跳转 + 配置/待办云端化 + 生长精确百分位 + 密钥外部化 + 跨天统计/查询兜底修复 + **凌晨4点逻辑日边界** + **AI 智能照护助手** + **语音多记录解析/直接编辑记录** + **AI 建议语音播报能力保留（按钮隐藏，腾讯云 TTS 待确认）**

> 真实配置和密钥文件必须继续保持 gitignored；不要提交 `secret.js`、`config.js`、微信开发者工具真实配置。

---

## 2026-06-01 最新交接重点

### 本轮新增/调整概览

#### 1. 语音录入支持多条同类型记录

**目标**：一句话可录入多条相同类型事件，例如：
- `5月28号12:10到12:30和14:39到15:10都喝了100ml奶`
- `5月28号12:10和14:39都换了尿片`

**实现原则**：
- 优先走 `parseRecord` 云函数 + DeepSeek 解析，不把多记录能力限制在本地正则。
- DeepSeek 必须返回完整客户端本地日期时间，格式为 `YYYY-MM-DD HH:mm`。
- `5月28号`、`上个月28号`、`28号` 等日期都要求由 DeepSeek 按客户端本地时间解析成完整日期；客户端只做兼容兜底，不再主动把日期“改错”。
- 多条独立事件返回 `records[]`，可覆盖 feeding、diaper、sleep、bath、health_temp、health_med、supplement、growth。

**核心文件**：
- `cloudfunctions/parseRecord/index.js`
  - prompt 增加当前客户端本地时间、时区、完整日期输出要求。
  - 增加多时间点/多时间段共享动作的 `records[]` 规范。
  - 明确 `5月28号`、`上个月28号`、`120:30` ASR 误识别等解析要求。
- `miniprogram/utils/voice-parser.js`
  - 调云函数时传 `now`、`localNow`、`timezoneOffsetMinutes`。
  - 支持 DeepSeek 返回 `records[]`。
  - `resolveTime()` 增强完整日期、中文日期和旧格式兼容。
  - 本地多喂奶解析仅作为云函数不可用时的兜底。
- `tests/voice-parser-multi.test.js`
  - 覆盖多条喂奶、多条尿片、完整日期、客户端本地时间传参。

**部署注意**：需要重新部署 `cloudfunctions/parseRecord`，否则线上仍会使用旧 prompt。

#### 2. 语音识别结果改为直接编辑记录

**目标**：识别结果点“编辑”后直接编辑结构化记录，不再编辑原文。

**实现**：
- `miniprogram/components/voice-input/voice-input.js|wxml|wxss`
  - 新增“编辑记录”弹层。
  - 单条和多条记录都可编辑。
  - 可改日期、开始时间、结束时间、喂奶奶量、尿片类型、体温、用药、辅食、洗澡、生长记录字段。
  - 保存后回到识别结果确认页，再点“确认”才入库。
  - 弹层遮罩增加 `catchtouchmove="noop"`，避免拖动编辑层时带动首页滚动。

**注意**：
- 语音组件仍保留手动文字输入入口；只是确认弹窗里的“编辑”不再编辑原文。
- 单条记录编辑不再触发父页面 `edit` 跳转；直接在语音组件内编辑字段。

#### 3. 睡眠/喂奶时间线与重叠校验

**时间线布局目标**：
- 记录时间轴的连续事件左侧固定为睡眠，右侧固定为喂奶。
- 睡眠和喂奶固定作为连续事件展示，即使没有持续时间也放在连续区。
- 洗澡如果有 duration 仍按时段展示。

**重叠校验目标**：
- 新增或更新喂奶/睡眠时，同类型时间段重叠要提示“输入存在问题”。
- 喂奶和睡眠互相重叠不拦截。
- 无持续时间的喂奶/睡眠如果落入已有同类型时段，也视为冲突。

**核心文件**：
- `miniprogram/utils/timeline-layout.js`
- `miniprogram/utils/record-overlap.js`
- `miniprogram/utils/db.js`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/record/record.js`
- `tests/timeline-layout.test.js`
- `tests/record-overlap.test.js`

#### 4. 统计页增加最近 7 日喂奶耗时

**实现**：
- `miniprogram/pages/stats/stats.js|wxml|wxss`
  - 最近 7 日趋势新增“平均喂奶耗时 (min)”柱状图。
  - 只统计有有效 `startTime/endTime` 的 completed feeding。

#### 5. 首页记录入口和记录筛选

**实现**：
- 首页日期旁边新增记录时间轴图标按钮，点击进入 `/pages/timeline/timeline`。
- 首页记录列表新增事件筛选：
  - 全部
  - 喂奶
  - 睡眠
  - 尿布
  - 辅食
  - 洗澡
  - 健康
  - 生长
- 筛选仅影响首页记录列表，不影响统计卡、喂奶计划和独立记录时间轴。
- 筛选后记录数显示为 `当前筛选数量/全部数量`。

**核心文件**：
- `miniprogram/pages/index/index.js|wxml|wxss`

#### 6. AI 助手进行中状态校准

**问题**：顶部本地事实显示“正在睡觉 59分钟”，AI 卡片可能仍显示缓存或模型生成的“约18分钟”，两者矛盾。

**修复**：
- 本地显示层校准进行中状态：
  - 正在睡觉：本地负责“已睡多久”
  - DeepSeek 仍可负责“预计什么时候醒”
  - 示例：`正在睡觉，已睡59分钟，预计18分钟后醒`
- 云函数 `babyAssistant` prompt 和兜底也要求使用 `context.ongoing.elapsedMin` 作为已进行时长唯一可信来源。

**核心文件**：
- `miniprogram/utils/assistant-display.js`
- `miniprogram/pages/index/index.js`
- `cloudfunctions/babyAssistant/index.js`
- `tests/assistant-display.test.js`

**部署注意**：需要重新部署 `cloudfunctions/babyAssistant`，否则云端 prompt/兜底不生效；但首页本地显示层已能先消除明显矛盾。

### 本轮提交和验证

**已 push 提交**：
- `83fb8b0 feat: improve record timeline and voice entry`

**已通过检查**：
- `node --check miniprogram\pages\index\index.js`
- `node --check miniprogram\utils\voice-parser.js`
- `node --check cloudfunctions\parseRecord\index.js`
- `node --check cloudfunctions\babyAssistant\index.js`
- `node tests\assistant-display.test.js`
- `node tests\timeline-layout.test.js`
- `node tests\record-overlap.test.js`
- `node tests\voice-parser-multi.test.js`
- `node tests\voice-action-routing.test.js`

**本轮后必须记得部署的云函数**：
1. `parseRecord`
2. `babyAssistant`

---

## 2026-05-31 最新交接重点

### 本轮新增/调整概览

#### 1. 凌晨4点逻辑日边界

**背景**：用户约定 0 点到 6 点一般不喝奶，但最后一顿奶可能在凌晨 12 点才喝。以日历日 00:00 为边界会把这顿奶算入第二天。

**实现原则**：
- 将业务上的“一天”改为从凌晨 4 点开始。
- 凌晨 4 点前的活动仍属于前一个逻辑日。
- 记录的 `startTime/endTime` 仍为真实时间戳，无数据迁移。
- 勿扰时段仍是绝对时钟，例如 `00:00-06:00`，不需要用户改配置。

**核心文件**：
- `miniprogram/utils/feeding-plan.js`
  - 新增/保留 `feedingDayStartHour: 4`
  - 新增 `getLogicalDayStart(date, dayStartHour)`
  - 新增 `getLogicalDateStr(date, dayStartHour)`
  - 新增 `isSameLogicalDay(a, b, dayStartHour)`
  - 喂奶计划、勿扰判断、活动窗口改为支持逻辑日起点偏移
- `miniprogram/utils/db.js`
  - `getTodayRange()` 使用逻辑日边界
- `miniprogram/pages/index/index.js`
  - 首页日期、当日记录、统计、AI 上下文使用逻辑日
- `miniprogram/pages/stats/stats.js`
  - 日统计和 7 日趋势使用逻辑日
- `miniprogram/pages/timeline/timeline.js`
- `miniprogram/utils/timeline-layout.js`
  - 时间轴分段、小时刻度、日期标签使用逻辑日
- `miniprogram/pages/todo/todo.js`
  - 待办页日期判断和完成记录归属使用逻辑日
- `miniprogram/pages/health/health.js`
  - 今日用药查询和时间格式化使用逻辑日
- `miniprogram/utils/local-reminders.js`
  - 本地提醒日期 key 和查询范围使用逻辑日
- `miniprogram/utils/voice-parser.js`
  - 语音确认文案中的“今天”判断使用逻辑日

**注意**：
- `startOfDay` 和 `sameDay` 在 `feeding-plan.js` 中保留为历史兼容函数。
- 新代码应优先使用 `getLogicalDayStart` / `getLogicalDateStr` / `isSameLogicalDay`。
- `feeding-plan.test.js` 目前仍有大量旧断言失败，看起来主要是测试尚未适配 4 点逻辑日边界和新计划行为。

#### 2. AI 智能照护助手

**目标**：首页打开后，在喂奶计划卡片底部展示 AI 对宝宝当前状态的判断和行动建议。AI 不只看喂奶，也要结合睡眠、待办、用药/洗澡约束、最近规律。

**云函数**：
- `cloudfunctions/babyAssistant/index.js`
  - 调 DeepSeek `deepseek-chat`
  - `temperature: 0.3`
  - `max_tokens: 300`
  - 返回结构：
    - `status`
    - `suggestions`
    - `reason`
    - `priority`
    - `checks`
- `cloudfunctions/babyAssistant/package.json`
- `cloudfunctions/babyAssistant/secret.example.js`
- `cloudfunctions/babyAssistant/secret.js`
  - 已有真实密钥文件应保持 gitignored
  - 可复用 `parseRecord` 的 DeepSeek API Key

**客户端入口**：
- `miniprogram/pages/index/index.js`
  - data:
    - `aiAssistant`
    - `aiAssistantLoading`
    - `aiAssistantFactText`
    - `aiAssistantReasonText`
    - `aiVoiceEnabled`（默认 false，隐藏语音按钮）
    - `aiVoiceLoading`
    - `aiVoicePlaying`
  - `_loadAiAssistant()`
    - 首页刷新后自动加载
    - 使用 10 分钟缓存
    - 缓存 key: `ai_assistant_cache`
    - 缓存带 `signature`，记录/计划/待办/事实变化后会刷新
  - `_buildAssistantContext()`
    - 打包喂奶、睡眠、尿布、进行中记录、喂奶计划、待办、近期规律、事实层
  - `_loadAssistantTodoContext()`
    - 查询当天待办，标注 `done/due/upcoming/snoozed`
  - `_calcRecentPattern()`
    - 查询最近 3 个完整逻辑日
    - 计算：
      - `avgSleepDurationMin`
      - `avgDailySleepMin`
      - `avgFeedingIntervalMin`
      - `avgNapCount`
      - `avgDailyAmountMl`
      - `samePeriodSleepPattern`
  - `_buildCareFacts()`
    - 事实层，给 AI 判断用，不写死阈值
    - 包含：
      - 当前本地时间
      - 距上次睡醒多久
      - 今日总睡眠
      - 今日小睡次数
      - 最近日均睡眠
      - 睡眠欠账
      - 同一时段睡眠规律
      - 距上次喂奶开始/结束多久
      - 距下次计划喂奶多久
  - `_updateAssistantFactText()`
    - 统计卡片“平均间隔/距上次喂奶”下方固定显示本地事实
    - 例如：`距上次喂奶结束 36分钟，醒了 1小时57分钟`
  - `_getAiAssistantReasonText()`
    - 如果 AI `reason` 与本地事实语义重复（如 `1小时0分钟` vs `60分钟`，`正在睡觉` vs `宝宝刚睡`），自动隐藏原因行
- `miniprogram/pages/index/index.wxml`
  - 喂奶计划卡片底部追加 AI 展示区域
  - AI 区域有刷新按钮 `↻`
  - 语音按钮逻辑保留但通过 `aiVoiceEnabled=false` 隐藏
- `miniprogram/pages/index/index.wxss`
  - AI 区域样式、统计卡事实小字、语音按钮样式

**AI 判断策略已讨论并落地**：
- 不再在本地写死“清醒窗口 = 2 小时”作为硬判断。
- 本地只提供事实和近期规律：
  - 宝宝月龄
  - 今日睡眠总量
  - 最近日均睡眠
  - 当前已醒多久
  - 同一时段通常几点睡
  - 同一时段睡前通常清醒多久
  - 距下次奶多久
  - 距上次奶开始/结束多久
- DeepSeek 必须先输出结构化 `checks`：
  ```json
  {
    "checks": {
      "feeding": { "needed": false, "reason": "..." },
      "sleep": { "needed": false, "reason": "..." }
    }
  }
  ```
- 云函数兜底：
  - 如果 `checks.feeding.needed=true` 或 `checks.sleep.needed=true`，`priority` 必须变为 `feeding` 或 `sleep`
  - 不能先给玩耍/普通待办建议
  - 如果距下次喂奶还有较久，而 AI 判断困了，应先睡

#### 3. AI 与待办联动

**目标**：AI 助手不只看喂奶/睡眠，也要结合当天待办，尤其是用药、体温、疫苗等。

**实现**：
- `miniprogram/pages/index/index.js`
  - `_loadAssistantTodoContext()` 将当天待办打入 AI 上下文：
    - `summary.total`
    - `summary.done`
    - `summary.pending`
    - `summary.due`
    - `summary.upcoming`
    - `dueNow`
    - `upcoming`
  - 已取消当天的待办会从 AI 上下文中排除
- `miniprogram/utils/local-reminders.js`
  - 待办到点提醒和喂奶到点提醒现在可以合并成一个“照护到点提醒”
  - 合并顺序中喂奶提醒在待办前面
  - `updateReminderEntries` 已改为保留已有日期状态，不再只写当前日期

**关键规则**：
- 如果喂奶/睡眠和待办同时需要处理，喂奶/睡眠优先。
- AI 不应擅自建议加药、停药、改剂量，只能提醒按已设置待办完成。
- 没有 `health_med` 待办时，AI 不得建议吃药/喂药/用药；没有洗澡/洗浴待办时，不得建议洗澡。

#### 4. 喂奶/睡眠/用药/洗澡约束

**已确认规则**：
- 喂奶后 30 分钟内：
  - AI 不建议：剧烈运动、趴玩、跳跳椅、大幅摇晃、游泳、洗澡、翻滚训练。
  - AI 可建议：竖抱/斜抱、拍嗝、安静互动、观察吐奶。
- 吃药/喂药/喝药/用药、洗澡要避开吃奶前后 30 分钟。
  - 如果 `lastFeedingMinAgo < 30`
  - 或 `plan.nextPlannedMinutesFromNow <= 30`
  - AI 不应建议立刻吃药或洗澡。
- 喂奶计划间隔仍按上次喂奶**开始时间**计算。
  - 用户明确纠正过：不要把喂奶计划改为按结束时间排。
  - 首页顶部“距上次喂奶”也保持按喂奶开始时间。
  - AI 卡片小字才显示“距上次喂奶结束多久”，用于避免“刚喝完还说饿了”的误判。

**云函数兜底**：
- `cloudfunctions/babyAssistant/index.js`
  - `applyPostFeedingGuard()`
    - 喂奶后 30 分钟内过滤剧烈活动、趴玩、洗澡等建议
    - 如果 AI 说“饿”，会改为“刚喝完奶，先安静观察”
  - `applyNextFeedingGuard()`
    - 修正 AI 自己算错的“距下次喂奶还有 X 小时”
    - AI 必须使用客户端传的 `plan.nextPlannedMinutesFromNow`
  - `applyFeedingCareSpacingGuard()`
    - 吃药/洗澡避开吃奶前后 30 分钟
  - `applyTodoScopeGuard()`
    - 过滤没有对应待办时 AI 生成的吃药/洗澡建议
  - `applyPriorityGuard()`
    - 根据 `checks` 修正 `priority`
    - 如果睡觉优先且喂奶还不近，会过滤“先喂奶”类建议

#### 5. AI 建议语音播报（当前保留，按钮隐藏）

**背景**：用户希望老人看不清字时可以听 AI 提醒。

**当前实现**：已接入腾讯云 TTS，但用户后来表示当前先不展示语音播放入口。目前先**不撤销**，保留实现和云函数，首页按钮通过 `aiVoiceEnabled=false` 隐藏，后续再决定是否继续使用腾讯云 TTS 或改成本地固定音频。

**新增文件**：
- `cloudfunctions/textToSpeech/index.js`
  - 腾讯云 TTS `TextToVoice`
  - 复用腾讯云 TC3 签名逻辑
  - 返回 MP3 base64
- `cloudfunctions/textToSpeech/package.json`
- `cloudfunctions/textToSpeech/secret.example.js`
- `cloudfunctions/textToSpeech/secret.js`
  - 已从 `cloudfunctions/speechToText/secret.js` 复制
  - 已被 `.gitignore` 忽略

**`.gitignore` 新增**：
- `cloudfunctions/textToSpeech/secret.js`

**首页播放逻辑**：
- `miniprogram/pages/index/index.js`
  - `_buildAiAssistantSpeechText()`
    - 将 AI `status`、前两条建议、事实小字、reason 拼成短文本
    - 限制约 140 字
  - `playAiAssistantVoice()`
    - 调云函数 `textToSpeech`
    - 返回 base64 MP3 后写入 `wx.env.USER_DATA_PATH`
    - 使用 `wx.createInnerAudioContext()` 播放
    - 同一句文本按 hash 缓存本地 MP3，重复播放不重复合成
  - `ServerNotOpen` 错误会弹窗提示“需开通语音合成”
- `miniprogram/pages/index/index.wxml`
  - AI 区域右侧语音按钮逻辑保留，但当前隐藏
  - 播放中显示 `■`
- `miniprogram/pages/index/index.wxss`
  - 新增 AI 语音按钮样式

**腾讯云 TTS 当前情况**：
- 用户测试时报错：
  - `UnsupportedOperation.ServerNotOpen: TTS service is not open`
  - 含义：腾讯云账号未开通语音合成 TTS 服务
- 官方文档：
  - 开通入口：腾讯云语音合成控制台
  - 需要完成实名认证/人脸认证、同意协议、立即开通
  - 文档：`https://cloud.tencent.com/document/product/1073/56640`
- 计费（官方 2026-04 文档）：
  - 通用语音合成支持免费额度
  - 基础/精品音色免费额度：800 万字符，领取后 3 个月有效
  - 大模型音色免费额度：10 万字符
  - 超自然大模型音色免费额度：2 万字符
  - 精品音色后付费约 0.3 元 / 万字符
  - 免费额度用完后，如果不开后付费通常会停服；开通后付费才继续按量扣费
  - 文档：`https://cloud.tencent.com/document/product/1073/34112`
- 粗略家庭自用费用估算：
  - 每次播报约 100 字
  - 每天 20 次：约 1.8 元/月
  - 每天 50 次：约 4.5 元/月
  - 每天 100 次：约 9 元/月
  - 每天 200 次：约 18 元/月

**后续可选方案**：
1. 继续用腾讯云 TTS
   - 优点：能读完整 AI 建议
   - 缺点：需开通服务，有付费可能
2. 改成本地固定音频
   - 例如本地 mp3：
     - “宝宝可能困了”
     - “该喂奶了”
     - “有待办事项”
     - “请查看小程序提示”
   - 优点：不需要云 TTS，不按字符付费
   - 缺点：不能读完整 AI 文案
3. 当前暂不撤销 TTS，实现保留

#### 6. 待办取消今天 + 撤销按钮视觉

**目标**：未完成待办需要能只取消当天这一次，不删除规则；已完成/已取消项主按钮要在真机和开发者工具显示一致。

**实现**：
- `miniprogram/pages/todo/todo.js`
  - 新增 `cancelledDates` 判断和 `_setTodoCancelled()`
  - 三点菜单：
    - 未完成：`编辑 / 取消今天 / 删除`
    - 已取消：`编辑 / 恢复今天 / 删除`
    - 已完成：`编辑 / 撤销完成 / 删除`
  - 取消今天只写待办规则的 `cancelledDates[dateStr]`，不生成记录，不删除规则
- `miniprogram/utils/local-reminders.js`
  - 导出 `isTodoCancelled()`
  - 到点提醒跳过当天已取消待办
- `miniprogram/pages/index/index.js`
  - AI 待办上下文跳过当天已取消待办
- `miniprogram/pages/todo/todo.wxml|wxss`
  - 主列表不显示单独取消按钮
  - 已完成/已取消的圆形按钮使用 SVG `undo` 图标，避免 Unicode `↶` 在真机和开发者工具字体渲染不一致

#### 7. 程序内到点提醒配置化

**目标**：用户要本地试用前台弹窗提醒，默认不要打扰。

**实现**：
- `miniprogram/utils/feeding-plan.js`
  - `DEFAULT_FEEDING_PLAN_CONFIG.localReminderEnabled = false`
  - `normalizeFeedingPlanConfig()` 归一化该字段
- `miniprogram/pages/mine/mine.js|wxml|wxss`
  - 新增「提醒设置 → 程序内到点提醒」switch
  - 开启后立即启动一次前台检查
- `miniprogram/utils/local-reminders.js`
  - `checkForegroundReminders()` 读取 `localReminderEnabled`
  - 未开启时直接跳过待办/喂奶弹窗提醒
  - 新增安全 `getAppSafe()`，避免 app 初始化早期 `globalData` undefined

**注意**：
- 这个开关只控制程序内待办/喂奶到点弹窗提醒。
- AI 智能照护助手不受该开关影响，仍在首页展示。

---

## 已实现功能清单

| 模块 | 功能 | 状态 |
|------|------|------|
| 首页 | 今日统计、平均喂奶间隔、距上次喂奶、日期导航、时间线 | 已完成 |
| 首页 | 进行中喂奶/睡眠卡片，支持取消和跳转结束 | 已完成 |
| 首页 | 开始喂奶/开始睡觉快捷按钮 | 已完成 |
| 首页 | 喂奶计划 P0：每日顿数、每顿奶量、夜间勿扰、最短间隔、紧张预警 | 已完成 |
| 首页 | 喂奶计划到点程序内提醒、稍后提醒、倒计时展示 | 已完成 |
| 首页 | AI 智能照护助手：DeepSeek 推断宝宝状态 + 行动建议 | 已完成 |
| 首页 | AI 本地事实小字：统计卡底部展示喂奶结束/睡眠状态，AI reason 自动去重 | 已完成 |
| 首页 | AI 建议语音播报：腾讯云 TTS 方案已接入，按钮隐藏，服务需开通 | 已接入待确认 |
| 待办 | 健康类每日待办，支持每日/连续多天/每 N 天/指定日期 | 已完成 |
| 待办 | 完成待办生成正式 `records`，支持撤销完成 | 已完成 |
| 待办 | 未完成待办支持“取消今天”，提醒和 AI 上下文跳过，可恢复 | 已完成 |
| 待办 | 到点程序内提醒、过期补弹、稍后提醒、倒计时展示 | 已完成 |
| 记录 | 独立记录时间轴页，多日连续展示，跨天裁剪 | 已完成 |
| 健康 | 体温、用药、疫苗、自定义健康记录 | 已完成 |
| 生长 | WHO LMS 精确百分位、生长曲线、编辑/删除 | 已完成 |
| 语音 | 腾讯云 ASR + DeepSeek 解析 + 本地正则兜底 | 已完成 |
| 语音 | 开始/结束动作路由、延迟喂奶、时间表达解析 | 已完成 |
| 统计 | 当日统计、最近 7 天趋势、跨天睡眠裁剪 | 已完成 |
| 更多 | 记录时间轴、数据统计、生长曲线、QQ 音乐跳转 | 已完成 |
| 数据层 | 云开发 + 本地存储降级 + 查询兜底 | 已完成 |
| 安全 | 密钥外部化，真实配置 gitignored | 已完成 |
| 全局 | 凌晨4点逻辑日边界 | 已完成 |
| 设置 | 程序内到点提醒开关，默认关闭 | 已完成 |

---

## 关键文件

### 本轮新增/修改

- `.gitignore`
  - 新增/确认 `cloudfunctions/babyAssistant/secret.js`
  - 新增/确认 `cloudfunctions/textToSpeech/secret.js`
- `cloudfunctions/babyAssistant/`
  - DeepSeek AI 照护助手云函数
  - 当前 prompt 要求输出 `checks.feeding` / `checks.sleep`
  - 包含喂奶后 30 分钟、吃药/洗澡避开吃奶前后 30 分钟、距离下次喂奶分钟纠偏
- `cloudfunctions/textToSpeech/`
  - 新增腾讯云 TTS 云函数
  - 当前保留，是否继续使用待用户确认
- `miniprogram/pages/index/index.js|wxml|wxss`
  - 逻辑日
  - AI 助手
  - 统计卡底部 AI 本地事实小字
  - 待办上下文
  - 近期规律
  - AI reason 去重
  - AI 语音播放逻辑保留，按钮隐藏
- `miniprogram/pages/mine/mine.js|wxml|wxss`
  - 程序内到点提醒配置开关 `localReminderEnabled`
- `miniprogram/utils/local-reminders.js`
  - 待办/喂奶提醒合并
  - 逻辑日提醒
  - 程序内到点提醒默认关闭，读取 `localReminderEnabled`
  - 安全 `getAppSafe()` 防止启动早期 `globalData` undefined
  - 已取消当天待办不提醒
  - 保护多日期提醒状态
  - 导出 `buildLogicalDateTime`、`formatTodoReminderText`、`isTodoCancelled`
- `miniprogram/pages/todo/todo.js`
  - 待办时间按逻辑日构造，凌晨 4 点前的待办归属正确
  - 支持 `cancelledDates` 取消今天/恢复今天
- `miniprogram/pages/todo/todo.wxml|wxss`
  - 撤销按钮使用 SVG undo 图标，避免真机字体差异
- `miniprogram/utils/feeding-plan.js`
  - 逻辑日工具函数
  - 喂奶计划保持按喂奶开始时间排下一顿

### 核心模块

- `miniprogram/utils/db.js`：数据库抽象、records/todos/config、本地降级、查询兜底
- `miniprogram/utils/feeding-plan.js`：喂奶计划本地规则 + 逻辑日工具函数
- `miniprogram/utils/todo-schedule.js`：待办日期匹配
- `miniprogram/utils/timeline-layout.js`：记录时间轴布局
- `miniprogram/utils/growth-standard.js`：WHO LMS 生长标准
- `miniprogram/utils/voice-parser.js`：本地语音解析兜底
- `miniprogram/utils/local-reminders.js`：程序内提醒系统

---

## 技术备注

### AI 缓存

- 缓存 key：`ai_assistant_cache`
- 结构大致为：
  ```js
  { data, timestamp, signature }
  ```
- 有效期：10 分钟
- `signature` 覆盖：
  - 今日喂奶/睡眠/尿布摘要
  - 进行中记录
  - 距上次奶开始/结束时间 bucket
  - 距上次睡醒时间 bucket
  - 喂奶计划
  - `careFacts`
  - `pattern`
  - `todos`
- 手动刷新按钮 `↻` 会清缓存。

### AI 时间口径

- 喂奶计划间隔：按喂奶开始时间。
- 首页顶部“距上次喂奶”：按喂奶开始时间。
- AI 事实小字“距上次喂奶结束”：按喂奶结束时间。
- `lastFeedingMinAgo` 在 AI 上下文中表示“距离上次喂奶结束多久”。
- `lastFeedingStartMinAgo` 表示“距离上次喂奶开始多久”。
- `plan.nextPlannedMinutesFromNow` 由客户端本地计算，DeepSeek 不能自己用 ISO 时间和 `15:05` 相减。

### AI 睡眠判断

- 不写死固定清醒窗口。
- 本地提供：
  - `careFacts.awakeSinceLastSleepMin`
  - `careFacts.todaySleepTotalMin`
  - `careFacts.recentAvgDailySleepMin`
  - `careFacts.sleepDebtMin`
  - `careFacts.samePeriodSleepPattern`
  - `babyAgeMonths`
- DeepSeek 根据这些证据输出 `checks.sleep.needed` 和原因。
- 如果 `checks.sleep.needed=true` 且喂奶不近，优先级应为 `sleep`。

### 本地提醒

- 不使用云函数、不使用订阅消息、不需要额外数据库集合。
- 默认关闭，由「我的 → 提醒设置 → 程序内到点提醒」控制，配置字段为 `localReminderEnabled`。
- 提醒状态只存在本机缓存：
  - `status: 'done'`：当天不再提醒
  - `status: 'snoozed'`：推迟到 `until` 后再次提醒
- 当前推迟时长固定为 10 分钟，在 `SNOOZE_MS` 中配置。
- 待办和喂奶同时到点会合并弹窗。
- 当天已取消的待办不进入提醒，也不进入 AI 待办上下文。

### Git 注意

真实配置文件仍应保持不提交：
- `miniprogram/config.js`
- `cloudfunctions/speechToText/secret.js`
- `cloudfunctions/parseRecord/secret.js`
- `cloudfunctions/babyAssistant/secret.js`
- `cloudfunctions/textToSpeech/secret.js`
- `project.config.json`
- `project.private.config.json`

---

## 已知限制与待办

### 当前限制

- 程序内提醒只在小程序前台有效；后台或关闭小程序时不会提醒。
- 程序内提醒默认关闭，需要在设置页手动开启。
- 微信订阅消息暂未启用。
- 个人小程序账号无法使用微信同声传译插件。
- 生长标准当前使用 WHO；如需中国 WS/T 423-2022 需获取 LMS 参数。
- AI 助手依赖 DeepSeek API 在线服务，离线不可用。
- AI 语音播报按钮当前隐藏；若继续用腾讯云 TTS，需要开通语音合成服务并可能产生费用。
- `feeding-plan.test.js` 仍有旧断言失败，需要后续按逻辑日和新规则重写/修正。

### 待开发/待确认

- 是否继续使用腾讯云 TTS，还是改成本地固定音频提示。
- AI 语音播报配置页面：
  - 开关：是否启用 AI 语音播报
  - 语音方案：腾讯云 TTS / 本地固定音频
- tabBar 正式图标替换。
- 数据导出（PDF/图片）。
- 体温趋势折线图。
- 离线记录后联网同步机制。
- 喂奶计划后台提醒 / 微信订阅消息方案（已暂缓）。
- 早教类待办（用户已明确可先不做）。
- 生长标准可选切换（WHO / WS/T 423-2022）。

---

## 部署与回归建议

### 云开发部署

1. 部署 `cloudfunctions/speechToText`
2. 部署 `cloudfunctions/parseRecord`
3. 部署 `cloudfunctions/familyManage`
4. 部署 `cloudfunctions/babyAssistant`
5. 如继续使用语音播报，部署 `cloudfunctions/textToSpeech`
6. 创建/确认集合：
   - `records`
   - `family_members`
   - `baby`
   - `med_history`
   - `config`
   - `todos`
7. 每个集合权限按当前体验版策略配置为可读写。
8. 建议索引：
   - `records.startTime` 降序
   - `records.createdAt` 降序

### TTS 部署注意

- `cloudfunctions/textToSpeech/secret.js` 已从 `speechToText/secret.js` 复制。
- 如果提示 `UnsupportedOperation.ServerNotOpen`：
  - 说明腾讯云账号未开通 TTS。
  - 需要去腾讯云语音合成控制台开通服务并领取免费资源包。
  - 开通后重新部署 `textToSpeech` 云函数。
- 如果用户不想继续使用腾讯云 TTS：
  - 不要删除前先确认。
  - 可改成本地固定音频方案。

### 重点回归

**逻辑日边界**：
- 凌晨 3 点打开首页，应显示当前逻辑日“今天”。
- 凌晨 1 点喂完奶，该记录归属上一个 4 点开始的逻辑日。
- 喂奶计划从 6:00 开始排，跳过 00:00-06:00 勿扰。
- 统计页今日喂奶次数包含逻辑日内记录。
- 待办提醒在逻辑日内正确弹出。

**AI 助手**：
- 首页打开后喂奶计划卡片底部出现 AI 建议。
- 10 分钟内重复打开使用缓存。
- 点 `↻` 可以强制刷新。
- 统计卡底部“当前”事实小字始终显示：
  - 距上次喂奶结束多久或正在喂奶
  - 醒了多久或正在睡觉
- AI 卡片中的 `reason` 如果与事实小字重复，应自动隐藏。
- 距下次奶还有 45 分钟且 `checks.sleep.needed=true` 时，应优先提示睡觉，而不是先喂奶。
- 刚喝完奶 30 分钟内，不能建议趴玩/洗澡/剧烈活动。
- 吃药/洗澡在吃奶前后 30 分钟内，不应建议立即执行。
- 没有当天用药待办时，不应建议吃药/喂药/用药；没有洗澡待办时，不应建议洗澡。
- 如果 DeepSeek 返回“距下次喂奶还有 9 小时”这类时区错误，应被云函数替换成客户端计算的正确时长。

**AI 语音播报**：
- 当前首页语音按钮隐藏；如后续开启 `aiVoiceEnabled`，点 `🔊` 后应生成并播放语音。
- 播放中按钮显示 `■`。
- 再点应停止播放。
- 如果 TTS 未开通，应弹窗提示“需开通语音合成”。
- 同一句 AI 文案重复播放应走本地缓存，不重复合成。

**程序内提醒**：
- 默认关闭；先在「我的 → 提醒设置 → 程序内到点提醒」打开。
- 建一个今天已过点未完成用药待办，打开小程序应震动并弹窗。
- 点“稍后提醒”，待办页显示倒计时，10 分钟后再次提醒。
- 点“知道了”，当天不再弹该条。
- 首页喂奶计划过点后应震动弹窗，推迟后首页卡片显示倒计时。
- 待办和喂奶同时到点时，弹一个合并提醒，喂奶排在前面。
- 取消今天的待办不应弹提醒，AI 上下文也不应包含该待办。

**其他**：
- QQ 音乐入口：更多页点击后跳转 QQ 音乐小程序首页。
- 跨天睡眠：首页和统计页按逻辑日边界裁剪一致。
- 记录时间轴：跨天睡眠/喂奶时段/洗澡 duration/点状记录布局。
- 每日待办：todos 云迁移、完成、撤销完成、删除规则保留历史记录。
- 语音：开始喂奶、喂完了、宝宝睡了、宝宝醒了、X 分钟后开始喂奶。

### 最近验证

已跑过并通过：
- `node --check miniprogram\pages\index\index.js`
- `node --check cloudfunctions\babyAssistant\index.js`
- `node --check cloudfunctions\textToSpeech\index.js`
- `node --check miniprogram\utils\local-reminders.js`
- `node --check miniprogram\utils\feeding-plan.js`
- `node tests\todo-schedule.test.js`
- `node tests\timeline-layout.test.js`
- `node tests\growth-standard.test.js`
- `node tests\voice-action-routing.test.js`

已知未通过：
- `node tests\feeding-plan.test.js`
  - 目前 42 个用例中约 28 个失败。
  - 初步判断主要是旧测试未适配凌晨 4 点逻辑日边界、新喂奶计划行为和勿扰偏移。
  - 后续需要重写测试断言，而不是直接回滚业务代码。
