const { paypalPayoutRequest, paypalWebhook } = require('../services/paypalPayout');
const socialLikes = require('../services/socialLikes');
const privateMessages = require('../services/privateMessages');

module.exports = async function paypalApi(req, res) {
  const handler = String(req.query?.handler || 'request');
  if (handler === 'social-likes') return socialLikes(req, res);
  if (handler === 'messages') return privateMessages(req, res);
  if (handler === 'webhook') {
    return paypalWebhook(req, res);
  }
  return paypalPayoutRequest(req, res);
};

module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };
