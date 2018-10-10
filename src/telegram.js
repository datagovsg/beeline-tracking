const { callbackWithFactory } = require('./utils/callback-helpers')
const TelegramBot = require('node-telegram-bot-api')

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN)

const welcome = chatId => `
Welcome to the Beeline Server monitoring bot!
To receive notifications from me, tell your admin
to use your chat id to set up Telegram notifications.
Your Telegram chat id is ${chatId}
`

const hook = (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)
  const { message } = JSON.parse(event.body)
  if (message && message.chat && message.chat.id) {
    const { id: chatId } = message.chat
    bot.sendMessage(chatId, welcome(chatId)).catch(console.error)
    callbackWith(200, {})
  } else {
    console.warn(`Not handling ${event.body}`)
    callbackWith(200, {})
  }
}

module.exports = { hook }
