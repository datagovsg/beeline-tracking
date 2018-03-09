const _ = require("lodash")
const pgp = require("pg-promise")()
const TelegramBot = require("node-telegram-bot-api")

const loadEventSubscriptions = db => {
  console.log("Loading event subscriptions")
  return db
    .any(
      `SELECT event, handler, params, agent, "transportCompanyId" FROM "eventSubscriptions"`
    )
    .then(subs => _.groupBy(subs, "transportCompanyId"))
}

const EVENT_TO_PAYLOAD = {
  noPings: event => ({
    message:
      `Driver app was not switched on ` +
      `${Math.floor(Number(event.delayInMins.N))} mins before start of ` +
      `${event.trip.M.route.M.label.S} ` +
      `${event.trip.M.route.M.from.S} to ${event.trip.M.route.M.to.S} (on ${
        event.trip.M.date.S
      })`,
    severity: Number(event.delayInMins.N) <= 5 ? 5 : 4,
  }),
  lateArrival: event => ({
    message:
      `Bus arrived ${Math.floor(Number(event.delayInMins.N))} mins late ${
        event.trip.M.route.M.label.S
      } ` +
      `${event.trip.M.route.M.from.S} to ${event.trip.M.route.M.to.S} (${
        event.trip.M.date.S
      })`,
  }),
  lateETA: event => ({
    message:
      `Bus may be ${Math.floor(Number(event.delayInMins.N))} mins late ${
        event.trip.M.route.M.label.S
      } ` +
      `${event.trip.M.route.M.from.S} to ${event.trip.M.route.M.to.S} (${
        event.trip.M.date.S
      })`,
  }),
}

const isPublishNoPings = record => {
  const { OldImage, NewImage } = record.dynamodb
  return (
    record.eventName === "MODIFY" &&
    NewImage.type.S === "noPings" &&
    Number(NewImage.time.N) - Number(OldImage.time.N) > 60 * 60 * 1000 &&
    NewImage.activeTrip.B
  )
}

const sendToTelegram = (bot, payload) => subscriber => {
  const { agent: { notes: { telegramChatId } } } = subscriber
  let criticality =
    payload.severity && payload.severity >= 6
      ? "EMERGNCY"
      : payload.severity && payload.severity >= 5 ? "CRITICAL" : "OPS"

  const message = `[${criticality}] ${
    payload.message
  } Sent: ${new Date().toLocaleTimeString()}`
  console.log(`Sending ${telegramChatId} - ${message}`)
  // return bot.sendMessage(telegramChatId, message)
  return Promise.resolve()
}

const makePublish = (lookupEventSubscriptions, bot) => (
  event,
  context,
  callback
) => {
  const eventsToPublish = event.Records.filter(
    record => record.eventName === "INSERT" || isPublishNoPings(record)
  ).map(record => record.dynamodb.NewImage)
  return lookupEventSubscriptions
    .then(subsByCompany => {
      const publishPromises = eventsToPublish.map(event => {
        const transportCompanyId = Number(
          event.trip.M.route.M.transportCompanyId.N
        )
        const routeId = Number(event.trip.M.routeId.N)
        const type = event.type.S

        const relevantSubscribers = (
          subsByCompany[transportCompanyId] || []
        ).filter(
          sub =>
            sub.event === type &&
            (!sub.params.routeIds || sub.params.routeIds.includes(routeId))
        )
        const subscribersByHandler = _.groupBy(
          relevantSubscribers || [],
          "handler"
        )
        console.warn("WARN: Only handling telegram subscribers")
        const telegramSubscribers = subscribersByHandler.telegram
        if (
          telegramSubscribers &&
          telegramSubscribers.length &&
          typeof EVENT_TO_PAYLOAD[type] === "function"
        ) {
          const payload = EVENT_TO_PAYLOAD[type](event)
          return Promise.all(
            telegramSubscribers.map(sendToTelegram(bot, payload))
          )
        } else {
          return Promise.resolve()
        }
      })
      return Promise.all(publishPromises)
    })
    .then(() => callback(null, { message: "Done" }))
    .catch(callback)
}

module.exports.makePublish = makePublish
module.exports.publish = makePublish(
  loadEventSubscriptions(pgp(process.env.DATABASE_URL)),
  new TelegramBot(process.env.TELEGRAM_TOKEN)
)
