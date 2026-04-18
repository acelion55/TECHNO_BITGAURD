import crypto from 'crypto';

/**
 * ECDH + AES-256-GCM transaction encryption
 *
 * Encrypt flow:
 *   1. Generate ephemeral P-256 keypair
 *   2. ECDH(ephemeral_private, server_public) → 32-byte shared secret
 *   3. AES-256-GCM encrypt plaintext with shared secret
 *   4. Store: ephemeralPub (hex) + iv (hex) + tag (hex) + ciphertext (hex)
 *
 * Decrypt flow:
 *   1. ECDH(server_private, ephemeral_public) → same 32-byte shared secret
 *   2. AES-256-GCM decrypt ciphertext
 */

const SERVER_PRIVATE_KEY = crypto.createPrivateKey({
  key: Buffer.from(process.env.EC_PRIVATE_KEY, 'hex'),
  format: 'der',
  type: 'pkcs8',
});

const SERVER_PUBLIC_KEY = crypto.createPublicKey({
  key: Buffer.from(process.env.EC_PUBLIC_KEY, 'hex'),
  format: 'der',
  type: 'spki',
});

// Derive 32-byte AES key from ECDH shared secret via SHA-256
const deriveKey = (privateKey, publicKey) => {
  const shared = crypto.diffieHellman({ privateKey, publicKey });
  return crypto.createHash('sha256').update(shared).digest(); // 32 bytes
};

export const ecEncrypt = (value) => {
  // Ephemeral keypair — unique per field per transaction
  const { privateKey: ephPriv, publicKey: ephPub } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding:  { type: 'spki',  format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  const ephPrivKey = crypto.createPrivateKey({ key: ephPriv, format: 'der', type: 'pkcs8' });
  const ephPubKey  = crypto.createPublicKey({  key: ephPub,  format: 'der', type: 'spki'  });

  const aesKey = deriveKey(ephPrivKey, SERVER_PUBLIC_KEY);

  const iv     = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const enc    = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);

  return {
    ephemeralPub: ephPub.toString('hex'),   // store ephemeral public key
    iv:           iv.toString('hex'),
    tag:          cipher.getAuthTag().toString('hex'),
    data:         enc.toString('hex'),
  };
};

export const ecDecrypt = ({ ephemeralPub, iv, tag, data }) => {
  const ephPubKey = crypto.createPublicKey({
    key: Buffer.from(ephemeralPub, 'hex'),
    format: 'der',
    type: 'spki',
  });

  const aesKey   = deriveKey(SERVER_PRIVATE_KEY, ephPubKey);
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  const dec = Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]);

  return JSON.parse(dec.toString('utf8'));
};
