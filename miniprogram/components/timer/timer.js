Component({
  properties: {
    startText: { type: String, value: '开始' },
    stopText: { type: String, value: '结束' },
    autoStart: { type: Boolean, value: false }
  },

  data: {
    running: false,
    paused: false,
    startTimestamp: 0,
    elapsed: 0,
    displayTime: '00:00:00'
  },

  lifetimes: {
    attached() {
      if (this.properties.autoStart) this.start()
    },
    detached() {
      this._clearTimer()
    }
  },

  methods: {
    start() {
      const now = Date.now()
      this._startTimestamp = now
      this.setData({
        running: true,
        paused: false,
        startTimestamp: now
      })
      this._startTick()
      this.triggerEvent('start', { startTime: new Date(now) })
    },

    stop() {
      this._clearTimer()
      const startTimestamp = this._startTimestamp || this.data.startTimestamp
      const elapsed = Date.now() - startTimestamp
      this.setData({ running: false, elapsed })
      this.triggerEvent('stop', {
        startTime: new Date(startTimestamp),
        endTime: new Date(),
        duration: Math.floor(elapsed / 1000)
      })
    },

    resume(startTimestamp) {
      this._startTimestamp = startTimestamp
      this.setData({
        running: true,
        paused: false,
        startTimestamp
      })
      this._startTick()
    },

    _startTick() {
      this._clearTimer()
      const tick = () => {
        if (!this.data.running) return
        const elapsed = Date.now() - (this._startTimestamp || this.data.startTimestamp)
        this.setData({ displayTime: this._formatElapsed(elapsed) })
      }
      tick()
      this._timer = setInterval(tick, 1000)
    },

    _clearTimer() {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
    },

    _formatElapsed(ms) {
      const totalSec = Math.max(0, Math.floor(ms / 1000))
      const h = Math.floor(totalSec / 3600).toString().padStart(2, '0')
      const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0')
      const s = (totalSec % 60).toString().padStart(2, '0')
      return `${h}:${m}:${s}`
    }
  }
})
