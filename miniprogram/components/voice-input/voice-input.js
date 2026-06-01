const { parseVoiceText, getConfirmText } = require('../../utils/voice-parser')

const TYPE_NAMES = {
  feeding: '喂奶',
  diaper: '换尿布',
  sleep: '睡眠',
  bath: '洗澡',
  health_temp: '体温',
  health_med: '用药',
  supplement: '辅食',
  growth: '生长记录'
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateValue(value) {
  const date = toDate(value) || new Date()
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTimeValue(value) {
  const date = toDate(value) || new Date()
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function buildDateTime(dateStr, timeStr, fallback) {
  const base = toDate(fallback) || new Date()
  const dateParts = (dateStr || formatDateValue(base)).split('-').map(n => parseInt(n, 10))
  const timeParts = (timeStr || formatTimeValue(base)).split(':').map(n => parseInt(n, 10))
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0, 0)
}

function buildEditableRecord(record, index) {
  const start = toDate(record.startTime) || new Date()
  const end = toDate(record.endTime)
  const data = { ...(record.data || {}) }
  return {
    ...record,
    data,
    editKey: record._id || `voice_${index}`,
    typeTitle: TYPE_NAMES[record.type] || '记录',
    dateStr: formatDateValue(start),
    startTimeStr: formatTimeValue(start),
    endDateStr: end ? formatDateValue(end) : formatDateValue(start),
    endTimeStr: end ? formatTimeValue(end) : '',
    hasEndTime: !!end,
    amountText: data.amount !== undefined && data.amount !== null ? String(data.amount) : '',
    tempText: data.value !== undefined && data.value !== null ? String(data.value) : '',
    dosageText: data.dosage !== undefined && data.dosage !== null ? String(data.dosage) : '',
    foodText: data.food || '',
    foodAmountText: data.amount || '适量',
    bathWaterTempText: data.waterTemp !== undefined && data.waterTemp !== null ? String(data.waterTemp) : '',
    bathDurationText: data.duration !== undefined && data.duration !== null ? String(data.duration) : '',
    growthWeightText: data.weight !== undefined && data.weight !== null ? String(data.weight) : '',
    growthHeightText: data.height !== undefined && data.height !== null ? String(data.height) : '',
    growthHcText: data.headCirc !== undefined && data.headCirc !== null ? String(data.headCirc) : ''
  }
}

function cleanEditedRecord(item) {
  const data = { ...(item.data || {}) }
  if (item.type === 'feeding') {
    const amount = parseInt(item.amountText, 10)
    data.amount = Number.isFinite(amount) ? amount : null
    data.action = data.action || 'complete'
  }
  if (item.type === 'health_temp') {
    const value = parseFloat(item.tempText)
    data.value = Number.isFinite(value) ? value : null
  }
  if (item.type === 'health_med') {
    const dosage = parseFloat(item.dosageText)
    data.dosage = Number.isFinite(dosage) ? dosage : null
  }
  if (item.type === 'diaper') {
    data.subType = data.subType || 'pee'
  }
  if (item.type === 'supplement') {
    data.food = (item.foodText || '').trim()
    data.amount = item.foodAmountText || data.amount || '适量'
  }
  if (item.type === 'bath') {
    const waterTemp = parseFloat(item.bathWaterTempText)
    const duration = parseInt(item.bathDurationText, 10)
    data.waterTemp = Number.isFinite(waterTemp) ? waterTemp : null
    data.duration = Number.isFinite(duration) ? duration : null
  }
  if (item.type === 'growth') {
    const weight = parseFloat(item.growthWeightText)
    const height = parseFloat(item.growthHeightText)
    const headCirc = parseFloat(item.growthHcText)
    data.weight = Number.isFinite(weight) ? weight : null
    data.height = Number.isFinite(height) ? height : null
    data.headCirc = Number.isFinite(headCirc) ? headCirc : null
  }

  const startTime = buildDateTime(item.dateStr, item.startTimeStr, item.startTime)
  let endTime = null
  if (item.hasEndTime && item.endTimeStr) {
    endTime = buildDateTime(item.endDateStr || item.dateStr, item.endTimeStr, item.endTime || startTime)
    if (endTime.getTime() <= startTime.getTime()) {
      endTime.setDate(endTime.getDate() + 1)
    }
  }

  return {
    type: item.type,
    data,
    action: item.action || data.action,
    startTime,
    endTime,
    status: item.status || 'completed',
    confidence: item.confidence
  }
}

Component({
  data: {
    recording: false,
    parsing: false,
    parsingText: '',
    showConfirm: false,
    confirmText: '',
    canEditConfirm: true,
    showBatchEditor: false,
    editingRecords: [],
    rawText: '',
    parsedResult: null,
    recordingTime: 0
  },

  methods: {
    noop() {},

    toggleRecord() {
      if (this.data.recording) {
        this._stopRecording()
      } else {
        this._startRecording()
      }
    },

    _startRecording() {
      this._recorder = wx.getRecorderManager()

      this._recorder.onStart(() => {
        this._recordTimer = setInterval(() => {
          this.setData({ recordingTime: this.data.recordingTime + 1 })
        }, 1000)
      })

      this._recorder.onStop((res) => {
        this._clearRecordTimer()
        this.setData({ recording: false, recordingTime: 0 })

        if (res.duration < 800) {
          wx.showToast({ title: '录音太短，请重试', icon: 'none' })
          return
        }

        this._uploadAndRecognize(res.tempFilePath)
      })

      this._recorder.onError((err) => {
        this._clearRecordTimer()
        this.setData({ recording: false, recordingTime: 0 })
        console.error('[voice-input] 录音失败:', err)
        wx.showToast({ title: '录音失败', icon: 'none' })
      })

      this._recorder.start({
        duration: 30000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      })

      this.setData({ recording: true, recordingTime: 0 })
    },

    _stopRecording() {
      if (this._recorder) {
        this._recorder.stop()
      }
    },

    manualInput() {
      this._showTextInput()
    },

    _clearRecordTimer() {
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
      }
    },

    async _uploadAndRecognize(filePath) {
      this.setData({ parsing: true, parsingText: '识别中...' })

      try {
        const app = getApp()
        if (!app.globalData.cloudReady) {
          this.setData({ parsing: false })
          this._showTextInput('云开发未连接')
          return
        }

        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `voice/${Date.now()}.mp3`,
          filePath
        })

        const sttRes = await wx.cloud.callFunction({
          name: 'speechToText',
          data: { fileID: uploadRes.fileID }
        })

        wx.cloud.deleteFile({ fileList: [uploadRes.fileID] }).catch(() => {})

        if (sttRes.result && sttRes.result.success) {
          const text = sttRes.result.text
          this.setData({ rawText: text })
          this._handleRecognitionResult(text)
        } else {
          this.setData({ parsing: false })
          const err = sttRes.result && sttRes.result.error
          console.warn('[voice-input] ASR失败:', err)
          this._showTextInput(err)
        }
      } catch (e) {
        this.setData({ parsing: false })
        console.error('[voice-input] 上传/识别异常:', e)
        this._showTextInput('网络错误')
      }
    },

    _showTextInput(errMsg) {
      wx.showModal({
        title: errMsg ? `识别失败：${errMsg}` : '手动输入',
        placeholderText: '如：刚喝了120ml奶',
        editable: true,
        success: (res) => {
          if (res.confirm && res.content) {
            this._handleRecognitionResult(res.content)
          } else {
            this.setData({ parsing: false })
          }
        },
        fail: () => {
          this.setData({ parsing: false })
        }
      })
    },

    async _handleRecognitionResult(text) {
      this.setData({ parsing: true, parsingText: '正在理解...' })
      try {
        const result = await parseVoiceText(text)
        if (!result) {
          wx.showToast({ title: '未能识别事件，请手动记录', icon: 'none' })
          return
        }

        const confirmText = getConfirmText(result)
        this.setData({
          showConfirm: true,
          confirmText,
          canEditConfirm: true,
          rawText: text,
          parsedResult: result
        })
      } finally {
        this.setData({ parsing: false })
      }
    },

    confirmRecord() {
      const result = this.data.parsedResult
      this.setData({ showConfirm: false, parsedResult: null, canEditConfirm: true })
      this.triggerEvent('record', { result })
    },

    editRecord() {
      const result = this.data.parsedResult
      if (!result) return
      const records = result.records && Array.isArray(result.records) ? result.records : [result]
      this.setData({
        showConfirm: false,
        showBatchEditor: true,
        editingRecords: records.map((record, index) => buildEditableRecord(record, index))
      })
    },

    cancelConfirm() {
      this.setData({ showConfirm: false, parsedResult: null, canEditConfirm: true })
    },

    updateEditingRecord(index, patch) {
      const recordIndex = parseInt(index, 10)
      const records = this.data.editingRecords.slice()
      if (!records[recordIndex]) {
        return
      }
      records[recordIndex] = {
        ...records[recordIndex],
        ...patch
      }
      this.setData({ editingRecords: records })
    },

    onBatchDateChange(e) {
      const index = parseInt(e.currentTarget.dataset.index, 10)
      const record = this.data.editingRecords[index]
      const patch = { dateStr: e.detail.value }
      if (record && record.hasEndTime && record.endDateStr === record.dateStr) {
        patch.endDateStr = e.detail.value
      }
      this.updateEditingRecord(index, patch)
    },

    onBatchStartTimeChange(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { startTimeStr: e.detail.value })
    },

    onBatchEndDateChange(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { endDateStr: e.detail.value })
    },

    onBatchEndTimeChange(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { endTimeStr: e.detail.value, hasEndTime: true })
    },

    onBatchAmountInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { amountText: e.detail.value })
    },

    onBatchTempInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { tempText: e.detail.value })
    },

    onBatchMedNameInput(e) {
      const index = e.currentTarget.dataset.index
      const records = this.data.editingRecords.slice()
      records[index].data = { ...(records[index].data || {}), name: e.detail.value }
      this.setData({ editingRecords: records })
    },

    onBatchDosageInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { dosageText: e.detail.value })
    },

    onBatchDiaperType(e) {
      const index = e.currentTarget.dataset.index
      const subType = e.currentTarget.dataset.val
      const records = this.data.editingRecords.slice()
      records[index].data = { ...(records[index].data || {}), subType }
      this.setData({ editingRecords: records })
    },

    onBatchFoodInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { foodText: e.detail.value })
    },

    onBatchFoodAmountInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { foodAmountText: e.detail.value })
    },

    onBatchBathWaterTempInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { bathWaterTempText: e.detail.value })
    },

    onBatchBathDurationInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { bathDurationText: e.detail.value })
    },

    onBatchGrowthWeightInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { growthWeightText: e.detail.value })
    },

    onBatchGrowthHeightInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { growthHeightText: e.detail.value })
    },

    onBatchGrowthHcInput(e) {
      this.updateEditingRecord(e.currentTarget.dataset.index, { growthHcText: e.detail.value })
    },

    cancelBatchEditor() {
      this.setData({
        showBatchEditor: false,
        editingRecords: [],
        showConfirm: !!this.data.parsedResult
      })
    },

    confirmBatchEditor() {
      const records = this.data.editingRecords.map(cleanEditedRecord)
      if (!records.length) {
        wx.showToast({ title: '没有可保存的记录', icon: 'none' })
        return
      }
      const original = this.data.parsedResult || {}
      const result = original.records && Array.isArray(original.records)
        ? { type: 'batch', records, status: 'completed', confidence: original.confidence }
        : { ...records[0], confidence: original.confidence }
      this.setData({
        showBatchEditor: false,
        editingRecords: [],
        showConfirm: true,
        parsedResult: result,
        confirmText: getConfirmText(result)
      })
    }
  }
})
