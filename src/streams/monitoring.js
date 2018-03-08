const _ = require("lodash")
const pgp = require("pg-promise")()

const db = pgp(process.env.DATABASE_URL)

const reloadEventSubscriptions = () => {
  console.log("Reloading event subscriptions")
  return db
    .any(
      `SELECT event, handler, params, agent, "transportCompanyId" FROM "eventSubscriptions"`
    )
    .then(subs => _.groupBy(subs, "transportCompanyId"))
}

let lookupEventSubscriptions = reloadEventSubscriptions()

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

module.exports.publish = (event, context, callback) => {
  const eventsToPublish = event.Records.filter(
    record => record.eventName === "INSERT" || isPublishNoPings(record)
  ).map(record => record.dynamodb.NewImage)
  lookupEventSubscriptions
    .then(subsByCompany => {
      eventsToPublish.forEach(event => {
        const transportCompanyId = Number(
          event.trip.M.route.M.transportCompanyId.N
        )
        const routeId = Number(event.trip.M.routeId.N)
        const type = event.type.S
        const relevantSubscribers = subsByCompany[transportCompanyId].filter(
          sub =>
            sub.event === type &&
            (!sub.params.routeIds || sub.params.routeIds.includes(routeId))
        )
        if (
          relevantSubscribers.length &&
          typeof EVENT_TO_PAYLOAD[type] === "function"
        ) {
          const payload = EVENT_TO_PAYLOAD[type](event)
          console.log(
            `Event: ${JSON.stringify(event)},
             Payload: ${JSON.stringify(payload)},
             Subscribers: ${JSON.stringify(relevantSubscribers)}`
          )
        }
      })
    })
    .then(() => callback(null, { message: "Done" }))
    .catch(callback)
}
