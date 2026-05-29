const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID
  const { action, role, nickname, targetId, displayName } = event

  switch (action) {
    case 'getMyInfo': {
      const res = await db.collection('family_members').where({ openId }).get()
      if (res.data.length > 0) {
        return { success: true, data: res.data[0] }
      }
      return { success: false, error: 'not_found' }
    }

    case 'register': {
      const existing = await db.collection('family_members').where({ openId }).get()
      if (existing.data.length > 0) {
        if (displayName && !existing.data[0].displayName) {
          await db.collection('family_members').doc(existing.data[0]._id).update({
            data: { displayName }
          })
          existing.data[0].displayName = displayName
        }
        return { success: true, data: existing.data[0] }
      }
      const member = {
        openId,
        role,
        nickname: nickname || role,
        displayName: displayName || '',
        joinedAt: db.serverDate(),
        status: 'active'
      }
      const res = await db.collection('family_members').add({ data: member })
      return { success: true, data: { ...member, _id: res._id } }
    }

    case 'updateRole': {
      const me = await db.collection('family_members').where({ openId }).get()
      if (me.data.length === 0) {
        return { success: false, error: 'not_found' }
      }
      await db.collection('family_members').doc(me.data[0]._id).update({
        data: { role, nickname: nickname || role }
      })
      return { success: true, data: { ...me.data[0], role, nickname: nickname || role } }
    }

    case 'updateMemberRole': {
      const caller = await db.collection('family_members').where({ openId }).get()
      if (caller.data.length === 0 || caller.data[0].role !== '妈妈') {
        return { success: false, error: '仅妈妈可修改成员角色' }
      }
      if (!targetId) {
        return { success: false, error: '缺少目标成员' }
      }
      await db.collection('family_members').doc(targetId).update({
        data: { role, nickname: nickname || role }
      })
      return { success: true }
    }

    case 'getMembers': {
      const members = await db.collection('family_members').where({ status: 'active' }).get()
      return { success: true, data: members.data }
    }

    default:
      return { success: false, error: 'unknown_action' }
  }
}
