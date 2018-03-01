/* eslint require-jsdoc: 0 */
const assert = require("assert")
const df = require("dateformat")
const { omit } = require("lodash")

const numFiveMins = ms => Math.ceil(ms / 60000 / 5)

const alertId = (time, trip, type, severity, message) =>
  [df(time, "isoDate"), trip.routeId, type, severity, message].join("|")

class NotificationEvent {
  constructor(time, trip, severity, message, type) {
    assert(typeof trip === "object")
    assert(typeof severity === "number")
    assert(typeof message === "string")

    this.time = time
    this.trip = omit(trip, "tripStops")
    this.severity = severity
    this.message = message
    this.type = type || "general"
    this.alertId = alertId(time, trip, this.type, severity, message)
    this.dateRoute = `${df(time, "isoDate")}|${trip.routeId}`
  }
}

class NoPingsEvent extends NotificationEvent {
  constructor(time, trip, severity, delayInMins) {
    super(
      time,
      trip,
      severity,
      `Driver app not switched on ${delayInMins} mins before`,
      "noPings"
    )
    this.delayInMins = delayInMins
  }
}

class LateArrivalEvent extends NotificationEvent {
  constructor(time, trip, severity, delayInMins) {
    super(
      time,
      trip,
      severity,
      `Service arrived ${delayInMins} mins late`,
      "lateArrival"
    )
    this.delayInMins = delayInMins
  }
}

class LateETAEvent extends NotificationEvent {
  constructor(time, trip, severity, delayInMins) {
    super(
      time,
      trip,
      severity,
      `Service might be more than ${delayInMins} mins late`,
      "lateETA"
    )
    this.delayInMins = delayInMins
  }
}

class CancellationEvent extends NotificationEvent {
  constructor(time, trip, severity) {
    super(time, trip, severity, `Emergency switched on`, "cancellation")
  }
}

const NonEvent = {
  /* ok means *green* status */
  ok(trip, time) {
    return new NotificationEvent(time, trip, 0, "", "ok")
  },
  /* dontCare means grey status -- e.g. 12 hours before a trip starts, we frankly don't care */
  dontCare(trip, time) {
    return new NotificationEvent(time, trip, -1, "", "dontCare")
  },
}

module.exports.create = context => {
  const {
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
  } = context

  // General trip status in the last five minutes
  const recentlyPinged = lastPing && time - lastPing.time.getTime() <= 5 * 60000

  const nextStopTime = nextStop && nextStop.time.getTime()
  const prevStopTime = prevStop && prevStop.time.getTime()

  const deviationPrevStop =
    isArrivedAtPrevStop &&
    prevStop.bestPing.time.getTime() - prevStop.time.getTime()

  const emergencyEvent =
    trip.status === "cancelled"
      ? new CancellationEvent(time, trip, 5)
      : NonEvent.dontCare(trip, time)

  const pingEvent = nextStopRelevant
    ? recentlyPinged
      ? NonEvent.ok(trip, time)
      : nextStopTime - time <= 5 * 60000
        ? new NoPingsEvent(time, trip, 4, 5)
        : nextStopTime - time <= 25 * 60000
          ? new NoPingsEvent(
              time,
              trip,
              3,
              numFiveMins(nextStopTime - time) * 5
            )
          : NonEvent.dontCare(trip, time)
    : prevStopRelevant
      ? /* Previous stop relevant */
        isArrivedAtPrevStop
        ? new NotificationEvent(time, trip, 0, "Bus has arrived")
        : recentlyPinged
          ? new NotificationEvent(time, trip, 0, "App is switched on")
          : new NoPingsEvent(time, trip, 4, 5)
      : NonEvent.dontCare(trip, time)

  const distanceEvent = nextStopRelevant
    ? nextStopETA
      ? nextStopETA - nextStopTime >= 10 * 60000
        ? new LateETAEvent(time, trip, 3, 10)
        : new NotificationEvent(
            time,
            trip,
            0,
            "Service is on track to arrive punctually"
          )
      : /* No distance ==> can't give estimate. const the absence of pings trigger the event*/
        NonEvent.dontCare(trip, time)
    : prevStopRelevant
      ? isArrivedAtPrevStop
        ? deviationPrevStop > 15 * 60000
          ? new LateArrivalEvent(
              time,
              trip,
              3,
              (deviationPrevStop / 60000).toFixed(0)
            )
          : deviationPrevStop > 5 * 60000
            ? new LateArrivalEvent(
                time,
                trip,
                2,
                (deviationPrevStop / 60000).toFixed(0)
              )
            : new NotificationEvent(time, trip, 0, "Service arrived on time")
        : prevStopETA
          ? prevStopETA - prevStopTime >= 10 * 60000
            ? new LateETAEvent(time, trip, 3, 10)
            : new NotificationEvent(
                time,
                trip,
                0,
                "Service is on track to arrive punctually"
              )
          : NonEvent.dontCare(trip, time)
      : NonEvent.dontCare(trip, time)

  return JSON.parse(
    JSON.stringify({ pingEvent, distanceEvent, emergencyEvent })
  )
}
