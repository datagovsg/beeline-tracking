const sinon = require('sinon')
const geohash = require('ngeohash')
const { expect } = require('chai')

const { makeGET } = require('../src/history')

describe('handler for GETing pings', () => {
  const mockDynamoClient = (errorOnQuery, dataOnQuery) => ({
    query: (params, onQuery) => onQuery(errorOnQuery, dataOnQuery),
  })

  const ping = {
    tripId: 12,
    driverId: 34,
    vehicleId: 56,
    location: geohash.encode(1.08, 103.56, 15),
  }

  const { latitude, longitude } = geohash.decode(ping.location)
  const coordinates = {
    type: 'Point',
    coordinates: [longitude, latitude],
  }

  const event = {
    pathParameters: { tripId: ping.tripId },
    queryStringParameters: {},
  }

  it('returns 500 on error', () => {
    const error = { message: 'fail' }
    const callback = sinon.spy()
    const handler = makeGET(mockDynamoClient(error))
    handler(event, undefined, callback)
    expect(callback.calledOnce).to.be.true

    const [, response] = callback.firstCall.args
    expect(response.statusCode).equal(500)

    const { error: body } = JSON.parse(response.body)
    expect(body).deep.equal(error)
  })

  it('returns empty response on not found', () => {
    const callback = sinon.spy()
    const handler = makeGET(mockDynamoClient(undefined, { Items: [] }))
    handler(event, undefined, callback)
    expect(callback.calledOnce).to.be.true

    const [, response] = callback.firstCall.args
    expect(response.statusCode).equal(200)

    const body = JSON.parse(response.body)
    expect(body).deep.equal([])
  })

  it('returns 1-item ping on hit', () => {
    const callback = sinon.spy()
    const handler = makeGET(mockDynamoClient(undefined, { Items: [ping] }))
    handler(event, undefined, callback)
    expect(callback.calledOnce).to.be.true

    const [, response] = callback.firstCall.args
    expect(response.statusCode).equal(200)

    const body = JSON.parse(response.body)
    expect(body).deep.equal([
      Object.assign(ping, { coordinates }),
    ])
  })
})
