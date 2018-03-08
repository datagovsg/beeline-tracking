// const pgp = require("pg-promise")()
//
// const db = pgp(process.env.DATABASE_URL)
//
// let lookupEventSubscriptions = db.query(`select * from eventSubscriptions`)

const isPublishNoPings = record => {
  const { OldImage, NewImage } = record.dynamodb
  return (
    record.eventName === "MODIFY" &&
    NewImage.type.S === "noPings" &&
    NewImage.time.N - OldImage.time.N > 60 * 60 * 1000 &&
    NewImage.activeTrip.B
  )
}

module.exports.publish = (event, context, callback) => {
  console.log(`Before - ${JSON.stringify(event.Records)}`)
  const recordsToPublish = event.Records.filter(
    record => record.eventName === "INSERT" || isPublishNoPings(record)
  )
  console.log(`After - ${JSON.stringify(recordsToPublish)}`)
  callback(undefined, "Done.")
}
