const sinon = require('sinon')
const geohash = require('ngeohash')
const { expect } = require('chai')

const validate = require('../src/utils/validate')
const { makePOST } = require('../src/latest')

describe('handler for POSTing pings', () => {
  const mockDynamoClient = (errorOnInsert) => ({
    put: (params, onInsert) => {
      onInsert(errorOnInsert)
      return { promise: () => Promise.resolve() }
    },
  })

  const ping = {
    driverId: 34,
    vehicleId: 56,
    latitude: 1.08,
    longitude: 103.56,
  }

  const event = {
    pathParameters: { tripId: 12 },
    body: JSON.stringify(ping),
  }

  beforeEach(() => {
    const validatePing = sinon.stub(validate, 'validatePing')
    validatePing.returns(Promise.resolve({ driverId: ping.driverId }))
  })

  afterEach(() => {
    validate.validatePing.restore()
  })

  it('should callback with 200 on successful insert', (done) => {
    const callback = sinon.spy()
    const handler = makePOST(mockDynamoClient())
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true

        const [, response] = callback.firstCall.args
        expect(response.statusCode).equal(200)

        const { item } = JSON.parse(response.body)
        delete item.time
        expect(item).deep.equal({
          tripId: event.pathParameters.tripId,
          driverId: ping.driverId,
          vehicleId: ping.vehicleId,
          location: geohash.encode(ping.latitude, ping.longitude, 15),
        })
        done()
      })
  })

  it('should callback with error on failure', (done) => {
    const errorOnInsert = { statusCode: 500, message: 'fail' }
    const callback = sinon.spy()
    const handler = makePOST(mockDynamoClient(errorOnInsert))
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true

        const [, response] = callback.firstCall.args
        expect(response.statusCode).equal(errorOnInsert.statusCode)

        const { item, error } = JSON.parse(response.body)
        delete item.time
        expect(item).deep.equal({
          tripId: event.pathParameters.tripId,
          driverId: ping.driverId,
          vehicleId: ping.vehicleId,
          location: geohash.encode(ping.latitude, ping.longitude, 15),
        })
        expect(error).deep.equal(errorOnInsert)
        done()
      })
      .catch(done)
  })

  it('should callback with error on validation fail', (done) => {
    const expectedError = new Error('Unauthorized')
    validate.validatePing.returns(Promise.reject(expectedError))
    const callback = sinon.spy()
    const handler = makePOST(mockDynamoClient())
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true

        const [, response] = callback.firstCall.args
        expect(response.statusCode).equal(400)
        const { error } = JSON.parse(response.body)
        expect(error.name).equal(expectedError.name)
        expect(error.message).equal(expectedError.message)
        expect(error.stack).equal(expectedError.stack)
        done()
      })
      .catch(done)
  })
})
