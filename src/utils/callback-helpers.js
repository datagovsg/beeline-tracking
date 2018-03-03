module.exports = {
  callbackWithFactory: callback => (statusCode, response, headers) => {
    const finalHeaders = Object.assign(headers || {}, {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
    })
    const body =
      finalHeaders["Content-Type"] === "text/csv"
        ? response
        : JSON.stringify(response)
    callback(null, { statusCode, finalHeaders, body })
  },
}
