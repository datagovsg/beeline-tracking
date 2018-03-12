const _ = require("lodash")
const AWS = require("aws-sdk")
const pgp = require("pg-promise")()

const { batchWrite } = require("../utils/dynamodb-load")

const db = pgp(process.env.DATABASE_URL)
const dynamoDb = new AWS.DynamoDB.DocumentClient()

module.exports.handler = (event, context, callback) => {
  return db
    .any(
      `SELECT event, handler, params, agent, "transportCompanyId" FROM "eventSubscriptions"`
    )
    .then(subs => {
      const subsByCompany = _.groupBy(subs, "transportCompanyId")
      const payload = _(subsByCompany)
        .toPairs()
        .map(([transportCompanyId, subscriptions]) => ({
          subscriptions,
          transportCompanyId: Number(transportCompanyId),
        }))
        .value()
      return batchWrite(dynamoDb, process.env.EVENT_SUBS_TABLE, payload)
    })
    .then(() => callback(null, { message: "Done" }))
    .catch(callback)
}
