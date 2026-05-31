const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { secretId: SECRET_ID, secretKey: SECRET_KEY } = require('./secret')

const HOST = 'tts.tencentcloudapi.com'
const SERVICE = 'tts'
const ACTION = 'TextToVoice'
const VERSION = '2019-08-23'
const REGION = 'ap-shanghai'
const MAX_TEXT_LENGTH = 150

function sign(secretId, secretKey, body, timestamp) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const credentialScope = `${date}/${SERVICE}/tc3_request`

  const hashedPayload = crypto.createHash('sha256').update(body).digest('hex')
  const canonicalRequest = [
    'POST',
    '/',
    '',
    'content-type:application/json',
    `host:${HOST}`,
    '',
    'content-type;host',
    hashedPayload
  ].join('\n')

  const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonical}`

  const secretDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
  const secretService = crypto.createHmac('sha256', secretDate).update(SERVICE).digest()
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`
}

function normalizeText(text) {
  return String(text || '')
    .replace(/[·•]/g, '。')
    .replace(/\s+/g, ' ')
    .replace(/([。！？])+/g, '$1')
    .trim()
    .slice(0, MAX_TEXT_LENGTH)
}

function callTTS(text, options = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({
      Text: text,
      SessionId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      Volume: options.volume == null ? 2 : options.volume,
      Speed: options.speed == null ? -0.2 : options.speed,
      ProjectId: 0,
      ModelType: 1,
      VoiceType: options.voiceType || 1002,
      PrimaryLanguage: 1,
      SampleRate: 16000,
      Codec: 'mp3'
    })
    const authorization = sign(SECRET_ID, SECRET_KEY, body, timestamp)

    const req = https.request({
      hostname: HOST,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': HOST,
        'Authorization': authorization,
        'X-TC-Action': ACTION,
        'X-TC-Version': VERSION,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': REGION
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`响应解析失败: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('TTS请求超时(15s)'))
    })
    req.write(body)
    req.end()
  })
}

exports.main = async (event) => {
  const text = normalizeText(event && event.text)
  if (!text) return { success: false, error: '缺少播报文本' }

  try {
    const result = await callTTS(text, event.options || {})
    const response = result.Response || {}
    if (response.Audio) {
      return {
        success: true,
        audio: response.Audio,
        format: 'mp3',
        requestId: response.RequestId || '',
        text
      }
    }

    const err = response.Error
    return {
      success: false,
      error: err ? `${err.Code}: ${err.Message}` : '语音合成失败'
    }
  } catch (e) {
    console.error('[textToSpeech] 异常:', e.message, e.stack)
    return { success: false, error: e.message }
  }
}
