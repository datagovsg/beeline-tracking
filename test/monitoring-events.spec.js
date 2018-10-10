const { expect } = require('chai')
const sinon = require('sinon')
const moment = require('moment-timezone')

const auth = require('../src/utils/auth')
const { makeEvents } = require('../src/monitoring')

describe('Retrieving monitoring events', () => {
  const mockQueryPromise = sinon.stub()
  const mockDynamoDb = {
    query: () => ({ promise: mockQueryPromise }),
  }
  const handler = makeEvents(mockDynamoDb)
  const event = {
    pathParameters: { routeId: 3 },
    queryStringParameters: {},
    headers: {},
  }

  beforeEach(() => {
    sinon.stub(auth, 'lookupEntitlements')
    sinon.stub(auth, 'getCompaniesByRole')
  })

  afterEach(() => {
    auth.lookupEntitlements.restore()
    auth.getCompaniesByRole.restore()
    mockQueryPromise.reset()
  })

  it('should 500 on lookupEntitlements fail', done => {
    const callback = sinon.spy()
    const data = { statusCode: 504 }
    auth.lookupEntitlements.rejects({ response: { data } })
    mockQueryPromise.resolves({ Items: [ { transportCompanyId: 2 } ] })
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal(data)
        done()
      })
      .catch(done)
  })

  it('should return nothing on lookupEntitlements empty', done => {
    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([])
    const monitoringEvent = { trip: { route: { transportCompanyId: 2 } } }
    mockQueryPromise.resolves({ Items: [ monitoringEvent ] })
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal([])
        done()
      })
      .catch(done)
  })

  it('should return nothing on mismatched transport companies', done => {
    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([1])
    const monitoringEvent = { trip: { route: { transportCompanyId: 2 } } }
    mockQueryPromise.resolves({ Items: [ monitoringEvent ] })
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal([])
        done()
      })
      .catch(done)
  })

  it('should retrieve JSON data', done => {
    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([1, 2])

    const monitoringEvent = {
      trip: { route: { transportCompanyId: 1 } },
      severity: 1,
    }

    mockQueryPromise.resolves({ Items: [ monitoringEvent ] })
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal([ monitoringEvent ])
        done()
      })
      .catch(done)
  })

  it('should retrieve CSV data', done => {
    const date = new Date()
    const { routeId } = event.pathParameters

    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([1, 2])
    const routeData = {
      dateRoute: `${moment.tz(date, 'Asia/Singapore').format('YYYY-MM-DD')}|${routeId}`,
      trip: {
        route: {
          label: 'B99',
          transportCompanyId: 1,
        },
      },
      time: date.getTime(),
      type: 'noPings',
      severity: 3,
      delayInMins: 4,
      message: 'bnbnm',
    }
    mockQueryPromise.resolves({ Items: [ routeData ] })
    event.queryStringParameters.format = 'csv'
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(response.body).equal(
          'routeId,date,label,time,type,severity,delayInMins,message\n' +
          [
            routeId,
            moment.tz(date, 'Asia/Singapore').format('YYYY-MM-DD'),
            routeData.trip.route.label,
            moment.tz(routeData.time, 'Asia/Singapore').toISOString(true),
            routeData.type,
            routeData.severity,
            routeData.delayInMins,
            routeData.message,
          ].join(',')
        )
        done()
      })
      .catch(done)
  })
})
