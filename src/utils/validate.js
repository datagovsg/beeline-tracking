const jwt = require('jsonwebtoken')

// TODO: Refactor this to use proper Errors
const VALIDATION_ERROR = { validationError: 'Ping invalid: no driver id found' }

const whereTripIdIs = tripId => ({
  ExpressionAttributeValues: {
    ':v1': tripId,
  },
  KeyConditionExpression: 'tripId = :v1',
  TableName: process.env.ROSTER_TABLE,
  ScanIndexForward: false,
  Limit: 1,
})

const invalidDriverOrVehicle = (tripId, driverId, vehicleId) => ({
  validationError: `Ping invalid: Trip ${tripId} should not have driver ${
    driverId
  } or vehicle ${vehicleId}`,
})

const validateDriverWithRoster = (driverId, event, { vehicleId }, dynamoDb) =>
  new Promise((resolve, reject) => {
    const tripId = Number(event.pathParameters.tripId)

    dynamoDb.query(whereTripIdIs(tripId), (validationError, data) => {
      if (validationError) {
        console.error(validationError)
        reject({ validationError }) // eslint-disable-line prefer-promise-reject-errors
      } else {
        const [roster] = data.Items || []
        if (!roster) {
          resolve({ driverId })
        } else {
          const valid =
            driverId === roster.driverId &&
            (!roster.vehicleId ||
              Number(vehicleId) === Number(roster.vehicleId))
          if (!valid) {
            console.error(
              `Roster is ${JSON.stringify(roster)}, ping is ${JSON.stringify({
                tripId,
                driverId,
                vehicleId,
              })}`
            )
            reject(invalidDriverOrVehicle(tripId, driverId, vehicleId))
          } else {
            resolve({ driverId })
          }
        }
      }
    })
  })

/**
 * Given an AWS Lambda event and a data object containing driver and trip
 * information, verify that the driver is meant to be driving the specified
 * vehicle on the specified trip
 * @param {object} event
 *   an AWS Lambda serverless event - pathParameters contains tripId, and
 *   headers contains an authorization token from a driver
 * @param {object} data
 *   an object containing a vehicleId
 * @param {object} dynamoDb
 *   the DynamoDB client
 * @return {Promise}
 *   resolves to driverId if the event is considered valid (see above),
 *   or rejects with validationError otherwise
 */
function validatePing (event, data, dynamoDb) {
  return new Promise((resolve, reject) => {
    const authorization =
      event.headers.authorization || event.headers.Authorization
    const [, token] = (authorization || '').split(' ')

    if (!token) {
      reject(VALIDATION_ERROR)
    }

    try {
      const credentials = jwt.verify(token, process.env.AUTH0_SECRET)
      const { driverId } = credentials

      if (driverId) {
        resolve(validateDriverWithRoster(driverId, event, data, dynamoDb))
      } else {
        reject(VALIDATION_ERROR)
      }
    } catch (validationError) {
      reject({ validationError }) // eslint-disable-line prefer-promise-reject-errors
    }
  })
}

module.exports = { validatePing }
