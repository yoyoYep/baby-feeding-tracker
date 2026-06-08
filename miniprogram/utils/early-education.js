const DEFAULT_LIMIT = 2
const POST_FEEDING_REST_MINUTES = 30
const FEEDING_SOON_MINUTES = 30

const SOURCE_LABELS = {
  cdc: 'CDC发育里程碑',
  who: 'WHO婴幼儿活动建议'
}

const REST_SUGGESTION = {
  id: 'rest_when_sleeping',
  title: '先让宝宝睡够',
  text: '宝宝睡着时先不安排早教，醒后再从轻声说话或看绘本开始。',
  reason: '睡眠本身就是重要发育支持。',
  durationText: '醒后2-5分钟',
  intensity: 'rest',
  sourceText: '参考CDC发育里程碑'
}

const EARLY_EDUCATION_LIBRARY = [
  {
    id: 'face_talk_0_3',
    title: '面对面说话',
    ageMinMonths: 0,
    ageMaxMonths: 3.5,
    domain: ['language', 'social'],
    intensity: 'quiet',
    durationMin: 2,
    durationMax: 5,
    suitableWhen: ['awake_calm', 'post_feeding', 'quiet_window', 'just_woke'],
    avoidWhen: ['ongoing_sleep'],
    text: '抱着宝宝或让宝宝仰卧，距离脸约20-30厘米，轻声说话、微笑，等宝宝发声后模仿回应。',
    reason: '适合练习看脸、听声音和早期互动。',
    sources: ['cdc']
  },
  {
    id: 'soft_song_0_4',
    title: '轻声儿歌',
    ageMinMonths: 0,
    ageMaxMonths: 4.5,
    domain: ['language', 'emotion'],
    intensity: 'quiet',
    durationMin: 2,
    durationMax: 5,
    suitableWhen: ['awake_calm', 'quiet_window', 'long_awake', 'post_feeding'],
    avoidWhen: ['ongoing_sleep'],
    text: '用平稳的声音唱一小段儿歌，观察宝宝是否看向你、放松或发声回应。',
    reason: '低刺激互动适合刚醒、刚喝完奶或准备安静下来时。',
    sources: ['cdc']
  },
  {
    id: 'high_contrast_0_4',
    title: '看黑白卡',
    ageMinMonths: 0,
    ageMaxMonths: 4.5,
    domain: ['vision'],
    intensity: 'quiet',
    durationMin: 1,
    durationMax: 3,
    suitableWhen: ['awake_calm', 'just_woke', 'quiet_window'],
    avoidWhen: ['ongoing_sleep'],
    text: '把高对比卡片放在宝宝视线前方，慢慢左右移动，看到宝宝转头或移开视线就暂停。',
    reason: '短时间追视能练习视觉关注，不需要大动作。',
    sources: ['cdc']
  },
  {
    id: 'sound_tracking_0_4',
    title: '听声找方向',
    ageMinMonths: 0,
    ageMaxMonths: 4.5,
    domain: ['hearing', 'cognitive'],
    intensity: 'quiet',
    durationMin: 1,
    durationMax: 3,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy'],
    text: '在宝宝头侧轻轻摇响安全摇铃，等宝宝寻找声音，再换到另一侧。',
    reason: '帮助练习听觉定位和注意力。',
    sources: ['cdc']
  },
  {
    id: 'tummy_time_0_6',
    title: '短时趴玩',
    ageMinMonths: 0,
    ageMaxMonths: 6.5,
    domain: ['motor'],
    intensity: 'medium',
    durationMin: 1,
    durationMax: 5,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'ongoing_feeding', 'within_30min_after_feeding', 'feeding_soon', 'sleepy', 'unwell'],
    text: '清醒且有人看护时，把宝宝放在地垫上短时间趴玩，前方放脸或玩具吸引抬头。',
    reason: '有助于练习颈背力量和大运动发展。',
    sources: ['who', 'cdc']
  },
  {
    id: 'mirror_face_2_6',
    title: '照镜子看脸',
    ageMinMonths: 2,
    ageMaxMonths: 6.5,
    domain: ['social', 'vision'],
    intensity: 'quiet',
    durationMin: 2,
    durationMax: 5,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep'],
    text: '把安全镜子放在宝宝面前，指给宝宝看脸、眼睛和嘴巴，配合微笑和轻声描述。',
    reason: '适合练习看脸和社交回应。',
    sources: ['cdc']
  },
  {
    id: 'reach_grasp_3_7',
    title: '伸手抓玩具',
    ageMinMonths: 3,
    ageMaxMonths: 7.5,
    domain: ['fine_motor'],
    intensity: 'medium',
    durationMin: 3,
    durationMax: 6,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'ongoing_feeding', 'sleepy', 'unwell'],
    text: '把轻软安全玩具放在宝宝胸前或身体一侧，等宝宝伸手碰、抓或拍打。',
    reason: '帮助练习手眼协调和抓握。',
    sources: ['cdc']
  },
  {
    id: 'roll_side_4_8',
    title: '侧身翻滚辅助',
    ageMinMonths: 4,
    ageMaxMonths: 8.5,
    domain: ['motor'],
    intensity: 'medium',
    durationMin: 2,
    durationMax: 5,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'ongoing_feeding', 'within_30min_after_feeding', 'feeding_soon', 'sleepy', 'unwell'],
    text: '用玩具吸引宝宝向一侧转头和伸手，轻轻辅助侧身，不强行翻身。',
    reason: '适合练习身体转动和躯干控制。',
    sources: ['cdc']
  },
  {
    id: 'call_name_4_9',
    title: '叫名字回应',
    ageMinMonths: 4,
    ageMaxMonths: 9.5,
    domain: ['language', 'social'],
    intensity: 'quiet',
    durationMin: 2,
    durationMax: 4,
    suitableWhen: ['awake_calm', 'awake_active', 'quiet_window'],
    avoidWhen: ['ongoing_sleep'],
    text: '在宝宝旁边温柔叫名字，等宝宝看过来后微笑回应，再换一个方向试一次。',
    reason: '帮助宝宝把声音、名字和照护者联系起来。',
    sources: ['cdc']
  },
  {
    id: 'texture_touch_4_10',
    title: '摸不同材质',
    ageMinMonths: 4,
    ageMaxMonths: 10.5,
    domain: ['sensory', 'fine_motor'],
    intensity: 'quiet',
    durationMin: 3,
    durationMax: 5,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy'],
    text: '准备柔软布巾、硅胶牙胶等安全物品，让宝宝摸一摸，家长同步说“软软的、凉凉的”。',
    reason: '安全触摸能丰富感官体验和词语输入。',
    sources: ['cdc']
  },
  {
    id: 'cloth_book_4_12',
    title: '翻布书',
    ageMinMonths: 4,
    ageMaxMonths: 12.5,
    domain: ['language', 'cognitive'],
    intensity: 'quiet',
    durationMin: 3,
    durationMax: 6,
    suitableWhen: ['awake_calm', 'quiet_window', 'long_awake', 'post_feeding'],
    avoidWhen: ['ongoing_sleep'],
    text: '一起看布书或硬纸板书，指着图案说名称，宝宝想抓、拍、咬时也可以探索。',
    reason: '阅读和讲述适合低刺激陪伴。',
    sources: ['cdc', 'who']
  },
  {
    id: 'object_transfer_6_10',
    title: '双手传物',
    ageMinMonths: 6,
    ageMaxMonths: 10.5,
    domain: ['fine_motor'],
    intensity: 'medium',
    durationMin: 3,
    durationMax: 6,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'ongoing_feeding', 'sleepy', 'unwell'],
    text: '递一个容易抓握的玩具，等宝宝从一只手换到另一只手，再换一个不同形状的玩具。',
    reason: '练习双手协调和物品探索。',
    sources: ['cdc']
  },
  {
    id: 'peekaboo_6_12',
    title: '躲猫猫',
    ageMinMonths: 6,
    ageMaxMonths: 12.5,
    domain: ['social', 'cognitive'],
    intensity: 'quiet',
    durationMin: 2,
    durationMax: 5,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy'],
    text: '用手或小布巾遮住脸，再露出来说“找到啦”，观察宝宝是否笑、看或模仿。',
    reason: '帮助练习社交回应和物体仍然存在的概念。',
    sources: ['cdc']
  },
  {
    id: 'crawl_reach_7_12',
    title: '够玩具前进',
    ageMinMonths: 7,
    ageMaxMonths: 12.5,
    domain: ['motor'],
    intensity: 'medium',
    durationMin: 3,
    durationMax: 8,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'ongoing_feeding', 'within_30min_after_feeding', 'feeding_soon', 'sleepy', 'unwell'],
    text: '把喜欢的玩具放在宝宝前方一点点，鼓励宝宝转身、挪动或爬过去拿。',
    reason: '适合练习移动和空间探索。',
    sources: ['cdc', 'who']
  },
  {
    id: 'clap_wave_8_14',
    title: '拍手和挥手',
    ageMinMonths: 8,
    ageMaxMonths: 14.5,
    domain: ['social', 'fine_motor'],
    intensity: 'quiet',
    durationMin: 2,
    durationMax: 5,
    suitableWhen: ['awake_calm', 'awake_active', 'quiet_window'],
    avoidWhen: ['ongoing_sleep'],
    text: '家长示范拍手、挥手和说“拜拜”，等宝宝看、笑或尝试模仿。',
    reason: '练习模仿、社交动作和手部控制。',
    sources: ['cdc']
  },
  {
    id: 'container_play_9_15',
    title: '放进拿出',
    ageMinMonths: 9,
    ageMaxMonths: 15.5,
    domain: ['cognitive', 'fine_motor'],
    intensity: 'medium',
    durationMin: 4,
    durationMax: 8,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy', 'unwell'],
    text: '用大口盒子和安全积木，示范把东西放进去、拿出来，再让宝宝自己试。',
    reason: '帮助理解容器关系和手部操作。',
    sources: ['cdc']
  },
  {
    id: 'supported_stand_9_15',
    title: '扶站拿玩具',
    ageMinMonths: 9,
    ageMaxMonths: 15.5,
    domain: ['motor'],
    intensity: 'medium',
    durationMin: 2,
    durationMax: 5,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'ongoing_feeding', 'within_30min_after_feeding', 'feeding_soon', 'sleepy', 'unwell'],
    text: '在稳定家具旁陪宝宝扶站，把玩具放在安全高度让宝宝伸手拿，家长全程保护。',
    reason: '适合练习站立平衡和身体控制。',
    sources: ['cdc']
  },
  {
    id: 'picture_point_9_18',
    title: '指图说物',
    ageMinMonths: 9,
    ageMaxMonths: 18.5,
    domain: ['language', 'cognitive'],
    intensity: 'quiet',
    durationMin: 3,
    durationMax: 6,
    suitableWhen: ['awake_calm', 'quiet_window', 'long_awake', 'post_feeding'],
    avoidWhen: ['ongoing_sleep'],
    text: '看绘本时指着常见物品说名称，比如“球、杯子、猫”，等宝宝看或指。',
    reason: '帮助建立词语和物品之间的联系。',
    sources: ['cdc', 'who']
  },
  {
    id: 'simple_instruction_12_20',
    title: '听简单指令',
    ageMinMonths: 12,
    ageMaxMonths: 20.5,
    domain: ['language', 'cognitive'],
    intensity: 'quiet',
    durationMin: 3,
    durationMax: 6,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy'],
    text: '用一个短指令玩游戏，比如“把球给妈妈”“拍拍手”，完成后马上微笑回应。',
    reason: '练习理解语言和轮流互动。',
    sources: ['cdc']
  },
  {
    id: 'cup_stack_12_24',
    title: '叠杯子',
    ageMinMonths: 12,
    ageMaxMonths: 24.5,
    domain: ['fine_motor', 'cognitive'],
    intensity: 'medium',
    durationMin: 4,
    durationMax: 8,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy', 'unwell'],
    text: '准备大小杯或软积木，示范叠高、推倒、再叠一次，让宝宝自己操作。',
    reason: '练习手眼协调、因果关系和解决问题。',
    sources: ['cdc']
  },
  {
    id: 'ball_roll_12_24',
    title: '滚球来回',
    ageMinMonths: 12,
    ageMaxMonths: 24.5,
    domain: ['motor', 'social'],
    intensity: 'medium',
    durationMin: 3,
    durationMax: 8,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'within_30min_after_feeding', 'feeding_soon', 'sleepy', 'unwell'],
    text: '和宝宝面对面坐着，把软球滚过去，等宝宝推回来，边玩边说“轮到你”。',
    reason: '练习轮流互动和大动作控制。',
    sources: ['cdc', 'who']
  },
  {
    id: 'crayon_marks_15_30',
    title: '蜡笔涂鸦',
    ageMinMonths: 15,
    ageMaxMonths: 30.5,
    domain: ['fine_motor', 'cognitive'],
    intensity: 'quiet',
    durationMin: 4,
    durationMax: 8,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy'],
    text: '给粗蜡笔和大纸，示范画线或点点，重点是让宝宝尝试抓握和留下痕迹。',
    reason: '练习手部控制和创造性表达。',
    sources: ['cdc']
  },
  {
    id: 'pretend_play_18_36',
    title: '假装照顾娃娃',
    ageMinMonths: 18,
    ageMaxMonths: 36.5,
    domain: ['social', 'cognitive'],
    intensity: 'quiet',
    durationMin: 5,
    durationMax: 10,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy'],
    text: '用娃娃或玩偶做“喂饭、盖被子、拍拍睡觉”的假装游戏，家长配合简单描述。',
    reason: '练习模仿、想象和社交理解。',
    sources: ['cdc']
  },
  {
    id: 'sort_big_small_18_36',
    title: '大小分类',
    ageMinMonths: 18,
    ageMaxMonths: 36.5,
    domain: ['cognitive'],
    intensity: 'quiet',
    durationMin: 5,
    durationMax: 8,
    suitableWhen: ['awake_calm', 'awake_active'],
    avoidWhen: ['ongoing_sleep', 'sleepy'],
    text: '拿两三个大小明显不同的安全物品，说“大球、小球”，请宝宝帮忙放到一起。',
    reason: '帮助练习比较、分类和词语理解。',
    sources: ['cdc']
  },
  {
    id: 'body_parts_18_36',
    title: '找身体部位',
    ageMinMonths: 18,
    ageMaxMonths: 36.5,
    domain: ['language', 'social'],
    intensity: 'quiet',
    durationMin: 3,
    durationMax: 6,
    suitableWhen: ['awake_calm', 'quiet_window'],
    avoidWhen: ['ongoing_sleep'],
    text: '边说边指出“鼻子、耳朵、肚子”，再问宝宝“鼻子在哪里”。',
    reason: '适合低刺激地练习词语理解和身体认知。',
    sources: ['cdc']
  },
  {
    id: 'music_move_18_36',
    title: '跟音乐动一动',
    ageMinMonths: 18,
    ageMaxMonths: 36.5,
    domain: ['motor', 'social'],
    intensity: 'medium',
    durationMin: 3,
    durationMax: 6,
    suitableWhen: ['awake_active'],
    avoidWhen: ['ongoing_sleep', 'within_30min_after_feeding', 'feeding_soon', 'sleepy', 'unwell'],
    text: '放一小段轻快音乐，牵手踏步、拍手或转圈，动作保持温和。',
    reason: '练习节奏、模仿和身体协调。',
    sources: ['who', 'cdc']
  }
]

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getAgeMonths(context = {}) {
  const direct = toFiniteNumber(context.ageMonths != null ? context.ageMonths : context.babyAgeMonths)
  if (direct !== null) return Math.max(0, direct)

  const birth = parseDate(context.birthday)
  const now = parseDate(context.now) || new Date()
  if (!birth || birth.getTime() > now.getTime()) return null
  return Math.max(0, (now.getTime() - birth.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
}

function getSoftWakeWindowMinutes(ageMonths) {
  if (ageMonths === null) return 120
  if (ageMonths < 3) return 90
  if (ageMonths < 6) return 120
  if (ageMonths < 9) return 150
  if (ageMonths < 12) return 180
  if (ageMonths < 18) return 240
  return 300
}

function buildStateTags(context = {}) {
  const ageMonths = getAgeMonths(context)
  const tags = {}
  const ongoingType = context.ongoingType || (context.ongoing && context.ongoing.type) || ''
  const lastFeedingEndMinAgo = toFiniteNumber(
    context.lastFeedingEndMinAgo != null ? context.lastFeedingEndMinAgo : context.lastFeedingMinAgo
  )
  const nextPlannedMinutesFromNow = toFiniteNumber(context.nextPlannedMinutesFromNow)
  const lastSleepEndMinAgo = toFiniteNumber(
    context.lastSleepEndMinAgo != null ? context.lastSleepEndMinAgo : context.awakeSinceLastSleepMin
  )
  const highTemperature = toFiniteNumber(context.highestTempC)
  const unwell = context.unwell === true || context.hasFever === true || (highTemperature !== null && highTemperature >= 37.5)

  if (ongoingType === 'sleep') tags.ongoing_sleep = true
  if (ongoingType === 'feeding') {
    tags.ongoing_feeding = true
    tags.within_30min_after_feeding = true
    tags.post_feeding = true
    tags.quiet_window = true
  }

  if (lastFeedingEndMinAgo !== null && lastFeedingEndMinAgo >= 0) {
    if (lastFeedingEndMinAgo < POST_FEEDING_REST_MINUTES) {
      tags.within_30min_after_feeding = true
      tags.quiet_window = true
    }
    if (lastFeedingEndMinAgo < 60) tags.post_feeding = true
  }

  if (nextPlannedMinutesFromNow !== null && nextPlannedMinutesFromNow >= 0 && nextPlannedMinutesFromNow <= FEEDING_SOON_MINUTES) {
    tags.feeding_soon = true
    tags.quiet_window = true
  }

  if (unwell) {
    tags.unwell = true
    tags.quiet_window = true
  }

  if (lastSleepEndMinAgo !== null && lastSleepEndMinAgo >= 0) {
    if (lastSleepEndMinAgo < 20) tags.just_woke = true
    if (lastSleepEndMinAgo >= getSoftWakeWindowMinutes(ageMonths)) {
      tags.long_awake = true
      tags.sleepy = true
      tags.quiet_window = true
    }
  }

  if (!tags.ongoing_sleep && !tags.ongoing_feeding) {
    tags.awake_calm = true
    if (!tags.quiet_window && !tags.sleepy) tags.awake_active = true
  }

  return tags
}

function isAgeMatched(item, ageMonths) {
  if (ageMonths === null) return item.ageMinMonths <= 6
  return ageMonths >= item.ageMinMonths && ageMonths <= item.ageMaxMonths
}

function hasAnyTag(list = [], tags = {}) {
  return list.some(tag => tags[tag])
}

function scoreItem(item, tags, ageMonths) {
  let score = 0
  let matchedState = false
  let stateScore = 0

  ;(item.suitableWhen || []).forEach(tag => {
    if (tags[tag]) {
      matchedState = true
      stateScore += 8
    }
  })
  score += Math.min(stateScore, 12)
  if (!matchedState) score -= 2

  if (tags.quiet_window && item.intensity === 'quiet') score += 6
  if (tags.awake_active && item.intensity === 'medium') score += 5
  if ((tags.long_awake || tags.sleepy) && item.intensity === 'quiet') score += 5
  if (tags.just_woke && item.intensity === 'quiet') score += 3
  if (tags.unwell && item.intensity === 'quiet') score += 6

  if (ageMonths !== null) {
    const center = (item.ageMinMonths + item.ageMaxMonths) / 2
    const range = Math.max(1, item.ageMaxMonths - item.ageMinMonths)
    score += Math.max(0, 4 - Math.abs(ageMonths - center) / range * 4)
  }

  return score
}

function sourceText(sources = []) {
  const labels = sources.map(source => SOURCE_LABELS[source]).filter(Boolean)
  return labels.length ? `参考${labels.join('、')}` : ''
}

function formatSuggestion(item) {
  return {
    id: item.id,
    title: item.title,
    text: item.text,
    reason: item.reason,
    durationText: `${item.durationMin}-${item.durationMax}分钟`,
    intensity: item.intensity,
    sourceText: sourceText(item.sources),
    domains: item.domain || []
  }
}

function getEarlyEducationSuggestions(context = {}, options = {}) {
  const limit = Math.max(1, options.limit || DEFAULT_LIMIT)
  const ageMonths = getAgeMonths(context)
  const tags = buildStateTags(context)

  if (tags.ongoing_sleep) {
    return [REST_SUGGESTION].slice(0, limit)
  }

  const suggestions = EARLY_EDUCATION_LIBRARY
    .filter(item => isAgeMatched(item, ageMonths))
    .filter(item => !hasAnyTag(item.avoidWhen, tags))
    .map(item => ({ item, score: scoreItem(item, tags, ageMonths) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.item.id.localeCompare(b.item.id)
    })
    .slice(0, limit)
    .map(entry => formatSuggestion(entry.item))

  if (suggestions.length) return suggestions

  return [formatSuggestion(EARLY_EDUCATION_LIBRARY[0])].slice(0, limit)
}

function getPrimaryEarlyEducationSuggestion(context = {}) {
  return getEarlyEducationSuggestions(context, { limit: 1 })[0] || null
}

module.exports = {
  EARLY_EDUCATION_LIBRARY,
  buildStateTags,
  getAgeMonths,
  getEarlyEducationSuggestions,
  getPrimaryEarlyEducationSuggestion
}
