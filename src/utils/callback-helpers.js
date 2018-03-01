module.exports = {
  callbackWithFactory: callback => (statusCode, response) => {
    const headers = {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
    }
    callback(null, { statusCode, headers, body: JSON.stringify(response) })
  },
}
