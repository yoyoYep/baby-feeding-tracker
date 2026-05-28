# 宝宝喂养记录小程序 - 使用与部署指南

> 一个微信小程序，用于记录宝宝的喂奶、睡眠、换尿布、洗澡、辅食、健康、生长等日常事件。支持语音一句话快速记录，家庭成员共享数据。

---

## 目录

1. [前置准备](#一前置准备)
2. [获取各项密钥](#二获取各项密钥)
3. [本地调试](#三本地调试)
4. [部署上线](#四部署上线)
5. [给家人使用](#五给家人使用)
6. [常见问题](#六常见问题)

---

## 一、前置准备

### 你需要准备的账号

| 平台 | 用途 | 注册地址 |
|------|------|----------|
| 微信公众平台 | 注册小程序，获取 AppID | https://mp.weixin.qq.com |
| 腾讯云 | 语音识别（ASR）服务 | https://cloud.tencent.com |
| DeepSeek | AI 自然语言解析 | https://platform.deepseek.com |

### 安装开发工具

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 用你注册小程序的微信号登录

---

## 二、获取各项密钥

### 2.1 小程序 AppID

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 左侧菜单 → 开发管理 → 开发设置
3. 找到「AppID(小程序ID)」，复制备用

> 注意：需要注册「小程序」类型，不是公众号。个人主体即可注册。

### 2.2 云开发环境 ID

1. 打开微信开发者工具，导入本项目
2. 顶部工具栏点击「云开发」按钮
3. 如果是首次使用，点击「开通」，创建一个环境（名字随意，如 "baby-tracker"）
4. 开通后，在云开发控制台顶部可以看到「环境 ID」（类似 `baby-tracker-xxxx`），复制备用

### 2.3 腾讯云 ASR 密钥（语音识别）

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com)
2. 搜索并开通「语音识别」服务（有免费额度）
3. 进入 [API密钥管理](https://console.cloud.tencent.com/cam/capi)
4. 点击「新建密钥」，得到 `SecretId` 和 `SecretKey`，复制备用

> 语音识别每月有免费调用额度，个人使用完全够用。

### 2.4 DeepSeek API Key（AI 语义解析）

1. 注册 [DeepSeek 开放平台](https://platform.deepseek.com)
2. 登录后进入「API Keys」页面
3. 点击「创建 API Key」，复制生成的 key（以 `sk-` 开头）

> DeepSeek 需要充值才能使用，费用非常低（每次解析约 ¥0.001）。充 10 块钱可以用很久。

---

## 三、本地调试

### 3.1 导入项目

1. 打开微信开发者工具
2. 选择「导入项目」
3. 项目目录选择本仓库根目录（包含 `project.config.json` 的那层）
4. AppID 填入你自己的小程序 AppID
5. 点击「导入」

### 3.2 填写配置文件

项目中有 3 个配置文件需要你手动创建（从模板复制）：

**① 小程序云环境配置**

复制 `miniprogram/config.example.js` 为 `miniprogram/config.js`，填入你的云开发环境 ID：

```javascript
module.exports = {
  cloudEnvId: '你的云开发环境ID'  // 如 'baby-tracker-8gxyz123'
}
```

**② 腾讯云 ASR 配置**

复制 `cloudfunctions/speechToText/secret.example.js` 为 `cloudfunctions/speechToText/secret.js`：

```javascript
module.exports = {
  secretId: '你的腾讯云SecretId',
  secretKey: '你的腾讯云SecretKey'
}
```

**③ DeepSeek 配置**

复制 `cloudfunctions/parseRecord/secret.example.js` 为 `cloudfunctions/parseRecord/secret.js`：

```javascript
module.exports = {
  apiKey: '你的DeepSeek API Key'  // sk-xxxxxxxx
}
```

### 3.3 创建数据库集合

1. 在微信开发者工具中点击「云开发」
2. 进入「数据库」标签
3. 依次创建以下集合（点「+」号）：
   - `records` — 所有喂养/睡眠/洗澡/健康/生长记录
   - `baby` — 宝宝基本信息
   - `med_history` — 用药历史（快捷选择用）
   - `family_members` — 家庭成员
   - `config` — 共享配置（默认奶量等）
4. 每个集合的权限设为 **「所有用户可读写」**：集合 → 权限设置 → 选择「自定义安全规则」，将内容改为 `{"read": true, "write": true}`

### 3.4 部署云函数

在微信开发者工具的项目目录中，对以下每个云函数文件夹右键操作：

| 云函数目录 | 右键操作 |
|-----------|----------|
| `cloudfunctions/speechToText` | 上传并部署：云端安装依赖 |
| `cloudfunctions/parseRecord` | 上传并部署：云端安装依赖 |
| `cloudfunctions/familyManage` | 上传并部署：云端安装依赖 |

> 其他云函数（addRecord/getRecords/getStats/getOpenId）是早期版本遗留，当前版本不依赖，可选部署。

### 3.5 运行调试

1. 点击微信开发者工具顶部的「编译」按钮
2. 首次进入会自动跳转角色选择页（选择"妈妈"/"爸爸"等）
3. 选择角色后进入首页，即可开始使用
4. 语音功能：点击底部横条「🎤 点击说话」开始录音，再次点击结束
5. 文字输入：点击底部 ⌨ 图标
6. 可重点试一下最近新增/修改的流程：
   - 首页快捷按钮：开始喂奶、完成喂奶、开始睡觉、宝宝醒了
   - 语音："2分钟后开始喂奶"（首页应显示倒计时，到点自动开始）
   - 进行中喂奶/睡眠：进入记录页后修改开始时间，计时应即时重算
   - 洗澡：从「+」面板添加，或语音说"刚给宝宝洗澡了水温38度"

### 3.6 调试技巧

- **云函数日志**：云开发控制台 → 云函数 → 点击函数名 → 日志，可以查看每次调用的详细输出
- **语音不工作**：检查是否已部署 `speechToText` 云函数，以及腾讯云是否开通了语音识别
- **AI 解析异常**：查看 `parseRecord` 云函数日志，确认 DeepSeek API Key 有效且有余额
- **数据不显示**：确认数据库集合权限为"所有用户可读写"

---

## 四、部署上线

调试没问题后，可以发布为体验版/正式版让家人使用。

### 4.1 上传代码

上传前建议先确认：

1. 已重新部署 `parseRecord` 云函数（本版本新增/调整了延迟喂奶、洗澡、时间解析等语义规则）
2. 已重新部署 `speechToText` 云函数（如改过语音识别相关代码或密钥）
3. 已部署 `familyManage` 云函数
4. 数据库集合 `records`/`baby`/`med_history`/`family_members`/`config` 已创建且权限正确
5. 本地编译通过，首页、记录页、语音输入能正常打开

然后上传小程序代码：

1. 微信开发者工具 → 顶部「上传」按钮
2. 填写版本号（如 `0.7.0`）和备注（例如：`新增洗澡记录、延迟喂奶、进行中改开始时间`）
3. 点击「上传」

### 4.2 设为体验版

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 左侧菜单 → 管理 → 版本管理
3. 在「开发版本」中找到刚上传的版本
4. 点击「设为体验版」

### 4.3 提交审核（可选）

如果你想让任何人都能搜索到你的小程序：

1. 在版本管理中点击「提交审核」
2. 填写相关信息，等待审核通过（通常 1-3 天）
3. 审核通过后点击「全量发布」

> 个人主体小程序审核较严格，工具类应用一般可以通过。如果不需要让陌生人使用，只用体验版即可。

---

## 五、给家人使用

### 方式一：体验版（推荐，最简单）

1. 微信公众平台 → 管理 → 成员管理 → 添加「体验成员」
2. 输入家人的微信号（不是微信名，是设置里的微信号）
3. 家人微信会收到确认通知，同意后即可
4. 家人打开体验版二维码或在「发现 → 小程序 → 我的小程序」中找到

> 个人主体小程序最多可添加 **15 个体验成员**。

### 方式二：正式发布

审核通过并发布后，家人直接微信搜索小程序名字即可使用。

### 家人首次使用流程

1. 打开小程序 → 自动跳转角色选择
2. 选择角色（爸爸/妈妈/爷爷/奶奶等）
3. 填写微信昵称 → 确认
4. 进入首页即可开始记录

所有家庭成员的数据自动共享（基于同一个云开发环境），每条记录会标记是谁录入的。

### 共享配置

在「我的」→「喂养配置」中设置的默认奶量和喂奶间隔阈值是**全家共享**的，任何成员修改后所有人生效。

---

## 六、常见问题

### Q: 语音识别没反应 / 报错

- 确认已部署 `speechToText` 云函数
- 确认 `cloudfunctions/speechToText/secret.js` 中的密钥正确
- 确认腾讯云控制台已开通「语音识别」服务
- 查看云函数日志排查具体错误

### Q: 说了一句话但没有正确解析

- 确认已部署 `parseRecord` 云函数
- 确认 `cloudfunctions/parseRecord/secret.js` 中的 API Key 正确
- 确认 DeepSeek 账户有余额
- 即使 AI 解析失败，本地正则引擎会兜底解析基础内容
- 如果刚改过语音规则（如洗澡、延迟喂奶），需要重新部署 `parseRecord` 后云端才会按新规则解析

### Q: 进入小程序白屏

- 确认 `miniprogram/config.js` 存在且环境 ID 正确
- 确认云开发已开通
- 确认数据库集合已创建且权限为"所有用户可读写"

### Q: 添加体验成员提示"超出限制"

- 个人主体小程序最多 15 个体验成员
- 可以考虑提交审核发布正式版

### Q: 换手机后数据还在吗？

- 数据存储在云端，只要用同一个微信号登录就能看到所有数据

### Q: 多个宝宝怎么办？

- 当前版本只支持一个宝宝。如需多宝宝支持，可以创建多个云开发环境各自独立运行。

---

## 费用参考

| 服务 | 免费额度 | 超出后费用 |
|------|----------|-----------|
| 微信云开发 | 基础版免费（存储1GB/流量5GB/云函数4万次） | 按用量计费 |
| 腾讯云语音识别 | 每月免费额度（具体见官网） | ¥0.006/次 左右 |
| DeepSeek API | 无免费额度，需充值 | 约 ¥0.001/次 |

正常家庭使用（每天记录 10-20 条），一个月成本在 **1 元以内**。

---

## 项目结构速览

```
baby-feeding-tracker/
├── miniprogram/
│   ├── config.js              ← 你的云环境ID（从 config.example.js 复制）
│   ├── app.js                 ← 入口
│   ├── utils/db.js            ← 数据库操作封装
│   ├── utils/voice-parser.js  ← 语音解析引擎
│   ├── utils/growth-standard.js ← 生长页 WHO LMS 百分位计算
│   ├── components/voice-input/ ← 语音输入组件
│   ├── components/top-nav/    ← 自定义顶部标题栏
│   └── pages/                 ← 各页面
├── cloudfunctions/
│   ├── speechToText/
│   │   ├── secret.js          ← 你的腾讯云密钥（从 secret.example.js 复制）
│   │   └── index.js
│   ├── parseRecord/
│   │   ├── secret.js          ← 你的 DeepSeek Key（从 secret.example.js 复制）
│   │   └── index.js
│   └── familyManage/          ← 家庭成员管理
├── tests/                     ← 本地测试脚本
├── .gitignore                 ← 已排除密钥文件
└── project.config.json        ← 修改其中的 appid
```
