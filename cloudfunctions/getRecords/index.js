const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { startDate, endDate, type, status, limit = 100 } = event

  let query = { userId: OPENID }

  if (startDate && endDate) {
    query.startTime = _.gte(new Date(startDate)).and(_.lt(new Date(endDate)))
  }

  if (type) query.type = type
  if (status) query.status = status

  try {
    const result = await db.collection('records')
      .where(query)
      .orderBy('startTime', 'desc')
      .limit(limit)
      .get()
    return { success: true, data: result.data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
