const AWS = require("aws-sdk")
const axios = require("axios")
const jwt = require("jsonwebtoken")
const { callbackWithFactory } = require("./utils/callback-helpers")

const makePUT = dynamoDb => (event, context, callback) => {
  const callbackWith = callbackWithFactory(callback)
  const { headers, pathParameters, body } = event
  const data = JSON.parse(body)
  const tripId = Number(pathParameters.tripId)
  const Authorization = headers.authorization || headers.Authorization
  axios
    .put(`${process.env.API_URL}/trips/${tripId}/setDriver`, data, {
      headers: { Authorization },
    })
    .then(response => {
      const [, token] = (Authorization || "").split(" ")
      const credentials = jwt.verify(token, process.env.AUTH0_SECRET)
      const { driverId } = credentials
      const time = Date.now()
      const params = {
        TableName: process.env.ROSTER_TABLE,
        Item: { tripId, driverId, time },
      }
      if (data && data.vehicleId) {
        params.Item.vehicleId = Number(data.vehicleId)
      }
      dynamoDb.put(params, error => {
        if (error) {
          console.error(error)
          callbackWith(error.statusCode || 500, { item: params.Item, error })
        } else {
          callbackWith(200, response.data)
        }
      })
    })
    .catch(error => {
      console.error(error)
      if (error.response) {
        const { data, status } = error.response
        callbackWith(status, data)
      } else {
        callbackWith(500, { error })
      }
    })
}

const makeExports = dynamoDb => ({
  makePUT,
  put: makePUT(dynamoDb),
})

module.exports = makeExports(new AWS.DynamoDB.DocumentClient())
