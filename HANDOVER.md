# 宝宝喂养记录小程序 - 开发交接文档

## 项目概况

- **项目位置**：`C:\Users\hzgujie\baby-feeding-tracker\`
- **Git 状态**：当前目录已是 Git 仓库，分支 `main` 跟踪 `origin/main`
- **远端仓库**：`https://github.com/yoyoYep/baby-feeding-tracker`
- **当前版本**：v0.8-dev
- **最新已推送提交**：
  - `8ed50cb feat: add in-app reminders with snooze`
  - `4609af3 feat: add QQ Music mini program jump`
  - `ec49daf Improve feeding plan and record overlap handling`
- **当前状态**：核心功能完成 + 每日待办 P0 + 独立记录时间轴 + 喂奶计划 P0 + 程序内提醒 + QQ 音乐跳转 + 配置/待办云端化 + 生长精确百分位 + 密钥外部化 + 跨天统计/查询兜底修复

> 交接时工作区应保持干净。若本文件和 PRD 更新尚未提交，请先 `git status --short` 确认后再提交。

---

## 2026-05-30 最新交接重点

### 本轮新增

#### 1. QQ 音乐跳转
- 更多页新增 `QQ 音乐`入口。
- 使用 `wx.navigateToMiniProgram` 跳转 QQ 音乐小程序首页。
- 已验证可用 appId：`wxada7aab80ba27074`
- 配置文件：`miniprogram/utils/qq-music.js`
- 跳转白名单：`miniprogram/app.json` 的 `navigateToMiniProgramAppIdList`
- 注意：之前从网页误取过一个 appId，会打开“佳品多多”，已删除并替换为本机微信缓存确认过的 QQ 音乐 appId。

#### 2. 程序内提醒 + 稍后提醒
- 新增 `miniprogram/utils/local-reminders.js`。
- 在 `miniprogram/app.js` 的 `onShow/onHide` 接入前台提醒循环。
- 小程序在前台时每分钟检查一次：
  - 今日已到点且未完成的待办/用药
  - 首页喂奶计划中已到点的下一顿
- 提醒方式：`wx.vibrateShort` + `wx.showModal`
- 弹窗按钮：
  - `知道了`：当天该条提醒不再弹
  - `稍后提醒`：10 分钟后再次提醒
- 推迟状态只写本机 `wx.Storage`，key 为 `local_reminder_triggered`；不会修改 `todos`、喂奶计划配置或任何云端规则。
- 待办页和首页喂奶计划卡片会显示推迟倒计时，例如 `稍后提醒：10分钟后`。
- 今天过期但未完成的待办会补弹；只处理今天，不追溯昨天以前。

#### 3. 微信订阅消息方案已暂缓
- 用户最终决定先不用微信服务通知/订阅消息，只做程序内提醒。
- 已撤掉：
  - `reminders` 集合设计
  - `sendReminders` 云函数
  - `wx.requestSubscribeMessage` 入口
  - 待办铃铛按钮和喂奶“提醒我”按钮
- 因此当前不需要创建 `reminders` 集合，也不需要配置订阅消息模板字段。
- 如未来恢复微信订阅消息，已知模板 ID：
  - 每日用药提醒：`PoAV1PggsRqy8x8jppE114AJJJ7TlAI5-w9NV24ar2I`
  - 喂奶记录通知：`At1xhy_FI8Pqk-egIV2CFgsYLu_oghNzSZizcEqSS9w`

#### 4. 调试日志清理
- 已清理业务代码中的 `console.log` 调试输出。
- 保留 `console.warn/error` 作为异常诊断。
- 清理范围包括：
  - 首页 `loadDayData` 诊断日志
  - 我的页家庭成员弹窗日志
  - 语音上传/ASR 结果日志
  - DeepSeek 解析返回日志
  - 云开发连接成功日志
  - `speechToText` 云函数普通请求日志

---

## 近期重要修复

### 喂奶计划时间紧张提前预警
- 文件：`miniprogram/utils/feeding-plan.js`
- 新增 `calcRealisticMax(fromMinute, config)`，用于判断当天剩余时间在最短间隔下最多还能排几顿。
- 当 `futureCount > realisticMax` 时提前触发 `status: 'tight'`。
- 警告文案变为可执行建议，例如“还需 X 顿，23:30前最多能排 Y 顿，建议尽早在 HH:MM 前喂”。
- 首页 `_updateFeedingPlan` 已确认使用 `now: new Date()`，没有残留测试时间。

### 跨天睡眠统计修复
- 文件：`miniprogram/pages/stats/stats.js`、`miniprogram/pages/index/index.js`
- 统计页改用 `getRecordsOverlappingDateRange` 查询跨天记录。
- 睡眠统计按自然日边界裁剪，不再把跨天睡眠全部归入开始日。
- 首页加载当天记录时补查前一天，确保跨天睡眠稳定出现。

### 云数据库查询缺失兜底
- 文件：`miniprogram/utils/db.js`
- `getRecordsOverlappingDateRange` 改为三路并行：
  - `startTime` 范围主查询
  - `orderBy('startTime', 'desc')` fallback
  - `orderBy('createdAt', 'desc')` recent fallback
- 三路结果合并去重后客户端过滤 overlap。
- 建议：`records.createdAt` 加降序索引，可提升第三路查询速度。

---

## 已实现功能清单

| 模块 | 功能 | 状态 |
|------|------|------|
| 首页 | 今日统计、平均喂奶间隔、距上次喂奶、日期导航、时间线 | 已完成 |
| 首页 | 进行中喂奶/睡眠卡片，支持取消和跳转结束 | 已完成 |
| 首页 | 开始喂奶/开始睡觉快捷按钮 | 已完成 |
| 首页 | 喂奶计划 P0：每日顿数、每顿奶量、夜间勿扰、最短间隔、紧张预警 | 已完成 |
| 首页 | 喂奶计划到点程序内提醒、稍后提醒、倒计时展示 | 已完成 |
| 待办 | 健康类每日待办，支持每日/连续多天/每 N 天/指定日期 | 已完成 |
| 待办 | 完成待办生成正式 `records`，支持撤销完成 | 已完成 |
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

---

## 关键文件

### 本轮新增/修改
- `miniprogram/utils/local-reminders.js`：程序内提醒、推迟提醒、本地提醒状态。
- `miniprogram/app.js`：前台启动提醒循环，后台停止。
- `miniprogram/pages/todo/todo.js|wxml|wxss`：待办稍后提醒倒计时展示。
- `miniprogram/pages/index/index.js|wxml|wxss`：喂奶稍后提醒倒计时展示。
- `miniprogram/utils/qq-music.js`：QQ 音乐小程序跳转配置。
- `miniprogram/pages/more/more.js|wxml|wxss`：更多页 QQ 音乐入口。

### 核心模块
- `miniprogram/utils/db.js`：数据库抽象、records/todos/config、本地降级、查询兜底。
- `miniprogram/utils/feeding-plan.js`：喂奶计划本地规则。
- `miniprogram/utils/todo-schedule.js`：待办日期匹配。
- `miniprogram/utils/timeline-layout.js`：记录时间轴布局。
- `miniprogram/utils/growth-standard.js`：WHO LMS 生长标准。
- `miniprogram/utils/voice-parser.js`：本地语音解析兜底。

---

## 技术备注

### 程序内提醒设计
- 不使用云函数、不使用订阅消息、不需要额外数据库集合。
- 提醒状态只存在本机缓存：
  - `status: 'done'`：当天不再提醒
  - `status: 'snoozed'`：推迟到 `until` 后再次提醒
- 同时到点的待办和喂奶提醒会排队展示，避免弹窗互相覆盖。
- 当前推迟时长固定为 10 分钟，在 `SNOOZE_MS` 中配置。
- 如果用户清除本地缓存，提醒状态会丢失，当天已过期未完成项可能再次补弹。

### 微信订阅消息说明
- 已调研并暂缓。一次性订阅通常“一次授权发一次”，不适合作为高频喂奶/用药提醒主方案。
- 如果未来恢复，建议新增 `reminders` 任务集合，保存某一次授权后的具体发送任务，而不是直接改 `todos`。

### Git 注意
- 真实配置文件仍应保持不提交：
  - `miniprogram/config.js`
  - `cloudfunctions/speechToText/secret.js`
  - `cloudfunctions/parseRecord/secret.js`
  - `project.config.json`
  - `project.private.config.json`
- 不要使用 `git reset --hard` 或 `git checkout --` 回滚用户改动。

---

## 已知限制与待办

### 当前限制
- 程序内提醒只在小程序前台有效；后台或关闭小程序时不会提醒。
- 微信订阅消息暂未启用。
- 个人小程序账号无法使用微信同声传译插件。
- 生长标准当前使用 WHO；如需中国 WS/T 423-2022 需获取 LMS 参数。

### 待开发
- tabBar 正式图标替换。
- 数据导出（PDF/图片）。
- 体温趋势折线图。
- 离线记录后联网同步机制。
- 喂奶计划后台提醒 / 微信订阅消息方案（已暂缓）。
- DeepSeek 自动生成喂奶计划建议（当前只有本地规则与受控 AI 建议入口）。
- 早教类待办（用户已明确可先不做）。
- 生长标准可选切换（WHO / WS/T 423-2022）。

---

## 部署与回归建议

### 云开发
1. 部署 `cloudfunctions/speechToText`。
2. 部署 `cloudfunctions/parseRecord`。
3. 部署 `cloudfunctions/familyManage`。
4. 创建/确认集合：`records`、`family_members`、`baby`、`med_history`、`config`、`todos`。
5. 每个集合权限按当前体验版策略配置为可读写。
6. 建议索引：
   - `records.startTime` 降序
   - `records.createdAt` 降序

### 重点回归
- QQ 音乐入口：更多页点击后跳转 QQ 音乐小程序首页。
- 程序内提醒：
  - 建一个今天已过点未完成用药待办，打开小程序应震动并弹窗。
  - 点“稍后提醒”，待办页显示倒计时，10 分钟后再次提醒。
  - 点“知道了”，当天不再弹该条。
  - 首页喂奶计划过点后应震动弹窗，推迟后首页卡片显示倒计时。
- 跨天睡眠：首页和统计页按自然日裁剪一致。
- 记录时间轴：跨天睡眠/喂奶时段/洗澡 duration/点状记录布局。
- 每日待办：todos 云迁移、完成、撤销完成、删除规则保留历史记录。
- 语音：开始喂奶、喂完了、宝宝睡了、宝宝醒了、X 分钟后开始喂奶。

### 最近验证
- `node --check miniprogram\utils\local-reminders.js`
- `node --check miniprogram\app.js`
- `node --check miniprogram\pages\index\index.js`
- `node --check miniprogram\pages\todo\todo.js`
- `node --check miniprogram\components\voice-input\voice-input.js`
- `node --check miniprogram\pages\mine\mine.js`
- `node --check miniprogram\utils\voice-parser.js`
- `node --check cloudfunctions\speechToText\index.js`
- `node --check miniprogram\utils\qq-music.js`
- `node --check miniprogram\pages\more\more.js`
