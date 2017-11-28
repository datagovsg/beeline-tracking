const jwt = require('jsonwebtoken')

const VALIDATION_ERROR = {validationError: 'Ping invalid: no driver id found'}

/**
 * Given an AWS Lambda event and a data object containing driver and trip
 * information, verify that the driver is meant to be driving the specified
 * vehicle on the specified trip
 * @param {object} event
 *   an AWS Lambda serverless event - pathParameters contains tripId, and
 *   headers contains an authorization token from a driver
 * @param {object} data
 *   an object containing a vehicleId
 * @return {object}
 *   contains driverId if the event is considered valid (see above),
 *   or validationError otherwise
 */
function validatePing (event, data) {
  const authorization =
    event.headers.authorization || event.headers.Authorization
  const [, token] = (authorization || '').split(' ')

  if (!token) {
    return VALIDATION_ERROR
  }

  try {
    const credentials = jwt.verify(token, process.env.AUTH0_SECRET)
    const {driverId} = credentials

    // TODO: look up the trip id on DynamoDB, ensure that
    // this driver is meant to be driving this vehicle on this trip

    return driverId ? credentials : VALIDATION_ERROR
  } catch (validationError) {
    return {validationError}
  }
}

module.exports = {validatePing}
