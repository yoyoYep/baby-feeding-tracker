const db = require('../../utils/db')
const { getPercentile, getRefData } = require('../../utils/growth-standard')

function createChartState() {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    lastDist: 0,
    lastX: 0,
    lastY: 0,
    touching: 0,
    pinchCenterX: 0,
    pinchCenterY: 0
  }
}

Page({
  data: {
    records: [],
    latestRecord: null,
    percentiles: { weight: '', length: '', hc: '' },
    activeTab: 'list',
    statusBarHeight: 0,
    navBarHeight: 44,
    canvasWidth: 0,
    canvasHeight: 0,
    chartScale: 1,
    zoomHintHidden: false
  },

  onLoad() {
    this._chartState = createChartState()
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = windowInfo.statusBarHeight || 0
    let navBarHeight = 44
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height
    } catch (e) {}
    this.setData({ statusBarHeight, navBarHeight })
  },

  _getChartState() {
    if (!this._chartState) {
      this._chartState = createChartState()
    }
    return this._chartState
  },

  onShow() {
    this._ensureBabyInfo().then(() => this.loadRecords())
  },

  async _ensureBabyInfo() {
    const app = getApp()
    if (app.globalData.babyInfo) return
    try {
      const res = await db.getBabyInfo()
      if (res.data && res.data.length > 0) {
        app.globalData.babyInfo = res.data[0]
      }
    } catch (e) {
      console.warn('获取宝宝信息失败', e)
    }
  },

  onReady() {
    if (this.data.activeTab !== 'list') {
      this._measureCanvasAndDraw()
    }
  },

  async loadRecords() {
    try {
      const res = await db.getGrowthRecords()
      const app = getApp()
      const baby = app.globalData.babyInfo
      const gender = (baby && baby.gender) || 'male'
      const birth = baby && baby.birthday ? new Date(baby.birthday) : null

      const records = (res.data || []).map(r => {
        const d = new Date(r.startTime)
        r.dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
        r.dateTitle = `${d.getMonth() + 1}月${d.getDate()}日`
        r.ageText = this._getAgeText(d, birth)
        r.percentileLabels = { weight: '', length: '', hc: '' }
        if (birth) {
          const monthAge = (d - birth) / (30.44 * 24 * 60 * 60 * 1000)
          if (r.data.weight) r.percentileLabels.weight = getPercentile(r.data.weight, monthAge, gender, 'weight').label
          if (r.data.height) r.percentileLabels.length = getPercentile(r.data.height, monthAge, gender, 'length').label
          if (r.data.headCirc) r.percentileLabels.hc = getPercentile(r.data.headCirc, monthAge, gender, 'hc').label
        }
        r.metrics = {
          height: this._formatMetric(r.data && r.data.height, r.percentileLabels.length),
          weight: this._formatMetric(r.data && r.data.weight, r.percentileLabels.weight),
          hc: this._formatMetric(r.data && r.data.headCirc, r.percentileLabels.hc)
        }
        return r
      })

      if (records.length > 0) {
        const latest = records[0]
        this.setData({ records, latestRecord: latest, percentiles: latest.percentileLabels })
      } else {
        this.setData({ records, latestRecord: null, percentiles: { weight: '', length: '', hc: '' } })
      }

      if (this.data.activeTab !== 'list') {
        setTimeout(() => this._measureCanvasAndDraw(), 200)
      }
    } catch (e) {
      console.error(e)
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab !== 'list') {
      setTimeout(() => this._measureCanvasAndDraw(), 100)
    }
  },

  _measureCanvasAndDraw() {
    const query = wx.createSelectorQuery()
    query.select('#growthCanvas').boundingClientRect(rect => {
      if (rect) {
        this.setData({ canvasWidth: rect.width, canvasHeight: rect.height }, () => this.drawChart())
      }
    }).exec()
  },

  _getAgeText(date, birth) {
    if (!birth) return ''
    const days = Math.floor((date - birth) / 86400000) + 1
    return days > 0 ? `第${days}天` : ''
  },

  _formatMetric(value, percentileLabel) {
    const hasValue = value !== undefined && value !== null && value !== ''
    const status = this._getMetricStatus(percentileLabel)
    return {
      hasValue,
      valueText: hasValue ? String(value) : '--',
      percentile: percentileLabel || '',
      status: status.text,
      statusClass: status.className
    }
  },

  _getMetricStatus(percentileLabel) {
    const p = parseFloat(percentileLabel)
    if (isNaN(p)) return { text: '', className: '' }
    if (p < 3) return { text: '偏低', className: 'low' }
    if (p > 97) return { text: '偏高', className: 'high' }
    return { text: '正常', className: 'normal' }
  },

  addRecord() {
    wx.navigateTo({ url: '/pages/record/record?type=growth&mode=manual' })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/stats/stats' })
    }
  },

  editRecord(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/record/record?type=growth&mode=edit&id=${id}` })
  },

  showRecordActions(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/record/record?type=growth&mode=edit&id=${id}` })
        } else if (res.tapIndex === 1) {
          this.deleteRecord(id)
        }
      }
    })
  },

  // === Touch handlers for zoom/pan ===
  onChartTouchStart(e) {
    const touches = e.touches
    const s = this._getChartState()
    s.touching = touches.length

    if (touches.length === 1) {
      s.lastX = touches[0].x
      s.lastY = touches[0].y
    } else if (touches.length === 2) {
      const dx = touches[1].x - touches[0].x
      const dy = touches[1].y - touches[0].y
      s.lastDist = Math.sqrt(dx * dx + dy * dy)
      s.pinchCenterX = (touches[0].x + touches[1].x) / 2
      s.pinchCenterY = (touches[0].y + touches[1].y) / 2
    }

    if (!this.data.zoomHintHidden) {
      this.setData({ zoomHintHidden: true })
    }
  },

  onChartTouchMove(e) {
    const touches = e.touches
    const s = this._getChartState()

    if (touches.length === 2) {
      // Pinch zoom
      const dx = touches[1].x - touches[0].x
      const dy = touches[1].y - touches[0].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (s.lastDist > 0) {
        const ratio = dist / s.lastDist
        const newScale = Math.max(1, Math.min(5, s.scale * ratio))

        // Zoom toward pinch center
        const cx = (touches[0].x + touches[1].x) / 2
        const cy = (touches[0].y + touches[1].y) / 2
        s.offsetX = cx - (cx - s.offsetX) * (newScale / s.scale)
        s.offsetY = cy - (cy - s.offsetY) * (newScale / s.scale)
        s.scale = newScale
      }
      s.lastDist = dist
      this._clampOffset()
      this.setData({ chartScale: Math.round(s.scale * 10) / 10 })
      this.drawChart()
    } else if (touches.length === 1 && s.scale > 1) {
      // Pan (only when zoomed in)
      const dx = touches[0].x - s.lastX
      const dy = touches[0].y - s.lastY
      s.offsetX += dx
      s.offsetY += dy
      s.lastX = touches[0].x
      s.lastY = touches[0].y
      this._clampOffset()
      this.drawChart()
    }
  },

  onChartTouchEnd() {
    const s = this._getChartState()
    s.lastDist = 0
    s.touching = 0
  },

  _clampOffset() {
    const s = this._getChartState()
    const { canvasWidth, canvasHeight } = this.data
    const maxOffX = canvasWidth * (s.scale - 1) / 2
    const maxOffY = canvasHeight * (s.scale - 1) / 2
    s.offsetX = Math.max(-maxOffX, Math.min(maxOffX, s.offsetX))
    s.offsetY = Math.max(-maxOffY, Math.min(maxOffY, s.offsetY))
  },

  resetZoom() {
    const s = this._getChartState()
    s.scale = 1
    s.offsetX = 0
    s.offsetY = 0
    this.setData({ chartScale: 1 })
    this.drawChart()
  },

  deleteRecord(e) {
    const id = typeof e === 'string' ? e : e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条记录吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await db.deleteRecord(id)
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadRecords()
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  _getMetricMeta(tab) {
    if (tab === 'weight') return { metric: 'weight', dataField: 'weight', label: '体重', unit: 'kg' }
    if (tab === 'height') return { metric: 'length', dataField: 'height', label: '身高', unit: 'cm' }
    return { metric: 'hc', dataField: 'headCirc', label: '头围', unit: 'cm' }
  },

  _buildChartPoints(records, dataField, baby) {
    const filtered = records
      .filter(r => r.data && r.data[dataField])
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))

    if (filtered.length === 0) return []

    const birth = baby && baby.birthday ? new Date(baby.birthday) : null
    return filtered.map((r, i) => {
      const measureDate = new Date(r.startTime)
      const month = birth
        ? (measureDate - birth) / (30.44 * 24 * 60 * 60 * 1000)
        : (filtered.length > 1 ? (i / (filtered.length - 1)) * 6 : 3)
      const percentileKey = dataField === 'weight' ? 'weight' : dataField === 'height' ? 'length' : 'hc'
      return {
        month: Math.max(0, Math.min(24, month)),
        value: r.data[dataField],
        ageText: this._getAgeText(measureDate, birth),
        percentile: r.percentileLabels && r.percentileLabels[percentileKey] || ''
      }
    })
  },

  _getChartMonthMax(points) {
    const latest = points.length ? points[points.length - 1].month : 0
    if (latest <= 6) return 6
    if (latest <= 12) return 12
    if (latest <= 18) return 18
    return 24
  },

  _interpolate(values, month) {
    const m = Math.max(0, Math.min(24, month))
    const lower = Math.floor(m)
    const upper = Math.min(lower + 1, 24)
    const frac = m - lower
    return values[lower] + (values[upper] - values[lower]) * frac
  },

  _sampleReference(refData, monthMax) {
    const result = {}
    Object.keys(refData).forEach(key => {
      result[key] = []
      for (let m = 0; m <= monthMax + 0.001; m += 0.2) {
        result[key].push({ month: m, value: this._interpolate(refData[key], m) })
      }
    })
    return result
  },

  _niceScale(min, max, ticks = 5) {
    const niceNumber = (range, round) => {
      const exponent = Math.floor(Math.log10(range))
      const fraction = range / Math.pow(10, exponent)
      let niceFraction
      if (round) {
        if (fraction < 1.5) niceFraction = 1
        else if (fraction < 3) niceFraction = 2
        else if (fraction < 7) niceFraction = 5
        else niceFraction = 10
      } else {
        if (fraction <= 1) niceFraction = 1
        else if (fraction <= 2) niceFraction = 2
        else if (fraction <= 5) niceFraction = 5
        else niceFraction = 10
      }
      return niceFraction * Math.pow(10, exponent)
    }

    const range = niceNumber(Math.max(1, max - min), false)
    const step = niceNumber(range / Math.max(1, ticks - 1), true)
    const niceMin = Math.floor(min / step) * step
    const niceMax = Math.ceil(max / step) * step
    const values = []
    for (let v = niceMin; v <= niceMax + step / 2; v += step) {
      values.push(Math.round(v * 10) / 10)
    }
    return { min: niceMin, max: niceMax, values }
  },

  _drawSmoothLine(ctx, points) {
    if (!points.length) return
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2
      const midY = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
    }
    const last = points[points.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  },

  _roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + w - radius, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
    ctx.lineTo(x + w, y + h - radius)
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
    ctx.lineTo(x + radius, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  },

  _drawTooltip(ctx, point, meta, W, H, padT, padB) {
    if (!point) return
    const boxW = 116
    const boxH = 86
    let x = point.x - boxW / 2
    let y = point.y - boxH - 22
    x = Math.max(48, Math.min(W - boxW - 18, x))
    if (y < padT + 12) y = point.y + 22
    y = Math.min(y, H - padB - boxH)

    ctx.save()
    ctx.shadowColor = 'rgba(31, 34, 40, 0.14)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
    ctx.fillStyle = '#fff'
    this._roundRect(ctx, x, y, boxW, boxH, 8)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#666B73'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(point.ageText || '本次记录', x + boxW / 2, y + 24)
    ctx.fillStyle = '#2F3237'
    ctx.font = 'bold 22px sans-serif'
    ctx.fillText(`${point.value}${meta.unit}`, x + boxW / 2, y + 52)
    if (point.percentile) {
      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#999EA6'
      ctx.fillText(`百分位 ${point.percentile}`, x + boxW / 2, y + 74)
    }
  },

  // === Chart Drawing ===
  drawChart() {
    const { records, activeTab, canvasWidth, canvasHeight } = this.data
    if (activeTab === 'list' || !canvasWidth || records.length === 0) return

    const app = getApp()
    const baby = app.globalData.babyInfo
    const gender = (baby && baby.gender) || 'male'
    const meta = this._getMetricMeta(activeTab)
    const points = this._buildChartPoints(records, meta.dataField, baby)
    if (points.length === 0) return

    const monthMax = this._getChartMonthMax(points)
    const refData = getRefData(gender, meta.metric)
    const sampled = this._sampleReference(refData, monthMax)
    const refValues = [...sampled.P3, ...sampled.P97].map(p => p.value)
    const pointValues = points.map(p => p.value)
    const rawMin = Math.min(...refValues, ...pointValues)
    const rawMax = Math.max(...refValues, ...pointValues)
    const padding = Math.max((rawMax - rawMin) * 0.12, meta.metric === 'weight' ? 0.6 : 2)
    const yScaleInfo = this._niceScale(rawMin - padding, rawMax + padding, 6)
    const s = this._getChartState()

    const query = wx.createSelectorQuery()
    query.select('#growthCanvas').fields({ node: true, size: true }).exec(res => {
      if (!res[0]) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getWindowInfo().pixelRatio
      canvas.width = canvasWidth * dpr
      canvas.height = canvasHeight * dpr
      ctx.scale(dpr, dpr)

      const W = canvasWidth
      const H = canvasHeight
      const padL = 44
      const padR = 58
      const padT = 58
      const padB = 48
      const chartW = W - padL - padR
      const chartH = H - padT - padB
      const xScale = (m) => padL + (m / monthMax) * chartW
      const yScale = (v) => padT + chartH - ((v - yScaleInfo.min) / (yScaleInfo.max - yScaleInfo.min)) * chartH
      const xStep = monthMax <= 6 ? 1 : monthMax <= 12 ? 2 : monthMax <= 18 ? 3 : 4
      const tx = (x) => (x - W / 2) * s.scale + W / 2 + s.offsetX
      const ty = (y) => (y - H / 2) * s.scale + H / 2 + s.offsetY
      const toCanvas = p => ({ ...p, x: tx(xScale(p.month)), y: ty(yScale(p.value)) })

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, W, H)

      ctx.save()
      ctx.rect(padL, padT, chartW, chartH)
      ctx.clip()

      ctx.strokeStyle = '#EEF0F3'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 5])
      yScaleInfo.values.forEach(v => {
        const y = ty(yScale(v))
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(W - padR, y)
        ctx.stroke()
      })

      for (let m = 0; m <= monthMax; m += xStep) {
        const x = tx(xScale(m))
        ctx.beginPath()
        ctx.moveTo(x, padT)
        ctx.lineTo(x, H - padB)
        ctx.stroke()
      }
      ctx.setLineDash([])

      const upper = sampled.P97.map(toCanvas)
      const lower = sampled.P3.map(toCanvas)
      ctx.fillStyle = 'rgba(255, 154, 162, 0.11)'
      ctx.beginPath()
      upper.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i].x, lower[i].y)
      ctx.closePath()
      ctx.fill()

      const drawReference = (key, color, width, alphaLine = false) => {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.setLineDash(alphaLine ? [4, 5] : [])
        this._drawSmoothLine(ctx, sampled[key].map(toCanvas))
      }
      drawReference('P3', '#FFD7DC', 1)
      drawReference('P10', '#FFE7EA', 1, true)
      drawReference('P25', '#FFE7EA', 1, true)
      drawReference('P50', '#FFB7B2', 1.5)
      drawReference('P75', '#FFE7EA', 1, true)
      drawReference('P90', '#FFE7EA', 1, true)
      drawReference('P97', '#FFD7DC', 1)

      const canvasPoints = points.map(toCanvas)
      const latest = canvasPoints[canvasPoints.length - 1]
      ctx.strokeStyle = 'rgba(190, 190, 190, 0.75)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(latest.x, padT)
      ctx.lineTo(latest.x, H - padB)
      ctx.stroke()

      ctx.strokeStyle = '#FF6B6B'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      this._drawSmoothLine(ctx, canvasPoints)

      canvasPoints.forEach((p, i) => {
        const isLatest = i === canvasPoints.length - 1
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#FF6B6B'
        ctx.lineWidth = isLatest ? 4 : 3
        ctx.beginPath()
        ctx.arc(p.x, p.y, isLatest ? 7 : 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
      ctx.restore()

      ctx.fillStyle = '#9EA2A9'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`${meta.label} (${meta.unit})`, 8, padT - 26)
      ctx.textAlign = 'right'
      ctx.fillText('百分位数', W - 8, padT - 26)

      ctx.fillStyle = '#9EA2A9'
      ctx.textAlign = 'right'
      yScaleInfo.values.forEach(v => {
        ctx.fillText(String(v), padL - 9, yScale(v) + 4)
      })

      ctx.textAlign = 'center'
      ctx.fillStyle = '#9EA2A9'
      for (let m = 0; m <= monthMax; m += xStep) {
        const label = m === 0 ? '出生' : `${m}个月`
        ctx.fillText(label, xScale(m), H - 14)
      }

      ctx.textAlign = 'left'
      ctx.fillStyle = '#FF9AA2'
      ctx.font = '12px sans-serif'
      ;[
        ['P97', '97%'],
        ['P90', '90%'],
        ['P50', '50%'],
        ['P10', '10%'],
        ['P3', '3%']
      ].forEach(([key, label]) => {
        const y = yScale(this._interpolate(refData[key], monthMax))
        if (y >= padT - 2 && y <= H - padB + 2) ctx.fillText(label, W - padR + 8, y + 4)
      })

      const latestBase = points[points.length - 1]
      const latestPoint = {
        ...latestBase,
        x: tx(xScale(latestBase.month)),
        y: ty(yScale(latestBase.value))
      }
      this._drawTooltip(ctx, latestPoint, meta, W, H, padT, padB)
    })
  }
})
