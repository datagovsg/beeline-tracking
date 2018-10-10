const { expect } = require('chai')
const sinon = require('sinon')
const moment = require('moment-timezone')

const auth = require('../src/utils/auth')
const { makePerformance } = require('../src/monitoring')

describe('Retrieving monitoring performance', () => {
  const mockQueryPromise = sinon.stub()
  const mockDynamoDb = {
    query: () => ({ promise: mockQueryPromise }),
  }
  const handler = makePerformance(mockDynamoDb)
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
    mockQueryPromise.resolves({ Items: [ { transportCompanyId: 2 } ] })
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
    mockQueryPromise.resolves({ Items: [ { transportCompanyId: 2 } ] })
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
    mockQueryPromise.resolves({ Items: [ { transportCompanyId: 1 } ] })
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal([ { transportCompanyId: 1 } ])
        done()
      })
      .catch(done)
  })

  it('should retrieve CSV data', done => {
    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([1, 2])
    const routeData = {
      transportCompanyId: 1,
      routeId: 23,
      date: '2018-02-01',
      label: 'B99',
      stops: [
        {
          stopId: 4,
          description: 'Sesame Street',
          road: 'Sesame Street 2',
          canBoard: true,
          canAlight: false,
          pax: 3,
          expectedTime: new Date().toISOString(),
          actualTime: new Date().toISOString(),
          actualLocation: 'bnba',
        },
      ],
    }
    mockQueryPromise.resolves({ Items: [ routeData ] })
    event.queryStringParameters.format = 'csv'
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(response.body).equal(
          'routeId,date,label,stopId,description,road,canBoard,canAlight,pax,expectedTime,actualTime,actualLocation,timeDifferenceMinutes\n' +
          [
            routeData.routeId,
            routeData.date,
            routeData.label,
            routeData.stops[0].stopId,
            routeData.stops[0].description,
            routeData.stops[0].road,
            routeData.stops[0].canBoard,
            routeData.stops[0].canAlight,
            routeData.stops[0].pax,
            moment.tz(routeData.stops[0].expectedTime, 'Asia/Singapore').toISOString(true),
            moment.tz(routeData.stops[0].actualTime, 'Asia/Singapore').toISOString(true),
            routeData.stops[0].actualLocation,
            moment(routeData.stops[0].actualTime).diff(routeData.stops[0].expectedTime, 'minutes'),
          ].join(',')
        )
        done()
      })
      .catch(done)
  })
})
