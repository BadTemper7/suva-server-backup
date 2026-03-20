// jobs/autoUnlockAccounts.js (create this file)
import cron from "node-cron";
import User from "../models/userModel.js";

export const autoUnlockAccounts = async () => {
  try {
    const now = new Date();

    const result = await User.updateMany(
      {
        lockUntil: { $lt: now, $ne: null },
      },
      {
        $set: {
          loginAttempts: 0,
          lockUntil: null,
          lastLoginAttempt: null,
        },
      },
    );

    if (result.modifiedCount > 0) {
      console.log(`🔓 Auto-unlocked ${result.modifiedCount} accounts`);
    }
  } catch (error) {
    console.error("Error auto-unlocking accounts:", error);
  }
};

// Schedule to run every 5 minutes
export const startAutoUnlockJob = () => {
  cron.schedule("*/5 * * * *", autoUnlockAccounts);
  console.log("Auto-unlock job scheduled (every 5 minutes)");
};
