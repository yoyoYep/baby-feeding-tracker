const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { type, startTime, endTime, data, status, source, note } = event

  const record = {
    type,
    userId: OPENID,
    startTime: new Date(startTime),
    endTime: endTime ? new Date(endTime) : null,
    data: data || {},
    status: status || 'completed',
    source: source || 'manual',
    note: note || '',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  try {
    const result = await db.collection('records').add({ data: record })
    return { success: true, _id: result._id }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
