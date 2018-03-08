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
          sub => sub.params.routeIds.includes(routeId) && sub.event === type
        )
        if (relevantSubscribers.length) {
          console.log(
            `Event: ${JSON.stringify(event)}, Subscribers ${JSON.stringify(
              relevantSubscribers
            )}`
          )
        }
      })
    })
    .then(() => callback(null, { message: "Done" }))
}
