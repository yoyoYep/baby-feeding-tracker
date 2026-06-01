let db = null
let _ = null
const { normalizeFeedingPlanConfig, getLogicalDayStart } = require('./feeding-plan')
const {
  getRecordTimeRange,
  findSameTypeOverlap,
  createRecordOverlapError,
  isRecordOverlapError,
  getRecordOverlapErrorContent
} = require('./record-overlap')

function getDb() {
  if (!db && getApp().globalData.cloudReady) {
    try {
      db = wx.cloud.database()
      _ = db.command
    } catch (e) {}
  }
  return db
}

function isCloudReady() {
  return !!getDb() && getApp().globalData.cloudReady
}

async function ensureCloud() {
  const app = getApp()
  if (!app.globalData.cloudReady && app.globalData.cloudReadyPromise) {
    await app.globalData.cloudReadyPromise
  }
  return isCloudReady()
}

const COLLECTION = {
  RECORDS: 'records',
  BABY: 'baby',
  MED_HISTORY: 'med_history',
  CONFIG: 'config',
  TODOS: 'todos'
}

const STORAGE_KEYS = {
  RECORDS: 'local_records',
  BABY: 'local_baby',
  MED_HISTORY: 'local_med_history',
  CONFIG: 'local_config',
  TODOS: 'local_todos'
}

function getLocalRecords() {
  return wx.getStorageSync(STORAGE_KEYS.RECORDS) || []
}

function saveLocalRecords(records) {
  wx.setStorageSync(STORAGE_KEYS.RECORDS, records)
}

function getLocalTodos() {
  return wx.getStorageSync(STORAGE_KEYS.TODOS) || []
}

function saveLocalTodos(todos) {
  wx.setStorageSync(STORAGE_KEYS.TODOS, todos)
}

function cleanTodoForCloud(todo) {
  const data = { ...todo }
  delete data._id
  delete data._cloudSynced
  return data
}

async function migrateLocalTodosToCloud() {
  const localTodos = getLocalTodos()
  const pending = localTodos.filter(todo => todo && todo._id && !todo._cloudSynced)
  if (!pending.length || !db) return false

  let changed = false
  for (const todo of pending) {
    try {
      await db.collection(COLLECTION.TODOS).doc(todo._id).set({
        data: {
          ...cleanTodoForCloud(todo),
          migratedFromLocal: true,
          updatedAt: db.serverDate()
        }
      })
      todo._cloudSynced = true
      changed = true
    } catch (e) {
      console.warn('本地待办迁移到云端失败', todo._id, e)
    }
  }

  if (changed) {
    saveLocalTodos(localTodos)
  }
  return changed
}

function getTodayRange(dayStartHour) {
  const now = new Date()
  if (dayStartHour == null) {
    const app = getApp()
    const config = (app && app.globalData && app.globalData.config) || {}
    dayStartHour = normalizeFeedingPlanConfig(config).feedingDayStartHour
  }
  const start = getLogicalDayStart(now, dayStartHour)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

function getRecordEndTime(record) {
  const start = new Date(record.startTime)
  if (Number.isNaN(start.getTime())) return null

  const explicitEnd = record.endTime ? new Date(record.endTime) : null
  if (explicitEnd && !Number.isNaN(explicitEnd.getTime()) && explicitEnd.getTime() > start.getTime()) {
    return explicitEnd
  }

  if (record.status === 'ongoing') {
    return new Date()
  }

  if ((record.type === 'bath' || record.type === 'feeding' || record.type === 'sleep') && record.data && record.data.duration) {
    const minutes = parseInt(record.data.duration, 10)
    if (minutes > 0) return new Date(start.getTime() + minutes * 60000)
  }

  return start
}

function recordOverlapsRange(record, startDate, endDate) {
  const start = new Date(record.startTime)
  const end = getRecordEndTime(record)
  if (Number.isNaN(start.getTime()) || !end) return false

  const startMs = start.getTime()
  const endMs = end.getTime()
  const rangeStartMs = startDate.getTime()
  const rangeEndMs = endDate.getTime()

  if (endMs === startMs) {
    return startMs >= rangeStartMs && startMs < rangeEndMs
  }

  return startMs < rangeEndMs && endMs > rangeStartMs
}

function mergeRecords(primary = [], fallback = []) {
  const seen = {}
  const merged = []
  primary.concat(fallback).forEach(record => {
    if (!record) return
    const key = record._id || `${record.type}_${record.startTime}_${record.endTime || ''}`
    if (seen[key]) return
    seen[key] = true
    merged.push(record)
  })
  return merged
}

function filterRecordsByStartRange(records, startDate, endDate) {
  return (records || [])
    .filter(r => {
      const t = new Date(r.startTime).getTime()
      return t >= startDate.getTime() && t < endDate.getTime()
    })
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
}

function filterRecordsByOverlap(records, startDate, endDate, limit) {
  return (records || [])
    .filter(r => recordOverlapsRange(r, startDate, endDate))
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .slice(0, limit)
}

function toTimestamp(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getConfigTimestamp(config) {
  if (!config) return 0
  return toTimestamp(config.savedAt) || toTimestamp(config.updatedAt) || toTimestamp(config.createdAt)
}

function pickLatestConfig(configs = []) {
  const valid = configs.filter(Boolean)
  if (!valid.length) return null
  return valid
    .map((config, index) => ({ config, index, ts: getConfigTimestamp(config) }))
    .sort((a, b) => b.ts - a.ts || b.index - a.index)[0].config
}

function cleanConfigForCloud(config) {
  const data = { ...config }
  delete data._id
  delete data._openid
  return data
}

function saveToLocal(data) {
  const records = getLocalRecords()
  const newRecord = {
    ...data,
    _id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    createdAt: new Date(),
    updatedAt: new Date()
  }
  records.unshift(newRecord)
  saveLocalRecords(records)
  return { _id: newRecord._id }
}

async function getRecordForValidation(id) {
  if (!id) return null

  if (await ensureCloud() && !id.startsWith('local_')) {
    try {
      const res = await db.collection(COLLECTION.RECORDS).doc(id).get()
      if (res && res.data) return res.data
    } catch (e) {
      console.warn('重叠校验读取云端记录失败，尝试本地记录', e)
    }
  }

  return getLocalRecords().find(r => r._id === id) || null
}

async function getRecordsForOverlapValidation(range) {
  const paddingMs = 2 * 86400000
  const startDate = new Date(range.start.getTime() - paddingMs)
  const endDate = new Date(Math.max(range.start.getTime(), range.end.getTime()) + paddingMs)
  const limit = 300

  if (await ensureCloud()) {
    try {
      const primaryPromise = db.collection(COLLECTION.RECORDS)
        .where({
          startTime: _.gte(startDate).and(_.lt(endDate))
        })
        .orderBy('startTime', 'desc')
        .limit(limit)
        .get()
      const fallbackPromise = db.collection(COLLECTION.RECORDS)
        .orderBy('startTime', 'desc')
        .limit(limit)
        .get()

      const results = await Promise.all([
        primaryPromise.catch(() => ({ data: [] })),
        fallbackPromise.catch(() => ({ data: [] }))
      ])
      return filterRecordsByOverlap(mergeRecords(results[0].data || [], results[1].data || []), startDate, endDate, limit)
    } catch (e) {
      console.warn('重叠校验云端查询失败，尝试本地记录', e)
    }
  }

  return filterRecordsByOverlap(getLocalRecords(), startDate, endDate, limit)
}

async function validateNoRecordTimeOverlap(record, excludeId) {
  const range = getRecordTimeRange(record)
  if (!range) return

  const records = await getRecordsForOverlapValidation(range)
  const conflict = findSameTypeOverlap(record, records, { excludeId })
  if (conflict) {
    throw createRecordOverlapError(record, conflict)
  }
}

module.exports = {
  async getRecordById(id) {
    if (await ensureCloud() && !id.startsWith('local_')) {
      try {
        const res = await db.collection(COLLECTION.RECORDS).doc(id).get()
        return { data: res.data }
      } catch (e) {
        console.warn('云端查询失败', e)
      }
    }
    const records = getLocalRecords()
    const record = records.find(r => r._id === id)
    return { data: record || null }
  },

  async addRecord(data) {
    await validateNoRecordTimeOverlap(data)

    const member = getApp().globalData.currentMember
    const recordedBy = member ? { role: member.role, nickname: member.nickname } : null

    if (await ensureCloud()) {
      try {
        return await db.collection(COLLECTION.RECORDS).add({
          data: {
            ...data,
            recordedBy,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
      } catch (e) {
        console.warn('云端写入失败，降级到本地存储', e)
      }
    }
    return saveToLocal({ ...data, recordedBy })
  },

  async updateRecord(id, data) {
    const currentRecord = await getRecordForValidation(id)
    const mergedRecord = currentRecord ? { ...currentRecord, ...data } : data
    await validateNoRecordTimeOverlap(mergedRecord, id)

    if (await ensureCloud() && !id.startsWith('local_')) {
      try {
        return await db.collection(COLLECTION.RECORDS).doc(id).update({
          data: { ...data, updatedAt: db.serverDate() }
        })
      } catch (e) {
        console.warn('云端更新失败，降级到本地存储', e)
      }
    }
    const records = getLocalRecords()
    const idx = records.findIndex(r => r._id === id)
    if (idx >= 0) {
      records[idx] = { ...records[idx], ...data, updatedAt: new Date() }
      saveLocalRecords(records)
    }
    return {}
  },

  async deleteRecord(id) {
    if (await ensureCloud() && !id.startsWith('local_')) {
      try {
        return await db.collection(COLLECTION.RECORDS).doc(id).remove()
      } catch (e) {
        console.warn('云端删除失败，降级到本地存储', e)
      }
    }
    const records = getLocalRecords().filter(r => r._id !== id)
    saveLocalRecords(records)
    return {}
  },

  async getTodos() {
    if (await ensureCloud()) {
      try {
        let res = await db.collection(COLLECTION.TODOS)
          .orderBy('time', 'asc')
          .limit(200)
          .get()
        const migrated = await migrateLocalTodosToCloud()
        if (migrated) {
          res = await db.collection(COLLECTION.TODOS)
            .orderBy('time', 'asc')
            .limit(200)
            .get()
        }
        return res
      } catch (e) {
        console.warn('云端查询待办失败，降级到本地存储', e)
      }
    }
    const todos = getLocalTodos().sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    return { data: todos }
  },

  async getTodoById(id) {
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.TODOS).doc(id).get()
        return { data: res.data }
      } catch (e) {
        console.warn('云端查询待办失败，降级到本地存储', e)
      }
    }
    const todo = getLocalTodos().find(t => t._id === id)
    return { data: todo || null }
  },

  async addTodo(data) {
    const todoData = {
      ...data,
      enabled: data.enabled !== false
    }
    if (await ensureCloud()) {
      try {
        return await db.collection(COLLECTION.TODOS).add({
          data: {
            ...todoData,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
      } catch (e) {
        console.warn('云端新增待办失败，降级到本地存储', e)
      }
    }
    const todos = getLocalTodos()
    const newTodo = {
      ...todoData,
      _id: 'local_todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      createdAt: new Date(),
      updatedAt: new Date()
    }
    todos.unshift(newTodo)
    saveLocalTodos(todos)
    return { _id: newTodo._id }
  },

  async updateTodo(id, data) {
    if (await ensureCloud()) {
      try {
        const result = await db.collection(COLLECTION.TODOS).doc(id).update({
          data: { ...data, updatedAt: db.serverDate() }
        })
        const todos = getLocalTodos()
        const idx = todos.findIndex(t => t._id === id)
        if (idx >= 0) {
          todos[idx] = { ...todos[idx], ...data, _cloudSynced: true, updatedAt: new Date() }
          saveLocalTodos(todos)
        }
        return result
      } catch (e) {
        console.warn('云端更新待办失败，降级到本地存储', e)
      }
    }
    const todos = getLocalTodos()
    const idx = todos.findIndex(t => t._id === id)
    if (idx >= 0) {
      todos[idx] = { ...todos[idx], ...data, updatedAt: new Date() }
      saveLocalTodos(todos)
    }
    return {}
  },

  async deleteTodo(id) {
    if (await ensureCloud()) {
      try {
        const result = await db.collection(COLLECTION.TODOS).doc(id).remove()
        saveLocalTodos(getLocalTodos().filter(t => t._id !== id))
        return result
      } catch (e) {
        console.warn('云端删除待办失败，降级到本地存储', e)
      }
    }
    saveLocalTodos(getLocalTodos().filter(t => t._id !== id))
    return {}
  },

  async getTodayRecords() {
    if (await ensureCloud()) {
      try {
        const { start, end } = getTodayRange()
        const res = await db.collection(COLLECTION.RECORDS)
          .where({
            startTime: _.gte(start).and(_.lt(end))
          })
          .orderBy('startTime', 'desc')
          .limit(100)
          .get()
        return res
      } catch (e) {
        console.warn('云端where查询失败，尝试降级查询', e)
        try {
          const { start, end } = getTodayRange()
          const res = await db.collection(COLLECTION.RECORDS)
            .orderBy('startTime', 'desc')
            .limit(100)
            .get()
          res.data = res.data.filter(r => {
            const t = new Date(r.startTime).getTime()
            return t >= start.getTime() && t < end.getTime()
          })
          return res
        } catch (e2) {
          console.warn('云端查询全部失败，降级到本地存储', e2)
        }
      }
    }
    const { start, end } = getTodayRange()
    const records = getLocalRecords().filter(r => {
      const t = new Date(r.startTime).getTime()
      return t >= start.getTime() && t < end.getTime()
    })
    records.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    return { data: records }
  },

  async getRecordsByDateRange(startDate, endDate) {
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.RECORDS)
          .where({
            startTime: _.gte(startDate).and(_.lt(endDate))
          })
          .orderBy('startTime', 'desc')
          .limit(100)
          .get()
        try {
          const fallback = await db.collection(COLLECTION.RECORDS)
            .orderBy('startTime', 'desc')
            .limit(100)
            .get()
          res.data = filterRecordsByStartRange(mergeRecords(res.data || [], fallback.data || []), startDate, endDate)
        } catch (fallbackErr) {
          console.warn('云端日期范围补充查询失败，仅使用where结果', fallbackErr)
        }
        return res
      } catch (e) {
        console.warn('云端where查询失败，尝试降级查询', e)
        try {
          const res = await db.collection(COLLECTION.RECORDS)
            .orderBy('startTime', 'desc')
            .limit(100)
            .get()
          res.data = filterRecordsByStartRange(res.data || [], startDate, endDate)
          return res
        } catch (e2) {
          console.warn('云端查询全部失败，降级到本地存储', e2)
        }
      }
    }
    const records = filterRecordsByStartRange(getLocalRecords(), startDate, endDate)
    return { data: records }
  },

  async getRecordsOverlappingDateRange(startDate, endDate, options = {}) {
    const lookbackDays = options.lookbackDays || 7
    const limit = options.limit || 200
    const lowerBound = new Date(startDate.getTime() - lookbackDays * 86400000)

    if (await ensureCloud()) {
      try {
        const primaryPromise = db.collection(COLLECTION.RECORDS)
          .where({
            startTime: _.gte(lowerBound).and(_.lt(endDate))
          })
          .orderBy('startTime', 'desc')
          .limit(limit)
          .get()
        const fallbackPromise = db.collection(COLLECTION.RECORDS)
          .orderBy('startTime', 'desc')
          .limit(limit)
          .get()
        const recentPromise = db.collection(COLLECTION.RECORDS)
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get()

        const results = await Promise.all([
          primaryPromise.catch(() => ({ data: [] })),
          fallbackPromise.catch(() => ({ data: [] })),
          recentPromise.catch(() => ({ data: [] }))
        ])

        const merged = mergeRecords(
          mergeRecords(results[0].data || [], results[1].data || []),
          results[2].data || []
        )
        return { data: filterRecordsByOverlap(merged, startDate, endDate, limit) }
      } catch (e) {
        console.warn('云端时间轴查询失败，降级到本地存储', e)
      }
    }

    return { data: filterRecordsByOverlap(getLocalRecords(), startDate, endDate, limit) }
  },

  async getOngoingRecords() {
    if (await ensureCloud()) {
      try {
        return await db.collection(COLLECTION.RECORDS)
          .where({ status: 'ongoing' })
          .get()
      } catch (e) {
        console.warn('云端查询失败，降级到本地存储', e)
      }
    }
    const records = getLocalRecords().filter(r => r.status === 'ongoing')
    return { data: records }
  },

  async getLastFeeding() {
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.RECORDS)
          .where({ type: 'feeding', status: 'completed' })
          .orderBy('startTime', 'desc')
          .limit(1)
          .get()
        return res
      } catch (e) {
        console.warn('云端查询失败，降级到本地存储', e)
      }
    }
    const records = getLocalRecords()
      .filter(r => r.type === 'feeding' && r.status === 'completed')
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    return { data: records.slice(0, 1) }
  },

  async getGrowthRecords() {
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.RECORDS)
          .where({ type: 'growth' })
          .limit(50)
          .get()
        res.data.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        return res
      } catch (e) {
        console.warn('云端查询失败，降级到本地存储', e)
      }
    }
    const records = getLocalRecords()
      .filter(r => r.type === 'growth')
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    return { data: records }
  },

  async getMedHistory(limit = 5) {
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.MED_HISTORY)
          .where({})
          .limit(20)
          .get()
        res.data.sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
        res.data = res.data.slice(0, limit)
        return res
      } catch (e) {
        console.warn('云端查询失败，降级到本地存储', e)
      }
    }
    const history = wx.getStorageSync(STORAGE_KEYS.MED_HISTORY) || []
    return { data: history.slice(0, limit) }
  },

  async updateMedHistory(medData) {
    const { name, dosage, unit, method } = medData
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.MED_HISTORY)
          .where({ name })
          .get()
        if (res.data.length > 0) {
          return await db.collection(COLLECTION.MED_HISTORY).doc(res.data[0]._id).update({
            data: { lastDosage: dosage, lastUnit: unit, lastMethod: method, lastUsedAt: db.serverDate() }
          })
        } else {
          return await db.collection(COLLECTION.MED_HISTORY).add({
            data: { name, lastDosage: dosage, lastUnit: unit, lastMethod: method, lastUsedAt: db.serverDate() }
          })
        }
      } catch (e) {
        console.warn('云端更新失败，降级到本地存储', e)
      }
    }
    let history = wx.getStorageSync(STORAGE_KEYS.MED_HISTORY) || []
    const idx = history.findIndex(h => h.name === name)
    const entry = { name, lastDosage: dosage, lastUnit: unit, lastMethod: method, lastUsedAt: new Date() }
    if (idx >= 0) {
      history[idx] = { ...history[idx], ...entry }
    } else {
      history.unshift(entry)
    }
    history = history.slice(0, 5)
    wx.setStorageSync(STORAGE_KEYS.MED_HISTORY, history)
    return {}
  },

  async getBabyInfo() {
    if (await ensureCloud()) {
      try {
        return await db.collection(COLLECTION.BABY).where({}).limit(1).get()
      } catch (e) {
        console.warn('云端查询失败，降级到本地存储', e)
      }
    }
    const baby = wx.getStorageSync(STORAGE_KEYS.BABY)
    return { data: baby ? [baby] : [] }
  },

  async saveBabyInfo(data) {
    if (await ensureCloud()) {
      try {
        return await db.collection(COLLECTION.BABY).add({ data })
      } catch (e) {
        console.warn('云端写入失败，降级到本地存储', e)
      }
    }
    const baby = { ...data, _id: 'local_baby_1' }
    wx.setStorageSync(STORAGE_KEYS.BABY, baby)
    return { _id: baby._id }
  },

  async getRecordsForDays(days) {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)
    return this.getRecordsByDateRange(start, end)
  },

  async updateBabyInfo(id, data) {
    if (await ensureCloud()) {
      try {
        return await db.collection(COLLECTION.BABY).doc(id).update({ data })
      } catch (e) {
        console.warn('云端更新失败，降级到本地存储', e)
      }
    }
    const baby = wx.getStorageSync(STORAGE_KEYS.BABY) || {}
    wx.setStorageSync(STORAGE_KEYS.BABY, { ...baby, ...data })
    return {}
  },

  async getConfig() {
    const localConfig = wx.getStorageSync(STORAGE_KEYS.CONFIG) || null
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.CONFIG).limit(20).get()
        const latestCloudConfig = pickLatestConfig(res.data || [])
        const latestConfig = pickLatestConfig([latestCloudConfig, localConfig])
        if (latestConfig) {
          const config = normalizeFeedingPlanConfig(latestConfig)
          wx.setStorageSync(STORAGE_KEYS.CONFIG, config)
          return config
        }
      } catch (e) {
        console.warn('云端查询config失败，降级到本地存储', e)
      }
    }
    return normalizeFeedingPlanConfig(localConfig || {})
  },

  async saveConfig(data) {
    const localConfig = wx.getStorageSync(STORAGE_KEYS.CONFIG) || null
    let cloudConfigs = []
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.CONFIG).limit(20).get()
        cloudConfigs = res.data || []
      } catch (e) {
        console.warn('云端读取config失败，先保存到本地', e)
      }
    }

    const baseConfig = pickLatestConfig([pickLatestConfig(cloudConfigs), localConfig]) || {}
    const merged = { ...baseConfig, ...data }
    const normalized = {
      ...normalizeFeedingPlanConfig(merged),
      savedAt: Date.now()
    }
    const cloudData = cleanConfigForCloud(normalized)
    if (await ensureCloud()) {
      try {
        if (cloudConfigs.length > 0) {
          await Promise.all(cloudConfigs.map(config => db.collection(COLLECTION.CONFIG).doc(config._id).update({
            data: { ...cloudData, updatedAt: db.serverDate() }
          })))
        } else {
          await db.collection(COLLECTION.CONFIG).add({
            data: { ...cloudData, createdAt: db.serverDate(), updatedAt: db.serverDate() }
          })
        }
      } catch (e) {
        console.warn('云端保存config失败，降级到本地存储', e)
      }
    }
    wx.setStorageSync(STORAGE_KEYS.CONFIG, normalized)
    getApp().globalData.config = normalized
    return normalized
  },

  isRecordOverlapError,
  getRecordOverlapErrorContent
}
