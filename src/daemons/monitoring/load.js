const { batchWrite } = require('../../utils/dynamodb-load')

module.exports = (dynamoDb, payloads) => {
  const [performance, monitoring, events] = payloads

  return Promise.all([
    batchWrite(dynamoDb, process.env.PERFORMANCE_TABLE, performance),
    batchWrite(dynamoDb, process.env.MONITORING_TABLE, monitoring),
    batchWrite(dynamoDb, process.env.EVENTS_TABLE, events),
  ]).then(() => payloads)
}
