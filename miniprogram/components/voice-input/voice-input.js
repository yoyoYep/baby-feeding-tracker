const { parseVoiceText, getConfirmText } = require('../../utils/voice-parser')

Component({
  data: {
    recording: false,
    parsing: false,
    parsingText: '',
    showConfirm: false,
    confirmText: '',
    rawText: '',
    parsedResult: null,
    recordingTime: 0
  },

  methods: {
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
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `voice/${Date.now()}.mp3`,
          filePath
        })
        console.log('[voice-input] 音频已上传:', uploadRes.fileID)

        const sttRes = await wx.cloud.callFunction({
          name: 'speechToText',
          data: { fileID: uploadRes.fileID }
        })
        console.log('[voice-input] ASR结果:', JSON.stringify(sttRes.result))

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
          rawText: text,
          parsedResult: result
        })
      } finally {
        this.setData({ parsing: false })
      }
    },

    confirmRecord() {
      const result = this.data.parsedResult
      this.setData({ showConfirm: false, parsedResult: null })
      this.triggerEvent('record', { result })
    },

    editRecord() {
      const result = this.data.parsedResult
      this.setData({ showConfirm: false, parsedResult: null })
      this.triggerEvent('edit', { result })
    },

    cancelConfirm() {
      this.setData({ showConfirm: false, parsedResult: null })
    }
  }
})
