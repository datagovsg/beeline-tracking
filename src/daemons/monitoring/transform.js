const _ = require('lodash')

const events = require('./events')

const GEOFENCE_RADIUS = 120

const trigDistance = (a, b) => {
  return Math.sqrt(
    (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])
  )
}

const filterRecentNoPings = (dynamoDb, events) => {
  const [noPingsEvents, otherEvents] = _.partition(
    events,
    e => e.type === 'noPings'
  )
  const keyParamsArray = noPingsEvents.map(e =>
    _.pick(e, ['dateRoute', 'alertId'])
  )
  const previousNoPingsEventsPromise = Promise.all(
    keyParamsArray.map(
      Key =>
        new Promise((resolve, reject) => {
          const params = {
            TableName: process.env.EVENTS_TABLE,
            Key,
          }
          dynamoDb.get(params, (error, data) => {
            if (error) {
              reject(error)
            } else {
              resolve(data.Item)
            }
          })
        })
    )
  )

  return previousNoPingsEventsPromise
    .then(previousNoPingsEvents =>
      noPingsEvents.filter(noPings => {
        const previousNoPings = previousNoPingsEvents.find(
          previousNoPings =>
            previousNoPings &&
            previousNoPings.alertId === noPings.alertId &&
            noPings.time - previousNoPings.time <= 60 * 60 * 1000
        )
        return !previousNoPings
      })
    )
    .then(filteredNoPings => otherEvents.concat(filteredNoPings))
}

/**
 * @param {Number} time - the timestamp of this status
 * @param {Object} infoByRouteId - a collection of ping-annotated trip stops keyed by routeId
 * @return {Array} payloads for export into various DynamoDB tables
 */
function createExportPayloads ({ infoByRouteId, time }) {
  const performance = _(infoByRouteId)
    .values()
    .map(info => ({
      routeId: info.trip.routeId,
      date: info.trip.date,
      label: info.trip.route.label,
      transportCompanyId: info.trip.route.transportCompanyId,
      stops: info.trip.tripStops.map(tripStop => {
        const stop = {
          stopId: tripStop.stopId,
          canBoard: tripStop.canBoard,
          canAlight: tripStop.canAlight,
          pax: tripStop.pax,
          description: tripStop.description,
          road: tripStop.road,
          expectedTime: tripStop.time.toISOString(),
          actualTime: tripStop.bestPing && tripStop.bestPing.time.toISOString(),
          actualLocation: tripStop.bestPing && tripStop.bestPing.location,
        }
        return _.pickBy(stop, Boolean)
      }),
    }))
    .value()

  const infoByCompanyId = {}
  _.forEach(infoByRouteId, (info, routeId) => {
    const { trip: { route: { transportCompanyId } } } = info
    const companyInfo = infoByCompanyId[transportCompanyId] || {
      transportCompanyId,
      time,
      ttl: time / 1000,
      monitoring: {},
    }
    if (!infoByCompanyId[transportCompanyId]) {
      infoByCompanyId[transportCompanyId] = companyInfo
    }
    const monitoringInfo = _(info)
      .omit(['events', 'trip.tripStops'])
      .set(
        'trip.startTime',
        _.minBy(info.trip.tripStops.map(s => s.time), t =>
          t.getTime()
        ).toISOString()
      )
      .value()
    if (
      monitoringInfo.lastPing &&
      monitoringInfo.lastPing.time instanceof Date
    ) {
      monitoringInfo.lastPing.time = monitoringInfo.lastPing.time.toISOString()
    }
    if (
      monitoringInfo.status.bestPing &&
      monitoringInfo.status.bestPing.time instanceof Date
    ) {
      monitoringInfo.status.bestPing.time = monitoringInfo.status.bestPing.time.toISOString()
    }
    if (monitoringInfo.status.arrivalTime instanceof Date) {
      monitoringInfo.status.arrivalTime = monitoringInfo.status.arrivalTime.toISOString()
    }
    if (monitoringInfo.status.eta instanceof Date) {
      monitoringInfo.status.eta = monitoringInfo.status.eta.toISOString()
    }
    companyInfo.monitoring[routeId] = monitoringInfo
  })

  const events = _(infoByRouteId)
    .values()
    .map(info =>
      _(info.events)
        .values()
        .value()
    )
    .flatten()
    .filter(e => e.message)
    .value()

  return [performance, _.values(infoByCompanyId), events]
}

/**
 * Given the output from injectArrivalHistory, annotate further with quickly-accessed
 * information about next arrival, like eta, arrival time, location ping, etc
 * @param {Object} infoByRouteId - a collection of ping-annotated trip stops keyed by routeId
 * @return {Object} `{infoByRouteId, time}`, where:
 *   - time is the epoch when this was processed, and;
 *   - infoByRouteId would have been further annotated as described
 */
function injectArrivalStatus (infoByRouteId) {
  const time = Date.now()
  _.forEach(infoByRouteId, (info, routeId) => {
    const { trip, notifyWhenEmpty, lastPing } = info
    // Look at all boarding stops, and either:
    //   - assume all boarding stops have people, for lite routes, or;
    //   - ensure there are people, for regular routes
    const isRelevant = s => s.canBoard && (notifyWhenEmpty || s.pax > 0)
    const relevantStops = trip.tripStops.filter(isRelevant)

    // next relevant stops
    let nextStop = relevantStops.find(s => s.time.getTime() > time)
    // First stop - if in the next 30 mins
    let nextStopRelevant =
      nextStop &&
      (nextStop === relevantStops[0]
        ? nextStop.time.getTime() - time <= 30 * 60000
        : nextStop.time.getTime() - time <= 15 * 60000)

    // last relevant stops, including the stop we are just arriving at
    let prevStop = _.findLast(relevantStops, s => s.time.getTime() <= time)
    let prevStopRelevant = prevStop
    // If there is only one pickup stop, then it doesn't matter
    // if the bus leaves very early (e.g. 5mins) as long as everyone was on board.
    // But otherwise 2mins is the maximum because we don't want buses to have
    // to linger around at bus stops
    const arrivalWindow = relevantStops.length > 1 ? -2 * 60000 : -5 * 60000
    let isArrivedAtPrevStop =
      prevStop &&
      prevStop.bestPing &&
      prevStop.bestPing.time.getTime() - prevStop.time.getTime() >=
        arrivalWindow

    // Compute ETAs
    const speed = 35 // km/h
    const computeETA = function (c1, c2) {
      if (!c1 || !c2) return null
      let distance = trigDistance(c1, c2)
      return time + distance / 1000 / speed * 3600 * 1000
    }
    const computeETAFromCoords = (p, s) => p && s && computeETA(p._xy, s._xy)
    const prevStopETA = computeETAFromCoords(lastPing, prevStop)
    const nextStopETA = computeETAFromCoords(lastPing, nextStop)

    const e = events.create({
      trip,
      time,
      isArrivedAtPrevStop,
      prevStop,
      prevStopRelevant,
      prevStopETA,
      nextStop,
      nextStopRelevant,
      nextStopETA,
      lastPing,
    })
    info.status = {
      arrivalTime: isArrivedAtPrevStop && prevStop.bestPing.time,
      emergency: trip.status === 'cancelled',
      eta: nextStopRelevant
        ? nextStopETA && new Date(nextStopETA)
        : prevStopRelevant ? prevStopETA && new Date(prevStopETA) : null,
      bestPing: nextStopRelevant
        ? nextStop.bestPing
        : prevStopRelevant ? prevStop.bestPing : null,
      ping: e.pingEvent.severity,
      distance: e.distanceEvent.severity,
    }
    info.events = e
    info.nobody = !trip.tripStops.find(s => s.pax > 0)
  })
  return { infoByRouteId, time }
}

/**
 * For each stop, assign the nearest ping that indicates vehicle arrival time,
 * and assign to the trip the last ping emitted by the vehicle
 * @param {Object} infoByRouteId - a collection of trip stops keyed by routeId
 * @param {Object} pingsByRouteId - a collection of pings keyed by routeId
 * @return {Object} infoByRouteId, with information from pingsByRouteId
 */
function injectArrivalHistory ([infoByRouteId, pingsByRouteId]) {
  _.forEach(infoByRouteId, (info, routeId) => {
    const pings = pingsByRouteId[routeId]
    for (const stop of info.trip.tripStops) {
      // Filter by distance
      stop.bestPing = _.minBy(
        pings,
        p =>
          trigDistance(p._xy, stop._xy) <= GEOFENCE_RADIUS
            ? Math.abs(p.time.getTime() - stop.time.getTime())
            : undefined
      )
      stop.bestPingDistance =
        stop.bestPing && trigDistance(stop.bestPing._xy, stop._xy)
    }

    info.lastPing = _.maxBy(pings, 'time')
  })
  return infoByRouteId
}

module.exports = {
  injectArrivalHistory,
  injectArrivalStatus,
  filterRecentNoPings,
  createExportPayloads,
}
