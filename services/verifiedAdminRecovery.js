const ADMIN_PROFILE_EMAIL = 'nebiyevsedi18@gmail.com';

function isVerifiedAdminRecovery(identity) {
  return identity?.emailVerified === true
    && String(identity.email || '').trim().toLowerCase() === ADMIN_PROFILE_EMAIL;
}

module.exports = { ADMIN_PROFILE_EMAIL, isVerifiedAdminRecovery };
