const { paypalPayoutRequest, paypalWebhook } = require('../services/paypalPayout');

module.exports = async function paypalApi(req, res) {
  if (String(req.query?.handler || 'request') === 'webhook') {
    return paypalWebhook(req, res);
  }
  return paypalPayoutRequest(req, res);
};
