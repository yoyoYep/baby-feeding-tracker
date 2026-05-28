Component({
  properties: {
    item: { type: Object, value: {} }
  },
  data: {
    iconMap: {
      feeding: '🍼',
      sleep: '💤',
      diaper: '🧷',
      supplement: '🥣',
      bath: '🛁',
      health_temp: '🌡️',
      health_med: '💊',
      growth: '📏'
    },
    offsetX: 0
  },
  methods: {
    onMoreTap() {
      this.triggerEvent('more', { item: this.data.item })
    },

    onTouchStart(e) {
      this._startX = e.touches[0].clientX
      this._startY = e.touches[0].clientY
      this._moved = false
    },

    onTouchMove(e) {
      const dx = e.touches[0].clientX - this._startX
      const dy = e.touches[0].clientY - this._startY

      if (!this._moved && Math.abs(dy) > Math.abs(dx)) {
        this._vertical = true
        return
      }
      if (this._vertical) return

      this._moved = true
      const offset = Math.max(Math.min(dx, 0), -160)
      this.setData({ offsetX: offset })
    },

    onTouchEnd() {
      if (this._vertical) {
        this._vertical = false
        return
      }
      const threshold = -80
      if (this.data.offsetX < threshold) {
        this.setData({ offsetX: -160 })
      } else {
        this.setData({ offsetX: 0 })
      }
    },

    onDelete() {
      this.setData({ offsetX: 0 })
      this.triggerEvent('delete', { item: this.data.item })
    }
  }
})
