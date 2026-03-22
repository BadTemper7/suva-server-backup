import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./utils/db.js";
import User from "./models/userModel.js";
import { cancelExpiredPendings } from "./jobs/cancelExpiredPendings.js";
import { initializeJobs, triggerJobsManually } from "./jobs/scheduler.js";
import { startAutoUnlockJob } from "./jobs/autoUnlockAccounts.js";

import userRoutes from "./routes/userRoutes.js";
import roomTypeRoutes from "./routes/roomTypeRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import amenityRoutes from "./routes/amenityRoutes.js";
import guestRoutes from "./routes/guestRoutes.js";
import reservationRoutes from "./routes/reservationRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import reservationRoomRoutes from "./routes/reservationRoomRoutes.js";
import discountRoutes from "./routes/discountRoutes.js";
import paymentOptionRoutes from "./routes/paymentOptionRoutes.js";
import paymentTypeRoutes from "./routes/paymentTypeRoutes.js";
import discountImageRoutes from "./routes/discountImageRoutes.js";
import receiptRoutes from "./routes/receiptRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import emailTest from "./routes/emailTest.js";
import messageRoutes from "./routes/messageRoutes.js";
import { initializeSettings } from "./controllers/settingsController.js";
import dns from "dns";
import path from "path";
import { fileURLToPath } from "url";

import http from "http";
import cron from "node-cron";
import { createWebSocketServer } from "./wsServer.js";
import { verifyEmailConnection } from "./config/email.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

dns.setServers(["1.1.1.1", "8.8.8.8"]);
// ✅ Ensure Superadmin exists
async function ensureSuperAdmin() {
  const existing = await User.findOne({ username: "suva-admin" });
  if (!existing) {
    await User.create({
      firstName: "Suva",
      lastName: "Admin",
      username: "suva-admin",
      email: "suva@example.com",
      contactNumber: "09281901654",
      password: "Suva_2026",
      role: "superadmin",
      status: "active",
      protected: true, // Cannot be deleted
    });
    console.log("Superadmin created!");
  }
}
async function deleteSuperadmin(id) {
  try {
    const deleted = await User.deleteOne({ _id: id });
    if (deleted.deletedCount > 0) {
      console.log("Superadmin deleted successfully!");
    } else {
      console.log("Superadmin not found or already deleted.");
    }
  } catch (err) {
    console.error("Error deleting superadmin:", err);
  }
}
async function startServer() {
  await connectDB();
  initializeSettings();
  await ensureSuperAdmin(); // ✅ called after DB is connected
  startSelfPingCron();
  startAutoUnlockJob();
  await verifyEmailConnection();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const JOB_INTERVAL_MS = 60 * 1000; // every 1 minute
  // setInterval(async () => {
  //   try {
  //     const { matched, modified } = await cancelExpiredPendings();
  //     if (modified > 0) {
  //       console.log(`🧹 Auto-cancel expired pendings: modified=${modified}`);
  //     }
  //   } catch (err) {
  //     console.error("❌ Auto-cancel job failed:", err.message);
  //   }
  // }, JOB_INTERVAL_MS);

  app.use("/uploads", express.static(path.join(__dirname, "uploads")));

  // routes
  app.use("/api/room-types", roomTypeRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/amenities", amenityRoutes);
  app.use("/api/guests", guestRoutes);
  app.use("/api/reservations", reservationRoutes);
  app.use("/api/billings", billingRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reservation-rooms", reservationRoomRoutes);
  app.use("/api/discounts", discountRoutes);
  app.use("/api/payment-options", paymentOptionRoutes);
  app.use("/api/payment-types", paymentTypeRoutes);
  app.use("/api/discount-images", discountImageRoutes);
  app.use("/api/receipts", receiptRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/email", emailTest);
  app.use("/api/messages", messageRoutes);

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      message: "Server is running",
      timestamp: new Date().toISOString(),
      endpoints: [
        "/health - Health check",
        "/api/* - API endpoints",
        "/uploads/* - Static files",
      ],
    });
  });

  // Create HTTP server manually
  const server = http.createServer(app);

  // Attach WebSocket to same server
  createWebSocketServer(server);

  server.listen(PORT, () =>
    console.log(`Server + WebSocket running on port ${PORT}`),
  );
}
function startSelfPingCron() {
  // Schedule self-ping every 10 minutes
  // Cron pattern: '*/10 * * * *' means every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    try {
      const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
      console.log(
        `[${new Date().toISOString()}] Self-pinging server at ${serverUrl}/health`,
      );

      // Ping the health endpoint
      const response = await fetch(`${serverUrl}/health`);

      if (response.ok) {
        const data = await response.json();
        console.log(`Server ping successful:`, data);
      } else {
        console.log(`Server ping failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error during self-ping:", error.message);

      // If the server is running locally, try to ping localhost
      if (process.env.NODE_ENV !== "production") {
        try {
          const localResponse = await fetch(`http://localhost:${PORT}/health`);
          console.log(`Local ping result: ${localResponse.status}`);
        } catch (localError) {
          console.error("Local ping also failed:", localError.message);
        }
      }
    }
  });

  console.log("Self-ping cron job scheduled (every 10 minutes)");
}
startServer();
