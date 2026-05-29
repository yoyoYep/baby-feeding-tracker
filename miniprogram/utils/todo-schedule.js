function parseDateParts(dateStr) {
  const [year, month, day] = (dateStr || '').split('-').map(n => parseInt(n, 10))
  if (!year || !month || !day) return null
  return { year, month, day }
}

function diffDays(startDate, endDate) {
  const start = parseDateParts(startDate)
  const end = parseDateParts(endDate)
  if (!start || !end) return 0
  const startUtc = Date.UTC(start.year, start.month - 1, start.day)
  const endUtc = Date.UTC(end.year, end.month - 1, end.day)
  return Math.round((endUtc - startUtc) / 86400000)
}

function matchesTodoDate(todo, dateStr) {
  if (!todo || todo.enabled === false) return false
  if (todo.scheduleType === 'once') return todo.date === dateStr
  if (todo.scheduleType === 'range') {
    return (!todo.startDate || dateStr >= todo.startDate) && (!todo.endDate || dateStr <= todo.endDate)
  }
  if (todo.scheduleType === 'interval') {
    if (!todo.startDate || dateStr < todo.startDate) return false
    if (todo.endDate && dateStr > todo.endDate) return false
    const intervalDays = Math.max(1, parseInt(todo.intervalDays, 10) || 1)
    return diffDays(todo.startDate, dateStr) % intervalDays === 0
  }
  return !todo.startDate || dateStr >= todo.startDate
}

function getTodoScheduleText(todo) {
  if (!todo) return ''
  if (todo.scheduleType === 'once') return `${todo.date || ''} ${todo.time || ''}`
  if (todo.scheduleType === 'range') return `${todo.startDate || ''} 至 ${todo.endDate || ''} 每天 ${todo.time || ''}`
  if (todo.scheduleType === 'interval') {
    const intervalDays = Math.max(1, parseInt(todo.intervalDays, 10) || 1)
    const endText = todo.endDate ? ` 至 ${todo.endDate}` : ''
    return `${todo.startDate || ''}${endText} 每${intervalDays}天 ${todo.time || ''}`
  }
  return `每天 ${todo.time || ''}`
}

module.exports = { diffDays, matchesTodoDate, getTodoScheduleText }
