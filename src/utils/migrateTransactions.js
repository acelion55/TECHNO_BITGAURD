import 'dotenv/config';
import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

const SENSITIVE = ['amountINR', 'btcAmount', 'pricePerBtc', 'costBasis'];

// Raw schema — bypass the model to access _enc directly
const rawSchema = new mongoose.Schema({}, { strict: false });
const RawTx = mongoose.model('RawTransaction', rawSchema, 'transactions');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const txs = await RawTx.find({}).lean();
  console.log(`Found ${txs.length} transactions`);

  let migrated = 0;
  let alreadyOk = 0;

  for (const tx of txs) {
    const hasNewEnc = tx.enc && tx.enc.amountINR?.iv;
    const hasOldEnc = tx._enc && tx._enc.amountINR?.iv;

    if (hasNewEnc) {
      alreadyOk++;
      continue; // already migrated
    }

    const update = { enc: {} };

    for (const field of SENSITIVE) {
      const val = tx[field];
      if (!val) continue;

      if (hasOldEnc && tx._enc[field]?.iv) {
        // Has old _enc — just copy to enc
        update.enc[field] = tx._enc[field];
      } else if (typeof val === 'number') {
        // Plain number — encrypt it
        const result = encrypt(val);
        update[field] = result.data;
        update.enc[field] = { iv: result.iv, tag: result.tag };
      } else if (typeof val === 'string' && val.length > 10) {
        // Already encrypted hex string but missing enc envelope — re-encrypt from scratch
        // We can't decrypt without the old key, so skip these
        console.warn(`  TX ${tx._id}: ${field} is encrypted string but no envelope — skipping`);
      }
    }

    await RawTx.updateOne({ _id: tx._id }, { $set: update, $unset: { _enc: '' } });
    migrated++;
    console.log(`  Migrated tx ${tx._id}`);
  }

  console.log(`\nDone. Migrated: ${migrated}, Already OK: ${alreadyOk}`);
  await mongoose.disconnect();
};

run().catch(e => { console.error(e.message); process.exit(1); });
