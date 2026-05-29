const db = require('../../utils/db')

const TYPE_OPTIONS = [
  { value: 'health_temp', label: '量体温' },
  { value: 'growth', label: '身高体重' },
  { value: 'health_med', label: '吃药' },
  { value: 'health_vaccine', label: '疫苗' },
  { value: 'health_custom', label: '自定义健康事项' }
]

const SCHEDULE_OPTIONS = [
  { value: 'daily', label: '每日' },
  { value: 'range', label: '连续多天' },
  { value: 'interval', label: '每N天' },
  { value: 'once', label: '指定日期' }
]

Page({
  data: {
    navTitle: '新增待办',
    editMode: false,
    todoId: '',
    typeOptions: TYPE_OPTIONS,
    scheduleOptions: SCHEDULE_OPTIONS,
    typeIndex: 0,
    scheduleIndex: 0,
    type: 'health_temp',
    typeLabel: '量体温',
    scheduleType: 'daily',
    scheduleLabel: '每日',
    time: '09:00',
    date: '',
    startDate: '',
    endDate: '',
    intervalDays: '2',
    intervalEndEnabled: false,
    title: '',
    note: '',
    tempMethod: 'forehead',
    medName: '',
    medDosage: '',
    medUnit: 'ml',
    medMethod: 'oral',
    vaccineName: '',
    customTitle: ''
  },

  onLoad(options) {
    const today = this._formatDateStr(new Date())
    this.setData({ date: today, startDate: today, endDate: today })
    if (options.id) {
      this.setData({ editMode: true, todoId: options.id, navTitle: '编辑待办' })
      this._loadTodo(options.id)
    }
  },

  async _loadTodo(id) {
    try {
      const res = await db.getTodoById(id)
      const todo = res.data
      if (!todo) {
        wx.showToast({ title: '待办不存在', icon: 'none' })
        return
      }
      const data = todo.data || {}
      const typeIndex = Math.max(0, TYPE_OPTIONS.findIndex(item => item.value === todo.type))
      const scheduleIndex = Math.max(0, SCHEDULE_OPTIONS.findIndex(item => item.value === todo.scheduleType))
      this.setData({
        typeIndex,
        scheduleIndex,
        type: todo.type || 'health_temp',
        typeLabel: TYPE_OPTIONS[typeIndex].label,
        scheduleType: todo.scheduleType || 'daily',
        scheduleLabel: SCHEDULE_OPTIONS[scheduleIndex].label,
        time: todo.time || '09:00',
        date: todo.date || this.data.date,
        startDate: todo.startDate || this.data.startDate,
        endDate: todo.endDate || this.data.endDate,
        intervalDays: todo.intervalDays ? String(todo.intervalDays) : '2',
        intervalEndEnabled: todo.scheduleType === 'interval' && !!todo.endDate,
        title: todo.title || '',
        note: todo.note || '',
        tempMethod: data.method || 'forehead',
        medName: data.name || '',
        medDosage: data.dosage ? String(data.dosage) : '',
        medUnit: data.unit || 'ml',
        medMethod: data.method || 'oral',
        vaccineName: data.name || '',
        customTitle: data.title || todo.title || ''
      })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  _formatDateStr(date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
  },

  onTypeChange(e) {
    const index = parseInt(e.detail.value, 10)
    const option = TYPE_OPTIONS[index]
    this.setData({
      typeIndex: index,
      type: option.value,
      typeLabel: option.label
    })
  },

  onScheduleChange(e) {
    const index = parseInt(e.detail.value, 10)
    const option = SCHEDULE_OPTIONS[index]
    this.setData({
      scheduleIndex: index,
      scheduleType: option.value,
      scheduleLabel: option.label
    })
  },

  onTimeChange(e) { this.setData({ time: e.detail.value }) },
  onDateChange(e) { this.setData({ date: e.detail.value }) },
  onStartDateChange(e) { this.setData({ startDate: e.detail.value }) },
  onEndDateChange(e) { this.setData({ endDate: e.detail.value }) },
  onIntervalDaysInput(e) { this.setData({ intervalDays: e.detail.value }) },
  onIntervalEndToggle(e) { this.setData({ intervalEndEnabled: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },
  onMedNameInput(e) { this.setData({ medName: e.detail.value }) },
  onMedDosageInput(e) { this.setData({ medDosage: e.detail.value }) },
  setMedUnit(e) { this.setData({ medUnit: e.currentTarget.dataset.val }) },
  setMedMethod(e) { this.setData({ medMethod: e.currentTarget.dataset.val }) },
  setTempMethod(e) { this.setData({ tempMethod: e.currentTarget.dataset.val }) },
  onVaccineNameInput(e) { this.setData({ vaccineName: e.detail.value }) },
  onCustomTitleInput(e) { this.setData({ customTitle: e.detail.value }) },

  _buildPayload() {
    const {
      type, scheduleType, time, date, startDate, endDate, intervalDays, intervalEndEnabled, note,
      tempMethod, medName, medDosage, medUnit, medMethod, vaccineName, customTitle
    } = this.data

    if (!time) return { error: '请选择时间' }
    if (scheduleType === 'once' && !date) return { error: '请选择日期' }
    if (scheduleType === 'interval') {
      if (!startDate) return { error: '请选择开始日期' }
      const parsedInterval = parseInt(intervalDays, 10)
      if (!parsedInterval || parsedInterval < 1 || parsedInterval > 365) return { error: '请输入1-365之间的间隔天数' }
      if (intervalEndEnabled) {
        if (!endDate) return { error: '请选择结束日期' }
        if (endDate < startDate) return { error: '结束日期不能早于开始日期' }
      }
    }
    if (scheduleType === 'range') {
      if (!startDate || !endDate) return { error: '请选择开始和结束日期' }
      if (endDate < startDate) return { error: '结束日期不能早于开始日期' }
    }

    const parsedInterval = parseInt(intervalDays, 10) || 2

    const payload = {
      category: 'health',
      type,
      scheduleType,
      time,
      date: scheduleType === 'once' ? date : '',
      startDate: scheduleType === 'once' ? date : startDate,
      endDate: scheduleType === 'range' || (scheduleType === 'interval' && intervalEndEnabled) ? endDate : '',
      intervalDays: scheduleType === 'interval' ? parsedInterval : 0,
      note,
      enabled: true,
      data: {}
    }

    if (type === 'health_temp') {
      payload.title = '量体温'
      payload.data = { method: tempMethod }
    } else if (type === 'growth') {
      payload.title = '身高体重'
      payload.data = {}
    } else if (type === 'health_med') {
      if (!medName.trim()) return { error: '请输入药品名称' }
      if (!medDosage) return { error: '请输入剂量' }
      const dosage = parseFloat(medDosage)
      if (!dosage || dosage <= 0) return { error: '请输入有效剂量' }
      payload.title = `吃药：${medName.trim()}`
      payload.data = { name: medName.trim(), dosage, unit: medUnit, method: medMethod }
    } else if (type === 'health_vaccine') {
      if (!vaccineName.trim()) return { error: '请输入疫苗名称' }
      payload.title = `疫苗：${vaccineName.trim()}`
      payload.data = { name: vaccineName.trim() }
    } else {
      if (!customTitle.trim()) return { error: '请输入事项名称' }
      payload.title = customTitle.trim()
      payload.data = { title: customTitle.trim() }
    }

    return { payload }
  },

  async saveTodo() {
    const { error, payload } = this._buildPayload()
    if (error) {
      wx.showToast({ title: error, icon: 'none' })
      return
    }

    try {
      if (this.data.editMode) {
        await db.updateTodo(this.data.todoId, payload)
      } else {
        await db.addTodo(payload)
      }
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  deleteTodo() {
    if (!this.data.editMode) return
    wx.showModal({
      title: '删除待办',
      content: '只删除待办规则，不会删除已经生成的记录。',
      confirmColor: '#F44336',
      success: async res => {
        if (!res.confirm) return
        try {
          await db.deleteTodo(this.data.todoId)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
