const handlers = {
  getMyReferralCode: require('../services/referralHandlers/getMyReferralCode'),
  getMyReferrals: require('../services/referralHandlers/getMyReferrals'),
  applyReferral: require('../services/referralHandlers/applyReferral'),
  checkReferralActivation: require('../services/referralHandlers/checkReferralActivation'),
};

module.exports = async function referralsDispatcher(req, res) {
  const action = String(req.query?.action || '');
  const handler = handlers[action];
  if (!handler) {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(400).json({ error: 'INVALID_REFERRAL_ACTION' });
  }
  return handler(req, res);
};
