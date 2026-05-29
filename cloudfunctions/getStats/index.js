const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { days = 7 } = event

  const now = new Date()
  const startDate = new Date(now.getTime() - days * 86400000)

  try {
    const result = await db.collection('records')
      .where({
        userId: OPENID,
        startTime: _.gte(startDate)
      })
      .orderBy('startTime', 'asc')
      .limit(1000)
      .get()

    const records = result.data
    const dailyStats = {}

    records.forEach(r => {
      const dateKey = new Date(r.startTime).toISOString().split('T')[0]
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { feeding: [], sleep: [], diaper: [] }
      }

      if (r.type === 'feeding' && r.status === 'completed') {
        dailyStats[dateKey].feeding.push(r)
      } else if (r.type === 'sleep' && r.status === 'completed') {
        dailyStats[dateKey].sleep.push(r)
      } else if (r.type === 'diaper') {
        dailyStats[dateKey].diaper.push(r)
      }
    })

    const summary = Object.entries(dailyStats).map(([date, data]) => ({
      date,
      feedingCount: data.feeding.length,
      totalAmount: data.feeding.reduce((s, r) => s + ((r.data && r.data.amount) || 0), 0),
      sleepMinutes: data.sleep.reduce((s, r) => {
        if (r.endTime) return s + (new Date(r.endTime) - new Date(r.startTime)) / 60000
        return s
      }, 0),
      diaperCount: data.diaper.length
    }))

    return { success: true, data: summary }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
