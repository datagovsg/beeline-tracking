const { expect } = require('chai')
const sinon = require('sinon')

const AWS = require('aws-sdk')

const load = require('../src/utils/dynamodb-load')
const database = require('../src/utils/database')

const stubWithPromise = promiseStub => {
  const stub = sinon.stub()
  const promise = promiseStub || sinon.stub().resolves(undefined)
  stub.returns({ promise })
  return stub
}

describe('Syncing monitoring event subscriptions', () => {
  const dynamoDb = { scan: stubWithPromise(), delete: stubWithPromise() }
  const db = { any: sinon.stub() }
  let eventSubscriptions
  before(() => {
    process.env.EVENT_SUBS_TABLE = 'TABLE'
    sinon.stub(database, 'getConnection').callsFake(() => (db))
    sinon.stub(AWS.DynamoDB, 'DocumentClient').callsFake(() => dynamoDb)
    eventSubscriptions = require('../src/daemons/event-subscriptions')
  })
  beforeEach(() => {
    sinon.stub(load, 'batchWrite').resolves(undefined)
  })
  afterEach(() => {
    load.batchWrite.restore()
  })
  after(() => {
    delete process.env.EVENT_SUBS_TABLE
    database.getConnection.restore()
    AWS.DynamoDB.DocumentClient.restore()
  })
  it('handles updating of subs', done => {
    const subscriptions = [
      { transportCompanyId: 1, id: 1 },
      { transportCompanyId: 1, id: 2 },

      { transportCompanyId: 3, id: 3 },
    ]
    db.any.resolves(subscriptions)
    dynamoDb.scan = stubWithPromise(sinon.stub().resolves({
      Items: [1, 2, 3, 4].map(transportCompanyId => ({ transportCompanyId })),
    }))
    eventSubscriptions
      .handler(null, null, err => {
        const expectedSubs = [
          { transportCompanyId: 1, subscriptions: [ { transportCompanyId: 1, id: 1 }, { transportCompanyId: 1, id: 2 } ] },
          { transportCompanyId: 3, subscriptions: [ { transportCompanyId: 3, id: 3 } ] },
        ]
        expect(
          load.batchWrite.calledWith(dynamoDb, process.env.EVENT_SUBS_TABLE, expectedSubs)
        ).to.be.true
        expect(
          dynamoDb.delete.calledWith({
            TableName: process.env.EVENT_SUBS_TABLE,
            Key: { HashKey: 2 },
          })
        ).to.be.true
        expect(
          dynamoDb.delete.calledWith({
            TableName: process.env.EVENT_SUBS_TABLE,
            Key: { HashKey: 4 },
          })
        ).to.be.true
        done(err)
      })
      .catch(done)
  })
})
