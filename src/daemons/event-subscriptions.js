const _ = require('lodash')
const AWS = require('aws-sdk')

const load = require('../utils/dynamodb-load')
const database = require('../utils/database')

const db = database.getConnection(process.env.DATABASE_URL)
const dynamoDb = new AWS.DynamoDB.DocumentClient()

const updateExistingCompanySubscriptions = subs => {
  const subsByCompany = _.groupBy(subs, 'transportCompanyId')
  const payload = _(subsByCompany)
    .toPairs()
    .map(([transportCompanyId, subscriptions]) => ({
      subscriptions,
      transportCompanyId: Number(transportCompanyId),
    }))
    .value()
  return load.batchWrite(dynamoDb, process.env.EVENT_SUBS_TABLE, payload)
}

const removeCompaniesWithNoSubscriptions = subs => {
  const toCompanyId = ({ transportCompanyId }) => Number(transportCompanyId)

  const subbedCompanyIds = subs.map(toCompanyId)
  const hasNoSubs = id => !subbedCompanyIds.includes(id)

  const TableName = process.env.EVENT_SUBS_TABLE
  const params = { TableName, AttributesToGet: ['transportCompanyId'] }
  return dynamoDb.scan(params)
    .promise()
    .then(({ Items }) => Items.map(toCompanyId).filter(hasNoSubs))
    .then(ids => Promise.all(ids.map(
      HashKey => dynamoDb.delete({ TableName, Key: { HashKey } }).promise()
    )))
}

module.exports.handler = (event, context, callback) => {
  return db
    .any(
      `SELECT event, handler, params, agent, "transportCompanyId" FROM "eventSubscriptions"`
    )
    .then(subs => Promise.all([
      updateExistingCompanySubscriptions(subs),
      removeCompaniesWithNoSubscriptions(subs),
    ]))
    .then(() => callback(null, { message: 'Done' }))
    .catch(callback)
}
