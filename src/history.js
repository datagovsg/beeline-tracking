const AWS = require('aws-sdk')
const geohash = require('ngeohash')

const {callbackWithFactory} = require('./callback-helpers')

const makeGET = (dynamoDb) => (event, context, callback) => {
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
  const {limit} = (event.queryStringParameters || {})
  if (limit && Number(limit) > 0) {
    params.Limit = Number(event.queryStringParameters.limit)
  }
  dynamoDb.query(params, (error, data) => {
    if (error) {
      console.error(error)
      callbackWith(500, {error})
    } else {
      const body = (data.Items || []).map(
        p => {
          const {latitude, longitude} = geohash.decode(p.location)
          const coordinates = {
            type: 'Point',
            coordinates: [longitude, latitude],
          }
          return Object.assign(p, {coordinates})
        }
      )
      callbackWith(200, body)
    }
  })
}

const makeExports = (dynamoDb) => ({
  makeGET,
  get: makeGET(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
