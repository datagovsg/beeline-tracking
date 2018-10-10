const AWS = require('aws-sdk')
const moment = require('moment-timezone')
const fcsv = require('fast-csv')
const _ = require('lodash')

const auth = require('./utils/auth')
const { callbackWithFactory } = require('./utils/callback-helpers')

const sgMoment = date => moment.tz(date, 'Asia/Singapore')
const makeSGTimestampString = date =>
  date ? sgMoment(date).toISOString(true) : date
const makeSGDate = date => sgMoment(date).format('YYYY-MM-DD')

const lookupTransportCompanyIds = function lookupTransportCompanyIds (headers) {
  return auth
    .lookupEntitlements(headers)
    .then(credentials =>
      auth.getCompaniesByRole(credentials, 'monitor-operations')
    )
}

const lookup = function lookup (dynamoDb, query) {
  return dynamoDb
    .query(query)
    .promise()
    .then(data => data.Items || [])
    .catch(err => {
      console.error(err)
      return []
    })
}

const csvFrom = function csvFrom (data, columnNames, dataToRows) {
  const rows = _(data)
    .map(dataToRows)
    .flatten()
    .value()

  return new Promise((resolve, reject) =>
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
}

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
  const fromDate = makeSGDate(from || Date.now())
  const toDate = makeSGDate(to || Date.now())

  const performanceByDateQuery = {
    ExpressionAttributeValues: {
      ':v1': Number(routeId),
      ':d1': fromDate,
      ':d2': toDate,
    },
    ExpressionAttributeNames: {
      '#date': 'date',
    },
    KeyConditionExpression: 'routeId = :v1 AND #date BETWEEN :d1 AND :d2',
    TableName: process.env.PERFORMANCE_TABLE,
    ScanIndexForward: false,
  }

  const columnNames = [
    'routeId',
    'date',
    'label',
    'stopId',
    'description',
    'road',
    'canBoard',
    'canAlight',
    'pax',
    'expectedTime',
    'actualTime',
    'actualLocation',
    'timeDifferenceMinutes',
  ]

  const dataToRows = d =>
    d.stops.map(s => [
      d.routeId,
      d.date,
      d.label,
      s.stopId,
      s.description,
      s.road,
      s.canBoard,
      s.canAlight,
      s.pax,
      makeSGTimestampString(s.expectedTime),
      makeSGTimestampString(s.actualTime),
      s.actualLocation,
      s.actualTime
        ? moment(s.actualTime).diff(s.expectedTime, 'minutes')
        : null,
    ])

  const filename = `${routeId} - ${fromDate} to ${toDate}.csv`
  const csvHeaders = {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${filename}"`,
  }

  return Promise.all([
    lookupTransportCompanyIds(headers),
    lookup(dynamoDb, performanceByDateQuery),
  ])
    .then(([transportCompanyIds, performance]) => {
      const data = performance.filter(p =>
        transportCompanyIds.includes(p.transportCompanyId)
      )
      return format === 'csv'
        ? Promise.all([csvFrom(data, columnNames, dataToRows), csvHeaders])
        : Promise.resolve([data, undefined])
    })
    .then(([data, headers]) => callbackWith(200, data, headers))
    .catch(onError(callbackWith))
}

const makeEvents = dynamoDb => (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)
  const { headers, pathParameters: { routeId }, queryStringParameters } = event

  const { date, format } = queryStringParameters || {}
  const key = `${makeSGDate(date || Date.now())}|${routeId}`

  const eventsByDateQuery = {
    ExpressionAttributeValues: {
      ':v1': key,
    },
    KeyConditionExpression: 'dateRoute = :v1',
    TableName: process.env.EVENTS_TABLE,
    ScanIndexForward: false,
  }

  const columnNames = [
    'routeId',
    'date',
    'label',
    'time',
    'type',
    'severity',
    'delayInMins',
    'message',
  ]
  const dataToRows = d => {
    const [date, routeId] = d.dateRoute.split('|')
    return [
      [
        routeId,
        date,
        d.trip.route.label,
        makeSGTimestampString(d.time),
        d.type,
        d.severity,
        d.delayInMins,
        d.message,
      ],
    ]
  }

  const csvHeaders = {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${routeId} - ${date}.csv"`,
  }

  return Promise.all([
    lookupTransportCompanyIds(headers),
    lookup(dynamoDb, eventsByDateQuery),
  ])
    .then(([transportCompanyIds, events]) => {
      const data = events.filter(
        e =>
          transportCompanyIds.includes(e.trip.route.transportCompanyId) &&
          Number(e.severity) > 0
      )
      return format === 'csv'
        ? Promise.all([csvFrom(data, columnNames, dataToRows), csvHeaders])
        : Promise.resolve([data, undefined])
    })
    .then(([data, headers]) => callbackWith(200, data, headers))
    .catch(onError(callbackWith))
}

const makeStatus = dynamoDb => (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)
  const { headers } = event
  const time = sgMoment(new Date())
    .startOf('date')
    .valueOf()

  const queryStatusBy = transportCompanyId => ({
    ExpressionAttributeNames: {
      '#time': 'time',
    },
    ExpressionAttributeValues: {
      ':v1': transportCompanyId,
      ':v2': time,
    },
    KeyConditionExpression: 'transportCompanyId = :v1 AND #time >= :v2',
    TableName: process.env.MONITORING_TABLE,
    ScanIndexForward: false,
    Limit: 1,
  })

  const lookupMonitoringById = transportCompanyId =>
    lookup(dynamoDb, queryStatusBy(transportCompanyId)).then(items => {
      const [status] = items || []
      return (status || {}).monitoring || {}
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
  makeEvents,
  makePerformance,
  performance: makePerformance(dynamoDb),
  events: makeEvents(dynamoDb),
  status: makeStatus(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
