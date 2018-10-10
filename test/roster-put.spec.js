const sinon = require('sinon')
const jwt = require('jsonwebtoken')
const moxios = require('moxios')
const { expect } = require('chai')

const { makePUT } = require('../src/roster')

describe('handler for PUTing roster', () => {
  const mockDynamoClient = (errorOnInsert) => ({
    put: (params, onInsert) => onInsert(errorOnInsert),
  })

  const sign = (driverId, token = process.env.AUTH0_SECRET) =>
    `Bearer ${jwt.sign({ driverId }, token)}`
  const tripId = 1337
  const driverId = 42
  const vehicleId = 50

  const event = {
    body: JSON.stringify({ vehicleId }),
    pathParameters: { tripId },
  }

  before(() => {
    process.env.AUTH0_SECRET = 'toomanysecrets'
    process.env.API_URL = 'https://api.beeline.sg'
    event.headers = { Authorization: sign(driverId) }
  })

  after(() => {
    delete process.env.AUTH0_SECRET
    delete process.env.API_URL
  })

  beforeEach(() => {
    moxios.install()
  })

  afterEach(() => {
    moxios.uninstall()
  })

  it('should be OK on OK', (done) => {
    const callback = sinon.spy()
    const handler = makePUT(mockDynamoClient())

    handler(event, undefined, callback)

    moxios.wait(function () {
      const axiosResponse = {
        status: 200,
        response: { message: 'OK' },
      }
      let request = moxios.requests.mostRecent()
      request.respondWith(axiosResponse)
        .then(() => {
          expect(callback.calledOnce).to.be.true
          const [, { statusCode, body }] = callback.firstCall.args
          expect(statusCode).equal(axiosResponse.status)
          const response = JSON.parse(body)
          expect(response).deep.equal(axiosResponse.response)
          done()
        })
    })
  })

  it('should error on JWT error', (done) => {
    event.headers = { Authorization: sign(driverId, 'badtoken') }
    const callback = sinon.spy()
    const handler = makePUT(mockDynamoClient())

    handler(event, undefined, callback)

    moxios.wait(function () {
      const axiosResponse = {
        status: 200,
        response: { message: 'OK' },
      }
      let request = moxios.requests.mostRecent()
      request.respondWith(axiosResponse)
        .then(() => {
          expect(callback.calledOnce).to.be.true
          const [, { statusCode, body }] = callback.firstCall.args
          expect(statusCode).equal(500)
          const payload = JSON.parse(body)
          expect(payload.error).exist
          done()
        })
    })
  })

  it('should error on server error', (done) => {
    const callback = sinon.spy()
    const handler = makePUT(mockDynamoClient())

    handler(event, undefined, callback)

    moxios.wait(function () {
      const axiosResponse = {
        status: 403,
        response: { message: 'fail' },
      }
      let request = moxios.requests.mostRecent()
      request.respondWith(axiosResponse)
        .then(() => {
          expect(callback.calledOnce).to.be.true
          const [, { statusCode, body }] = callback.firstCall.args
          expect(statusCode).equal(axiosResponse.status)
          expect(body).equal(JSON.stringify(axiosResponse.response))
          done()
        })
    })
  })

  it('should error on server error', (done) => {
    const callback = sinon.spy()
    const handler = makePUT(mockDynamoClient())

    handler(event, undefined, callback)

    moxios.wait(function () {
      const axiosResponse = {
        status: 403,
        response: { message: 'fail' },
      }
      let request = moxios.requests.mostRecent()
      request.respondWith(axiosResponse)
        .then(() => {
          expect(callback.calledOnce).to.be.true
          const [, { statusCode, body }] = callback.firstCall.args
          expect(statusCode).equal(axiosResponse.status)
          expect(body).equal(JSON.stringify(axiosResponse.response))
          done()
        })
    })
  })
})
