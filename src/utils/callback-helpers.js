module.exports = {
  callbackWithFactory: callback => (statusCode, response, customHeaders) => {
    const headers = Object.assign(customHeaders || {}, {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
    })
    const body =
      headers['Content-Type'] === 'text/csv'
        ? response
        : JSON.stringify(response)
    callback(null, { statusCode, headers, body })
  },
}
