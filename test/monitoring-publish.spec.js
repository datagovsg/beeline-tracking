const { expect } = require('chai')
const sinon = require('sinon')
const moment = require('moment-timezone')

const TelegramBot = require('node-telegram-bot-api')

const { makePublish } = require('../src/streams/monitoring')

const makeEvent = ({ eventName, type, routeId, transportCompanyId }) => {
  const event = {
    Records: [{
      eventName: eventName || 'INSERT',
      dynamodb: {
        NewImage: {
          delayInMins: { N: '5' },
          type: { S: type || 'noPings' },
          trip: {
            M: {
              date: { S: moment.tz(new Date(), 'Asia/Singapore').format('YYYY-MM-DD') },
              routeId: { N: routeId || '34' },
              route: {
                M: {
                  transportCompanyId: { N: transportCompanyId || '3' },
                  from: { S: 'Here' },
                  to: { S: 'There' },
                  label: { S: 'Somewhere' },
                },
              },
            },
          },
        },
      },
    }],
  }
  return event
}

const persistentNoPingsEvent = {
  Records: [{
    eventName: 'MODIFY',
    dynamodb: {
      OldImage: {
        activeTrip: { BOOL: true },
        delayInMins: { N: '5' },
        time: { N: '0' },
        type: { S: 'noPings' },
        trip: {
          M: {
            date: { S: moment.tz(new Date(), 'Asia/Singapore').format('YYYY-MM-DD') },
            routeId: { N: '34' },
            route: {
              M: {
                transportCompanyId: { N: '3' },
                from: { S: 'Here' },
                to: { S: 'There' },
                label: { S: 'Somewhere' },
              },
            },
          },
        },
      },
      NewImage: {
        activeTrip: { BOOL: true },
        delayInMins: { N: '5' },
        time: { N: '' + (62 * 60 * 1000) },
        type: { S: 'noPings' },
        trip: {
          M: {
            date: { S: moment.tz(new Date(), 'Asia/Singapore').format('YYYY-MM-DD') },
            routeId: { N: '34' },
            route: {
              M: {
                transportCompanyId: { N: '3' },
                from: { S: 'Here' },
                to: { S: 'There' },
                label: { S: 'Somewhere' },
              },
            },
          },
        },
      },
    },
  }],
}

describe('Retrieving monitoring event publication', () => {
  const subscribers = [
    3,
    [{
      id: 1,
      event: 'noPings',
      params: { routeIds: [34], minsBefore: [5] },
      handler: 'telegram',
      agent: { notes: { telegramChatId: 345 } },
      transportCompanyId: 3,
    }],
  ]

  it('Does nothing if no relevant events - diff eventName', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    const event = {
      Records: [{ eventName: 'DELETE', dynamodb: {} }],
    }
    publish(event, undefined, callback)
      .then(() => {
        expect(callback.calledWith(null)).to.be.true
        expect(bot.sendMessage.notCalled).to.be.true
      })
      .then(done)
      .catch(done)
  })

  it('Does nothing if no relevant events - company mismatch', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    publish(makeEvent({ transportCompanyId: '4' }), undefined, callback)
      .then(() => {
        expect(callback.calledWith(null)).to.be.true
        expect(bot.sendMessage.notCalled).to.be.true
      })
      .then(done)
      .catch(done)
  })

  it('Does nothing if no relevant events - type mismatch', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    publish(makeEvent({ type: 'lateETA' }), undefined, callback)
      .then(() => {
        expect(bot.sendMessage.notCalled).to.be.true
      })
      .then(done)
      .catch(done)
  })

  it('Does nothing if no relevant events - routeId mismatch', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    publish(makeEvent({ routeId: '45' }), undefined, callback)
      .then(() => {
        expect(callback.calledWith(null)).to.be.true
        expect(bot.sendMessage.notCalled).to.be.true
      })
      .then(done)
      .catch(done)
  })

  it('Does nothing if no relevant events - handler mismatch', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const subscribers = [
      3,
      [{
        id: 1,
        event: 'noPings',
        params: { routeIds: [34] },
        handler: 'twilio',
        agent: { notes: { telegramChatId: 345 } },
        transportCompanyId: 3,
      }],
    ]
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    publish(makeEvent({}), undefined, callback)
      .then(() => {
        expect(callback.calledWith(null)).to.be.true
        expect(bot.sendMessage.notCalled).to.be.true
      })
      .then(done)
      .catch(done)
  })

  it('Sends a message on match - modified noPings', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    publish(persistentNoPingsEvent, undefined, callback)
      .then(() => {
        expect(callback.calledWith(null)).to.be.true
        expect(bot.sendMessage.calledWith(345)).to.be.true
      })
      .then(done)
      .catch(done)
  })

  it('Sends a message on match - INSERT', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    publish(makeEvent({}), undefined, callback)
      .then(() => {
        expect(callback.calledWith(null)).to.be.true
        expect(bot.sendMessage.calledWith(345)).to.be.true
      })
      .then(done)
      .catch(done)
  })

  it('Sends a message on match - subscriber without route id', done => {
    const bot = sinon.createStubInstance(TelegramBot)
    const publish = makePublish(() => Promise.resolve(subscribers), bot)
    const callback = sinon.spy()
    publish(makeEvent({}), undefined, callback)
      .then(() => {
        expect(callback.calledWith(null)).to.be.true
        expect(bot.sendMessage.calledWith(345)).to.be.true
      })
      .then(done)
      .catch(done)
  })
})
