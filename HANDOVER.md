# 宝宝喂养记录小程序 - 开发交接文档

## 项目概况

- **项目位置**：`C:\Users\hzgujie\baby-feeding-tracker\`
- **当前版本**：v0.7
- **状态**：核心功能完成 + 配置云端化 + 生长页精确百分位 + 密钥外部化

---

## 已实现功能清单

| 模块 | 功能 | 状态 |
|------|------|------|
| 首页 | 今日统计卡片（喂奶次数/总奶量/换尿布次数/睡眠时长）+ 图标 | ✅ |
| 首页 | 平均喂奶间隔 | ✅ |
| 首页 | 距上次喂奶倒计时（可配阈值，绿色/红色） | ✅ |
| 首页 | 进行中状态卡片（喂奶中/睡觉中，支持取消） | ✅ |
| 首页 | 延迟开始喂奶倒计时（语音"X分钟后开始喂奶"→到点自动开始） | ✅ |
| 首页 | 时间线视图（按时间倒序展示当日记录） | ✅ |
| 首页 | 时间线左滑删除 | ✅ |
| 首页 | 日期导航（前后翻页/日期选择器/回到今天） | ✅ |
| 首页 | 下拉刷新 | ✅ |
| 首页 | 底部操作栏（"+"快捷入口 + 语音横条 + 键盘输入） | ✅ |
| 首页 | 自定义 tabBar（大字体，统一风格） | ✅ |
| 喂奶 | 开始/结束计时模式（进行中可修改开始时间） | ✅ |
| 喂奶 | 手动补录模式（含开始/结束时间） | ✅ |
| 喂奶 | 奶量快捷选择（60/90/120/150ml） | ✅ |
| 喂奶 | 默认奶量配置（云端共享） | ✅ |
| 喂奶 | 日期选择器（回溯记录） | ✅ |
| 换尿布 | 类型选择（小便/大便/混合） | ✅ |
| 换尿布 | 大便形状/颜色/量完整字段 | ✅ |
| 睡眠 | 计时器模式（宝宝睡了/醒了，进行中可修改开始时间） | ✅ |
| 睡眠 | 睡眠类型/入睡方式/质量/夜醒次数 | ✅ |
| 辅食 | 食材选择 + 自定义输入 + 食用量/宝宝反应 | ✅ |
| 洗澡 | 时间/水温/时长/备注记录 + 时间线展示 | ✅ |
| 健康 | 体温记录（含测量方式、异常标色、3天历史） | ✅ |
| 健康 | 用药记录（含最近5种药品快选） | ✅ |
| 生长 | 身高/体重/头围记录 + 编辑/删除 | ✅ |
| 生长 | 生长页 WHO LMS 精确百分位计算（如"17.8%"） | ✅ |
| 生长 | 生长曲线图（Canvas + 缩放拖拽 + 7条百分位参考线） | ✅ |
| 身份 | 角色选择 + 微信昵称 + 记录标记 | ✅ |
| 身份 | 家庭成员管理（仅妈妈可操作） | ✅ |
| 记录管理 | 编辑/删除（三点菜单 + 左滑删除 + 语音编辑跳转） | ✅ |
| 语音 | DeepSeek LLM 解析 + 本地正则兜底 | ✅ |
| 语音 | 腾讯云ASR语音转文字 | ✅ |
| 语音 | 开始/结束动作路由（喂奶中→喂完了、睡觉→醒了） | ✅ |
| 语音 | 日期表达解析（昨天/X号/X分钟前/X分钟后/跨天等） | ✅ |
| 语音 | 时长倒推 + 默认奶量自动填入 + 洗澡解析 | ✅ |
| 统计 | 当日统计（含平均喂奶耗时） | ✅ |
| 统计 | 最近7天趋势柱状图 | ✅ |
| 配置 | 喂奶间隔阈值 + 默认奶量（云端共享，所有成员可改） | ✅ |
| 数据层 | 云开发 + 本地存储自动降级 | ✅ |
| 数据层 | 服务端 where 日期过滤（三层降级） | ✅ |
| 安全 | 密钥外部化（config.js / secret.js + .gitignore） | ✅ |

---

## v0.7 变更记录（本次开发）

### 语音开始/结束动作路由修复
- **根因**：`effectiveAction = hasEndTime ? null : action` 导致 action='end' 被 endTime 覆盖；本地解析用 'wake'/'sleep' 不匹配 'end'/'start'
- **修复**：action 归一化（wake→end, sleep→start），start/end 动作不受 hasEndTime 覆盖
- 本地解析器（voice-parser.js）统一使用 'start'/'end'/'complete'
- 喂奶本地解析新增 start/end 识别（"开始喂奶"→start，"喂完了"→end）

### 喂养配置云端化
- `defaultFeedingAmount` + `feedingIntervalThreshold` 从本地 Storage 迁移到云数据库 `config` 集合
- 所有家庭成员共享同一份配置
- app.js 启动时加载到 `globalData.config`，各页面直接读取
- "我的"页面配置项独立为"喂养配置"卡片
- 结束喂奶时自动填入默认奶量（之前漏了这个逻辑）

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
- 新增编辑/删除功能（复用表单弹窗）
- 去掉浮动红圈按钮，改为卡片内"+ 添加"
- 注意：首页时间线仍使用旧 `who-data.js` 的区间百分位标签（如 `P15~P50`），迁移前不要删除该文件

### 统计页增强
- 喂奶统计新增"平均耗时(min)"（仅计算有起止时间的记录）

### 密钥外部化
- 所有 API Key / Secret 抽出为独立文件（不提交 git）
- `miniprogram/config.js` — 云环境 ID
- `cloudfunctions/speechToText/secret.js` — 腾讯云 ASR 密钥
- `cloudfunctions/parseRecord/secret.js` — DeepSeek API Key
- 各有对应 `.example.js` 模板
- `.gitignore` 排除真实配置
- 注意：真实 `config.js` / `secret.js` 仍会存在于本地开发目录；对外分发或建仓库前确认它们未被提交，如密钥曾暴露需轮换

---

## 项目结构

```
baby-feeding-tracker/
├── .gitignore                         # 排除 config.js / secret.js
├── HANDOVER.md                        # 本文档
├── SETUP.md                           # 使用与部署指南（给外部用户）
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
│   │   ├── growth-standard.js         # WHO LMS 生长标准 + 精确百分位计算（生长页）
│   │   └── who-data.js                # 首页时间线仍在用的区间百分位数据，迁移后再删除
│   ├── components/
│   │   ├── voice-input/               # 语音组件
│   │   ├── timer/                     # 计时器组件
│   │   └── timeline-item/             # 时间线卡片（含左滑删除）
│   └── pages/
│       ├── index/                     # 首页
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
    └── voice-action-routing.test.js   # 语音动作路由测试
```

---

## 技术架构

### 关键设计模式

1. **服务端 where + 三层降级**：日期查询优先走云数据库 `_.gte().and(_.lt())`，失败则 `orderBy` 取最近 100 条客户端过滤，最后降级本地存储
2. **LLM + 正则双重解析**：语音文本优先 DeepSeek，超时/失败回退本地正则
3. **语音动作路由**：action 归一化后路由到对应处理器（start→开始计时，end→结束进行中记录，complete→创建完整记录）
4. **时间解析两层**：DeepSeek 返回时间字符串 → `resolveTime` 转为 Date；本地解析直接由 `parseTimeExpression` 处理
5. **配置云端共享**：`config` 集合单文档，app 启动时加载到 `globalData.config`，全家可读写
6. **生长页百分位 LMS 法**：WHO MGRS 的 L/M/S 参数 + 正态分布 CDF，月龄间线性插值；首页时间线暂仍用 `who-data.js` 的区间标签
7. **密钥分离**：`config.js` / `secret.js` 被 gitignore，通过 `.example.js` 模板分发

### 云数据库集合

| 集合 | 用途 | 权限 |
|------|------|------|
| `records` | 所有喂养/睡眠/洗澡/健康/生长记录 | 所有用户可读写 |
| `baby` | 宝宝基本信息 | 所有用户可读写 |
| `med_history` | 用药历史（快选用） | 所有用户可读写 |
| `family_members` | 家庭成员（由云函数管理） | 所有用户可读写 |
| `config` | 共享配置（默认奶量/喂奶间隔阈值） | 所有用户可读写 |

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

### 待开发
- [ ] tabBar 图标替换为正式设计
- [ ] 喂奶提醒功能（订阅消息 or 小程序内弹窗+震动）
- [ ] 数据导出（PDF/图片）
- [ ] 用药提醒
- [ ] 体温趋势折线图
- [ ] 离线记录后联网同步机制
- [ ] 生长标准可选切换（WHO / WS/T 423-2022）— 需获取中国标准 LMS 参数
- [ ] 将首页时间线的生长百分位展示迁移到 `growth-standard.js`，完成后再删除旧的 `who-data.js`

---

## 部署清单

1. 复制配置文件模板并填入密钥（详见 `SETUP.md`）
2. 右键部署 `cloudfunctions/speechToText` → "上传并部署：云端安装依赖"
3. 右键部署 `cloudfunctions/parseRecord` → 同上
4. 右键部署 `cloudfunctions/familyManage` → 同上
5. 云开发控制台 → 数据库 → 创建集合 `records`/`family_members`/`baby`/`med_history`/`config`
6. 每个集合权限：选择「自定义安全规则」，内容改为 `{"read": true, "write": true}`
7. 确认腾讯云控制台已开通"语音识别"服务
8. 上传代码 → 设为体验版
