const { flatten } = require("lodash")

const BATCH_SIZE = 25

const makeBatchWrite = (dynamoDb, tableName) => batch =>
  new Promise((resolve, reject) => {
    const requests = batch.map(item => ({ PutRequest: { Item: item } }))
    const params = { RequestItems: { [tableName]: requests } }
    dynamoDb.batchWrite(params, (err, data) => {
      if (err) {
        // Just log the error, this is run regularly
        console.warn("Unable to batch write: " + JSON.stringify(err), err.stack)
        resolve([])
      } else {
        const remaining = (data.UnprocessedItems[tableName] || []).map(
          v => v.PutRequest.Item
        )
        resolve(remaining)
      }
    })
  })

const makeItemWrite = (dynamoDb, tableName) => item =>
  new Promise((resolve, reject) => {
    const params = { TableName: tableName, Item: item }
    dynamoDb.put(params, (err, data) => {
      if (err) {
        // Just log the error, this is run regularly
        console.warn("Unable to write: " + err, err.stack)
      }
      resolve()
    })
  })

/**
 * @param {Object} dynamoDb - an AWS.DynamoDB.DocumentClient
 * @param {String} tableName - the table to write to
 * @param {Array} payload - an array of items to write
 * @return {Promise} a Promise that blocks on the completion of all writes
 */
function batchWrite(dynamoDb, tableName, payload) {
  // Split payload into batches of 25
  const batches = []
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    batches.push(payload.slice(i, i + BATCH_SIZE))
  }
  // map batches into a batchWrite wrapped in Promise.all
  const batchWrites = Promise.all(
    batches.map(makeBatchWrite(dynamoDb, tableName))
  )
  // All unprocessed items will be mapped to PutItem
  return batchWrites
    .then(remainingByBatch => flatten(remainingByBatch))
    .then(remaining =>
      Promise.all(remaining.map(makeItemWrite(dynamoDb, tableName)))
    )
}

module.exports = (dynamoDb, payloads) => {
  const [performance, monitoring, events] = payloads

  return Promise.all([
    batchWrite(dynamoDb, process.env.PERFORMANCE_TABLE, performance),
    batchWrite(dynamoDb, process.env.MONITORING_TABLE, monitoring),
    batchWrite(dynamoDb, process.env.EVENTS_TABLE, events),
  ]).then(() => payloads)
}
