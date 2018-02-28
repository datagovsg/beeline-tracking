const geohash = require("ngeohash")
const _ = require("lodash")

const proj4 = require("proj4")

proj4.defs([
  [
    "epsg:3414",
    "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs ",
  ],
])

const toSVY = proj4("epsg:3414").forward

const STOPS_QUERY = `
SELECT
trips."routeId",
ARRAY[ST_X(stops.coordinates), ST_Y(stops.coordinates)] as coordinates,
stops.description,
count(tickets.*) as pax,
ts."stopId",
ts."tripId",
ts."canBoard",
ts."canAlight",
ts.time
FROM
"tripStops" ts
LEFT OUTER JOIN tickets ON tickets.status = 'valid' AND (tickets."boardStopId" = ts.id OR tickets."alightStopId" = ts.id)
INNER JOIN stops ON stops.id = ts."stopId"
INNER JOIN trips ON trips.id = ts."tripId"
WHERE date = $1
GROUP BY trips.id, stops.id, ts.id
ORDER BY "tripId", time
`

const ROUTES_QUERY = `
SELECT DISTINCT
trips.id as "tripId",
trips."routeId",
trips.date::text,
trips.status is not null and trips.status = 'cancelled' as cancelled,
routes."transportCompanyId",
routes.label,
routes.from,
routes.to,
routes.tags && array['notify-when-empty'::varchar] as "notifyWhenEmpty"
FROM trips
INNER JOIN routes ON routes.id = trips."routeId"
WHERE trips.date = $1
`

/**
 * Decode the geohash embedded within the given ping, and
 * inject the corresponding GeoJSON point coordinates
 * @param {Object} ping - an object where `location` is set to a geohash
 * @return {Object} the ping, with additional data fields:
 * ` - coordinates` - a GeoJSON object whose GPS coordinates match `ping.location`
 *   - _xy - cartesian coordinates on the SVY21 plane
 *   - time - `ping.time` converted from epoch to Date
 */
function injectGeoInfo(ping) {
  const { latitude, longitude } = geohash.decode(ping.location)
  ping.coordinates = {
    type: "Point",
    coordinates: [longitude, latitude],
  }
  ping._xy = toSVY(ping.coordinates.coordinates)
  ping.time = new Date(ping.time)
  return ping
}

/**
 * Look up the pings for a given trip
 * @param {Object} dynamoDb - an AWS.DynamoDB.DocumentClient
 * @param {Number} tripId - the trip id to look up pings for
 * @return {Promise} the pings retrieved from DynamoDB
 */
function pings(dynamoDb, tripId) {
  return new Promise((resolve, reject) => {
    const params = {
      KeyConditionExpression: "tripId = :v1",
      TableName: process.env.TRACKING_TABLE,
      ExpressionAttributeValues: { ":v1": tripId },
    }
    dynamoDb.query(params, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve((data.Items || []).map(injectGeoInfo))
      }
    })
  })
}

/**
 * Collect all the pings associated with the given routes from DynamoDB
 * @param {Object} dynamoDb - an AWS.DynamoDB.DocumentClient
 * @param {Array} routes - An array of routes
 * @return {Promise} a collection of trip pings keyed by route id
 */
function collectPings(dynamoDb, routes) {
  const result = {}
  return Promise.all(
    routes.map(({ routeId, tripId }) =>
      pings(dynamoDb, tripId).then(pings => _.set(result, routeId, pings))
    )
  ).then(() => result)
}

/**
 * Enrich and restructure infoByRouteId, using information from routesById
 * @param {Object} infoByRouteId - a collection of trip stops keyed by routeId
 * @param {Object} routesAndTripsById - a collection of route and trip information keyed by routeId
 * @return {Object} a collection of route information and associated stops,
 * keyed by route id
 */
function injectStopsWithRouteInfo([infoByRouteId, routesAndTripsById]) {
  return _.mapValues(infoByRouteId, tripStops => {
    if (!(tripStops && tripStops.length)) {
      return {}
    }
    const { routeId } = tripStops[0]
    const routeAndTrip = routesAndTripsById[routeId]
    const trip = _(routeAndTrip)
      .pick(["tripId", "routeId", "date", "cancelled"])
      .set(
        "route",
        _.pick(routeAndTrip, ["transportCompanyId", "label", "from", "to"])
      )
      .set(
        "tripStops",
        tripStops.map(ts =>
          _(ts)
            .omit(["coordinates", "description"])
            .set("stop", {
              description: ts.description,
              coordinates: { type: "Point", coordinates: ts.coordinates },
            })
            .set("_xy", toSVY(ts.coordinates))
            .value()
        )
      )
      .value()
    return {
      notifyWhenEmpty: routeAndTrip.notifyWhenEmpty,
      trip,
    }
  })
}

/**
 * Query the database for route information for a given date
 * @param {Object} db - a pg-promise database connection
 * @param {Object} dynamoDb - an AWS.DynamoDB.DocumentClient
 * @param {String} dateString - an ISO string representation of the date
 * @return {Promise} a collection of route ids to trip stops and other metadata
 */
function infoByRouteId(db, dynamoDb, dateString) {
  return Promise.all([
    db.any(STOPS_QUERY, dateString),
    db.any(ROUTES_QUERY, dateString),
  ]).then(([stops, routes]) =>
    Promise.all([
      injectStopsWithRouteInfo([
        _.groupBy(stops, "routeId"),
        _.keyBy(routes, "routeId"),
      ]),
      collectPings(dynamoDb, routes),
    ])
  )
}

module.exports = {
  infoByRouteId,
  injectStopsWithRouteInfo,
}
