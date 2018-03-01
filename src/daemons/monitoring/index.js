const AWS = require("aws-sdk")
const df = require("dateformat")
const pgp = require("pg-promise")()

const db = pgp(process.env.DATABASE_URL)
const dynamoDb = new AWS.DynamoDB.DocumentClient()

const extract = require("./extract")
const transform = require("./transform")
const load = require("./load")

const logCompletionOf = (v, start) => s => {
  const d = new Date()
  const msg = `${v} finished at ${d} in ${d.getTime() - start.getTime()}ms`
  console.log(msg)
  return s
}

module.exports.handler = (event, context, callback) => {
  const date = new Date()
  console.log(`Starting at ${date}`)
  const statusPromise = extract
    .infoByRouteId(db, dynamoDb, df(date, "isoDate"))
    .then(transform.injectArrivalHistory)
    .then(transform.injectArrivalStatus)
    .then(transform.createExportPayloads)
    .then(logCompletionOf("Query", date))
    .then(payloads => load(dynamoDb, payloads))
    .then(logCompletionOf("Entire operation", date))
    .then(s => {
      if (callback) {
        callback(null, { message: "Done" })
      }
      return s
    })
    .catch(e => {
      console.error(e)
      if (callback) {
        callback(e)
      }
    })
  return statusPromise
}
