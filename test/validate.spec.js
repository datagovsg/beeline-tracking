const {expect} = require('chai')

const jwt = require('jsonwebtoken')

const {validatePing} = require('../src/utils/validate')

const fail = (e) => expect.fail(undefined, undefined, JSON.stringify(e))

describe('Ping validations', () => {
  const sign = (driverId, token = process.env.AUTH0_SECRET) =>
    `Bearer ${jwt.sign({driverId}, token)}`

  before(() => {
    process.env.AUTH0_SECRET = 'toomanysecrets'
  })

  after(() => {
    delete process.env.AUTH0_SECRET
  })

  it('should reject if no token', (done) => {
    validatePing({headers: {}}, {}, undefined)
      .then(fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should reject if bad token', (done) => {
    const authorization = sign(1, 'bad-token')
    validatePing({headers: {authorization}}, {}, undefined)
      .then(fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should reject if token has no driverId', (done) => {
    const authorization = sign(undefined)
    validatePing({headers: {authorization}}, {}, undefined)
      .then(fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should reject if good token and dynamoDb fail', (done) => {
    const expected = 1337
    const tripId = 13
    const dynamoDb = {
      query: (ignored, onData) => onData('fail', { Items: [] }),
    }
    const authorization = sign(expected)
    const event = {
      headers: { authorization },
      pathParameters: { tripId },
    }
    validatePing(event, {}, dynamoDb)
      .then(fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should reject if good token and non-matching roster (no vehicle)', (done) => {
    const expected = 1337
    const tripId = 13
    const dynamoDb = {
      query: (ignored, onData) => onData(undefined, { Items: [{ driverId: 69 }] }),
    }
    const authorization = sign(expected)
    const event = {
      headers: { authorization },
      pathParameters: { tripId },
    }
    validatePing(event, {}, dynamoDb)
      .then(fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should reject if good token and non-matching roster (with vehicle)', (done) => {
    const expected = 1337
    const tripId = 13
    const vehicleId = 2
    const dynamoDb = {
      query: (ignored, onData) => onData(undefined, { Items: [{ driverId: expected, vehicleId }] }),
    }
    const authorization = sign(expected)
    const event = {
      headers: { authorization },
      pathParameters: { tripId },
    }
    validatePing(event, {}, dynamoDb)
      .then(fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should accept if good token and no roster', (done) => {
    const expected = 1337
    const tripId = 13
    const dynamoDb = {
      query: (ignored, onData) => onData(undefined, { Items: [] }),
    }
    const authorization = sign(expected)
    const event = {
      headers: { authorization },
      pathParameters: { tripId },
    }
    validatePing(event, {}, dynamoDb)
      .then(({driverId}) => {
        expect(driverId).equal(expected)
        done()
      })
      .catch(fail)
      .catch(done)
  })

  it('should accept if good token and valid roster (no vehicle)', (done) => {
    const expected = 1337
    const tripId = 13
    const dynamoDb = {
      query: (ignored, onData) => onData(undefined, { Items: [{ driverId: expected }] }),
    }
    const authorization = sign(expected)
    const event = {
      headers: { authorization },
      pathParameters: { tripId },
    }
    validatePing(event, {}, dynamoDb)
      .then(({driverId}) => {
        expect(driverId).equal(expected)
        done()
      })
      .catch(fail)
      .catch(done)
  })

  it('should accept if good token and valid roster (with vehicle)', (done) => {
    const expected = 1337
    const tripId = 13
    const vehicleId = 2
    const dynamoDb = {
      query: (ignored, onData) => onData(undefined, { Items: [{ driverId: expected, vehicleId }] }),
    }
    const authorization = sign(expected)
    const event = {
      headers: { authorization },
      pathParameters: { tripId },
    }
    validatePing(event, { vehicleId }, dynamoDb)
      .then(({driverId}) => {
        expect(driverId).equal(expected)
        done()
      })
      .catch(fail)
      .catch(done)
  })
})
