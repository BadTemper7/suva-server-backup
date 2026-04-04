import dotenv from "dotenv";
import mongoose from "mongoose";
import { LEGACY_INACTIVE_MAINTENANCE_REASON } from "../constants/roomMigration.js";

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const coll = mongoose.connection.db.collection("rooms");

  const result = await coll.updateMany(
    { status: "inactive" },
    [
      {
        $set: {
          status: "maintenance",
          maintenanceReason: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $ifNull: ["$maintenanceReason", ""] }, ""] },
                  { $eq: ["$maintenanceReason", null] },
                ],
              },
              LEGACY_INACTIVE_MAINTENANCE_REASON,
              "$maintenanceReason",
            ],
          },
        },
      },
    ],
  );

  console.log(
    `migrateRoomsInactiveToMaintenance: matched ${result.matchedCount}, modified ${result.modifiedCount}`,
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
