import 'dotenv/config';
import mongoose from 'mongoose';
import { ecEncrypt } from './ecEncryption.js';

const SENSITIVE = ['amountINR', 'btcAmount', 'pricePerBtc', 'costBasis'];

const rawSchema    = new mongoose.Schema({}, { strict: false });
const RawTx        = mongoose.model('RawTransaction', rawSchema, 'transactions');
const RawPortfolio = mongoose.model('RawPortfolio', new mongoose.Schema({}, { strict: false }), 'portfolios');

const isPlain = (val) =>
  typeof val === 'number' ||
  (typeof val === 'string' && val.length < 40 && !isNaN(Number(val)) && val.trim() !== '');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const txs = await RawTx.find({}).lean();
  console.log(`Found ${txs.length} transactions`);

  let migrated = 0, alreadyOk = 0, deleted = 0;
  const deletedIds = [];

  for (const tx of txs) {
    // Already ECDH encrypted
    if (tx.enc?.amountINR?.ephemeralPub) { alreadyOk++; continue; }

    const update = { enc: {} };
    let unrecoverable = false;

    for (const field of SENSITIVE) {
      const val = tx[field];
      if (isPlain(val)) {
        const result = ecEncrypt(Number(val));
        update[field]     = result.data;
        update.enc[field] = { ephemeralPub: result.ephemeralPub, iv: result.iv, tag: result.tag, data: result.data };
      } else {
        // Already a long hex ciphertext with no envelope — unrecoverable
        unrecoverable = true;
        break;
      }
    }

    if (unrecoverable) {
      await RawTx.deleteOne({ _id: tx._id });
      deletedIds.push(tx._id);
      deleted++;
      console.log(`  Deleted unrecoverable tx ${tx._id}`);
      continue;
    }

    await RawTx.updateOne({ _id: tx._id }, { $set: update, $unset: { _enc: '' } });
    migrated++;
    console.log(`  Migrated tx ${tx._id} → ECDH`);
  }

  if (deletedIds.length > 0) {
    await RawPortfolio.updateMany(
      { transactions: { $in: deletedIds } },
      { $pull: { transactions: { $in: deletedIds } } }
    );
    console.log(`Cleaned ${deletedIds.length} broken tx refs from portfolios`);
  }

  console.log(`\nDone. Migrated: ${migrated}, Already OK: ${alreadyOk}, Deleted: ${deleted}`);
  await mongoose.disconnect();
};

run().catch(e => { console.error(e.message); process.exit(1); });
