const db = require('../../utils/db')
const { getLogicalDayStart, normalizeFeedingPlanConfig } = require('../../utils/feeding-plan')
const {
  buildDietExportRows,
  createBlankSuggestionLines,
  formatDateInput,
  formatDateTitle,
  isDietRecord
} = require('../../utils/diet-export')

const EXPORT_WIDTH = 1240
const EXPORT_HEIGHT = 1754
const EXPORT_ROWS = 18
const SUGGESTION_COUNT = 5
const TABLE_COLUMNS = [260, 250, 210, 210, 110]
const TABLE_HEADERS = ['进食持续时间', '提供的食物种类', '实际进食量', '进食行为', '备注']

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function makeSuggestionLines(values) {
  const lines = values || createBlankSuggestionLines(SUGGESTION_COUNT)
  return lines.slice(0, SUGGESTION_COUNT).map((value, index) => ({
    id: `line_${index}`,
    value: value || ''
  }))
}

function parseDateInput(value) {
  const parts = String(value || '').split('-').map(n => parseInt(n, 10))
  if (parts.length < 3 || parts.some(n => !Number.isFinite(n))) return new Date()
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0)
}

function isDateInputAfter(a, b) {
  return parseDateInput(a).getTime() > parseDateInput(b).getTime()
}

function chineseNumberToInt(text) {
  if (/^\d+$/.test(text)) return parseInt(text, 10)
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (text === '十') return 10
  if (text.startsWith('十')) return 10 + (digits[text.slice(1)] || 0)
  if (text.includes('十')) {
    const parts = text.split('十')
    return (digits[parts[0]] || 0) * 10 + (digits[parts[1]] || 0)
  }
  return digits[text] || 0
}

function intToChineseNumber(value) {
  const n = parseInt(value, 10)
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (!Number.isFinite(n) || n <= 0) return String(value)
  if (n < 10) return digits[n]
  if (n === 10) return '十'
  if (n < 20) return `十${digits[n % 10]}`
  if (n < 100) return `${digits[Math.floor(n / 10)]}十${digits[n % 10]}`
  return String(n)
}

function formatRangeTime(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

Page({
  data: {
    startDate: '',
    endDate: '',
    dayLabel: '第一天',
    rangeText: '',
    recordCount: 0,
    rows: [],
    sheetTabs: [],
    activeSheetIndex: 0,
    suggestionLines: makeSuggestionLines(),
    previewPath: '',
    previewDrawn: false,
    previewErrorText: '',
    loading: false,
    saving: false,
    canvasCssWidth: 375,
    canvasCssHeight: 531
  },

  onLoad(options) {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const canvasCssWidth = Math.max(260, Math.min(430, (windowInfo.windowWidth || 375) - 48))
    const canvasCssHeight = Math.round(canvasCssWidth * EXPORT_HEIGHT / EXPORT_WIDTH)
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const initialDate = options.date
      ? parseDateInput(options.date)
      : getLogicalDayStart(new Date(), config.feedingDayStartHour)
    const initialDateText = formatDateInput(initialDate)

    this.setData({
      startDate: initialDateText,
      endDate: initialDateText,
      canvasCssWidth,
      canvasCssHeight
    })
  },

  onReady() {
    this._canvasReady = true
    this.loadRecords()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  onUnload() {
    if (this._renderTimer) {
      clearTimeout(this._renderTimer)
      this._renderTimer = null
    }
  },

  onStartDateChange(e) {
    const startDate = e.detail.value
    const nextData = { startDate }
    if (this.data.endDate && isDateInputAfter(startDate, this.data.endDate)) {
      nextData.endDate = startDate
    }
    this.setData(nextData, () => this.loadRecords())
  },

  onEndDateChange(e) {
    const endDate = e.detail.value
    const nextData = { endDate }
    if (this.data.startDate && isDateInputAfter(this.data.startDate, endDate)) {
      nextData.startDate = endDate
    }
    this.setData(nextData, () => this.loadRecords())
  },

  onDayLabelInput(e) {
    this.setData({ dayLabel: e.detail.value }, () => {
      this._applySheetLabels()
      this._scheduleRender()
    })
  },

  onSuggestionInput(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    if (!Number.isFinite(index)) return
    const suggestionLines = (this.data.suggestionLines || []).map((item, i) => (
      i === index ? { ...item, value: e.detail.value } : item
    ))
    this.setData({ suggestionLines }, () => this._scheduleRender())
  },

  async loadRecords() {
    this.setData({ loading: true })
    try {
      const app = getApp()
      if (app.globalData.cloudReadyPromise) {
        await app.globalData.cloudReadyPromise
      }

      const { start, end } = this._getSelectedRange()
      const sheetDays = await this._loadSheetDays(start, end)
      const rows = sheetDays[0] ? sheetDays[0].rows : []
      this._sheetDays = sheetDays
      this.setData({
        rows,
        sheetTabs: this._buildSheetTabs(sheetDays),
        activeSheetIndex: 0,
        previewPath: '',
        previewDrawn: false,
        previewErrorText: '',
        recordCount: sheetDays.reduce((sum, sheet) => sum + sheet.recordCount, 0),
        rangeText: `${formatRangeTime(start)} - ${formatRangeTime(end)}`
      }, () => this.renderPreview())
    } catch (e) {
      console.error('加载饮食导出数据失败', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async _loadSheetDays(start, end) {
    const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
    const tasks = []
    for (let i = 0; i < dayCount; i++) {
      const dayStart = new Date(start.getTime() + i * 86400000)
      const dayEnd = new Date(dayStart.getTime() + 86400000)
      tasks.push(async () => {
        const res = await db.getRecordsByDateRange(dayStart, dayEnd)
        const records = res.data || []
        const rows = buildDietExportRows(records, { maxRows: EXPORT_ROWS })
        return {
          id: formatDateInput(dayStart),
          dayLabel: this._getSheetDayLabel(i),
          dateInfo: formatDateTitle(dayStart),
          start: dayStart,
          end: dayEnd,
          rows,
          recordCount: records.filter(isDietRecord).length
        }
      })
    }

    const sheets = []
    for (let i = 0; i < tasks.length; i += 5) {
      const batch = tasks.slice(i, i + 5)
      const batchResults = await Promise.all(batch.map(task => task()))
      sheets.push(...batchResults)
    }
    return sheets
  },

  _buildSheetTabs(sheetDays) {
    return (sheetDays || []).map((sheet, index) => ({
      id: sheet.id,
      label: `${sheet.dateInfo.month}/${sheet.dateInfo.day}`,
      count: sheet.recordCount,
      active: index === this.data.activeSheetIndex
    }))
  },

  _applySheetLabels() {
    const sheetDays = this._sheetDays || []
    sheetDays.forEach((sheet, index) => {
      sheet.dayLabel = this._getSheetDayLabel(index)
    })
    this.setData({ sheetTabs: this._buildSheetTabs(sheetDays) })
  },

  _getSheetDayLabel(index) {
    const base = (this.data.dayLabel || '').trim()
    const match = base.match(/^第([一二三四五六七八九十\d]+)天$/)
    if (match) {
      const startNumber = chineseNumberToInt(match[1]) || 1
      return `第${intToChineseNumber(startNumber + index)}天`
    }
    if (index === 0) return base || '第一天'
    return `第${intToChineseNumber(index + 1)}天`
  },

  _getActiveSheet() {
    const sheets = this._sheetDays || []
    return sheets[this.data.activeSheetIndex] || sheets[0] || null
  },

  selectSheet(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const sheets = this._sheetDays || []
    if (!Number.isFinite(index) || !sheets[index]) return
    this.setData({
      activeSheetIndex: index,
      sheetTabs: this._buildSheetTabs(sheets).map((tab, i) => ({ ...tab, active: i === index })),
      rows: sheets[index].rows,
      previewPath: '',
      previewDrawn: false,
      previewErrorText: ''
    }, () => this.renderPreview())
  },

  _getSelectedRange() {
    const app = getApp()
    const config = normalizeFeedingPlanConfig((app && app.globalData && app.globalData.config) || {})
    const startDate = parseDateInput(this.data.startDate)
    const endDate = parseDateInput(this.data.endDate || this.data.startDate)
    const start = getLogicalDayStart(startDate, config.feedingDayStartHour)
    let endDayStart = getLogicalDayStart(endDate, config.feedingDayStartHour)
    if (endDayStart.getTime() < start.getTime()) {
      endDayStart = new Date(start)
    }
    const end = new Date(endDayStart.getTime() + 86400000)
    return {
      start,
      end,
      endDayStart,
      isMultiDay: endDayStart.getTime() > start.getTime()
    }
  },

  _scheduleRender() {
    if (this._renderTimer) clearTimeout(this._renderTimer)
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null
      this.renderPreview()
    }, 260)
  },

  _getCanvasNode() {
    return new Promise((resolve, reject) => {
      if (!this._canvasReady) {
        reject(new Error('canvas not ready'))
        return
      }
      wx.createSelectorQuery()
        .in(this)
        .select('#dietExportCanvas')
        .fields({ node: true, size: true })
        .exec(res => {
          const item = res && res[0]
          if (!item || !item.node) {
            reject(new Error('canvas node not found'))
            return
          }
          resolve(item.node)
        })
    })
  },

  _canvasToTempFilePath(canvas) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'jpg',
        quality: 1,
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        destWidth: EXPORT_WIDTH,
        destHeight: EXPORT_HEIGHT,
        success: res => resolve(res.tempFilePath),
        fail: reject
      }, this)
    })
  },

  async renderPreview() {
    if (!this._canvasReady) return
    const token = Date.now()
    this._renderToken = token
    this.setData({ previewDrawn: false, previewErrorText: '' })
    try {
      const sheet = this._getActiveSheet()
      if (!sheet) return ''
      const previewPath = await this._renderSheetToPath(sheet)
      if (this._renderToken !== token) return
      if (this._renderToken === token) {
        this.setData({ previewPath, previewDrawn: true })
        return previewPath
      }
    } catch (e) {
      console.error('生成导出预览失败', e)
      this.setData({ previewErrorText: '预览生成失败，请刷新重试' })
    }
    return ''
  },

  async _renderSheetToPath(sheet) {
    const canvas = await this._getCanvasNode()
    canvas.width = EXPORT_WIDTH
    canvas.height = EXPORT_HEIGHT
    const ctx = canvas.getContext('2d')
    this._drawSheet(ctx, sheet)
    this.setData({ previewDrawn: true })
    await delay(80)
    return this._canvasToTempFilePath(canvas)
  },

  async saveImage() {
    try {
      this.setData({ saving: true })
      const sheets = this._sheetDays || []
      if (!sheets.length) {
        wx.showToast({ title: '暂无可保存图片', icon: 'none' })
        return
      }

      let saved = 0
      for (let i = 0; i < sheets.length; i++) {
        if (sheets.length > 1 && wx.showLoading) {
          wx.showLoading({ title: `保存 ${i + 1}/${sheets.length}`, mask: true })
        }
        const usePreview = i === this.data.activeSheetIndex && this.data.previewPath
        const filePath = usePreview ? this.data.previewPath : await this._renderSheetToPath(sheets[i])
        if (!filePath) continue
        const ok = await this._saveImageFile(filePath, { silent: true })
        if (!ok) break
        saved++
      }

      if (wx.hideLoading) wx.hideLoading()
      if (saved > 0) {
        wx.showToast({ title: saved === 1 ? '已保存到相册' : `已保存${saved}张`, icon: 'success' })
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    } finally {
      if (wx.hideLoading) wx.hideLoading()
      this.setData({ saving: false })
    }
  },

  _saveImageFile(filePath, options = {}) {
    return new Promise(resolve => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => {
          if (!options.silent) wx.showToast({ title: '已保存到相册', icon: 'success' })
          resolve(true)
        },
        fail: err => {
          if (wx.hideLoading) wx.hideLoading()
          const msg = err && err.errMsg || ''
          if (msg.includes('auth') || msg.includes('authorize')) {
            wx.showModal({
              title: '需要相册权限',
              content: '请允许保存图片到相册。',
              confirmText: '去设置',
              confirmColor: '#FF9AA2',
              success: res => {
                if (res.confirm) wx.openSetting()
                resolve(false)
              }
            })
            return
          }
          if (!options.silent) wx.showToast({ title: '保存失败', icon: 'none' })
          resolve(false)
        }
      })
    })
  },

  _drawSheet(ctx, sheet) {
    const currentSheet = sheet || this._getActiveSheet()
    const rows = currentSheet ? currentSheet.rows : []
    const suggestions = (this.data.suggestionLines || []).map(item => item.value || '')

    ctx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)

    this._drawDateHeader(ctx, currentSheet)
    this._drawTable(ctx, rows)
    this._drawSuggestions(ctx, suggestions)
  },

  _drawDateHeader(ctx, sheet) {
    const dateInfo = sheet && sheet.dateInfo || formatDateTitle(new Date())
    const y = 178
    const label = `${sheet && sheet.dayLabel || this.data.dayLabel || '第____天'}：`
    ctx.save()
    ctx.fillStyle = '#202124'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = 'bold 34px sans-serif'
    ctx.fillText(label, 250, y)

    const labelWidth = ctx.measureText(label).width
    let x = 250 + labelWidth + 26
    if (x > 485) x = 485

    this._drawUnderlinedValue(ctx, String(dateInfo.year), x, y, 112, '年')
    this._drawUnderlinedValue(ctx, String(dateInfo.month), x + 178, y, 92, '月')
    this._drawUnderlinedValue(ctx, String(dateInfo.day), x + 324, y, 92, '日')
    ctx.restore()
  },

  _drawUnderlinedValue(ctx, value, x, y, width, suffix) {
    ctx.save()
    ctx.strokeStyle = '#222222'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y + 17)
    ctx.lineTo(x + width, y + 17)
    ctx.stroke()
    ctx.fillStyle = '#202124'
    ctx.font = '32px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(value, x + width / 2, y - 1)
    ctx.textAlign = 'left'
    ctx.fillText(suffix, x + width + 13, y - 1)
    ctx.restore()
  },

  _drawTable(ctx, rows) {
    const tableX = 100
    const tableY = 258
    const headerH = 56
    const rowH = 58
    const tableW = TABLE_COLUMNS.reduce((sum, width) => sum + width, 0)
    const tableH = headerH + EXPORT_ROWS * rowH

    ctx.save()
    ctx.strokeStyle = '#202124'
    ctx.lineWidth = 2
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(tableX, tableY, tableW, tableH)

    let x = tableX
    ctx.beginPath()
    ctx.moveTo(tableX, tableY)
    ctx.lineTo(tableX + tableW, tableY)
    ctx.lineTo(tableX + tableW, tableY + tableH)
    ctx.lineTo(tableX, tableY + tableH)
    ctx.closePath()
    ctx.stroke()

    TABLE_COLUMNS.forEach(width => {
      ctx.beginPath()
      ctx.moveTo(x, tableY)
      ctx.lineTo(x, tableY + tableH)
      ctx.stroke()
      x += width
    })
    ctx.beginPath()
    ctx.moveTo(tableX + tableW, tableY)
    ctx.lineTo(tableX + tableW, tableY + tableH)
    ctx.stroke()

    for (let i = 0; i <= EXPORT_ROWS; i++) {
      const y = tableY + headerH + i * rowH
      ctx.beginPath()
      ctx.moveTo(tableX, y)
      ctx.lineTo(tableX + tableW, y)
      ctx.stroke()
    }

    ctx.font = 'bold 27px sans-serif'
    ctx.fillStyle = '#303134'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    let headerX = tableX
    TABLE_HEADERS.forEach((header, index) => {
      const width = TABLE_COLUMNS[index]
      ctx.fillText(header, headerX + width / 2, tableY + headerH / 2)
      headerX += width
    })

    ctx.font = '24px sans-serif'
    rows.forEach((row, index) => {
      const rowTop = tableY + headerH + index * rowH
      const values = [row.time, row.food, row.amount, row.behavior, row.note]
      let cellX = tableX
      values.forEach((value, colIndex) => {
        const width = TABLE_COLUMNS[colIndex]
        this._drawWrappedText(ctx, value, cellX + width / 2, rowTop + rowH / 2, width - 22, 25, 2)
        cellX += width
      })
    })

    ctx.restore()
  },

  _drawSuggestions(ctx, suggestions) {
    const marginX = 96
    const titleY = 1418
    const lineStartX = marginX + 64
    const lineEndX = EXPORT_WIDTH - 96

    ctx.save()
    ctx.fillStyle = '#202124'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = 'bold 34px sans-serif'
    ctx.fillText('饮食建议：', marginX, titleY)

    ctx.strokeStyle = '#202124'
    ctx.lineWidth = 2
    ctx.font = '30px sans-serif'
    for (let i = 0; i < SUGGESTION_COUNT; i++) {
      const y = titleY + 72 + i * 78
      ctx.fillText(`${i + 1}、`, marginX, y - 8)
      ctx.beginPath()
      ctx.moveTo(lineStartX, y)
      ctx.lineTo(lineEndX, y)
      ctx.stroke()

      const text = suggestions[i] || ''
      if (text) {
        ctx.font = '27px sans-serif'
        this._drawWrappedText(ctx, text, lineStartX + 8, y - 20, lineEndX - lineStartX - 16, 28, 1, 'left')
        ctx.font = '30px sans-serif'
      }
    }
    ctx.restore()
  },

  _drawWrappedText(ctx, value, x, y, maxWidth, lineHeight, maxLines, align = 'center') {
    const lines = this._wrapText(ctx, value, maxWidth, maxLines)
    if (!lines.length) return
    ctx.save()
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    const totalHeight = (lines.length - 1) * lineHeight
    lines.forEach((line, index) => {
      const drawY = y - totalHeight / 2 + index * lineHeight
      ctx.fillText(line, x, drawY)
    })
    ctx.restore()
  },

  _wrapText(ctx, value, maxWidth, maxLines) {
    const raw = String(value || '').trim()
    if (!raw) return []
    const lines = []
    raw.split(/\n+/).forEach(part => {
      let line = ''
      Array.from(part).forEach(char => {
        const test = line + char
        if (line && ctx.measureText(test).width > maxWidth) {
          lines.push(line)
          line = char
        } else {
          line = test
        }
      })
      if (line) lines.push(line)
    })

    if (lines.length <= maxLines) return lines
    const result = lines.slice(0, maxLines)
    let last = result[result.length - 1]
    while (last && ctx.measureText(`${last}...`).width > maxWidth) {
      last = last.slice(0, -1)
    }
    result[result.length - 1] = `${last}...`
    return result
  }
})
