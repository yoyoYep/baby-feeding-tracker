# 宝宝喂养记录小程序 - 开发交接文档

## 项目概况

- **项目位置**：`C:\Users\hzgujie\baby-feeding-tracker\`
- **当前版本**：v0.8-dev
- **状态**：核心功能完成 + 每日待办 P0 完成 + 独立记录时间轴 + 首页交互优化 + 配置/待办云端化 + 生长精确百分位 + 密钥外部化 + 喂奶计划紧张预警 + 跨天睡眠统计修复 + 云查询三路兜底

---

## 2026-05-30 换 Agent 交接重点

### 当前工作状态
- 当前目录 `C:\Users\hzgujie\baby-feeding-tracker\` 不是 Git 仓库，不要使用 `git reset` / `git checkout --` 之类命令回滚文件。
- 今天主要完成了三个改动：喂奶计划时间紧张预警优化、跨天睡眠统计不一致修复、云数据库查询缺失兜底。
- 首页 `index.js` 的 `_updateFeedingPlan` 中有一行测试代码 `now: new Date('2026-05-30T21:00:00')` 用于测试喂奶计划紧张状态，用户可能已改回也可能未改回，**接手后请确认该行已恢复为 `now: new Date()`**。
- 云数据库 `records` 集合已添加 `startTime` 字段的降序索引，保留即可。

### 今天完成的改动

#### 1. 喂奶计划时间紧张提前预警（feeding-plan.js）
- **问题**：当剩余顿数在最短间隔约束下排不完时，系统只在最后时刻给出模糊警告”当前规则下可能排不完”。
- **修复**：
  - 新增 `calcRealisticMax(fromMinute, config)` 函数，计算从某时间点开始按最短间隔能排几顿。
  - `buildFeedingPlan` 返回新增 `realisticMax` 字段；当 `futureCount > realisticMax` 时提前触发 `status: 'tight'`。
  - 警告文案改为可执行建议：”还需 X 顿，23:30前最多能排 Y 顿（间隔Z），建议尽早在 HH:MM 前喂”。
  - 极端场景（下一顿推入勿扰后当天无法安排）：”还需 X 顿但今天已无法再安排，明天尽量提前开始”。
  - 未压缩最短间隔（用户明确说宝宝喝不下），只是更早告知和给出建议。
- **测试**：`feeding-plan.test.js` 从 23 个增加到 42 个用例，全部通过。

#### 2. 跨天睡眠统计不一致修复（stats.js + index.js）
- **问题**：统计页的7天睡眠柱状图把跨天睡眠的全部时长计入开始日（如前天21:00到昨天06:00，9小时全归前天），而首页按天裁剪（前天3小时、昨天6小时）。两边不一致。
- **根因**：统计页 `_calcWeekTrend` 按 `startTime` 归天后直接用 `endTime - startTime` 全量计算，没有按天边界裁剪。
- **修复**：
  - `stats.js` 的 `loadStats` 改用 `getRecordsOverlappingDateRange` 查询（能抓到跨天记录）。
  - `_calcSleepStats` 新增 `start`/`end` 参数，按天边界裁剪睡眠时长。
  - `_calcWeekTrend` 的睡眠部分改为遍历所有睡眠记录，按每天 overlap + clip 分配。
  - `_loadRecentDayRecords` 改用 `getRecordsOverlappingDateRange`。
  - 首页 `loadDayData` 新增查询前一天数据并合并，确保跨天记录被稳定捕获。

#### 3. 云数据库查询缺失兜底（db.js）
- **问题**：补录记录（如昨天凌晨4点）保存成功后，首页切到对应日期看不到记录。数据库里有记录但 `where({ startTime: _.gte(x).and(_.lt(y)) })` 查不到。
- **根因**：微信云数据库的 startTime 范围+排序复合查询对刚写入的记录不保证即时可见（即使有索引）。原有的 `orderBy('startTime', 'desc')` fallback 走相同索引路径也会漏。
- **修复**：`getRecordsOverlappingDateRange` 改为三路并行查询：
  1. 主查询：`where({ startTime: _.gte(x).and(_.lt(y)) }).orderBy('startTime', 'desc')`
  2. fallback：`orderBy('startTime', 'desc').limit(200)` — 按 startTime 取最新
  3. **新增**：`orderBy('createdAt', 'desc').limit(200)` — 按写入时间取最新
  - 三路结果 `mergeRecords` 去重后客户端 `filterRecordsByOverlap` 过滤。
  - `createdAt` 由 `db.serverDate()` 在写入时生成，写入即可见，不受 startTime 索引延迟影响。
  - 三路查询 `Promise.all` 并行发出，单路失败不影响其他路。
- **注意**：`records` 集合已建 `startTime` 降序索引，保留不删；建议也对 `createdAt` 加降序索引以加速第三路查询。

### 首页 loadDayData 诊断日志
- 当前首页 `loadDayData` 中有 `console.log('[loadDayData] ...')` 诊断日志，用于排查查询问题。如已确认稳定可删除。

### 最近验证
- `node --check miniprogram\utils\feeding-plan.js` 通过
- `node --check miniprogram\utils\db.js` 通过
- `node --check miniprogram\pages\index\index.js` 通过
- `node --check miniprogram\pages\stats\stats.js` 通过
- `node tests\feeding-plan.test.js` 通过，42/42
- `node tests\voice-action-routing.test.js` 通过，37/37
- `node tests\growth-standard.test.js` 通过，6/6
- `node tests\todo-schedule.test.js` 通过，9/9
- `node tests\timeline-layout.test.js` 通过，27/27

### 今天明确未做 / 待后续清理
- ⏳ 首页 `loadDayData` 的 console.log 诊断代码待稳定后删除
- ⏳ 云数据库 `records` 集合建议追加 `createdAt` 降序索引（当前无索引也能工作，加了更快）
- ⏳ 清理各处调试日志（首页 `[loadDayData]` console.log、以及其他可能残留的测试 log）
- ⏳ QQ音乐接入

---

## 已实现功能清单

| 模块 | 功能 | 状态 |
|------|------|------|
| 首页 | 今日统计卡片（喂奶次数/总奶量/换尿布次数/睡眠时长）+ 图标 | ✅ |
| 首页 | 平均喂奶间隔 | ✅ |
| 首页 | 距上次喂奶倒计时（可配阈值，绿色/红色） | ✅ |
| 首页 | 顶部宝宝信息（月龄/天数随日期筛选变化） | ✅ |
| 首页 | 进行中状态卡片（喂奶中/睡觉中，支持取消） | ✅ |
| 首页 | 开始喂奶/开始睡觉快捷按钮（明显化 + 大图标） | ✅ |
| 首页 | 延迟开始喂奶倒计时（语音"X分钟后开始喂奶"→到点自动开始） | ✅ |
| 首页 | 时间线视图（按时间倒序展示当日记录） | ✅ |
| 首页 | 时间线左滑删除 | ✅ |
| 首页 | 日期导航（前后翻页/日期选择器/回到今天） | ✅ |
| 首页 | 下拉刷新 | ✅ |
| 首页 | 底部操作栏（"+"快捷入口 + 语音横条 + 键盘输入） | ✅ |
| 首页 | 自定义 tabBar（大字体，统一风格） | ✅ |
| 记录 | 独立记录时间轴页（从「更多」进入），按天展示 24 小时时间轴 | ✅ |
| 记录 | 有起止时间/洗澡 duration 的记录按时间段块展示，跨天记录按当天可见区间裁剪 | ✅ |
| 记录 | 点状记录按具体时间点展示，支持当前时间线标记 | ✅ |
| 待办 | 底部 tab 独立页面，每日/连续多天/每N天/指定日期健康待办 | ✅ |
| 待办 | 完成待办后自动生成 records 记录（体温/身高体重/吃药/疫苗/自定义健康） | ✅ |
| 待办 | 支持撤销完成，删除由待办生成的当天记录并恢复未完成 | ✅ |
| 待办 | 删除规则后保留已完成记录，完成项排到下面，加号按钮可拖动 | ✅ |
| 喂奶 | 开始/结束计时模式（进行中可修改开始时间） | ✅ |
| 喂奶 | 手动补录模式（含开始/结束时间） | ✅ |
| 喂奶 | 奶量快捷选择（60/90/120/150ml） | ✅ |
| 喂奶 | 每顿奶量配置（云端共享） | ✅ |
| 喂奶 | 日期选择器（回溯记录） | ✅ |
| 换尿布 | 类型选择（小便/大便/混合） | ✅ |
| 换尿布 | 大便形状/颜色/量完整字段 | ✅ |
| 睡眠 | 计时器模式（宝宝睡了/醒了，进行中可修改开始时间） | ✅ |
| 睡眠 | 睡眠类型/入睡方式/质量/夜醒次数 | ✅ |
| 辅食 | 食材选择 + 自定义输入 + 食用量/宝宝反应 | ✅ |
| 洗澡 | 时间/水温/时长/备注记录 + 时间线展示 | ✅ |
| 健康 | 体温记录（含测量方式、异常标色、3天历史） | ✅ |
| 健康 | 用药记录（含最近5种药品快选，单位含 ml/包/片/滴/粒/瓶/g） | ✅ |
| 健康 | 疫苗/自定义健康记录（由待办完成生成，时间线可编辑） | ✅ |
| 生长 | 身高/体重/头围记录 + 编辑/删除 | ✅ |
| 生长 | WHO LMS 精确百分位计算（生长页 + 首页时间线，如"17.8%"） | ✅ |
| 生长 | 生长曲线图（Canvas + 缩放拖拽 + 7条百分位参考线） | ✅ |
| 身份 | 角色选择 + 微信昵称 + 记录标记 | ✅ |
| 身份 | 家庭成员管理（仅妈妈可操作） | ✅ |
| 记录管理 | 编辑/删除（三点菜单 + 左滑删除 + 语音编辑跳转） | ✅ |
| 语音 | DeepSeek LLM 解析 + 本地正则兜底 | ✅ |
| 语音 | 腾讯云ASR语音转文字 | ✅ |
| 语音 | 开始/结束动作路由（喂奶中→喂完了、睡觉→醒了） | ✅ |
| 语音 | 日期表达解析（昨天/X号/X分钟前/X分钟后/跨天等） | ✅ |
| 语音 | 时长倒推 + 每顿奶量自动填入 + 洗澡解析 | ✅ |
| 统计 | 当日统计（含平均喂奶耗时） | ✅ |
| 统计 | 最近7天趋势柱状图 | ✅ |
| 配置 | 喂奶间隔阈值 + 每顿奶量（云端共享，所有成员可改） | ✅ |
| 数据层 | 云开发 + 本地存储自动降级 | ✅ |
| 数据层 | 服务端 where 日期过滤（三层降级） | ✅ |
| 安全 | 密钥外部化（config.js / secret.js / project.config.json + .gitignore） | ✅ |

---

## v0.7 历史变更记录

### 晚间最后新增/修复（2026-05-28）
- **洗澡记录**：新增 `bath` 类型，入口在首页 `+` 面板；记录页字段为时间/水温/时长/备注；时间线显示 🛁 图标和水温/时长；语音支持"刚洗澡了/水温38度/洗澡10分钟"。
- **延迟开始喂奶**：语音说"2分钟后开始喂奶"会在首页显示倒计时，到点自动创建进行中喂奶记录；倒计时可取消，也可点快捷按钮立即开始。
- **进行中状态取消**：首页喂奶中/睡觉中卡片新增"取消"，二次确认后删除 ongoing 记录，不保存为完成记录。
- **进行中开始时间可改**：喂奶/睡眠进行中进入记录页后可修改开始时间，数据库 ongoing 记录同步更新，计时器即时重算；已点结束但未保存时也可改开始时间。
- **计时器跳动修复**：`components/timer` 不再把 interval 句柄放在 `data`，改用内部 `_timer`/`_startTimestamp`，避免旧 tick 和新 tick 交错导致已睡时间跳来跳去。
- **首页刷新修复**：新增/结束/取消/删除后统一 `_refreshHomeData()`，删除最后一条喂奶后会清空"距上次喂奶"，不再残留旧值。
- **生长页按钮避让**：生长页顶部"添加"从导航栏右侧移到标题下方，避免被微信右上角胶囊按钮遮挡。
- **SETUP 更新**：补充洗澡、延迟喂奶、进行中改开始时间、发布前部署清单和 `parseRecord` 重新部署提醒。
- **Git 上传准备**：原目录不是 Git 仓库；已创建不含密钥的干净副本 `C:\Users\hzgujie\baby-feeding-tracker-git-20260528-215905`，其中 `config.js`/`secret.js`/`project.private.config.json` 未复制，`project.config.json` 的 AppID 已改为 `touristappid`，并已 `git init` + `git add .`。

### 语音开始/结束动作路由修复
- **根因**：`effectiveAction = hasEndTime ? null : action` 导致 action='end' 被 endTime 覆盖；本地解析用 'wake'/'sleep' 不匹配 'end'/'start'
- **修复**：action 归一化（wake→end, sleep→start），start/end 动作不受 hasEndTime 覆盖
- 本地解析器（voice-parser.js）统一使用 'start'/'end'/'complete'
- 喂奶本地解析新增 start/end 识别（"开始喂奶"→start，"喂完了"→end）

### 喂养配置云端化
- `feedingAmount` / 兼容字段 `defaultFeedingAmount` + `feedingIntervalThreshold` 从本地 Storage 迁移到云数据库 `config` 集合
- 所有家庭成员共享同一份配置
- app.js 启动时加载到 `globalData.config`，各页面直接读取
- "我的"页面配置项独立为"喂养配置"卡片
- 结束喂奶时自动填入每顿奶量（之前漏了这个逻辑）

### 时间解析修复
- `resolveTime` 新增纯日期数字 `"26"` / `"26号"` 的识别
- `parseTimeExpression` 重构：先确定基准日期（昨天/前天/X号），再叠加时间，解决"26号下午3点"日期丢失问题
- DeepSeek prompt 新增 growth 类型带日期示例（"26号体重5公斤" → startTime="26"）
- 新增未来相对时间：`X分钟后` / `X小时后` → 首页喂奶倒计时，到点自动创建进行中喂奶记录

### 生长记录改进
- 百分位数据源：WHO LMS 参数（精确计算，与美柚结果一致）
- 百分位显示：从区间 "P50~P85" 改为精确值 "17.8%"
- 计算方法：Z = ((value/M)^L - 1)/(L*S) + 正态分布 CDF
- 月龄间线性插值（按天精度）
- 生长曲线图画 7 条参考线（P3/P10/P25/P50/P75/P90/P97）
- 历史记录每条显示各项百分位
- 新增编辑/删除功能（添加/编辑均跳转统一 `pages/record`，不使用弹窗）
- 顶部添加按钮已从导航栏右侧移到标题下方，避开微信胶囊按钮

### 续接开发（2026-05-29）
- 首页时间线的生长记录已迁移到 `growth-standard.js`，显示与生长页一致的 WHO LMS 精确百分位
- 首页加载当日记录前会补齐 `babyInfo`，避免未打开生长页时用默认宝宝信息计算百分位
- 「我的」页读取/保存宝宝信息时同步刷新 `globalData.babyInfo`
- 旧 `miniprogram/utils/who-data.js` 已删除
- 新增 `tests/growth-standard.test.js` 覆盖 LMS 百分位与参考线数据
- 新增 `tests/todo-schedule.test.js` 覆盖每N天待办匹配
- 新增 P0「每日待办」：底部 tab、待办列表页 `pages/todo`、独立编辑页 `pages/todo-edit`
- 新增 `todos` 集合与本地降级；支持健康类待办：量体温、身高体重、吃药、疫苗、自定义健康事项
- 如果先用了本地降级待办，云端 `todos` 集合创建后，打开待办页会自动把 `local_todos` 迁移到云端，并保留原 id 以匹配历史完成记录
- 待办规则支持每日、连续多天、每N天一次、指定日期；时间精确到分钟
- 每N天规则可用于轮流吃药：药A从今天开始每2天，药B从明天开始每2天
- 完成待办会写入正式 `records`，并带 `source: 'todo'`、`todoId`、`todoDate`；身高体重会跳现有记录页保存
- 删除待办规则只删除 `todos` 配置，不删除已完成的 `records`；待办页会回填当天已完成的历史记录并标注“规则已删除，记录已保留”
- 待办页完成项排到下面；顶部日期居中；右下角加号按钮支持拖动位置
- 待办用药单位新增 `瓶` 和 `g`，普通记录页/健康页/首页健康编辑弹窗同步支持
- 待办列表用药项不再用大号“吃药”做主标题，改为直接显示药名/剂量/方式
- 新增 `health_vaccine` / `health_custom` 记录类型，首页时间线和记录页编辑均已支持
- 首页顶部新增宝宝信息 + 日期筛选卡，宝宝月龄/天数按当前筛选日期动态计算
- 存在进行中喂奶时，“距上次喂奶”优先从本次 ongoing 喂奶开始时间计算，并显示为“本次喂奶已开始”
- 首页、记录页、待办页的记录成功提示改为更醒目的顶部绿色浮层
- 首页“开始喂奶/开始睡觉”快捷按钮做了明显化：文字缩短，按钮视觉权重增强，图标放大，按钮尺寸基本保持不变
- 新增 P1「独立记录时间轴」：`pages/timeline` 当前从「更多」进入，默认展示最新日期+前一天两天连续时间轴；顶部选日期会重置为该日期+前一天；下拉或滑到底部把更早日期接到后面；多日图表合并到一张连续卡片里，日期标记浮在左侧时间轴内不单独占行；喂奶/睡眠/洗澡 duration 等按时段块展示，跨天记录按当天可见区间裁剪；点状记录只显示图标，密集时纵向避让并轻微横向错开；卡片简化为“用药显示药名，其他显示操作名”，点击打开只读详情弹窗；新增 `timeline-layout.js` 和 `tests/timeline-layout.test.js`

### 统计页增强
- 喂奶统计新增"平均耗时(min)"（仅计算有起止时间的记录）

### 密钥外部化
- 所有 API Key / Secret 抽出为独立文件（不提交 git）
- `miniprogram/config.js` — 云环境 ID
- `cloudfunctions/speechToText/secret.js` — 腾讯云 ASR 密钥
- `cloudfunctions/parseRecord/secret.js` — DeepSeek API Key
- `project.config.json` — 本地微信开发者工具配置，可能包含真实 AppID，已加入 `.gitignore`
- 各有对应 `.example.js` 模板
- `.gitignore` 排除真实配置
- 新增 `project.config.example.json`，公开仓库使用 `touristappid` 模板；本地开发时复制为 `project.config.json` 并填自己的 AppID
- 注意：真实 `config.js` / `secret.js` / `project.config.json` 仍会存在于本地开发目录；对外分发或建仓库前确认它们未被提交，如密钥曾暴露需轮换

---

## 项目结构

```
baby-feeding-tracker/
├── .gitignore                         # 排除 config.js / secret.js
├── HANDOVER.md                        # 本文档
├── README.md                          # 使用与部署指南（给外部用户）
├── PRD_喂养记录功能文档.md
├── miniprogram/
│   ├── config.js                      # 云环境ID（gitignored，从 config.example.js 复制）
│   ├── config.example.js              # 配置模板
│   ├── app.js                         # 入口：云初始化 + 身份检查 + 加载 config
│   ├── app.json                       # 页面路由 + tabBar(custom:true)
│   ├── app.wxss                       # 全局样式
│   ├── custom-tab-bar/               # 自定义 tabBar 组件
│   ├── utils/
│   │   ├── db.js                      # 数据库抽象层（含 config 集合读写）
│   │   ├── voice-parser.js            # 语音→结构化数据（含 resolveTime）
│   │   ├── time-parser.js             # 时间表述解析（日期+时间组合）
│   │   ├── todo-schedule.js           # 待办日期匹配/每N天规则/展示文案
│   │   ├── timeline-layout.js         # 独立记录时间轴布局/跨天裁剪/时段块计算
│   │   ├── feeding-plan.js            # 喂奶计划本地规则/AI建议校验边界
│   │   └── growth-standard.js         # WHO LMS 生长标准 + 精确百分位计算（生长页 + 首页时间线）
│   ├── components/
│   │   ├── voice-input/               # 语音组件
│   │   ├── timer/                     # 计时器组件
│   │   ├── top-nav/                   # 自定义顶部标题组件
│   │   └── timeline-item/             # 时间线卡片（含左滑删除）
│   └── pages/
│       ├── index/                     # 首页
│       ├── todo/                      # 每日待办列表
│       ├── more/                      # 更多入口：记录时间轴/数据统计/生长曲线
│       ├── todo-edit/                 # 待办独立编辑页
│       ├── timeline/                  # 独立记录时间轴页
│       ├── record/                    # 记录页
│       ├── health/                    # 健康模块
│       ├── growth/                    # 生长曲线页（含编辑删除）
│       ├── stats/                     # 统计页（含平均喂奶耗时）
│       ├── mine/                      # 我的（含喂养配置面板）
│       └── role-select/               # 角色选择页
├── cloudfunctions/
│   ├── parseRecord/
│   │   ├── index.js                   # DeepSeek NLP
│   │   ├── secret.js                  # API Key（gitignored）
│   │   ├── secret.example.js          # 模板
│   │   └── config.json                # 超时 20s
│   ├── speechToText/
│   │   ├── index.js                   # 腾讯云 ASR
│   │   ├── secret.js                  # 密钥（gitignored）
│   │   ├── secret.example.js          # 模板
│   │   └── config.json                # 超时 20s
│   ├── familyManage/                  # 家庭成员管理
│   └── ...                            # 其他早期云函数（不再使用）
└── tests/
    ├── voice-action-routing.test.js   # 语音动作路由测试
    ├── growth-standard.test.js        # WHO LMS 百分位测试
    ├── todo-schedule.test.js          # 每N天待办规则测试
    ├── timeline-layout.test.js        # 独立时间轴布局/跨天裁剪测试
    └── feeding-plan.test.js           # 喂奶计划本地规则/AI建议边界测试
```

---

## 技术架构

### 关键设计模式

1. **服务端 where + 三层降级**：日期查询优先走云数据库 `_.gte().and(_.lt())`，失败则 `orderBy` 取最近 100 条客户端过滤，最后降级本地存储
2. **LLM + 正则双重解析**：语音文本优先 DeepSeek，超时/失败回退本地正则
3. **语音动作路由**：action 归一化后路由到对应处理器（start→开始计时，end→结束进行中记录，complete→创建完整记录）
4. **时间解析两层**：DeepSeek 返回时间字符串 → `resolveTime` 转为 Date；本地解析直接由 `parseTimeExpression` 处理
5. **配置云端共享**：`config` 集合单文档，app 启动时加载到 `globalData.config`，全家可读写
6. **生长百分位 LMS 法**：WHO MGRS 的 L/M/S 参数 + 正态分布 CDF，月龄间线性插值；生长页和首页时间线共用 `growth-standard.js`
7. **密钥分离**：`config.js` / `secret.js` 被 gitignore，通过 `.example.js` 模板分发
8. **进行中记录编辑**：ongoing 喂奶/睡眠可以修改 `startTime`；更新数据库后调用计时器 `resume()` 重新计算显示
9. **延迟喂奶**：仅保存在本地 `wx.Storage` 的 pending 状态，倒计时到点后才写入 `records` ongoing 记录，避免统计提前计入
10. **待办规则与完成记录分离**：`todos` 只保存规则；点完成会生成 `records`，删除规则不删除历史完成记录
11. **本地待办迁移云端**：云端 `todos` 集合缺失时先落 `local_todos`；集合建好后打开待办页自动迁移，并保留原 id 匹配历史完成记录
12. **独立时间轴布局**：`getRecordsOverlappingDateRange` 按 startTime 回看并在客户端过滤与当天重叠的记录；`timeline-layout.js` 统一计算跨天裁剪、时段块高度、点状记录位置和简单并列 lane
13. **喂奶计划本地优先**：`feeding-plan.js` 负责每日目标、夜间勿扰、最短间隔、睡眠中醒后提醒和剩余顿数重排；DeepSeek 只能通过 `aiSuggestion` 小幅建议下一顿时间，且必须通过本地规则校验

### 云数据库集合

| 集合 | 用途 | 权限 |
|------|------|------|
| `records` | 所有喂养/睡眠/洗澡/健康/生长记录 | 所有用户可读写 |
| `baby` | 宝宝基本信息 | 所有用户可读写 |
| `med_history` | 用药历史（快选用） | 所有用户可读写 |
| `family_members` | 家庭成员（由云函数管理） | 所有用户可读写 |
| `config` | 共享配置（每顿奶量/喂奶间隔阈值） | 所有用户可读写 |
| `todos` | 每日待办规则（健康类待办） | 所有用户可读写 |

### 云函数

| 云函数名 | 用途 | 超时 |
|----------|------|------|
| `speechToText` | 语音转文字（腾讯云 ASR） | 20s |
| `parseRecord` | 自然语言解析（DeepSeek Chat API） | 20s |
| `familyManage` | 家庭成员管理 | 默认 |

---

## 已知限制与待办

### 当前限制
- 个人小程序账号无法使用微信同声传译插件
- 生长标准使用 WHO 数据（与美柚一致），如需替换为中国 WS/T 423-2022 国标需获取其 LMS 参数
- 原项目目录 `C:\Users\hzgujie\baby-feeding-tracker\` 当前不是 Git 仓库；Git 上传请使用干净副本目录，避免提交真实密钥

### 待开发
- [ ] tabBar 图标替换为正式设计
- [ ] 喂奶提醒功能（订阅消息 or 小程序内弹窗+震动）
- [ ] 数据导出（PDF/图片）
- [ ] 用药提醒
- [ ] 体温趋势折线图
- [ ] 离线记录后联网同步机制
- [ ] P2 待办到点微信提醒（订阅消息 + 云函数定时/服务端调度方案未实现）
- [ ] 喂奶计划后台提醒与 DeepSeek 自动预测（当前只有首页内计划和受控 AI 建议入口）
- [ ] 早教类待办（用户已明确可先不做）
- [ ] tab 正式图标（待办当前复用健康图标，记录当前复用生长图标）
- [ ] 生长标准可选切换（WHO / WS/T 423-2022）— 需获取中国标准 LMS 参数

---

## 部署清单

1. 复制配置文件模板并填入密钥（详见 `README.md`）
2. 右键部署 `cloudfunctions/speechToText` → "上传并部署：云端安装依赖"
3. 右键部署 `cloudfunctions/parseRecord` → 同上（必须重新部署，包含洗澡、延迟喂奶、时间解析 prompt）
4. 右键部署 `cloudfunctions/familyManage` → 同上
5. 云开发控制台 → 数据库 → 创建集合 `records`/`family_members`/`baby`/`med_history`/`config`/`todos`
6. 每个集合权限：选择「自定义安全规则」，内容改为 `{"read": true, "write": true}`
7. 确认腾讯云控制台已开通"语音识别"服务
8. 上传代码 → 设为体验版

---

## 明天接手建议

1. 先在微信开发者工具编译原项目 `C:\Users\hzgujie\baby-feeding-tracker\`，重点回归：记录时间轴（跨天睡眠、喂奶时段、洗澡 duration、点状记录）、每日待办、todos 云迁移、语音延迟喂奶、洗澡记录、进行中改开始时间、首页取消 ongoing、首页快捷按钮视觉。
2. 上传体验版前重新部署 `parseRecord`、`speechToText`、`familyManage` 三个云函数。
3. 如果要推 Git，当前最新代码在原项目目录 `C:\Users\hzgujie\baby-feeding-tracker\`；该目录当前仍不是 Git 仓库。已补充 `.gitignore`，会忽略真实 `miniprogram/config.js`、两个云函数 `secret.js`、`project.config.json`、`project.private.config.json`。公开仓库提交 `project.config.example.json` 即可。
4. Git 推送命令参考（在原项目目录执行）：
   ```powershell
   cd C:\Users\hzgujie\baby-feeding-tracker
   git init
   git status --ignored --short
   git add .
   git status --short
   # 确认没有以下文件出现在待提交列表：
   # miniprogram/config.js
   # cloudfunctions/speechToText/secret.js
   # cloudfunctions/parseRecord/secret.js
   # project.config.json
   # project.private.config.json
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<用户名>/baby-feeding-tracker.git
   git push -u origin main
   ```
5. 如果未来某次不小心把密钥加入暂存区，用 `git rm --cached <文件路径>` 只从 Git 暂存中移除，不要删本地真实配置文件。
6. 最近通过的检查：`node tests\timeline-layout.test.js` 为 27/27，`node tests\feeding-plan.test.js` 为 23/23，`node tests\voice-action-routing.test.js` 为 37/37，`node tests\growth-standard.test.js` 为 6/6，`node tests\todo-schedule.test.js` 为 9/9；相关新增/修改 JS 均已 `node --check`。
