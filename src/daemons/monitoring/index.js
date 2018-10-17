const AWS = require('aws-sdk')
const moment = require('moment-timezone')

const database = require('../utils/database')

const db = database.getConnection(process.env.DATABASE_URL)
const dynamoDb = new AWS.DynamoDB.DocumentClient()

const extract = require('./extract')
const transform = require('./transform')
const load = require('./load')

const logCompletionOf = (v, start) => s => {
  const d = new Date()
  const msg = `${v} finished at ${d} in ${d.getTime() - start.getTime()}ms`
  console.log(msg)
  return s
}

module.exports.handler = (event, context, callback) => {
  const date = new Date()
  console.log(`Starting at ${date} (SGT date ${
    moment.tz(date, 'Asia/Singapore').format('YYYY-MM-DD')
  })`)
  const statusPromise = extract
    .infoByRouteId(
      db,
      dynamoDb,
      moment.tz(date, 'Asia/Singapore').format('YYYY-MM-DD')
    )
    .then(transform.injectArrivalHistory)
    .then(transform.injectArrivalStatus)
    .then(transform.createExportPayloads)
    .then(([performance, status, events]) =>
      Promise.all([
        performance,
        status,
        transform.filterRecentNoPings(dynamoDb, events),
      ])
    )
    .then(logCompletionOf('Query', date))
    .then(payloads => load(dynamoDb, payloads))
    .then(logCompletionOf('Entire operation', date))
    .then(s => {
      if (callback) {
        callback(null, { message: 'Done' })
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
