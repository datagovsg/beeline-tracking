const transform = require('../src/daemons/monitoring/transform')
const { expect } = require('chai')

const proj4 = require('proj4')

proj4.defs([
  [
    'epsg:3414',
    '+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs ',
  ],
])

const toWGS = proj4('epsg:3414').inverse

const transformInput = (infoByRouteId, pingsByRouteId) => {
  const infoByRouteIdWithHistory = transform.injectArrivalHistory([infoByRouteId, pingsByRouteId])
  const infoByRouteIdWithStatus = transform.injectArrivalStatus(infoByRouteIdWithHistory)
  return transform.createExportPayloads(infoByRouteIdWithStatus)
}

describe('Processing of pings for monitoring status', () => {
  it('should emit noPings event 5 minutes before stop', () => {
    const infoByRouteId = {
      100: {
        trip: {
          tripStops: [{
            canBoard: true,
            pax: 1,
            time: new Date(Date.now() + 5 * 60000),
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }
    const pingsByRouteId = {}
    const [, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(monitoring[0].monitoring[100].status.ping).equal(4)
    expect(events[0].type).equal('noPings')
  })
  it('should emit noPings event 5 minutes before stop arrival', () => {
    const infoByRouteId = {
      100: {
        trip: {
          tripStops: [{
            canBoard: true,
            pax: 1,
            time: new Date(Date.now() + 5 * 60000),
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }
    const pingsByRouteId = {}
    const [, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(monitoring[0].monitoring[100].status.ping).equal(4)
    expect(events[0].type).equal('noPings')
  })

  it('should emit noPings event 25 minutes before stop arrival', () => {
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          tripStops: [{
            canBoard: true,
            time: new Date(Date.now() + 25 * 60000),
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }
    const pingsByRouteId = {}
    const [, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(monitoring[0].monitoring[100].status.ping).equal(3)
    expect(events[0].type).equal('noPings')
  })

  it('should emit cancelled event if trip is cancelled', () => {
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          status: 'cancelled',
          tripStops: [{
            canBoard: true,
            time: new Date(Date.now() + 25 * 60000),
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }
    const pingsByRouteId = {}
    const [, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(monitoring[0].monitoring[100].status.emergency).equal(true)
    expect(events.map(e => e.type)).contains('cancellation')
  })

  it('should do something when pings are received 25 minutes before arrival', () => {
    const now = Date.now()
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          tripStops: [{
            canBoard: true,
            time: new Date(now + 25 * 60000),
            _xy: [13, 37],
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }
    const pingsByRouteId = {
      100: [{ time: new Date(now), _xy: [12346, 2132], coordinates: { type: 'Point', coordinates: toWGS([12346, 2132]) } }],
    }
    const [, monitoring] = transformInput(infoByRouteId, pingsByRouteId)
    expect(monitoring[0].monitoring[100].status.ping).equal(0)
  })

  it('should complain when pings received 5 minutes before arrival are too far away', () => {
    const now = Date.now()
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          tripStops: [{
            canBoard: true,
            time: new Date(now + 5 * 60000),
            _xy: [13, 37],
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }

    // work out how far away the bus has to be to trigger a distance warning,
    // ie, the bus, driving at 35 km/h, has to be >= 10 minutes away
    const distance = (10 + 5) / 60 * 35 * 1000
    const _xy = [13 + distance, 37]
    const pingsByRouteId = {
      100: [{ time: new Date(now), _xy, coordinates: { type: 'Point', coordinates: toWGS(_xy) } }],
    }
    const [, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(monitoring[0].monitoring[100].status.distance).equal(3)
    expect(events[0].type).equal('lateETA')
  })

  it('should report when pings received 5 minutes before arrival are on track', () => {
    const now = Date.now()
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          tripStops: [{
            canBoard: true,
            time: new Date(now + 5 * 60000),
            _xy: [13, 37],
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }

    // work out how far away the bus has to be to trigger a distance warning,
    // ie, the bus, driving at 35 km/h, has to be >= 10 minutes away
    const distance = 5 / 60 * 35 * 1000
    const _xy = [13 + distance, 37]
    const pingsByRouteId = {
      100: [{ time: new Date(now), _xy, coordinates: { type: 'Point', coordinates: toWGS(_xy) } }],
    }
    const [, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(monitoring[0].monitoring[100].status.distance).equal(0)
    expect(events[0].type).equal('general')
  })

  it('should report and mark performance when pings received on arrival', () => {
    const now = Date.now()
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          tripStops: [{
            canBoard: true,
            time: new Date(now),
            _xy: [13, 37],
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }

    const _xy = [13, 37]
    const pingsByRouteId = {
      100: [{ time: new Date(now), _xy, coordinates: { type: 'Point', coordinates: toWGS(_xy) } }],
    }
    const [performance, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(performance[0].stops[0].actualTime).exist
    expect(monitoring[0].monitoring[100].status.ping).equal(0)
    expect(monitoring[0].monitoring[100].status.distance).equal(0)
    expect(events.length).equal(2)
    expect(events.map(e => e.type)).deep.equal(['general', 'general'])
  })

  it('should complain and mark performance when ping received on >5 min late arrival', () => {
    const now = Date.now()
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          tripStops: [{
            canBoard: true,
            time: new Date(now),
            _xy: [13, 37],
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }

    const _xy = [13, 37]
    const pingsByRouteId = {
      100: [{ time: new Date(now + 6 * 60000), _xy, coordinates: { type: 'Point', coordinates: toWGS(_xy) } }],
    }
    const [performance, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(performance[0].stops[0].actualTime).exist
    expect(monitoring[0].monitoring[100].status.ping).equal(0)
    expect(monitoring[0].monitoring[100].status.distance).equal(2)
    expect(events.length).equal(2)
    expect(events.map(e => e.type)).contains('lateArrival')
    expect(events.map(e => e.type)).contains('general')
  })

  it('should complain and mark performance when ping received on >15 min late arrival', () => {
    const now = Date.now()
    const infoByRouteId = {
      100: {
        notifyWhenEmpty: true,
        trip: {
          tripStops: [{
            canBoard: true,
            time: new Date(now),
            _xy: [13, 37],
            description: 'Not needed',
            road: 'To nowhere',
            coordinates: {
              type: 'Point',
              coordinates: toWGS([13, 37]),
            },
          }],
          route: {
            transportCompanyId: 15,
          },
        },
      },
    }

    const _xy = [13, 37]
    const pingsByRouteId = {
      100: [{ time: new Date(now + 16 * 60000), _xy, coordinates: { type: 'Point', coordinates: toWGS(_xy) } }],
    }
    const [performance, monitoring, events] = transformInput(infoByRouteId, pingsByRouteId)
    expect(performance[0].stops[0].actualTime).exist
    expect(monitoring[0].monitoring[100].status.ping).equal(0)
    expect(monitoring[0].monitoring[100].status.distance).equal(3)
    expect(events.length).equal(2)
    expect(events.map(e => e.type)).contains('lateArrival')
    expect(events.map(e => e.type)).contains('general')
  })
})
