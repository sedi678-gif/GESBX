function parseAdminUidAllowlist(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((uid) => uid.trim())
    .filter(Boolean);
}

function isConfiguredAdminUid(uid, allowlistValue) {
  const normalizedUid = String(uid || '').trim();
  return Boolean(normalizedUid && parseAdminUidAllowlist(allowlistValue).includes(normalizedUid));
}

module.exports = { parseAdminUidAllowlist, isConfiguredAdminUid };
