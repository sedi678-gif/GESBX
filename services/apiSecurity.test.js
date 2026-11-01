const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { hmacRiskHash } = require('./apiSecurity');

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function withServerEnv(values, run) {
  const names = ['FIREBASE_SERVICE_ACCOUNT_JSON', 'RISK_HASH_SECRET'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) {
    if (values[name] == null) delete process.env[name];
    else process.env[name] = values[name];
  }
  try {
    run();
  } finally {
    for (const name of names) {
      if (previous[name] == null) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

function serviceAccountJson() {
  return JSON.stringify({
    project_id: 'gesbx-c4312',
    client_email: 'test@gesbx-c4312.iam.gserviceaccount.com',
    private_key: privateKey,
  });
}

test('derives stable, purpose-separated hashes when RISK_HASH_SECRET is unset', () => {
  withServerEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson() }, () => {
    const first = hmacRiskHash('Installation-123', 'installation');
    assert.equal(first, hmacRiskHash('installation-123', 'installation'));
    assert.notEqual(first, hmacRiskHash('installation-123', 'ip'));
    assert.match(first, /^[a-f0-9]{64}$/);
  });
});

test('uses a configured RISK_HASH_SECRET override', () => {
  const secret = 'a'.repeat(48);
  withServerEnv({ RISK_HASH_SECRET: secret }, () => {
    const expected = crypto.createHmac('sha256', secret)
      .update('installation:device-1').digest('hex');
    assert.equal(hmacRiskHash('device-1', 'installation'), expected);
  });
});

test('rejects a configured RISK_HASH_SECRET that is too short', () => {
  withServerEnv({ RISK_HASH_SECRET: 'too-short' }, () => {
    assert.throws(
      () => hmacRiskHash('device-1', 'installation'),
      (error) => error.code === 'SECURITY_CONFIGURATION_MISSING',
    );
  });
});
