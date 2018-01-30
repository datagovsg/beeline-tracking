const jwt = require("jsonwebtoken")

const VALIDATION_ERROR = { validationError: "Ping invalid: no driver id found" }

/**
 * Given an AWS Lambda event and a data object containing driver and trip
 * information, verify that the driver is meant to be driving the specified
 * vehicle on the specified trip
 * @param {object} event
 *   an AWS Lambda serverless event - pathParameters contains tripId, and
 *   headers contains an authorization token from a driver
 * @param {object} data
 *   an object containing a vehicleId
 * @return {Promise}
 *   resolves to driverId if the event is considered valid (see above),
 *   or rejects with validationError otherwise
 */
function validatePing(event, data) {
  return new Promise((resolve, reject) => {
    const authorization =
      event.headers.authorization || event.headers.Authorization
    const [, token] = (authorization || "").split(" ")

    if (!token) {
      reject(VALIDATION_ERROR)
    }

    try {
      const credentials = jwt.verify(token, process.env.AUTH0_SECRET)
      const { driverId } = credentials

      // TODO: look up the trip id on DynamoDB, ensure that
      // this driver is meant to be driving this vehicle on this trip
      if (driverId) {
        resolve(credentials)
      } else {
        reject(VALIDATION_ERROR)
      }
    } catch (validationError) {
      reject({ validationError })
    }
  })
}

module.exports = { validatePing }
