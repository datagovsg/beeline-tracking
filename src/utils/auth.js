const _ = require("lodash")
const axios = require("axios")

/**
 * Call the `/admins/whoami` endpoint at `API_URL` to figure out
 * who the admin is and what he/she can do
 * @param {Object} headers - the headers containing the JSON web token received from the admin
 * @return {Promise<Object>} the credentials returned by the endpoint
 */
function lookupEntitlements(headers) {
  const Authorization = headers.authorization || headers.Authorization
  return axios
    .get(
      `${process.env.API_URL}/admins/whoami`,
      Authorization ? { headers: { Authorization } } : {}
    )
    .then(({ data: credentials }) => credentials)
}

/**
 * @param {Object} credentials - the decrypted credentials from an auth0 token
 * @param {string} role - self-explanatory
 * @return {Array<Number>} List of company IDs for which this `credentials`
 * has permissions to a particular `role`
 */
function getCompaniesByRole(credentials, role) {
  if (!credentials.permissions) {
    return []
  }

  return _(credentials.permissions)
    .pickBy(v => v.includes(role))
    .keys()
    .map(id => parseInt(id))
    .value()
}

module.exports = {
  lookupEntitlements,
  getCompaniesByRole,
}
