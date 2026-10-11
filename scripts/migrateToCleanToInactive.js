import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

// One-off: renames the old "to-clean" room/cottage status to "inactive" (WT-03).
// Run once before deploying the code change that removes "to-clean" from the
// Room status enum, or existing rooms will be left with an invalid status value.
async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const coll = mongoose.connection.db.collection("rooms");

  const result = await coll.updateMany(
    { status: "to-clean" },
    { $set: { status: "inactive" } },
  );

  console.log(
    `migrateToCleanToInactive: matched ${result.matchedCount}, modified ${result.modifiedCount}`,
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
