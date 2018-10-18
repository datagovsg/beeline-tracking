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
  const hasNoSubs = ({ transportCompanyId }) => !subbedCompanyIds.includes(transportCompanyId)

  const TableName = process.env.EVENT_SUBS_TABLE
  const params = { TableName, AttributesToGet: ['transportCompanyId'] }
  return dynamoDb.scan(params)
    .promise()
    .then(({ Items }) => Items.filter(hasNoSubs))
    .then(keys => Promise.all(keys.map(
      Key => dynamoDb.delete({ TableName, Key }).promise()
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
