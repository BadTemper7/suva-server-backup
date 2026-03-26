// config/email.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create transporter with proper SSL/TLS configuration
const createTransporter = () => {
  // Check if using Gmail
  if (process.env.EMAIL_SERVICE === "gmail") {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("❌ Gmail credentials missing");
      return null;
    }

    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  // Using SMTP (Hostinger)
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASSWORD
  ) {
    console.error("❌ SMTP credentials missing");
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE === "true";

  console.log(`📧 Configuring SMTP:`);
  console.log(`   - Host: ${process.env.SMTP_HOST}`);
  console.log(`   - Port: ${port}`);
  console.log(`   - Secure: ${secure} ${secure ? "(SSL/TLS)" : "(STARTTLS)"}`);
  console.log(`   - User: ${process.env.SMTP_USER}`);

  const transporterConfig = {
    host: process.env.SMTP_HOST,
    port: port,
    secure: secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
      ciphers: "SSLv3",
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  };

  if (!secure && port === 587) {
    transporterConfig.tls = {
      rejectUnauthorized: false,
    };
    transporterConfig.requireTLS = true;
  }

  return nodemailer.createTransport(transporterConfig);
};

const transporter = createTransporter();

// Verify connection with detailed logging
export const verifyEmailConnection = async () => {
  if (!transporter) {
    console.error("❌ Email transporter not configured");
    return false;
  }

  try {
    console.log("🔌 Testing email connection...");
    await transporter.verify();
    console.log("✅ Email service is ready to send emails");
    console.log(
      `   - Connected to: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
    );
    return true;
  } catch (error) {
    console.error("❌ Email service connection failed:");
    console.error(`   - Error: ${error.message}`);
    console.error(`   - Code: ${error.code || "N/A"}`);
    console.error(`   - Command: ${error.command || "N/A"}`);

    if (error.message.includes("ECONNREFUSED")) {
      console.error(
        "   💡 Suggestion: Check if the port is correct and not blocked by firewall",
      );
    } else if (error.message.includes("AUTH")) {
      console.error("   💡 Suggestion: Check your email username and password");
    } else if (error.message.includes("CERT")) {
      console.error(
        "   💡 Suggestion: SSL certificate issue. Try setting SMTP_SECURE=false and using port 587",
      );
    }

    return false;
  }
};

// Enhanced send email function with better error handling
export const sendEmail = async ({ to, subject, html, text }) => {
  if (!transporter) {
    console.error("❌ Email transporter not configured");
    return { success: false, error: "Email service not configured" };
  }

  if (!to) {
    console.error("❌ No recipient email address provided");
    return { success: false, error: "No recipient email address" };
  }

  try {
    const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;
    const fromName = "Suva's Place Resort";

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, ""),
      headers: {
        "X-Mailer": "Suva's Place Resort",
        "X-Priority": "3",
        "List-Unsubscribe": `<mailto:${fromEmail}?subject=unsubscribe>`,
      },
    };

    console.log(`📧 Sending email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   From: ${mailOptions.from}`);

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent successfully!");
    console.log(`   - Message ID: ${info.messageId}`);
    console.log(`   - Response: ${info.response || "N/A"}`);
    console.log(`   - Accepted: ${info.accepted?.join(", ") || "N/A"}`);
    console.log(`   - Rejected: ${info.rejected?.join(", ") || "None"}`);

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    };
  } catch (error) {
    console.error("❌ Email sending failed:");
    console.error(`   - Error: ${error.message}`);
    console.error(`   - Code: ${error.code || "N/A"}`);
    console.error(`   - Command: ${error.command || "N/A"}`);

    if (error.response) {
      console.error(`   - SMTP Response: ${error.response}`);
    }

    return { success: false, error: error.message, code: error.code };
  }
};

/* ==================== GUEST EMAIL TEMPLATES ==================== */

// Guest Welcome Email
export const sendWelcomeEmail = async (guest) => {
  const subject = "Welcome to Suva's Place Resort! 🏖️";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Suva's Place Resort</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          padding: 40px 30px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .header::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,215,0,0.2) 0%, transparent 70%);
          animation: shimmer 10s infinite;
        }
        @keyframes shimmer {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20%, 20%); }
        }
        .logo-wrapper {
          margin-bottom: 20px;
          position: relative;
          display: inline-block;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
        }
        .logo img {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .brand-name {
          font-family: 'Dancing Script', cursive;
          font-size: 32px;
          font-weight: bold;
          color: white;
          margin-bottom: 8px;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
        }
        .brand-subtitle {
          font-family: 'Times New Roman', serif;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
          letter-spacing: 1px;
          font-style: italic;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .greeting {
          font-size: 24px;
          color: #78350f;
          margin-bottom: 20px;
          font-weight: 600;
        }
        .greeting strong {
          color: #b45309;
        }
        .welcome-text {
          color: #6b4c2c;
          margin-bottom: 30px;
          line-height: 1.8;
          font-size: 16px;
        }
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 30px 0;
        }
        .feature-card {
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border-radius: 16px;
          padding: 20px;
          text-align: center;
          transition: transform 0.3s ease;
        }
        .feature-icon {
          font-size: 32px;
          margin-bottom: 12px;
        }
        .feature-title {
          font-weight: 600;
          color: #b45309;
          margin-bottom: 8px;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          margin: 20px 0;
          transition: all 0.3s ease;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
        }
        .footer {
          background: linear-gradient(135deg, #78350f, #92400e);
          padding: 30px;
          text-align: center;
          color: white;
        }
        .tagline {
          font-family: 'Dancing Script', cursive;
          font-size: 18px;
          font-weight: 500;
          color: #fde68a;
          margin-bottom: 20px;
        }
        .contact-info {
          font-size: 12px;
          line-height: 1.8;
          color: #fed7aa;
          margin-top: 20px;
        }
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap');
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-wrapper">
            <div class="logo">
              <img src="${process.env.LOGO_URL || "https://suvasplaceresort.com/images/small-logo.png"}" alt="Suva's Place Resort" />
            </div>
          </div>
          <div class="brand-name">Suva's Place</div>
          <div class="brand-subtitle">Resort Antipolo</div>
        </div>
        
        <div class="content">
          <div class="greeting">
            Welcome, <strong>${guest.firstName} ${guest.lastName}</strong>! 🎉
          </div>
          
          <div class="welcome-text">
            Thank you for creating an account with Suva's Place Resort. We're thrilled to have you as part of our family! Your gateway to unforgettable tropical escapes and relaxing getaways awaits.
          </div>
          
          <div class="feature-grid">
            <div class="feature-card">
              <div class="feature-icon">🏊</div>
              <div class="feature-title">Swimming Pool</div>
              <div class="feature-desc">Relax in our crystal-clear pool</div>
            </div>
            <div class="feature-card">
              <div class="feature-icon">📶</div>
              <div class="feature-title">Free Wi-Fi</div>
              <div class="feature-desc">Stay connected throughout your stay</div>
            </div>
            <div class="feature-card">
              <div class="feature-icon">🚗</div>
              <div class="feature-title">Free Parking</div>
              <div class="feature-desc">Secure parking for all guests</div>
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/booking-process" class="button">
              Make Your First Reservation →
            </a>
          </div>
        </div>
        
        <div class="footer">
          <div class="tagline">Have Fun Under The Sun</div>
          <div class="contact-info">
            <strong>Suva's Place Resort</strong><br>
            Antipolo City, Rizal, Philippines<br>
            📞 +63 976023356<br>
            📧 suvasplaceinc@gmail.com
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: guest.email, subject, html });
};

// Guest Verification Email
export const sendVerificationEmail = async (guest, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  const subject = "Verify Your Email - Suva's Place Resort";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
      <style>
        /* Same styles as welcome email */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .logo img {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .brand-name {
          font-family: 'Dancing Script', cursive;
          font-size: 32px;
          font-weight: bold;
          color: white;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .greeting {
          font-size: 24px;
          color: #78350f;
          margin-bottom: 20px;
        }
        .verification-box {
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border-radius: 16px;
          padding: 30px;
          text-align: center;
          margin: 30px 0;
          border: 2px solid #f59e0b;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          margin: 20px 0;
        }
        .footer {
          background: linear-gradient(135deg, #78350f, #92400e);
          padding: 30px;
          text-align: center;
          color: white;
        }
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap');
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <img src="${process.env.LOGO_URL || "https://suvasplaceresort.com/images/small-logo.png"}" alt="Suva's Place Resort" />
          </div>
          <div class="brand-name">Suva's Place</div>
        </div>
        
        <div class="content">
          <div class="greeting">
            Welcome, <strong>${guest.firstName} ${guest.lastName}</strong>! 🎉
          </div>
          
          <div class="verification-box">
            <div style="font-size: 18px; font-weight: 600; color: #78350f; margin-bottom: 10px;">
              Verify Your Email Address
            </div>
            <a href="${verificationUrl}" class="button">
              Activate My Account →
            </a>
            <div style="margin-top: 20px; font-size: 12px; color: #b45309;">
              This link will expire in 24 hours
            </div>
          </div>
        </div>
        
        <div class="footer">
          <div class="tagline">Have Fun Under The Sun</div>
          <div>📞 +63 976023356 | 📧 suvasplaceinc@gmail.com</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: guest.email, subject, html });
};

// Guest Password Reset Email
export const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const isGuest = !user.role; // Check if it's a guest (no role field)

  const subject = "Reset Your Password - Suva's Place Resort";

  const roleText = isGuest ? "guest account" : "staff account";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .logo img {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .brand-name {
          font-family: 'Dancing Script', cursive;
          font-size: 32px;
          font-weight: bold;
          color: white;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .greeting {
          font-size: 24px;
          color: #78350f;
          margin-bottom: 20px;
        }
        .reset-box {
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border-radius: 16px;
          padding: 30px;
          text-align: center;
          margin: 30px 0;
          border: 2px solid #f59e0b;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          margin: 20px 0;
        }
        .warning-text {
          font-size: 12px;
          color: #92400e;
          margin-top: 15px;
        }
        .footer {
          background: linear-gradient(135deg, #78350f, #92400e);
          padding: 30px;
          text-align: center;
          color: white;
        }
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap');
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <img src="${process.env.LOGO_URL || "https://suvasplaceresort.com/images/small-logo.png"}" alt="Suva's Place Resort" />
          </div>
          <div class="brand-name">Suva's Place</div>
        </div>
        
        <div class="content">
          <div class="greeting">
            Hello, <strong>${user.firstName} ${user.lastName}</strong>
          </div>
          
          <div class="reset-box">
            <div style="font-size: 18px; font-weight: 600; color: #78350f; margin-bottom: 10px;">
              Reset Your Password
            </div>
            <div style="color: #92400e; margin-bottom: 20px;">
              We received a request to reset the password for your ${roleText}.
            </div>
            <a href="${resetUrl}" class="button">
              Reset Password →
            </a>
            <div class="warning-text">
              This link will expire in 1 hour
            </div>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 12px;">
            <p style="color: #92400e; font-size: 14px;">
              <strong>💡 Didn't request this?</strong><br>
              If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
            </p>
          </div>
        </div>
        
        <div class="footer">
          <div class="tagline">Have Fun Under The Sun</div>
          <div>📞 +63 976023356 | 📧 suvasplaceinc@gmail.com</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: user.email, subject, html });
};

/* ==================== STAFF USER EMAIL TEMPLATES ==================== */

// Staff Welcome Email (for new staff accounts)
export const sendStaffWelcomeEmail = async (user, password) => {
  const subject = "Welcome to Suva's Place Resort Staff Portal! 👋";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Staff Portal</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, #1e293b, #0f172a);
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .logo img {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .brand-name {
          font-family: 'Dancing Script', cursive;
          font-size: 32px;
          font-weight: bold;
          color: white;
        }
        .badge {
          display: inline-block;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50px;
          font-size: 12px;
          color: white;
          margin-top: 15px;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .greeting {
          font-size: 24px;
          color: #1e293b;
          margin-bottom: 20px;
        }
        .role-badge {
          display: inline-block;
          padding: 4px 12px;
          background: #f59e0b;
          color: white;
          border-radius: 50px;
          font-size: 12px;
          font-weight: 600;
          margin-left: 10px;
          text-transform: uppercase;
        }
        .credentials-box {
          background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
          border-radius: 16px;
          padding: 25px;
          margin: 25px 0;
          border-left: 4px solid #f59e0b;
        }
        .credential-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #cbd5e1;
        }
        .credential-label {
          font-weight: 600;
          color: #475569;
        }
        .credential-value {
          color: #0f172a;
          font-family: monospace;
          font-size: 14px;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          margin: 20px 0;
        }
        .warning-box {
          background: #fef3c7;
          padding: 15px;
          border-radius: 12px;
          margin-top: 20px;
        }
        .footer {
          background: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
        }
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap');
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <img src="${process.env.LOGO_URL || "https://suvasplaceresort.com/images/small-logo.png"}" alt="Suva's Place Resort" />
          </div>
          <div class="brand-name">Suva's Place</div>
          <div class="badge">Staff Portal</div>
        </div>
        
        <div class="content">
          <div class="greeting">
            Welcome to the Team, <strong>${user.firstName} ${user.lastName}</strong>! 🎉
            <span class="role-badge">${user.role}</span>
          </div>
          
          <p style="color: #475569; margin-bottom: 20px;">
            Your staff account has been created. You can now access the Suva's Place Resort Management System.
          </p>
          
          <div class="credentials-box">
            <h3 style="color: #0f172a; margin-bottom: 15px;">🔐 Your Login Credentials</h3>
            <div class="credential-row">
              <span class="credential-label">Username:</span>
              <span class="credential-value">${user.username}</span>
            </div>
            <div class="credential-row">
              <span class="credential-label">Email:</span>
              <span class="credential-value">${user.email}</span>
            </div>
            <div class="credential-row">
              <span class="credential-label">Temporary Password:</span>
              <span class="credential-value">${password}</span>
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_ADMIN}/" class="button">
              Access Staff Portal →
            </a>
          </div>
          
          <div class="warning-box">
            <p style="color: #92400e; font-size: 14px;">
              <strong>⚠️ Important:</strong><br>
              • Please change your password after your first login<br>
              • Never share your credentials with anyone<br>
              • For security reasons, this email contains your temporary password
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p>Suva's Place Resort Management System</p>
          <p style="font-size: 12px; margin-top: 10px;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: user.email, subject, html });
};

// Staff Password Reset Email (can use same as guest but with different styling)
export const sendStaffPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_ADMIN}/reset-password?token=${resetToken}`;

  const subject = "Reset Your Staff Account Password - Suva's Place Resort";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Staff Password</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, #1e293b, #0f172a);
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .logo img {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .brand-name {
          font-family: 'Dancing Script', cursive;
          font-size: 32px;
          font-weight: bold;
          color: white;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .reset-box {
          background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
          border-radius: 16px;
          padding: 30px;
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          margin: 20px 0;
        }
        .footer {
          background: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
        }
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap');
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <img src="${process.env.LOGO_URL || "https://suvasplaceresort.com/images/small-logo.png"}" alt="Suva's Place Resort" />
          </div>
          <div class="brand-name">Suva's Place</div>
        </div>
        
        <div class="content">
          <h2 style="color: #1e293b;">Reset Staff Password</h2>
          <p style="color: #475569; margin: 20px 0;">
            Hello <strong>${user.firstName} ${user.lastName}</strong>,<br>
            We received a request to reset your staff account password.
          </p>
          
          <div class="reset-box">
            <a href="${resetUrl}" class="button">
              Reset Staff Password →
            </a>
            <p style="margin-top: 15px; font-size: 12px; color: #64748b;">
              This link will expire in 1 hour
            </p>
          </div>
          
          <p style="color: #64748b; font-size: 14px;">
            If you didn't request this, please contact your system administrator immediately.
          </p>
        </div>
        
        <div class="footer">
          <p>Suva's Place Resort - Staff Portal</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: user.email, subject, html });
};

// Staff Account Locked Email
export const sendStaffAccountLockedEmail = async (user, lockoutDuration) => {
  const subject = "Your Staff Account Has Been Locked - Suva's Place Resort";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Locked</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          padding: 40px 30px;
          text-align: center;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          margin: 20px 0;
        }
        .footer {
          background: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: white;">🔒 Account Locked</h1>
        </div>
        
        <div class="content">
          <h2 style="color: #1e293b;">Security Alert</h2>
          <p style="color: #475569; margin: 20px 0;">
            Hello <strong>${user.firstName} ${user.lastName}</strong>,<br><br>
            Your staff account has been locked due to multiple failed login attempts.
          </p>
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 12px; margin: 20px 0;">
            <p style="color: #92400e;">
              <strong>📋 Account Details:</strong><br>
              • Username: ${user.username}<br>
              • Lock Duration: ${lockoutDuration} minutes<br>
              • Please contact an administrator to unlock your account
            </p>
          </div>
          
          <div style="text-align: center;">
            <a href="mailto:suvasplaceinc@gmail.com" class="button">
              Contact Administrator →
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>Suva's Place Resort - Security Notice</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: user.email, subject, html });
};

/* ==================== RESERVATION EMAILS ==================== */

// Reservation Status Email (for guests)
export const sendReservationStatusEmail = async (
  reservation,
  guest,
  oldStatus,
  newStatus,
) => {
  const statusTemplates = {
    pending: {
      subject: `Reservation ${reservation.reservationNumber} - Pending Confirmation`,
      title: "Reservation Received",
      color: "#f59e0b",
      icon: "⏳",
    },
    confirmed: {
      subject: `Reservation ${reservation.reservationNumber} - Confirmed! 🎉`,
      title: "Reservation Confirmed!",
      color: "#10b981",
      icon: "✅",
    },
    cancelled: {
      subject: `Reservation ${reservation.reservationNumber} - Cancelled`,
      title: "Reservation Cancelled",
      color: "#ef4444",
      icon: "❌",
    },
    checked_in: {
      subject: `Reservation ${reservation.reservationNumber} - Checked In`,
      title: "Welcome to Suva's Place!",
      color: "#3b82f6",
      icon: "🏊",
    },
    checked_out: {
      subject: `Reservation ${reservation.reservationNumber} - Checked Out`,
      title: "Thank You for Staying!",
      color: "#8b5cf6",
      icon: "🙏",
    },
  };

  const template = statusTemplates[newStatus] || statusTemplates.pending;

  const checkInDate = new Date(reservation.checkIn).toLocaleDateString(
    "en-PH",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  const checkOutDate = new Date(reservation.checkOut).toLocaleDateString(
    "en-PH",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${template.subject}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, ${template.color}, ${template.color}dd);
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .logo img {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .brand-name {
          font-family: 'Dancing Script', cursive;
          font-size: 32px;
          font-weight: bold;
          color: white;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .reservation-details {
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border-radius: 20px;
          padding: 25px;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, ${template.color}, ${template.color}dd);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
        }
        .footer {
          background: linear-gradient(135deg, #78350f, #92400e);
          padding: 30px;
          text-align: center;
          color: white;
        }
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap');
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <img src="${process.env.LOGO_URL || "https://suvasplaceresort.com/images/small-logo.png"}" alt="Suva's Place Resort" />
          </div>
          <div class="brand-name">Suva's Place</div>
          <div style="font-size: 48px; margin-top: 20px;">${template.icon}</div>
        </div>
        
        <div class="content">
          <h2 style="color: #78350f;">${template.title}</h2>
          <p style="color: #6b4c2c; margin: 20px 0;">
            Dear <strong>${guest.firstName} ${guest.lastName}</strong>,
          </p>
          
          <div class="reservation-details">
            <h3 style="color: #78350f; margin-bottom: 15px;">📋 Reservation Details</h3>
            <p><strong>Reservation Number:</strong> ${reservation.reservationNumber}</p>
            <p><strong>Check-in:</strong> ${checkInDate}</p>
            <p><strong>Check-out:</strong> ${checkOutDate}</p>
            <p><strong>Nights:</strong> ${reservation.nights}</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/bookings" class="button">
              View Reservation →
            </a>
          </div>
        </div>
        
        <div class="footer">
          <div class="tagline">Have Fun Under The Sun</div>
          <div>📞 +63 976023356 | 📧 suvasplaceinc@gmail.com</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: guest.email, subject: template.subject, html });
};

// Export all email functions
export default {
  sendEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStaffWelcomeEmail,
  sendStaffPasswordResetEmail,
  sendStaffAccountLockedEmail,
  sendReservationStatusEmail,
  verifyEmailConnection,
};
