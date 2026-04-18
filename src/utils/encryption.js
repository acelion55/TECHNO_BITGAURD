import crypto from 'crypto';

const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

export const encrypt = (data) => {
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc    = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return {
    iv:   iv.toString('hex'),
    data: enc.toString('hex'),
    tag:  cipher.getAuthTag().toString('hex')
  };
};

export const decrypt = (encrypted) => {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', KEY,
    Buffer.from(encrypted.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'hex')),
    decipher.final()
  ]);
  return JSON.parse(dec.toString('utf8'));
};
