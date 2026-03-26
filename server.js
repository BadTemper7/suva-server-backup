import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./utils/db.js";
import User from "./models/userModel.js";
import { initScheduler, runJobsNow } from "./jobs/scheduler.js";
import { startAutoUnlockJob } from "./jobs/autoUnlockAccounts.js";

import userRoutes from "./routes/userRoutes.js";
import roomTypeRoutes from "./routes/roomTypeRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import amenityRoutes from "./routes/amenityRoutes.js";
import addOnRoutes from "./routes/addOnRoutes.js";
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
  const existing = await User.findOne({ username: "suva_admin" });
  if (!existing) {
    await User.create({
      firstName: "Suva",
      lastName: "Admin",
      username: "suva_admin",
      email: "suvasplaceinc@gmail.com",
      contactNumber: "09760233563",
      password: "!Suva123",
      role: "superadmin",
      status: "active",
      protected: true, // Cannot be deleted
    });
    console.log("✅ Superadmin created!");
  }
}

async function startServer() {
  await connectDB();
  console.log("✅ Database connected");

  await initializeSettings();
  console.log("✅ Settings initialized");

  await ensureSuperAdmin(); // ✅ called after DB is connected

  // Start self-ping cron (keeps server awake)
  startSelfPingCron();

  // Initialize all scheduled jobs
  initScheduler();
  console.log("✅ Job scheduler initialized");

  // Start auto-unlock accounts job
  startAutoUnlockJob();
  console.log("✅ Auto-unlock job started");

  // Verify email connection
  await verifyEmailConnection();
  console.log("✅ Email service verified");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Serve static files
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));

  // Routes
  app.use("/api/room-types", roomTypeRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/add-ons", addOnRoutes);
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
      jobs: {
        expiredReservations: "running every 2 hours",
        expiredReceipts: "running every 6 hours",
        autoUnlockAccounts: "running every 30 minutes",
        selfPing: "running every 10 minutes",
      },
    });
  });

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      message: "Suva's Place Resort API Server",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      status: "running",
      endpoints: {
        health: "/health - Health check with job status",
        api: "/api/* - All API endpoints",
        uploads: "/uploads/* - Static files",
      },
      jobs: {
        expiredReservations: "Cancels pending reservations after 24 hours",
        expiredReceipts: "Deletes pending receipts after 24 hours",
        autoUnlockAccounts: "Unlocks locked user accounts after timeout",
        selfPing: "Keeps server awake by pinging health endpoint",
      },
    });
  });

  // Create HTTP server manually
  const server = http.createServer(app);

  // Attach WebSocket to same server
  createWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`\n🚀 Server + WebSocket running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔗 API URL: http://localhost:${PORT}/api`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
    console.log(`\n📋 Job Status:`);
    console.log(`   - Expired reservations: running every 2 hours`);
    console.log(`   - Expired receipts: running every 6 hours`);
    console.log(`   - Auto-unlock accounts: running every 30 minutes`);
    console.log(`   - Self-ping: running every 10 minutes`);

    // Run initial cleanup jobs on startup
    runJobsNow()
      .then((results) => {
        console.log(`\n🧹 Initial cleanup completed:`);
        if (results.reservations.modified > 0) {
          console.log(
            `   - Cancelled ${results.reservations.modified} expired reservations`,
          );
        }
        if (results.receipts.deletedCount > 0) {
          console.log(
            `   - Deleted ${results.receipts.deletedCount} expired receipts`,
          );
        }
        if (
          results.reservations.modified === 0 &&
          results.receipts.deletedCount === 0
        ) {
          console.log(`   - No expired items found to clean up`);
        }
      })
      .catch((err) => {
        console.error("❌ Initial cleanup failed:", err.message);
      });
  });
}

function startSelfPingCron() {
  // Schedule self-ping every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    try {
      const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
      const timestamp = new Date().toISOString();

      console.log(`\n[${timestamp}] 🔄 Self-pinging server...`);

      // Ping the health endpoint
      const response = await fetch(`${serverUrl}/health`);

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Server ping successful at ${timestamp}`);
        console.log(`   - Uptime: ${Math.floor(data.uptime / 60)} minutes`);
      } else {
        console.log(`⚠️ Server ping returned status: ${response.status}`);
      }
    } catch (error) {
      console.error("❌ Error during self-ping:", error.message);

      // If the server is running locally, try to ping localhost
      if (process.env.NODE_ENV !== "production") {
        try {
          const localResponse = await fetch(`http://localhost:${PORT}/health`);
          console.log(`🔄 Local ping result: ${localResponse.status}`);
        } catch (localError) {
          console.error("❌ Local ping also failed:", localError.message);
        }
      }
    }
  });

  console.log("✅ Self-ping cron job scheduled (every 10 minutes)");
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  // Keep the server running, but log the error
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

startServer();
