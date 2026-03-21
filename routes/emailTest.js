// routes/emailTest.js or add to existing routes
import express from "express";
import { sendEmail, verifyEmailConnection } from "../config/email.js";

const router = express.Router();

// Test email configuration
router.get("/test-email-config", async (req, res) => {
  const isConnected = await verifyEmailConnection();
  res.json({
    configured: !!process.env.SMTP_USER,
    connected: isConnected,
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ? "✓ Set" : "✗ Missing",
  });
});

// Send test email
router.post("/test-send-email", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email address required" });
  }

  const result = await sendEmail({
    to: email,
    subject: "Test Email from Suva's Place Resort",
    html: `
      <h1>Test Email</h1>
      <p>This is a test email from Suva's Place Resort.</p>
      <p>If you're receiving this, your email configuration is working correctly!</p>
      <p>Time: ${new Date().toISOString()}</p>
    `,
  });

  res.json(result);
});

export default router;
