const AWS = require("aws-sdk")
const auth = require("./utils/auth")
const { callbackWithFactory } = require("./utils/callback-helpers")

const lookupTransportCompanyIds = headers =>
  auth
    .lookupEntitlements(headers)
    .then(credentials =>
      auth.getCompaniesByRole(credentials, "monitor-operations")
    )

const makeStatus = dynamoDb => (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)
  const { headers } = event

  const lookupMonitoringById = transportCompanyId =>
    dynamoDb
      .query({
        ExpressionAttributeValues: {
          ":v1": transportCompanyId,
        },
        KeyConditionExpression: "transportCompanyId = :v1",
        TableName: process.env.MONITORING_TABLE,
        ScanIndexForward: false,
        Limit: 1,
      })
      .promise()
      .then(data => {
        const [status] = data.Items || []
        return (status || {}).monitoring || {}
      })
      .catch(err => {
        console.error(err)
        return {}
      })

  const lookupMonitoring = lookupTransportCompanyIds(headers).then(
    transportCompanyIds =>
      Promise.all(transportCompanyIds.map(lookupMonitoringById))
  )

  return lookupMonitoring
    .then(
      monitoringParts =>
        monitoringParts.length ? Object.assign.apply(null, monitoringParts) : {}
    )
    .then(monitoring => callbackWith(200, monitoring))
    .catch(error => {
      if (error.response) {
        callbackWith(error.response.status || 500, error.response.data)
      } else {
        callbackWith(500, { error })
      }
    })
}

const makeExports = dynamoDb => ({
  makeStatus,
  status: makeStatus(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
