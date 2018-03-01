const AWS = require("aws-sdk")
const geohash = require("ngeohash")

const validate = require("./utils/validate")
const { callbackWithFactory } = require("./utils/callback-helpers")

const makePOST = dynamoDb => (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)

  const time = Date.now()
  const data = JSON.parse(event.body)

  const { vehicleId, latitude, longitude } = data
  const tripId = Number(event.pathParameters.tripId)

  return validate
    .validatePing(event, data, dynamoDb)
    .then(({ driverId }) => {
      const location = geohash.encode(latitude, longitude, 15)

      const params = {
        TableName: process.env.TRACKING_TABLE,
        Item: { tripId, driverId, vehicleId, time, location },
      }

      dynamoDb.put(params, error => {
        if (error) {
          console.error(error)
          callbackWith(error.statusCode || 501, { item: params.Item, error })
        } else {
          callbackWith(200, { item: params.Item })
        }
      })
    })
    .catch(error => {
      console.error(error)
      callbackWith((error.validationError || {}).statusCode || 400, {
        error: error.validationError || error,
      })
    })
}

const makeGET = dynamoDb => (event, context, callback) => {
  const tripId = Number(event.pathParameters.tripId)
  const params = {
    ExpressionAttributeValues: {
      ":v1": tripId,
    },
    KeyConditionExpression: "tripId = :v1",
    TableName: process.env.TRACKING_TABLE,
    ScanIndexForward: false,
    Limit: 1,
  }
  dynamoDb.query(params, (error, data) => {
    const callbackWith = callbackWithFactory(callback)

    if (error) {
      console.error(error)
      callbackWith(500, { error })
    } else {
      const [body] = data.Items || []
      if (!body) {
        callbackWith(404, { error: "Not Found" })
      } else {
        const { latitude, longitude } = geohash.decode(body.location)
        const coordinates = {
          type: "Point",
          coordinates: [longitude, latitude],
        }
        Object.assign(body, { coordinates })
        callbackWith(200, body)
      }
    }
  })
}

const makeExports = dynamoDb => ({
  makeGET,
  makePOST,
  get: makeGET(dynamoDb),
  post: makePOST(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
