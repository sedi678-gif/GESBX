const { paypalPayoutRequest, paypalWebhook } = require('../services/paypalPayout');
const socialLikes = require('../services/socialLikes');

module.exports = async function paypalApi(req, res) {
  const handler = String(req.query?.handler || 'request');
  if (handler === 'social-likes') return socialLikes(req, res);
  if (handler === 'webhook') {
    return paypalWebhook(req, res);
  }
  return paypalPayoutRequest(req, res);
};
