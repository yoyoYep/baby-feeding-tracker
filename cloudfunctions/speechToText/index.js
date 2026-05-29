const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { secretId: SECRET_ID, secretKey: SECRET_KEY } = require('./secret')

function sign(secretId, secretKey, body, timestamp) {
  const service = 'asr'
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const credentialScope = `${date}/${service}/tc3_request`

  const hashedPayload = crypto.createHash('sha256').update(body).digest('hex')
  const canonicalRequest = [
    'POST',
    '/',
    '',
    'content-type:application/json',
    'host:asr.tencentcloudapi.com',
    '',
    'content-type;host',
    hashedPayload
  ].join('\n')

  const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonical}`

  const secretDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`
}

function callASR(params) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000)
    const body = JSON.stringify(params)
    const authorization = sign(SECRET_ID, SECRET_KEY, body, timestamp)

    const options = {
      hostname: 'asr.tencentcloudapi.com',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': 'asr.tencentcloudapi.com',
        'Authorization': authorization,
        'X-TC-Action': 'SentenceRecognition',
        'X-TC-Version': '2019-06-14',
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': 'ap-shanghai'
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`响应解析失败: ${data.substring(0, 200)}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ASR请求超时(15s)')) })
    req.write(body)
    req.end()
  })
}

exports.main = async (event) => {
  const { fileID } = event
  console.log('[speechToText] 收到请求, fileID:', fileID)

  if (!fileID) {
    return { success: false, error: '缺少音频文件ID' }
  }

  try {
    const res = await cloud.downloadFile({ fileID })
    const audioBuffer = res.fileContent
    console.log('[speechToText] 音频下载成功, 大小:', audioBuffer.length, 'bytes')

    if (audioBuffer.length < 100) {
      return { success: false, error: '音频文件过小，可能上传失败' }
    }

    const base64Audio = audioBuffer.toString('base64')

    const params = {
      EngSerViceType: '16k_zh',
      SourceType: 1,
      VoiceFormat: 'mp3',
      Data: base64Audio,
      DataLen: audioBuffer.length
    }

    console.log('[speechToText] 调用ASR, 音频大小:', audioBuffer.length, ', base64长度:', base64Audio.length)

    const result = await callASR(params)
    console.log('[speechToText] ASR响应:', JSON.stringify(result).substring(0, 500))

    if (result.Response && result.Response.Result) {
      return { success: true, text: result.Response.Result }
    } else {
      const err = result.Response && result.Response.Error
      console.error('[speechToText] ASR错误:', JSON.stringify(err))
      return {
        success: false,
        error: err ? `${err.Code}: ${err.Message}` : '识别失败，无返回结果'
      }
    }
  } catch (e) {
    console.error('[speechToText] 异常:', e.message, e.stack)
    return { success: false, error: e.message }
  }
}
