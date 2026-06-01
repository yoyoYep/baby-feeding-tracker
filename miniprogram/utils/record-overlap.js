const OVERLAP_TYPE_LABELS = {
  feeding: '喂奶',
  sleep: '睡眠'
}

function isOverlapCheckedType(type) {
  return !!OVERLAP_TYPE_LABELS[type]
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getRecordTimeRange(record, now = new Date()) {
  if (!record || !isOverlapCheckedType(record.type)) return null

  const start = toDate(record.startTime)
  if (!start) return null

  const explicitEnd = toDate(record.endTime)
  let end = explicitEnd && explicitEnd.getTime() > start.getTime() ? explicitEnd : null

  if (!end && record.data && record.data.duration) {
    const minutes = Number(record.data.duration)
    if (Number.isFinite(minutes) && minutes > 0) {
      end = new Date(start.getTime() + minutes * 60000)
    }
  }

  if (!end && record.status === 'ongoing' && now.getTime() > start.getTime()) {
    end = now
  }

  return {
    type: record.type,
    start,
    end: end || start
  }
}

function rangesOverlap(a, b) {
  if (!a || !b) return false

  const aStart = a.start.getTime()
  const aEnd = a.end.getTime()
  const bStart = b.start.getTime()
  const bEnd = b.end.getTime()

  if (aEnd === aStart && bEnd === bStart) {
    return aStart === bStart
  }

  if (aEnd === aStart) {
    return aStart >= bStart && aStart < bEnd
  }

  if (bEnd === bStart) {
    return bStart >= aStart && bStart < aEnd
  }

  return aStart < bEnd && aEnd > bStart
}

function sameRecord(record, excludeId) {
  return !!excludeId && record && record._id === excludeId
}

function findSameTypeOverlap(candidate, records = [], options = {}) {
  const candidateRange = getRecordTimeRange(candidate, options.now)
  if (!candidateRange) return null

  return (records || []).find(record => {
    if (!record || sameRecord(record, options.excludeId)) return false
    if (record.type !== candidate.type) return false
    const recordRange = getRecordTimeRange(record, options.now)
    return rangesOverlap(candidateRange, recordRange)
  }) || null
}

function createRecordOverlapError(candidate) {
  const label = OVERLAP_TYPE_LABELS[candidate && candidate.type] || '记录'
  const err = new Error(`该时间段已有${label}记录，请调整时间后再保存。`)
  err.code = 'RECORD_TIME_OVERLAP'
  err.title = '输入存在问题'
  err.content = err.message
  return err
}

function isRecordOverlapError(err) {
  return !!err && err.code === 'RECORD_TIME_OVERLAP'
}

function getRecordOverlapErrorContent(err) {
  return isRecordOverlapError(err) ? (err.content || err.message) : ''
}

module.exports = {
  isOverlapCheckedType,
  getRecordTimeRange,
  rangesOverlap,
  findSameTypeOverlap,
  createRecordOverlapError,
  isRecordOverlapError,
  getRecordOverlapErrorContent
}
