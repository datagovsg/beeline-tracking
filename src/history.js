const AWS = require('aws-sdk')
const geohash = require('ngeohash')

const { callbackWithFactory } = require('./utils/callback-helpers')

const addQueryStringParameters = (params, { limit, from, to }) => {
  const validNumber = x => x && Number(x) > 0
  if (validNumber(limit)) {
    params.Limit = Number(limit)
  }
  if (validNumber(from) && validNumber(to)) {
    params.KeyConditionExpression =
      'tripId = :v1 and #time BETWEEN :from AND :to'
    params.ExpressionAttributeNames = { '#time': 'time' }
    params.ExpressionAttributeValues[':from'] = Number(from)
    params.ExpressionAttributeValues[':to'] = Number(to)
  } else if (validNumber(from)) {
    params.KeyConditionExpression = 'tripId = :v1 and #time >= :from'
    params.ExpressionAttributeNames = { '#time': 'time' }
    params.ExpressionAttributeValues[':from'] = Number(from)
  } else if (validNumber(to)) {
    params.KeyConditionExpression = 'tripId = :v1 and #time <= :to'
    params.ExpressionAttributeNames = { '#time': 'time' }
    params.ExpressionAttributeValues[':to'] = Number(to)
  }
}

const makeGET = dynamoDb => (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)

  const tripId = Number(event.pathParameters.tripId)
  const params = {
    ExpressionAttributeValues: {
      ':v1': tripId,
    },
    KeyConditionExpression: 'tripId = :v1',
    TableName: process.env.TRACKING_TABLE,
    ScanIndexForward: false,
  }
  addQueryStringParameters(params, event.queryStringParameters || {})
  dynamoDb.query(params, (error, data) => {
    if (error) {
      console.error(error)
      callbackWith(500, { error })
    } else {
      const body = (data.Items || []).map(p => {
        const { latitude, longitude } = geohash.decode(p.location)
        const coordinates = {
          type: 'Point',
          coordinates: [longitude, latitude],
        }
        return Object.assign(p, { coordinates })
      })
      callbackWith(200, body)
    }
  })
}

const makeExports = dynamoDb => ({
  makeGET,
  get: makeGET(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
