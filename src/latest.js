const AWS = require('aws-sdk')
const geohash = require('ngeohash')

const validate = require('./validate')

const makePOST = (dynamoDb) => (event, context, callback) => {
  const callbackWith = (statusCode, item, error) => {
    const response = {}
    if (item) {
      response.item = item
    }
    if (error) {
      response.error = error
    }
    callback(null, {statusCode, body: JSON.stringify(response)})
  }

  const time = Date.now()
  const data = JSON.parse(event.body)

  const {vehicleId, latitude, longitude} = data
  const tripId = Number(event.pathParameters.tripId)

  const {driverId, validationError} = validate.validatePing(event, data)
  if (validationError) {
    callbackWith(validationError.statusCode || 400, undefined, validationError)
  } else {
    const location = geohash.encode(latitude, longitude)

    const params = {
      TableName: process.env.TRACKING_TABLE,
      Item: {tripId, driverId, vehicleId, time, location},
    }

    dynamoDb.put(params, (error) => {
      if (error) {
        console.error(error)
        callbackWith(error.statusCode || 501, params.Item, error)
      } else {
        callbackWith(200, params.Item)
      }
    })
  }
}

const makeGET = (dynamoDb) => (event, context, callback) => {
  const tripId = Number(event.pathParameters.tripId)
  const params = {
    ExpressionAttributeValues: {
      ':v1': tripId,
    },
    KeyConditionExpression: 'tripId = :v1',
    TableName: process.env.TRACKING_TABLE,
    ScanIndexForward: false,
    Limit: 1,
  }
  dynamoDb.query(params, (error, data) => {
    if (error) {
      console.error(error)
      callback(null, {statusCode: 500, body: JSON.stringify(error)})
    } else {
      const [body] = data.Items || []
      if (!body) {
        callback(null, {statusCode: 404, body: JSON.stringify({message: 'Not Found'})})
      } else {
        Object.assign(body, geohash.decode(body.location))
        callback(null, {statusCode: 200, body: JSON.stringify(body)})
      }
    }
  })
}

const makeExports = (dynamoDb) => ({
  makeGET,
  makePOST,
  get: makeGET(dynamoDb),
  post: makePOST(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
