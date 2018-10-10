const { expect } = require('chai')
const sinon = require('sinon')

const auth = require('../src/utils/auth')
const { makeStatus } = require('../src/monitoring')

describe('Retrieving monitoring status', () => {
  const mockQueryPromise = sinon.stub()
  const mockDynamoDb = {
    query: () => ({ promise: mockQueryPromise }),
  }
  const handler = makeStatus(mockDynamoDb)
  const event = {}

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
    handler(event, undefined, callback)
      .then(() => {
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal(data)
        done()
      })
      .catch(done)
  })

  it('should skip dynamoDb on lookupEntitlements empty', done => {
    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([])
    mockQueryPromise.resolves({ Items: [ { monitoring: { 1: {} } } ] })
    handler(event, undefined, callback)
      .then(() => {
        expect(mockQueryPromise.notCalled)
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal({})
        done()
      })
      .catch(done)
  })

  it('should continue even when dynamoDb throws on some queries', done => {
    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([1, 2])
    mockQueryPromise
      .onFirstCall().resolves({ Items: [ { monitoring: { 1: {} } } ] })
      .onSecondCall().rejects()
    handler(event, undefined, callback)
      .then(() => {
        expect(mockQueryPromise.calledTwice).to.be.true
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal({ 1: {} })
        done()
      })
      .catch(done)
  })

  it('should merge data across multiple transport companies', done => {
    const callback = sinon.spy()
    auth.lookupEntitlements.resolves()
    auth.getCompaniesByRole.resolves([1, 2])
    mockQueryPromise
      .onFirstCall().resolves({ Items: [ { monitoring: { 1: {} } } ] })
      .onSecondCall().resolves({ Items: [ { monitoring: { 2: {} } } ] })
    handler(event, undefined, callback)
      .then(() => {
        expect(mockQueryPromise.calledTwice).to.be.true
        expect(callback.calledOnce).to.be.true
        const [, response] = callback.firstCall.args
        expect(JSON.parse(response.body)).deep.equal({ 1: {}, 2: {} })
        done()
      })
      .catch(done)
  })
})
