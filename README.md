# beeline-tracking

Trip-level bus location tracking for Beeline

## Overview
Location pings are received, along with an authorization token from the driver.
Once validated, it is stored in a DynamoDB table with the following structure:

```
{tripId, driverId, vehicleId, time, location}
```

where tripId, driverId and vehicleId are numeric identifiers for the respective entities, time is expressed in epoch milliseconds, and location is a [geohash](https://en.wikipedia.org/wiki/Geohash).

Pings are validated by ensuring the driverId contained in the auth token is sane.
In future, further validation will ensure that the driver is meant to be driving
the specified vehicle on the specified trip.

beeline-tracking is deployed on AWS using [Serverless](https://serverless.com/).

## Setup

```bash
npm install
```

## Tests
Tests are written in mocha and found in `test/`

```bash
npm test
```

## Deploy
Ensure that `AUTH0_SECRET` is set. This is the symmetric key used to decrypt
authorization tokens from other Beeline components

```bash
npm run staging
```

The expected result should be similar to:

```bash
Serverless: Packaging service…
Serverless: Uploading CloudFormation file to S3…
Serverless: Uploading service .zip file to S3…
Serverless: Updating Stack…
Serverless: Checking Stack update progress…
Serverless: Stack update finished…

Service Information
service: beeline-tracking
stage: staging
region: ap-southeast-1
api keys:
  None
endpoints:
  POST - ...
  GET - ...
functions:
  ...
```

## Usage

You can create or retrieve the latest location of a given trip
with the following commands:

(In these examples, the tripId is 121)

### POST the latest location of the bus on a trip

```bash
curl -X POST \
https://XXXXXXX.execute-api.ap-southeast-1.amazonaws.com/staging/trips/121/pings/latest \
--data '{ "vehicleId": 1337, "latitude": 1.3, "longitude": 103.85 }' \
--header 'Authorization: Bearer <jsonwebtoken encrypted with AUTH0_SECRET: {driverId:62353535}>'
```

Example Result:
```json
{
    "item": {
        "tripId": 121,
        "driverId": 62353535,
        "vehicleId": 1337,
        "time": 1511846793362,
        "location": "w21z7htm0"
    }
}
```

### GET the latest location of the bus on a trip

```bash
curl https://XXXXXXX.execute-api.ap-southeast-1.amazonaws.com/staging/trips/121/pings/latest
```

Example output:
```json
{
    "tripId": 121,
    "location": "w21ztqe24",
    "time": 1512125372160,
    "vehicleId": 1337,
    "driverId": 62353535,
    "coordinates": {
        "type": "Point",
        "coordinates": [
            103.94622087478638,
            1.3540863990783691
        ]
    }
}
```

### GET the last 20 pings of the bus on a trip

```bash
curl https://XXXXXXX.execute-api.ap-southeast-1.amazonaws.com/staging/trips/121/pings?limit=20
```

Example output:
```json
[
  {
      "tripId": 121,
      "location": "w21ztqe24",
      "time": 1512125372160,
      "vehicleId": 1337,
      "driverId": 62353535,
      "coordinates": {
          "type": "Point",
          "coordinates": [
              103.94622087478638,
              1.3540863990783691
          ]
      }
  },
  // ...
]
```


## Acknowledgements
This project is created using code derived from [serverless/examples](https://github.com/serverless/examples/blob/master/aws-node-rest-api-with-dynamodb/)
on GitHub

## Contributing
We welcome contributions to code open sourced by the Government Technology Agency of Singapore. All contributors will be asked to sign a Contributor License Agreement (CLA) in order to ensure that everybody is free to use their contributions.
