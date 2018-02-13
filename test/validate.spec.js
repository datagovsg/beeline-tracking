const {expect} = require('chai')

const jwt = require('jsonwebtoken')

const {validatePing} = require('../src/validate')

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
    validatePing({headers: {}})
      .then(expect.fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should reject if bad token', (done) => {
    const authorization = sign(1, 'bad-token')
    validatePing({headers: {authorization}})
      .then(expect.fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should reject if token has no driverId', (done) => {
    const authorization = sign(undefined)
    validatePing({headers: {authorization}})
      .then(expect.fail)
      .catch(({validationError}) => {
        expect(validationError).exist
        done()
      })
  })

  it('should accept if good token', (done) => {
    const expected = 1337
    const authorization = sign(expected)
    validatePing({headers: {authorization}})
      .then(({driverId}) => {
        expect(driverId).equal(expected)
        done()
      })
      .catch(expect.fail)
  })
})
