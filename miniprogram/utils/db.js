let db = null
let _ = null

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
  if (app.globalData.cloudReadyPromise) {
    await app.globalData.cloudReadyPromise
  }
  return isCloudReady()
}

const COLLECTION = {
  RECORDS: 'records',
  BABY: 'baby',
  MED_HISTORY: 'med_history',
  CONFIG: 'config'
}

const STORAGE_KEYS = {
  RECORDS: 'local_records',
  BABY: 'local_baby',
  MED_HISTORY: 'local_med_history',
  CONFIG: 'local_config'
}

function getLocalRecords() {
  return wx.getStorageSync(STORAGE_KEYS.RECORDS) || []
}

function saveLocalRecords(records) {
  wx.setStorageSync(STORAGE_KEYS.RECORDS, records)
}

function getTodayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
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
        return res
      } catch (e) {
        console.warn('云端where查询失败，尝试降级查询', e)
        try {
          const res = await db.collection(COLLECTION.RECORDS)
            .orderBy('startTime', 'desc')
            .limit(100)
            .get()
          res.data = res.data.filter(r => {
            const t = new Date(r.startTime).getTime()
            return t >= startDate.getTime() && t < endDate.getTime()
          })
          return res
        } catch (e2) {
          console.warn('云端查询全部失败，降级到本地存储', e2)
        }
      }
    }
    const records = getLocalRecords().filter(r => {
      const t = new Date(r.startTime).getTime()
      return t >= startDate.getTime() && t < endDate.getTime()
    })
    records.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    return { data: records }
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
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.CONFIG).limit(1).get()
        if (res.data && res.data.length > 0) {
          const config = res.data[0]
          wx.setStorageSync(STORAGE_KEYS.CONFIG, config)
          return config
        }
      } catch (e) {
        console.warn('云端查询config失败，降级到本地存储', e)
      }
    }
    return wx.getStorageSync(STORAGE_KEYS.CONFIG) || { defaultFeedingAmount: 0, feedingIntervalThreshold: 180 }
  },

  async saveConfig(data) {
    const localConfig = wx.getStorageSync(STORAGE_KEYS.CONFIG) || {}
    const merged = { ...localConfig, ...data }
    delete merged._id
    if (await ensureCloud()) {
      try {
        const res = await db.collection(COLLECTION.CONFIG).limit(1).get()
        if (res.data && res.data.length > 0) {
          await db.collection(COLLECTION.CONFIG).doc(res.data[0]._id).update({
            data: { ...merged, updatedAt: db.serverDate() }
          })
        } else {
          await db.collection(COLLECTION.CONFIG).add({
            data: { ...merged, updatedAt: db.serverDate() }
          })
        }
      } catch (e) {
        console.warn('云端保存config失败，降级到本地存储', e)
      }
    }
    wx.setStorageSync(STORAGE_KEYS.CONFIG, merged)
    getApp().globalData.config = merged
    return merged
  }
}
