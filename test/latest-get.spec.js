const sinon = require('sinon')
const geohash = require('ngeohash')
const {expect} = require('chai')

const {makeGET} = require('../src/latest')


describe('handler for POSTing pings', () => {
  const mockDynamoClient = (errorOnQuery, dataOnQuery) => ({
    query: (params, onQuery) => onQuery(errorOnQuery, dataOnQuery),
  })

  const ping = {
    tripId: 12,
    driverId: 34,
    vehicleId: 56,
    location: geohash.encode(1.08, 103.56),
  }

  const event = {
    pathParameters: {tripId: ping.tripId},
  }

  it('returns 500 on error', () => {
    const error = {message: 'fail'}
    const callback = sinon.spy()
    const handler = makeGET(mockDynamoClient(error))
    handler(event, undefined, callback)
    expect(callback.calledOnce)

    const [, response] = callback.firstCall.args
    expect(response.statusCode).equal(500)

    const {error:body} = JSON.parse(response.body)
    expect(body).deep.equal(error)
  })

  it('returns 404 on not found', () => {
    const callback = sinon.spy()
    const handler = makeGET(mockDynamoClient(undefined, {Items: []}))
    handler(event, undefined, callback)
    expect(callback.calledOnce)

    const [, response] = callback.firstCall.args
    expect(response.statusCode).equal(404)

    const {error} = JSON.parse(response.body)
    expect(error).equal('Not Found')
  })

  it('returns 200 on hit', () => {
    const callback = sinon.spy()
    const handler = makeGET(mockDynamoClient(undefined, {Items: [ping]}))
    handler(event, undefined, callback)
    expect(callback.calledOnce)

    const [, response] = callback.firstCall.args
    expect(response.statusCode).equal(200)

    const body = JSON.parse(response.body)
    expect(body).deep.equal(Object.assign(body, geohash.decode(body.location)))
  })
})
