const db = require('../../utils/db')
const { matchesTodoDate, getTodoScheduleText } = require('../../utils/todo-schedule')
const { getTodoReminderKey, getSnoozeCountdownText, buildLogicalDateTime, isTodoCancelled } = require('../../utils/local-reminders')
const { normalizeFeedingPlanConfig, getLogicalDayStart, getLogicalDateStr, isSameLogicalDay } = require('../../utils/feeding-plan')

const TYPE_META = {
  health_temp: { label: '量体温', icon: '🌡️' },
  growth: { label: '身高体重', icon: '📏' },
  health_med: { label: '吃药', icon: '💊' },
  health_vaccine: { label: '疫苗', icon: '💉' },
  health_custom: { label: '健康事项', icon: '🏥' }
}

const METHOD_NAMES = {
  forehead: '额温',
  ear: '耳温',
  armpit: '腋温',
  oral: '口服',
  external: '外用',
  nebulize: '雾化',
  rectal: '塞肛'
}

Page({
  data: {
    currentDate: null,
    dateStr: '',
    dateLabel: '今天',
    isToday: true,
    todos: [],
    stats: { total: 0, done: 0, overdue: 0 },
    loading: false,
    successNotice: '',
    addBtnX: 0,
    addBtnY: 0,
    addBtnInited: false
  },

  onLoad() {
    const today = new Date()
    this.setData({
      currentDate: today,
      dateStr: this._formatDateStr(today),
      dateLabel: '今天',
      isToday: true
    })
    this._initAddButton()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this._initAddButton()
    this.loadTodos()
    this._startSnoozeCountdownTimer()
  },

  onHide() {
    this._clearSnoozeCountdownTimer()
  },

  onUnload() {
    if (this._successNoticeTimer) {
      clearTimeout(this._successNoticeTimer)
      this._successNoticeTimer = null
    }
    this._clearSnoozeCountdownTimer()
  },

  _initAddButton() {
    if (this.data.addBtnInited) return
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this._screenWidth = info.windowWidth
    this._screenHeight = info.windowHeight
    this.setData({
      addBtnX: 18,
      addBtnY: info.windowHeight - 150,
      addBtnInited: true
    })
  },

  async onPullDownRefresh() {
    await this.loadTodos()
    wx.stopPullDownRefresh()
  },

  async loadTodos() {
    this.setData({ loading: true })
    try {
      const d = this.data.currentDate || new Date()
      const app = getApp()
      const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
      const dayStartHour = config.feedingDayStartHour
      const start = getLogicalDayStart(d, dayStartHour)
      const end = new Date(start.getTime() + 86400000)
      const [todoRes, recordRes] = await Promise.all([
        db.getTodos(),
        db.getRecordsByDateRange(start, end)
      ])
      const dateStr = getLogicalDateStr(d, dayStartHour)
      const records = recordRes.data || []
      const completedMap = {}
      records.forEach(r => {
        if (r.todoId && r.todoDate === dateStr && r.status === 'completed') {
          completedMap[r.todoId] = r
        }
      })

      const todosFromRules = (todoRes.data || [])
        .filter(todo => matchesTodoDate(todo, dateStr))
        .map(todo => this._formatTodo(todo, dateStr, completedMap[todo._id]))

      const visibleTodoIds = {}
      todosFromRules.forEach(todo => {
        visibleTodoIds[todo._id] = true
      })

      const archivedCompleted = records
        .filter(r => r.todoId && r.todoDate === dateStr && !visibleTodoIds[r.todoId])
        .map(r => this._formatArchivedTodoRecord(r))

      const todos = todosFromRules
        .concat(archivedCompleted)
        .sort((a, b) => this._sortTodos(a, b))

      const stats = {
        total: todos.length,
        done: todos.filter(t => t.done).length,
        overdue: todos.filter(t => t.overdue).length
      }
      this.setData({ todos, stats, loading: false })
    } catch (e) {
      console.error('加载待办失败:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  _formatTodo(todo, dateStr, doneRecord) {
    const meta = TYPE_META[todo.type] || TYPE_META.health_custom
    const scheduledAt = this._buildScheduledTime(dateStr, todo.time)
    const done = !!doneRecord
    const cancelled = !done && isTodoCancelled(todo, dateStr)
    const overdue = !done && !cancelled && scheduledAt.getTime() < Date.now()
    const reminderKey = getTodoReminderKey(todo, dateStr)
    const snoozeText = !done && !cancelled ? getSnoozeCountdownText(dateStr, reminderKey) : ''
    const data = todo.data || {}
    const descParts = []
    let title = todo.title || meta.label
    if (todo.type === 'health_med') {
      if (data.name) descParts.push(data.name)
      if (data.dosage) descParts.push(`${data.dosage}${data.unit || ''}`)
      if (data.method) descParts.push(METHOD_NAMES[data.method] || data.method)
    } else if (todo.type === 'health_temp') {
      if (data.method) descParts.push(METHOD_NAMES[data.method] || data.method)
    } else if (todo.type === 'health_vaccine') {
      if (data.name) descParts.push(data.name)
    } else if (todo.type === 'growth') {
      descParts.push('完成后填写身高/体重/头围')
    } else if (todo.type === 'health_custom' && data.title && data.title !== todo.title) {
      descParts.push(data.title)
    }
    let desc = descParts.join(' · ')
    if (todo.type === 'health_med') {
      title = desc || (todo.title && todo.title !== meta.label ? todo.title : '用药事项')
      desc = ''
    }

    return {
      ...todo,
      icon: meta.icon,
      typeLabel: meta.label,
      title,
      desc,
      done,
      cancelled,
      overdue,
      statusText: done ? '已完成' : (cancelled ? '已取消' : (overdue ? '已过期' : '未完成')),
      statusClass: done ? 'done' : (cancelled ? 'cancelled' : (overdue ? 'overdue' : 'pending')),
      recordId: doneRecord && doneRecord._id || '',
      scheduleText: this._getScheduleText(todo),
      snoozeText
    }
  },

  _startSnoozeCountdownTimer() {
    this._clearSnoozeCountdownTimer()
    this._snoozeCountdownTimer = setInterval(() => {
      this._refreshSnoozeCountdowns()
    }, 60000)
  },

  _clearSnoozeCountdownTimer() {
    if (this._snoozeCountdownTimer) {
      clearInterval(this._snoozeCountdownTimer)
      this._snoozeCountdownTimer = null
    }
  },

  refreshLocalReminderCountdowns() {
    this._refreshSnoozeCountdowns()
  },

  _refreshSnoozeCountdowns() {
    const todos = this.data.todos || []
    if (!todos.length) return
    const dateStr = this.data.dateStr
    const now = new Date()
    let changed = false
    const updated = todos.map(todo => {
      const reminderKey = getTodoReminderKey(todo, dateStr)
      const snoozeText = !todo.done && !todo.cancelled && !todo.archived ? getSnoozeCountdownText(dateStr, reminderKey, now) : ''
      if ((todo.snoozeText || '') === snoozeText) return todo
      changed = true
      return { ...todo, snoozeText }
    })
    if (changed) {
      this.setData({ todos: updated })
    }
  },

  _sortTodos(a, b) {
    const aClosed = !!(a.done || a.cancelled)
    const bClosed = !!(b.done || b.cancelled)
    if (aClosed !== bClosed) return aClosed ? 1 : -1
    if (!!a.cancelled !== !!b.cancelled) return a.cancelled ? 1 : -1
    if (!!a.done !== !!b.done) return a.done ? 1 : -1
    return (a.time || '').localeCompare(b.time || '')
  },

  _formatArchivedTodoRecord(record) {
    const data = record.data || {}
    const meta = TYPE_META[record.type] || TYPE_META.health_custom
    const time = new Date(record.startTime)
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
    const descParts = []
    let title = meta.label

    if (record.type === 'health_med') {
      title = data.name || '用药事项'
      if (data.dosage) descParts.push(`${data.dosage}${data.unit || ''}`)
      if (data.method) descParts.push(METHOD_NAMES[data.method] || data.method)
    } else if (record.type === 'health_temp') {
      title = '量体温'
      if (data.value) descParts.push(`${data.value}°C`)
      if (data.method) descParts.push(METHOD_NAMES[data.method] || data.method)
    } else if (record.type === 'health_vaccine') {
      title = data.name ? `疫苗：${data.name}` : '疫苗'
    } else if (record.type === 'growth') {
      title = '身高体重'
      if (data.weight) descParts.push(`${data.weight}kg`)
      if (data.height) descParts.push(`${data.height}cm`)
      if (data.headCirc) descParts.push(`头围${data.headCirc}cm`)
    } else if (record.type === 'health_custom') {
      title = data.title || '健康事项'
    }

    return {
      _id: `archived_${record._id}`,
      todoId: record.todoId,
      type: record.type,
      icon: meta.icon,
      typeLabel: meta.label,
      title,
      desc: descParts.join(' · '),
      done: true,
      overdue: false,
      archived: true,
      statusText: '已完成',
      statusClass: 'done',
      recordId: record._id,
      time: timeStr,
      scheduleText: '规则已删除，记录已保留'
    }
  },

  _matchesDate(todo, dateStr) {
    return matchesTodoDate(todo, dateStr)
  },

  _getScheduleText(todo) {
    return getTodoScheduleText(todo)
  },

  _buildScheduledTime(dateStr, timeStr) {
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    return buildLogicalDateTime(dateStr, timeStr, config.feedingDayStartHour)
  },

  _showSuccessNotice(title = '已完成') {
    if (this._successNoticeTimer) {
      clearTimeout(this._successNoticeTimer)
    }
    this.setData({ successNotice: title })
    this._successNoticeTimer = setTimeout(() => {
      this.setData({ successNotice: '' })
      this._successNoticeTimer = null
    }, 2200)
  },

  _formatDateStr(date) {
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    return getLogicalDateStr(date, config.feedingDayStartHour)
  },

  _updateDateLabel(date) {
    const today = new Date()
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const dayStartHour = config.feedingDayStartHour
    let label = ''
    if (isSameLogicalDay(date, today, dayStartHour)) {
      label = '今天'
    } else if (isSameLogicalDay(date, new Date(today.getTime() - 86400000), dayStartHour)) {
      label = '昨天'
    } else if (isSameLogicalDay(date, new Date(today.getTime() + 86400000), dayStartHour)) {
      label = '明天'
    } else {
      const ds = getLogicalDayStart(date, dayStartHour)
      label = `${ds.getMonth() + 1}月${ds.getDate()}日`
    }
    this.setData({
      currentDate: date,
      dateStr: getLogicalDateStr(date, dayStartHour),
      dateLabel: label,
      isToday: isSameLogicalDay(date, today, dayStartHour)
    })
  },

  prevDay() {
    const d = new Date(this.data.currentDate || new Date())
    d.setDate(d.getDate() - 1)
    this._updateDateLabel(d)
    this.loadTodos()
  },

  nextDay() {
    const d = new Date(this.data.currentDate || new Date())
    d.setDate(d.getDate() + 1)
    this._updateDateLabel(d)
    this.loadTodos()
  },

  goToday() {
    this._updateDateLabel(new Date())
    this.loadTodos()
  },

  onDateChange(e) {
    const [y, m, d] = e.detail.value.split('-').map(n => parseInt(n, 10))
    this._updateDateLabel(new Date(y, m - 1, d))
    this.loadTodos()
  },

  addTodo() {
    wx.navigateTo({ url: '/pages/todo-edit/todo-edit' })
  },

  onAddTouchStart(e) {
    const touch = e.touches[0]
    this._addStartX = touch.clientX
    this._addStartY = touch.clientY
    this._addOriginX = this.data.addBtnX
    this._addOriginY = this.data.addBtnY
    this._addMoved = false
  },

  onAddTouchMove(e) {
    const touch = e.touches[0]
    const dx = touch.clientX - this._addStartX
    const dy = touch.clientY - this._addStartY
    if (!this._addMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    this._addMoved = true
    const size = 52
    const bottomLimit = 72
    const x = Math.max(8, Math.min(this._addOriginX + dx, (this._screenWidth || 375) - size - 8))
    const y = Math.max(8, Math.min(this._addOriginY + dy, (this._screenHeight || 667) - size - bottomLimit))
    this.setData({ addBtnX: x, addBtnY: y })
  },

  onAddTouchEnd() {
    if (!this._addMoved) {
      this.addTodo()
    }
    this._addMoved = false
  },

  editTodo(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.todos.find(t => t._id === id)
    if (item && item.archived && item.recordId) {
      wx.navigateTo({ url: `/pages/record/record?type=${item.type}&mode=edit&id=${item.recordId}` })
      return
    }
    wx.navigateTo({ url: `/pages/todo-edit/todo-edit?id=${id}` })
  },

  onTodoMore(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.todos.find(t => t._id === id)
    if (item && item.archived) {
      wx.showActionSheet({
        itemList: ['编辑记录', '删除记录'],
        success: res => {
          if (res.tapIndex === 0 && item.recordId) {
            wx.navigateTo({ url: `/pages/record/record?type=${item.type}&mode=edit&id=${item.recordId}` })
          } else if (res.tapIndex === 1 && item.recordId) {
            this._confirmDeleteRecord(item.recordId)
          }
        }
      })
      return
    }
    const itemList = item && item.done
      ? ['编辑', '撤销完成', '删除']
      : (item && item.cancelled ? ['编辑', '恢复今天', '删除'] : ['编辑', '取消今天', '删除'])
    wx.showActionSheet({
      itemList,
      success: res => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/todo-edit/todo-edit?id=${id}` })
        } else if (item && item.done && res.tapIndex === 1) {
          this._confirmUndoComplete(item)
        } else if (item && item.cancelled && res.tapIndex === 1) {
          this._restoreCancelledTodo(item)
        } else if (item && !item.done && !item.cancelled && res.tapIndex === 1) {
          this._confirmCancelTodo(item)
        } else {
          this._confirmDelete(id)
        }
      }
    })
  },

  _confirmDelete(id) {
    wx.showModal({
      title: '删除待办',
      content: '只删除待办规则，不会删除已经生成的记录。',
      confirmColor: '#F44336',
      success: async res => {
        if (!res.confirm) return
        try {
          await db.deleteTodo(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadTodos()
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  _confirmDeleteRecord(id) {
    wx.showModal({
      title: '删除记录',
      content: '这是已经完成的正式记录，删除后无法恢复。',
      confirmColor: '#F44336',
      success: async res => {
        if (!res.confirm) return
        try {
          await db.deleteRecord(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadTodos()
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  completeTodo(e) {
    const id = e.currentTarget.dataset.id
    const todo = this.data.todos.find(t => t._id === id)
    if (!todo) return
    if (todo.archived) {
      if (todo.recordId) this._confirmDeleteRecord(todo.recordId)
      return
    }
    if (todo.done) {
      this._confirmUndoComplete(todo)
      return
    }
    if (todo.cancelled) {
      this._restoreCancelledTodo(todo)
      return
    }
    if (todo.type === 'health_temp') {
      this._completeTemp(todo)
      return
    }
    if (todo.type === 'growth') {
      wx.navigateTo({
        url: `/pages/record/record?type=growth&mode=manual&todoId=${todo._id}&todoDate=${this.data.dateStr}&todoTime=${todo.time || ''}`
      })
      return
    }
    this._completeDirect(todo)
  },

  cancelTodo(e) {
    const id = e.currentTarget.dataset.id
    const todo = this.data.todos.find(t => t._id === id)
    if (!todo || todo.done || todo.cancelled || todo.archived) return
    this._confirmCancelTodo(todo)
  },

  _confirmCancelTodo(todo) {
    wx.showModal({
      title: '取消今日待办',
      content: '只取消今天这一次，不删除重复规则，也不会生成健康记录。',
      cancelText: '保留',
      confirmText: '取消这次',
      confirmColor: '#F44336',
      success: async res => {
        if (!res.confirm) return
        await this._setTodoCancelled(todo, true)
      }
    })
  },

  async _restoreCancelledTodo(todo) {
    await this._setTodoCancelled(todo, false)
  },

  async _setTodoCancelled(todo, cancelled) {
    try {
      const cancelledDates = { ...(todo.cancelledDates || {}) }
      if (cancelled) {
        cancelledDates[this.data.dateStr] = { at: Date.now() }
      } else {
        delete cancelledDates[this.data.dateStr]
      }
      await db.updateTodo(todo._id, { cancelledDates })
      wx.removeStorageSync('ai_assistant_cache')
      this._showSuccessNotice(cancelled ? '已取消' : '已恢复')
      await this.loadTodos()
    } catch (e) {
      console.error('更新待办取消状态失败:', e)
      wx.showToast({ title: cancelled ? '取消失败' : '恢复失败', icon: 'none' })
    }
  },

  _confirmUndoComplete(todo) {
    if (!todo || !todo.recordId) {
      wx.showToast({ title: '未找到完成记录', icon: 'none' })
      return
    }
    wx.showModal({
      title: '撤销完成',
      content: '会删除这次由待办生成的正式记录，并把当天待办恢复为未完成。',
      cancelText: '保留',
      confirmText: '撤销',
      confirmColor: '#F44336',
      success: async res => {
        if (!res.confirm) return
        try {
          await db.deleteRecord(todo.recordId)
          this._showSuccessNotice('已恢复未完成')
          await this.loadTodos()
        } catch (e) {
          wx.showToast({ title: '撤销失败', icon: 'none' })
        }
      }
    })
  },

  _completeTemp(todo) {
    wx.showModal({
      title: '记录体温',
      placeholderText: '输入体温，如 37.2',
      editable: true,
      success: async res => {
        if (!res.confirm) return
        const value = parseFloat(res.content)
        if (!value || value < 30 || value > 45) {
          wx.showToast({ title: '请输入有效体温', icon: 'none' })
          return
        }
        await this._createTodoRecord(todo, {
          type: 'health_temp',
          data: { value, method: (todo.data && todo.data.method) || '' }
        })
      }
    })
  },

  async _completeDirect(todo) {
    const data = todo.data || {}
    if (todo.type === 'health_med') {
      await this._createTodoRecord(todo, {
        type: 'health_med',
        data: {
          name: data.name,
          dosage: data.dosage,
          unit: data.unit,
          method: data.method
        }
      })
      return
    }
    if (todo.type === 'health_vaccine') {
      await this._createTodoRecord(todo, {
        type: 'health_vaccine',
        data: { name: data.name || todo.title }
      })
      return
    }
    await this._createTodoRecord(todo, {
      type: 'health_custom',
      data: { title: data.title || todo.title }
    })
  },

  async _createTodoRecord(todo, payload) {
    try {
      const recordData = {
        type: payload.type,
        startTime: this._buildScheduledTime(this.data.dateStr, todo.time),
        data: payload.data || {},
        status: 'completed',
        source: 'todo',
        todoId: todo._id,
        todoDate: this.data.dateStr,
        note: todo.note || ''
      }
      await db.addRecord(recordData)
      if (payload.type === 'health_med' && payload.data.name) {
        await db.updateMedHistory(payload.data)
      }
      this._showSuccessNotice('已完成')
      await this.loadTodos()
    } catch (e) {
      console.error('完成待办失败:', e)
      wx.showToast({ title: '记录失败', icon: 'none' })
    }
  }
})
