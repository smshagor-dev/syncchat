const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateOtp,
  generateResetToken,
  hashOtp,
  hashResetToken,
  timingSafeHexEqual,
  validatePassword,
  verifyOtpHash,
} = require('../server/helpers/authCodes');
const {
  decryptSmtpSecret,
  encryptSmtpSecret,
  isEncryptedSmtpSecret,
} = require('../server/helpers/smtpSecret');
const { validateUploadBuffer } = require('../server/helpers/fileSignature');

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]);

test('verification OTPs are cryptographically generated six-digit codes', () => {
  const seen = new Set();
  for (let index = 0; index < 200; index += 1) {
    const otp = generateOtp();
    assert.match(otp, /^\d{6}$/);
    seen.add(otp);
  }
  assert.ok(seen.size > 150, 'OTP generator should produce varied values');
});

test('OTP hashes verify correct code and reject an incorrect code', () => {
  const hash = hashOtp({
    purpose: 'verify-account',
    userId: 'user-123',
    otp: '012345',
  });
  assert.equal(
    verifyOtpHash({
      purpose: 'verify-account',
      userId: 'user-123',
      otp: '012345',
      hash,
    }),
    true
  );
  assert.equal(
    verifyOtpHash({
      purpose: 'verify-account',
      userId: 'user-123',
      otp: '012346',
      hash,
    }),
    false
  );
});

test('password reset tokens are random and stored only as one-way hashes', () => {
  const left = generateResetToken();
  const right = generateResetToken();
  assert.notEqual(left, right);
  assert.ok(left.length >= 40);
  const hash = hashResetToken(left);
  assert.notEqual(hash, left);
  assert.equal(timingSafeHexEqual(hashResetToken(left), hash), true);
  assert.equal(timingSafeHexEqual(hashResetToken(right), hash), false);
});

test('password policy rejects weak passwords and accepts strong passwords', () => {
  assert.ok(validatePassword('short1'));
  assert.ok(validatePassword('abcdefgh'));
  assert.ok(validatePassword('12345678'));
  assert.equal(validatePassword('SecurePass123'), '');
});

test('SMTP secrets are encrypted at rest and decrypt correctly', () => {
  const secret = 'smtp-app-password-123';
  const encrypted = encryptSmtpSecret(secret);
  assert.equal(isEncryptedSmtpSecret(encrypted), true);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSmtpSecret(encrypted), secret);
  assert.equal(decryptSmtpSecret('legacy-plaintext'), 'legacy-plaintext');
});

test('upload validation uses content signature instead of trusting filename', () => {
  const detected = validateUploadBuffer({
    buffer: png,
    filename: 'photo.png',
    mime: 'image/png',
  });
  assert.deepEqual(detected, { type: 'image', format: 'png' });

  assert.throws(
    () =>
      validateUploadBuffer({
        buffer: png,
        filename: 'malware.exe',
        mime: 'image/png',
      }),
    /not allowed/
  );

  assert.throws(
    () =>
      validateUploadBuffer({
        buffer: Buffer.from('not really a png'),
        filename: 'fake.png',
        mime: 'image/png',
      }),
    /could not be safely identified/
  );
});
