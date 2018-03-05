const AWS = require("aws-sdk")
const df = require("dateformat")
const fcsv = require("fast-csv")
const _ = require("lodash")

const auth = require("./utils/auth")
const { callbackWithFactory } = require("./utils/callback-helpers")

const lookupTransportCompanyIds = headers =>
  auth
    .lookupEntitlements(headers)
    .then(credentials =>
      auth.getCompaniesByRole(credentials, "monitor-operations")
    )

const onError = callbackWith => error => {
  if (error.response) {
    callbackWith(error.response.status || 500, error.response.data)
  } else {
    callbackWith(500, { error })
  }
}

const makePerformance = dynamoDb => (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)
  const { headers, pathParameters: { routeId }, queryStringParameters } = event

  const { from, to, format } = queryStringParameters || {}
  const fromDate = df(new Date(from || Date.now()), "isoDate")
  const toDate = df(new Date(to || Date.now()), "isoDate")

  const lookupPerformanceByDate = dynamoDb
    .query({
      ExpressionAttributeValues: {
        ":v1": Number(routeId),
        ":d1": fromDate,
        ":d2": toDate,
      },
      ExpressionAttributeNames: {
        "#date": "date",
      },
      KeyConditionExpression: "routeId = :v1 AND #date BETWEEN :d1 AND :d2",
      TableName: process.env.PERFORMANCE_TABLE,
      ScanIndexForward: false,
    })
    .promise()
    .then(data => data.Items || [])
    .catch(err => {
      console.error(err)
      return []
    })

  const csvFrom = data => {
    const columnNames = [
      "routeId",
      "date",
      "stopId",
      "description",
      "canBoard",
      "canAlight",
      "pax",
      "expectedTime",
      "actualTime",
      "actualLocation",
    ]
    const rows = _(data)
      .map(d =>
        d.stops.map(s => [
          d.routeId,
          d.date,
          s.stopId,
          s.description,
          s.canBoard,
          s.canAlight,
          s.pax,
          s.expectedTime,
          s.actualTime,
          s.actualLocation,
        ])
      )
      .flatten()
      .value()

    const csvPromise = new Promise((resolve, reject) =>
      fcsv.writeToString(
        [columnNames].concat(rows),
        { headers: true },
        (err, output) => {
          if (err) {
            reject(err)
          } else {
            resolve(output)
          }
        }
      )
    )

    const headers = {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${routeId} - ${
        fromDate
      } to ${toDate}.csv"`,
    }
    return Promise.all([csvPromise, headers])
  }

  return Promise.all([
    lookupTransportCompanyIds(headers),
    lookupPerformanceByDate,
  ])
    .then(([transportCompanyIds, performance]) => {
      const data = performance.filter(p =>
        transportCompanyIds.includes(p.transportCompanyId)
      )
      return format === "csv"
        ? csvFrom(data)
        : Promise.resolve([data, undefined])
    })
    .then(([data, headers]) => callbackWith(200, data, headers))
    .catch(onError(callbackWith))
}

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
    .catch(onError(callbackWith))
}

const makeExports = dynamoDb => ({
  makeStatus,
  makePerformance,
  performance: makePerformance(dynamoDb),
  status: makeStatus(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
