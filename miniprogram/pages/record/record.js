const db = require('../../utils/db')

Page({
  data: {
    type: 'feeding',
    mode: 'timer',
    navTitle: '添加记录',
    note: '',
    editMode: false,
    editRecordId: '',
    recordDate: '',
    successNotice: '',
    todoId: '',
    todoDate: '',
    todoTime: '',

    // 喂奶
    amount: '',
    showAmountInput: false,
    manualTime: '',
    manualEndTime: '',
    feedingStartTime: null,
    feedingEndTime: null,
    ongoingRecordId: null,
    ongoingStartTimeText: '',

    // 换尿布
    diaperType: 'pee',
    poopStatus: '',
    poopColor: '',
    poopAmount: '适量',
    diaperTime: '',

    // 睡眠
    showSleepForm: false,
    sleepType: 'nap',
    sleepMethod: '',
    sleepQuality: 'good',
    wakeCount: 0,
    sleepStartTime: null,
    sleepEndTime: null,
    ongoingSleepId: null,

    // 辅食
    food: '',
    customFood: '',
    foodAmount: '适量',
    reaction: '',
    foodList: ['米粉', '南瓜泥', '红薯泥', '蛋黄', '苹果泥', '香蕉泥', '胡萝卜泥', '西兰花泥'],

    // 生长
    growthWeight: '',
    growthHeight: '',
    growthHc: '',

    // 洗澡
    bathTime: '',
    bathWaterTemp: '',
    bathDuration: '',

    // 体温
    tempValue: '',
    tempMethod: '',

    // 用药
    medName: '',
    medDosage: '',
    medUnit: 'ml',
    medMethod: 'oral',

    // 疫苗/自定义健康
    vaccineName: '',
    customHealthTitle: ''
  },

  onLoad(options) {
    const { type = 'feeding', mode = 'timer', id, todoId = '', todoDate = '', todoTime = '' } = options

    let navTitle = '添加记录'
    switch (type) {
      case 'feeding': navTitle = '喂奶记录'; break
      case 'diaper': navTitle = '换尿布'; break
      case 'sleep': navTitle = '睡眠记录'; break
      case 'supplement': navTitle = '辅食记录'; break
      case 'bath': navTitle = '洗澡记录'; break
      case 'growth': navTitle = '身高体重'; break
      case 'health_temp': navTitle = '体温记录'; break
      case 'health_med': navTitle = '用药记录'; break
      case 'health_vaccine': navTitle = '疫苗记录'; break
      case 'health_custom': navTitle = '健康事项'; break
    }

    if (mode === 'edit') {
      navTitle = '编辑记录'
      this.setData({ type, mode: 'manual', navTitle, editMode: true, editRecordId: id })
      wx.setNavigationBarTitle({ title: navTitle })
      this._loadRecordForEdit(id)
      return
    }

    const now = new Date()
    const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
    wx.setNavigationBarTitle({ title: navTitle })
    this.setData({ type, mode, navTitle, recordDate: todoDate || todayStr, todoId, todoDate, todoTime })

    if (options.from === 'voice') {
      this._prefillFromVoice()
    } else if (mode === 'ongoing') {
      this._resumeOngoing(type)
    }
  },

  onUnload() {
    if (this._successNoticeTimer) {
      clearTimeout(this._successNoticeTimer)
      this._successNoticeTimer = null
    }
  },

  _showSuccessNotice(title = '保存成功') {
    if (this._successNoticeTimer) {
      clearTimeout(this._successNoticeTimer)
    }
    this.setData({ successNotice: title })
    this._successNoticeTimer = setTimeout(() => {
      this.setData({ successNotice: '' })
      this._successNoticeTimer = null
    }, 1800)
  },

  _formatTimeValue(date) {
    const d = new Date(date)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  },

  _buildDateTime(dateStr, timeStr) {
    const now = new Date()
    let y = now.getFullYear(), mo = now.getMonth(), d = now.getDate()
    if (dateStr) {
      const parts = dateStr.split('-').map(n => parseInt(n, 10))
      y = parts[0]
      mo = parts[1] - 1
      d = parts[2]
    }
    let h = now.getHours(), m = now.getMinutes()
    if (timeStr) {
      const parts = timeStr.split(':').map(n => parseInt(n, 10))
      h = parts[0]
      m = parts[1]
    }
    return new Date(y, mo, d, h, m, 0, 0)
  },

  _getCreateMeta() {
    if (this.data.todoId) {
      return {
        source: 'todo',
        todoId: this.data.todoId,
        todoDate: this.data.todoDate || this.data.recordDate
      }
    }
    return { source: 'manual' }
  },

  _buildOngoingStartTime(timeText, currentStartTime) {
    const [h, m] = timeText.split(':')
    const base = currentStartTime ? new Date(currentStartTime) : new Date()
    const startTime = new Date(base.getFullYear(), base.getMonth(), base.getDate(), parseInt(h), parseInt(m), 0, 0)

    if (startTime.getTime() > Date.now()) {
      startTime.setDate(startTime.getDate() - 1)
    }

    return startTime
  },

  _refreshRunningTimer(type, startTime) {
    this._resumeToken = Date.now()
    const timerId = type === 'sleep' ? '#sleepTimer' : '#feedingTimer'
    const timer = this.selectComponent(timerId)
    if (timer) timer.resume(new Date(startTime).getTime())
  },

  _resumeTimerAfterRender(type, startTime) {
    const token = Date.now()
    this._resumeToken = token
    setTimeout(() => {
      if (this._resumeToken !== token) return
      this._refreshRunningTimer(type, startTime)
    }, 100)
  },

  async _resumeOngoing(type) {
    try {
      const res = await db.getOngoingRecords()
      const record = (res.data || []).find(r => r.type === type)
      if (record) {
        if (type === 'feeding') {
          const startTime = new Date(record.startTime)
          this.setData({
            ongoingRecordId: record._id,
            feedingStartTime: startTime,
            ongoingStartTimeText: this._formatTimeValue(startTime)
          })
          this._resumeTimerAfterRender(type, startTime)
        } else if (type === 'sleep') {
          const startTime = new Date(record.startTime)
          this.setData({
            ongoingSleepId: record._id,
            sleepStartTime: startTime,
            ongoingStartTimeText: this._formatTimeValue(startTime)
          })
          this._resumeTimerAfterRender(type, startTime)
        }
      }
    } catch (e) {
      console.error(e)
    }
  },

  _prefillFromVoice() {
    const app = getApp()
    const result = app.globalData.pendingVoiceRecord
    app.globalData.pendingVoiceRecord = null
    if (!result) return

    const fmt = (date) => {
      if (!date) return ''
      const d = new Date(date)
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    }

    const startTime = result.startTime ? new Date(result.startTime) : null
    if (startTime) {
      const dateStr = `${startTime.getFullYear()}-${(startTime.getMonth() + 1).toString().padStart(2, '0')}-${startTime.getDate().toString().padStart(2, '0')}`
      this.setData({ recordDate: dateStr })
    }

    const data = result.data || {}

    switch (result.type) {
      case 'feeding':
        this.setData({
          amount: data.amount ? String(data.amount) : '',
          manualTime: fmt(result.startTime),
          manualEndTime: fmt(result.endTime),
          showAmountInput: true,
          note: ''
        })
        break
      case 'diaper':
        this.setData({
          diaperType: data.subType || 'pee',
          poopStatus: data.status || '',
          poopColor: data.color || '',
          poopAmount: data.amount || '适量',
          diaperTime: fmt(result.startTime),
          note: ''
        })
        break
      case 'sleep':
        this.setData({
          sleepType: data.sleepType || 'nap',
          sleepMethod: data.method || '',
          sleepQuality: data.quality || 'good',
          wakeCount: data.wakeCount || 0,
          showSleepForm: true,
          manualTime: fmt(result.startTime),
          manualEndTime: fmt(result.endTime),
          note: ''
        })
        break
      case 'supplement':
        const foodList = this.data.foodList
        const food = data.food || ''
        this.setData({
          food: foodList.includes(food) ? food : '',
          customFood: foodList.includes(food) ? '' : food,
          foodAmount: data.amount || '适量',
          reaction: data.reaction || '',
          note: ''
        })
        break
      case 'bath':
        this.setData({
          bathTime: fmt(result.startTime),
          bathWaterTemp: data.waterTemp ? String(data.waterTemp) : '',
          bathDuration: data.duration ? String(data.duration) : '',
          note: ''
        })
        break
      case 'health_temp':
        this.setData({
          tempValue: data.value ? String(data.value) : '',
          tempMethod: data.method || '',
          note: ''
        })
        break
      case 'health_med':
        this.setData({
          medName: data.name || '',
          medDosage: data.dosage ? String(data.dosage) : '',
          medUnit: data.unit || 'ml',
          medMethod: data.method || 'oral',
          note: ''
        })
        break
      case 'health_vaccine':
        this.setData({
          vaccineName: data.name || '',
          note: ''
        })
        break
      case 'health_custom':
        this.setData({
          customHealthTitle: data.title || '',
          note: ''
        })
        break
      case 'growth':
        this.setData({
          growthWeight: data.weight ? String(data.weight) : '',
          growthHeight: data.height ? String(data.height) : '',
          growthHc: data.headCirc ? String(data.headCirc) : '',
          note: ''
        })
        break
    }
  },

  async _loadRecordForEdit(id) {
    try {
      const res = await db.getRecordById(id)
      const record = res.data
      if (!record) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        return
      }

      const startTime = new Date(record.startTime)
      const startStr = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`
      const dateStr = `${startTime.getFullYear()}-${(startTime.getMonth() + 1).toString().padStart(2, '0')}-${startTime.getDate().toString().padStart(2, '0')}`
      this.setData({ recordDate: dateStr })

      switch (record.type) {
        case 'feeding': {
          let endStr = ''
          if (record.endTime) {
            const endTime = new Date(record.endTime)
            endStr = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`
          }
          this.setData({
            amount: record.data && record.data.amount || '',
            manualTime: startStr,
            manualEndTime: endStr,
            showAmountInput: true,
            note: record.note || ''
          })
          break
        }
        case 'diaper':
          this.setData({
            diaperType: record.data && record.data.subType || 'pee',
            poopStatus: record.data && record.data.status || '',
            poopColor: record.data && record.data.color || '',
            poopAmount: record.data && record.data.amount || '适量',
            diaperTime: startStr,
            note: record.note || ''
          })
          break
        case 'sleep': {
          let sleepEndStr = ''
          if (record.endTime) {
            const endTime = new Date(record.endTime)
            sleepEndStr = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`
          }
          this.setData({
            sleepType: record.data && record.data.sleepType || 'nap',
            sleepMethod: record.data && record.data.method || '',
            sleepQuality: record.data && record.data.quality || 'good',
            wakeCount: record.data && record.data.wakeCount || 0,
            showSleepForm: true,
            manualTime: startStr,
            manualEndTime: sleepEndStr,
            note: record.note || ''
          })
          break
        }
        case 'supplement':
          const foodList = this.data.foodList
          const recordFood = record.data && record.data.food || ''
          this.setData({
            food: foodList.includes(recordFood) ? recordFood : '',
            customFood: foodList.includes(recordFood) ? '' : recordFood,
            foodAmount: record.data && record.data.amount || '适量',
            reaction: record.data && record.data.reaction || '',
            note: record.note || ''
          })
          break
        case 'bath':
          this.setData({
            bathTime: startStr,
            bathWaterTemp: record.data && record.data.waterTemp ? String(record.data.waterTemp) : '',
            bathDuration: record.data && record.data.duration ? String(record.data.duration) : '',
            note: record.note || ''
          })
          break
        case 'health_temp':
          this.setData({
            tempValue: record.data && record.data.value ? String(record.data.value) : '',
            tempMethod: record.data && record.data.method || '',
            note: record.note || ''
          })
          break
        case 'health_med':
          this.setData({
            medName: record.data && record.data.name || '',
            medDosage: record.data && record.data.dosage ? String(record.data.dosage) : '',
            medUnit: record.data && record.data.unit || 'ml',
            medMethod: record.data && record.data.method || 'oral',
            note: record.note || ''
          })
          break
        case 'health_vaccine':
          this.setData({
            vaccineName: record.data && record.data.name || '',
            note: record.note || ''
          })
          break
        case 'health_custom':
          this.setData({
            customHealthTitle: record.data && record.data.title || '',
            note: record.note || ''
          })
          break
        case 'growth':
          this.setData({
            growthWeight: record.data && record.data.weight ? String(record.data.weight) : '',
            growthHeight: record.data && record.data.height ? String(record.data.height) : '',
            growthHc: record.data && record.data.headCirc ? String(record.data.headCirc) : '',
            note: record.note || ''
          })
          break
      }
    } catch (e) {
      console.error('加载记录失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  deleteRecord() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条记录吗？',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          try {
            await db.deleteRecord(this.data.editRecordId)
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 1000)
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // === 喂奶 ===
  async onFeedingStart(e) {
    const startTime = e.detail.startTime
    this.setData({ feedingStartTime: startTime, ongoingStartTimeText: this._formatTimeValue(startTime) })
    try {
      const res = await db.addRecord({
        type: 'feeding',
        startTime,
        data: {},
        status: 'ongoing',
        source: 'manual'
      })
      this.setData({ ongoingRecordId: res._id })
    } catch (err) {
      console.error(err)
    }
  },

  onFeedingStop(e) {
    const { endTime, duration } = e.detail
    this.setData({
      feedingEndTime: endTime,
      showAmountInput: true
    })
  },

  setAmount(e) {
    this.setData({ amount: parseInt(e.currentTarget.dataset.val) })
  },

  onAmountInput(e) {
    this.setData({ amount: parseInt(e.detail.value) || '' })
  },

  switchToManual() {
    this.setData({ mode: 'manual', showAmountInput: true })
  },

  onTimeChange(e) {
    this.setData({ manualTime: e.detail.value })
  },

  onEndTimeChange(e) {
    this.setData({ manualEndTime: e.detail.value })
  },

  async onOngoingStartTimeChange(e) {
    const timeText = e.detail.value
    const isSleep = this.data.type === 'sleep'
    const recordId = isSleep ? this.data.ongoingSleepId : this.data.ongoingRecordId
    const currentStartTime = isSleep ? this.data.sleepStartTime : this.data.feedingStartTime

    if (!recordId) return

    const startTime = this._buildOngoingStartTime(timeText, currentStartTime)
    try {
      await db.updateRecord(recordId, { startTime })
      const nextData = { ongoingStartTimeText: timeText }
      if (isSleep) {
        nextData.sleepStartTime = startTime
      } else {
        nextData.feedingStartTime = startTime
      }
      this.setData(nextData)
      const hasStopped = isSleep ? !!this.data.sleepEndTime : !!this.data.feedingEndTime
      if (!hasStopped) {
        this._refreshRunningTimer(this.data.type, startTime)
      }
      wx.showToast({ title: '开始时间已更新', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '更新时间失败', icon: 'none' })
    }
  },

  onRecordDateChange(e) {
    this.setData({ recordDate: e.detail.value })
  },

  async saveFeedingRecord() {
    const { amount, note, mode, ongoingRecordId, feedingStartTime, feedingEndTime, manualTime, manualEndTime, editMode, editRecordId, recordDate } = this.data
    if (!amount) {
      wx.showToast({ title: '请输入奶量', icon: 'none' })
      return
    }

    try {
      if (editMode || mode === 'manual') {
        const baseDate = recordDate ? new Date(recordDate) : new Date()
        let startTime = baseDate
        let endTime = null
        if (manualTime) {
          const [h, m] = manualTime.split(':')
          startTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parseInt(h), parseInt(m))
        }
        if (manualEndTime) {
          const [eh, em] = manualEndTime.split(':')
          endTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parseInt(eh), parseInt(em))
          if (endTime <= startTime) {
            wx.showToast({ title: '结束时间不能早于开始时间', icon: 'none' })
            return
          }
        }
        if (editMode) {
          await db.updateRecord(editRecordId, {
            startTime,
            endTime: endTime || startTime,
            data: { amount: parseInt(amount) },
            note
          })
        } else {
          await db.addRecord({
            type: 'feeding',
            startTime,
            endTime: endTime || startTime,
            data: { amount: parseInt(amount) },
            status: 'completed',
            source: 'manual',
            note
          })
        }
      } else if (ongoingRecordId) {
        await db.updateRecord(ongoingRecordId, {
          ...(feedingStartTime ? { startTime: feedingStartTime } : {}),
          endTime: feedingEndTime || new Date(),
          data: { amount: parseInt(amount) },
          status: 'completed',
          note
        })
      }

      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 换尿布 ===
  setDiaperType(e) { this.setData({ diaperType: e.currentTarget.dataset.val }) },
  setPoopStatus(e) { this.setData({ poopStatus: e.currentTarget.dataset.val }) },
  setPoopColor(e) { this.setData({ poopColor: e.currentTarget.dataset.val }) },
  setPoopAmount(e) { this.setData({ poopAmount: e.currentTarget.dataset.val }) },
  onDiaperTimeChange(e) { this.setData({ diaperTime: e.detail.value }) },

  async saveDiaperRecord() {
    const { diaperType, poopStatus, poopColor, poopAmount, diaperTime, note, editMode, editRecordId, recordDate } = this.data
    const baseDate = recordDate ? new Date(recordDate) : new Date()
    let startTime = baseDate
    if (diaperTime) {
      const [h, m] = diaperTime.split(':')
      startTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parseInt(h), parseInt(m))
    }

    const recordData = {
      subType: diaperType,
      status: diaperType !== 'pee' ? poopStatus : '',
      color: diaperType !== 'pee' ? poopColor : '',
      amount: diaperType !== 'pee' ? poopAmount : ''
    }

    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { startTime, data: recordData, note })
      } else {
        await db.addRecord({
          type: 'diaper',
          startTime,
          data: recordData,
          status: 'completed',
          source: 'manual',
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 睡眠 ===
  async onSleepStart(e) {
    const startTime = e.detail.startTime
    this.setData({ sleepStartTime: startTime, ongoingStartTimeText: this._formatTimeValue(startTime) })
    try {
      const res = await db.addRecord({
        type: 'sleep',
        startTime,
        data: { sleepType: 'nap' },
        status: 'ongoing',
        source: 'manual'
      })
      this.setData({ ongoingSleepId: res._id })
    } catch (err) {
      console.error(err)
    }
  },

  onSleepStop(e) {
    const { endTime } = e.detail
    this.setData({ sleepEndTime: endTime, showSleepForm: true })
  },

  setSleepType(e) { this.setData({ sleepType: e.currentTarget.dataset.val }) },
  setSleepMethod(e) { this.setData({ sleepMethod: e.currentTarget.dataset.val }) },
  setSleepQuality(e) { this.setData({ sleepQuality: e.currentTarget.dataset.val }) },
  setWakeCount(e) { this.setData({ wakeCount: parseInt(e.currentTarget.dataset.val) }) },

  async saveSleepRecord() {
    const { ongoingSleepId, sleepStartTime, sleepEndTime, sleepType, sleepMethod, sleepQuality, wakeCount, note, editMode, editRecordId, manualTime, manualEndTime, recordDate } = this.data

    if (!editMode && !ongoingSleepId) {
      wx.showToast({ title: '请先开始计时', icon: 'none' })
      return
    }

    const sleepData = { sleepType, method: sleepMethod, quality: sleepQuality, wakeCount }

    try {
      if (editMode) {
        const baseDate = recordDate ? new Date(recordDate) : new Date()
        let startTime = baseDate
        let endTime = baseDate
        if (manualTime) {
          const [h, m] = manualTime.split(':')
          startTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parseInt(h), parseInt(m))
        }
        if (manualEndTime) {
          const [eh, em] = manualEndTime.split(':')
          endTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parseInt(eh), parseInt(em))
        }
        if (manualTime && manualEndTime && endTime.getTime() <= startTime.getTime()) {
          endTime.setDate(endTime.getDate() + 1)
        }
        await db.updateRecord(editRecordId, {
          startTime,
          endTime,
          data: sleepData,
          note
        })
      } else {
        const finalEndTime = new Date(sleepEndTime || new Date())
        if (sleepStartTime && finalEndTime.getTime() <= new Date(sleepStartTime).getTime()) {
          finalEndTime.setDate(finalEndTime.getDate() + 1)
        }
        await db.updateRecord(ongoingSleepId, {
          ...(sleepStartTime ? { startTime: sleepStartTime } : {}),
          endTime: finalEndTime,
          data: sleepData,
          status: 'completed',
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 辅食 ===
  setFood(e) { this.setData({ food: e.currentTarget.dataset.val, customFood: '' }) },
  onCustomFoodInput(e) { this.setData({ customFood: e.detail.value, food: '' }) },
  setFoodAmount(e) { this.setData({ foodAmount: e.currentTarget.dataset.val }) },
  setReaction(e) { this.setData({ reaction: e.currentTarget.dataset.val }) },

  async saveSupplementRecord() {
    const { food, customFood, foodAmount, reaction, note, editMode, editRecordId } = this.data
    const finalFood = food || customFood
    if (!finalFood) {
      wx.showToast({ title: '请选择或输入食物', icon: 'none' })
      return
    }

    const recordData = { food: finalFood, amount: foodAmount, reaction, allergy: [] }

    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { data: recordData, note })
      } else {
        await db.addRecord({
          type: 'supplement',
          startTime: new Date(),
          data: recordData,
          status: 'completed',
          source: 'manual',
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 洗澡 ===
  onBathTimeChange(e) { this.setData({ bathTime: e.detail.value }) },
  onBathWaterTempInput(e) { this.setData({ bathWaterTemp: e.detail.value }) },
  onBathDurationInput(e) { this.setData({ bathDuration: e.detail.value }) },

  async saveBathRecord() {
    const { bathTime, bathWaterTemp, bathDuration, note, editMode, editRecordId, recordDate } = this.data
    const baseDate = recordDate ? new Date(recordDate) : new Date()
    let startTime = baseDate
    if (bathTime) {
      const [h, m] = bathTime.split(':')
      startTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parseInt(h), parseInt(m))
    } else {
      const now = new Date()
      startTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), now.getHours(), now.getMinutes())
    }

    const recordData = {}
    if (bathWaterTemp) recordData.waterTemp = parseFloat(bathWaterTemp)
    if (bathDuration) recordData.duration = parseInt(bathDuration)

    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { startTime, data: recordData, note })
      } else {
        await db.addRecord({
          type: 'bath',
          startTime,
          data: recordData,
          status: 'completed',
          source: 'manual',
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 体温 ===
  onTempInput(e) { this.setData({ tempValue: e.detail.value }) },
  setTempMethod(e) { this.setData({ tempMethod: e.currentTarget.dataset.val }) },

  async saveTempRecord() {
    const { tempValue, tempMethod, note, editMode, editRecordId, recordDate, todoTime } = this.data
    if (!tempValue) {
      wx.showToast({ title: '请输入体温', icon: 'none' })
      return
    }
    const recordData = { value: parseFloat(tempValue), method: tempMethod }
    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { data: recordData, note })
      } else {
        await db.addRecord({
          type: 'health_temp',
          startTime: this._buildDateTime(recordDate, todoTime),
          data: recordData,
          status: 'completed',
          ...this._getCreateMeta(),
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 用药 ===
  onMedNameInput(e) { this.setData({ medName: e.detail.value }) },
  onMedDosageInput(e) { this.setData({ medDosage: e.detail.value }) },
  setMedUnit(e) { this.setData({ medUnit: e.currentTarget.dataset.val }) },
  setMedMethod(e) { this.setData({ medMethod: e.currentTarget.dataset.val }) },

  async saveMedRecord() {
    const { medName, medDosage, medUnit, medMethod, note, editMode, editRecordId, recordDate, todoTime } = this.data
    if (!medName) {
      wx.showToast({ title: '请输入药品名称', icon: 'none' })
      return
    }
    const recordData = { name: medName, dosage: medDosage ? parseFloat(medDosage) : null, unit: medUnit, method: medMethod }
    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { data: recordData, note })
      } else {
        await db.addRecord({
          type: 'health_med',
          startTime: this._buildDateTime(recordDate, todoTime),
          data: recordData,
          status: 'completed',
          ...this._getCreateMeta(),
          note
        })
        await db.updateMedHistory(recordData)
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 疫苗/自定义健康 ===
  onVaccineNameInput(e) { this.setData({ vaccineName: e.detail.value }) },
  onCustomHealthTitleInput(e) { this.setData({ customHealthTitle: e.detail.value }) },

  async saveVaccineRecord() {
    const { vaccineName, note, editMode, editRecordId, recordDate, todoTime } = this.data
    if (!vaccineName) {
      wx.showToast({ title: '请输入疫苗名称', icon: 'none' })
      return
    }
    const recordData = { name: vaccineName }
    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { data: recordData, note })
      } else {
        await db.addRecord({
          type: 'health_vaccine',
          startTime: this._buildDateTime(recordDate, todoTime),
          data: recordData,
          status: 'completed',
          ...this._getCreateMeta(),
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  async saveCustomHealthRecord() {
    const { customHealthTitle, note, editMode, editRecordId, recordDate, todoTime } = this.data
    if (!customHealthTitle) {
      wx.showToast({ title: '请输入事项名称', icon: 'none' })
      return
    }
    const recordData = { title: customHealthTitle }
    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { data: recordData, note })
      } else {
        await db.addRecord({
          type: 'health_custom',
          startTime: this._buildDateTime(recordDate, todoTime),
          data: recordData,
          status: 'completed',
          ...this._getCreateMeta(),
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // === 生长记录 ===
  onGrowthWeightInput(e) { this.setData({ growthWeight: e.detail.value }) },
  onGrowthHeightInput(e) { this.setData({ growthHeight: e.detail.value }) },
  onGrowthHcInput(e) { this.setData({ growthHc: e.detail.value }) },

  async saveGrowthRecord() {
    const { growthWeight, growthHeight, growthHc, note, editMode, editRecordId, recordDate, todoTime } = this.data
    if (!growthWeight && !growthHeight && !growthHc) {
      wx.showToast({ title: '请至少填写一项', icon: 'none' })
      return
    }
    const data = {}
    if (growthWeight) data.weight = parseFloat(growthWeight)
    if (growthHeight) data.height = parseFloat(growthHeight)
    if (growthHc) data.headCirc = parseFloat(growthHc)

    const startTime = this._buildDateTime(recordDate, todoTime)

    try {
      if (editMode) {
        await db.updateRecord(editRecordId, { startTime, data, note })
      } else {
        await db.addRecord({
          type: 'growth',
          startTime,
          data,
          status: 'completed',
          ...this._getCreateMeta(),
          note
        })
      }
      this._showSuccessNotice('保存成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // 通用
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  onVoiceRecord(e) {
    const { result } = e.detail
    if (!result) return
    // 语音识别后自动保存
    this._saveVoiceResult(result)
  },

  async _saveVoiceResult(result) {
    try {
      await db.addRecord({
        type: result.type,
        startTime: result.startTime,
        data: result.data || {},
        status: result.status || 'completed',
        source: 'voice'
      })
      this._showSuccessNotice('记录成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.showToast({ title: '记录失败', icon: 'none' })
    }
  }
})
