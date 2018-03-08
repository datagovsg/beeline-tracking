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

setInterval(
  () => (lookupEventSubscriptions = reloadEventSubscriptions()),
  10 * 60 * 1000
)

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
  if (eventsToPublish.length) {
    console.log(JSON.stringify(eventsToPublish))
  }
  lookupEventSubscriptions.then(subsByCompany => {
    eventsToPublish.forEach(event => {
      const transportCompanyId = Number(event.transportCompanyId.N)
      const relevantSubscribers = subsByCompany[transportCompanyId]
      console.log(`Event: ${event}, Subscribers ${relevantSubscribers}`)
    })
    callback(undefined, "Done.")
  })
}
