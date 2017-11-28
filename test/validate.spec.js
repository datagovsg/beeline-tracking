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

  it('should reject if no token', () => {
    const {driverId, validationError} = validatePing({headers: {}})
    expect(driverId).not.exist
    expect(validationError).exist
  })

  it('should reject if bad token', () => {
    const authorization = sign(1, 'bad-token')
    const {driverId, validationError} = validatePing({headers: {authorization}})
    expect(driverId).not.exist
    expect(validationError).exist
  })

  it('should reject if token has no driverId', () => {
    const authorization = sign(undefined)
    const {driverId, validationError} = validatePing({headers: {authorization}})
    expect(driverId).not.exist
    expect(validationError).exist
  })

  it('should accept if good token', () => {
    const expected = 1337
    const authorization = sign(expected)
    const {driverId, validationError} = validatePing({headers: {authorization}})
    expect(driverId).equal(expected)
    expect(validationError).not.exist
  })
})
