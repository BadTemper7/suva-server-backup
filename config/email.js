// config/email.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import tls from "tls";

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
    secure: secure, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      // For port 465 with SSL, we don't need to reject unauthorized
      rejectUnauthorized: false,
      // Force TLS for port 465
      ciphers: "SSLv3",
    },
    // Increase timeout for slower connections
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  };

  // Additional configuration for port 587
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

    // Provide helpful suggestions
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
      // Add tracking headers
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

// config/email.js - Updated Reservation Status Email Template

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
      subtitle: "Your reservation is pending confirmation",
      color: "#f59e0b",
      bgGradient: "linear-gradient(135deg, #f59e0b, #d97706)",
      icon: "⏳",
      message: `We have received your reservation request for ${reservation.nights} night(s). Our team will review your booking and send confirmation shortly.`,
      action: "Awaiting Confirmation",
      buttonText: "View Reservation",
    },
    confirmed: {
      subject: `Reservation ${reservation.reservationNumber} - Confirmed! 🎉`,
      title: "Reservation Confirmed!",
      subtitle: "Your stay at Suva's Place is confirmed",
      color: "#10b981",
      bgGradient: "linear-gradient(135deg, #10b981, #059669)",
      icon: "✅",
      message: `Great news! Your reservation for ${reservation.nights} night(s) has been confirmed. We're looking forward to welcoming you to Suva's Place Resort.`,
      action: "Confirmed",
      buttonText: "View Details",
    },
    cancelled: {
      subject: `Reservation ${reservation.reservationNumber} - Cancelled`,
      title: "Reservation Cancelled",
      subtitle: "Your reservation has been cancelled",
      color: "#ef4444",
      bgGradient: "linear-gradient(135deg, #ef4444, #dc2626)",
      icon: "❌",
      message: `Your reservation for ${reservation.nights} night(s) has been cancelled. If you did not request this cancellation, please contact us immediately.`,
      action: "Cancelled",
      buttonText: "View Details",
    },
    checked_in: {
      subject: `Reservation ${reservation.reservationNumber} - Checked In`,
      title: "Welcome to Suva's Place!",
      subtitle: "You have successfully checked in",
      color: "#3b82f6",
      bgGradient: "linear-gradient(135deg, #3b82f6, #2563eb)",
      icon: "🏊",
      message: `Welcome to Suva's Place Resort! You have successfully checked in for your ${reservation.nights} night(s) stay. We hope you enjoy your stay!`,
      action: "Checked In",
      buttonText: "View Stay Details",
    },
    checked_out: {
      subject: `Reservation ${reservation.reservationNumber} - Checked Out`,
      title: "Thank You for Staying!",
      subtitle: "You have successfully checked out",
      color: "#8b5cf6",
      bgGradient: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
      icon: "🙏",
      message: `Thank you for choosing Suva's Place Resort! We hope you had a wonderful stay. We look forward to welcoming you again soon.`,
      action: "Checked Out",
      buttonText: "Leave a Review",
    },
    expired: {
      subject: `Reservation ${reservation.reservationNumber} - Expired`,
      title: "Reservation Expired",
      subtitle: "Your reservation has expired",
      color: "#6b7280",
      bgGradient: "linear-gradient(135deg, #6b7280, #4b5563)",
      icon: "⏰",
      message: `Your reservation for ${reservation.nights} night(s) has expired. If you still wish to book, please make a new reservation.`,
      action: "Expired",
      buttonText: "Book Again",
    },
    no_show: {
      subject: `Reservation ${reservation.reservationNumber} - No Show`,
      title: "Missed Reservation",
      subtitle: "You did not check in for your reservation",
      color: "#dc2626",
      bgGradient: "linear-gradient(135deg, #dc2626, #b91c1c)",
      icon: "🚫",
      message: `We noticed you didn't check in for your reservation. If you have any questions or need assistance, please contact us.`,
      action: "No Show",
      buttonText: "Contact Us",
    },
  };

  const template = statusTemplates[newStatus] || statusTemplates.pending;

  // Calculate dates
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
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
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
        
        /* Header with brand colors */
        .header {
          background: ${template.bgGradient};
          padding: 40px 30px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        
        /* Decorative sun rays effect */
        .header::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,215,0,0.15) 0%, transparent 70%);
          animation: shimmer 10s infinite;
        }
        
        @keyframes shimmer {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20%, 20%); }
        }
        
        /* Logo styling matching the React component */
        .logo-container {
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
          position: relative;
          transition: transform 0.3s ease;
        }
        
        .logo img {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        
        /* Sun burst effect */
        .logo::before {
          content: '';
          position: absolute;
          inset: -8px;
          background: radial-gradient(circle, rgba(255,215,0,0.3), transparent);
          border-radius: 50%;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .logo:hover::before {
          opacity: 1;
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
        }
        
        .status-badge {
          display: inline-block;
          padding: 8px 24px;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          color: white;
          border-radius: 50px;
          font-size: 14px;
          font-weight: 600;
          margin-top: 20px;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .content {
          padding: 40px 30px;
          background: white;
        }
        
        .greeting {
          font-size: 18px;
          color: #78350f;
          margin-bottom: 20px;
        }
        
        .greeting strong {
          color: #b45309;
        }
        
        .message-text {
          color: #6b4c2c;
          margin-bottom: 30px;
          line-height: 1.8;
        }
        
        /* Reservation card matching brand style */
        .reservation-details {
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border-radius: 20px;
          padding: 25px;
          margin: 30px 0;
          border-left: 4px solid ${template.color};
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        .reservation-details h3 {
          color: #78350f;
          font-size: 18px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid rgba(180, 83, 9, 0.1);
        }
        
        .detail-row:last-child {
          border-bottom: none;
        }
        
        .detail-label {
          font-weight: 600;
          color: #b45309;
        }
        
        .detail-value {
          color: #78350f;
          font-weight: 500;
        }
        
        /* Button matching the "Have Fun Under The Sun" theme */
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: ${template.bgGradient};
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
        
        /* Help section with brand colors */
        .help-section {
          margin-top: 30px;
          padding: 20px;
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border-radius: 16px;
          border-left: 4px solid #f59e0b;
        }
        
        .help-section p {
          color: #92400e;
          font-size: 14px;
          margin: 0;
        }
        
        .help-section strong {
          color: #b45309;
        }
        
        /* Footer with brand elements */
        .footer {
          background: linear-gradient(135deg, #78350f, #92400e);
          padding: 30px;
          text-align: center;
          color: white;
        }
        
        .tagline {
          font-family: 'Dancing Script', cursive;
          font-size: 18px;
          font-weight: medium;
          color: #fde68a;
          margin-bottom: 20px;
        }
        
        .established {
          font-family: 'Times New Roman', serif;
          font-size: 12px;
          letter-spacing: 2px;
          color: #fcd34d;
          margin: 10px 0;
        }
        
        .divider {
          width: 60px;
          height: 2px;
          background: linear-gradient(90deg, transparent, #f59e0b, transparent);
          margin: 20px auto;
        }
        
        .contact-info {
          font-size: 12px;
          line-height: 1.8;
          color: #fed7aa;
          margin-top: 20px;
        }
        
        .footer-text {
          font-size: 11px;
          color: #fed7aa;
          margin-top: 20px;
          opacity: 0.8;
        }
        
        @media (max-width: 600px) {
          .content {
            padding: 30px 20px;
          }
          
          .detail-row {
            flex-direction: column;
            gap: 5px;
          }
          
          .brand-name {
            font-size: 24px;
          }
          
          .logo {
            width: 60px;
            height: 60px;
          }
          
          .logo img {
            width: 45px;
            height: 45px;
          }
        }
        
        /* Import Dancing Script font */
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap');
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header with brand styling -->
        <div class="header">
          <div class="logo-container">
            <div class="logo">
              <!-- Using the same small-logo concept from your React component -->
              <img src="${process.env.FRONTEND_URL}/images/small-logo.png" alt="Suva's Place Resort" />
            </div>
          </div>
          
          <div class="brand-name">Suva's Place</div>
          <div class="brand-subtitle">Resort Antipolo</div>
          
          <div class="status-badge">
            ${template.icon} ${template.action}
          </div>
        </div>
        
        <!-- Main Content -->
        <div class="content">
          <div class="greeting">
            Dear <strong>${guest.firstName} ${guest.lastName}</strong>,
          </div>
          
          <div class="message-text">
            ${template.message}
          </div>
          
          <!-- Reservation Details Card -->
          <div class="reservation-details">
            <h3>
              <span>📋</span> Reservation Details
            </h3>
            <div class="detail-row">
              <span class="detail-label">Reservation Number:</span>
              <span class="detail-value">${reservation.reservationNumber}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Check-in Date:</span>
              <span class="detail-value">${checkInDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Check-out Date:</span>
              <span class="detail-value">${checkOutDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Number of Nights:</span>
              <span class="detail-value">${reservation.nights} night(s)</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Guests:</span>
              <span class="detail-value">${reservation.adults} Adults, ${reservation.children} Children</span>
            </div>
          </div>
          
          <!-- Call to Action Button -->
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/bookings" class="button">
              ${template.buttonText} →
            </a>
          </div>
          
          <!-- Help Section -->
          <div class="help-section">
            <p>
              <strong>💡 Have Fun Under The Sun!</strong><br>
              Need assistance with your reservation? Contact us at (02) 8123 4567 or reply to this email.
            </p>
          </div>
        </div>
        
        <!-- Footer with brand elements -->
        <div class="footer">
          <div class="tagline">Have Fun Under The Sun</div>
          <div class="established">Est. 1971</div>
          <div class="divider"></div>
          
          <div class="contact-info">
            <strong>Suva's Place Resort</strong><br>
            Antipolo City, Rizal, Philippines<br>
            📞 (02) 8123 4567<br>
            📧 info@suvasplace.com<br>
            🌐 www.suvasplace.com
          </div>
          
          <div class="footer-text">
            This is an automated message from Suva's Place Resort.<br>
            Please do not reply directly to this email.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: guest.email, subject: template.subject, html });
};
