// config/email.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create transporter
const createTransporter = () => {
  if (process.env.EMAIL_SERVICE === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

const transporter = createTransporter();

// Verify connection
export const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log("✅ Email service is ready to send emails");
    return true;
  } catch (error) {
    console.error("❌ Email service connection failed:", error.message);
    return false;
  }
};

// Send email function
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const mailOptions = {
      from: `"Suva's Place Resort" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    return { success: false, error: error.message };
  }
};

// Reservation Status Email Templates
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
          background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .header {
          background: linear-gradient(135deg, #1e3a8a, #7c3aed);
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
          background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
          animation: shimmer 10s infinite;
        }
        @keyframes shimmer {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20%, 20%); }
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
          font-size: 40px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .status-badge {
          display: inline-block;
          padding: 8px 20px;
          background: ${template.color};
          color: white;
          border-radius: 50px;
          font-size: 14px;
          font-weight: 600;
          margin-top: 15px;
        }
        .content {
          padding: 40px 30px;
          background: white;
        }
        .reservation-details {
          background: #f9fafb;
          border-radius: 16px;
          padding: 20px;
          margin: 25px 0;
          border-left: 4px solid ${template.color};
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #374151;
        }
        .detail-value {
          color: #111827;
          font-weight: 500;
        }
        .button {
          display: inline-block;
          padding: 14px 32px;
          background: linear-gradient(135deg, ${template.color}, ${template.color}dd);
          color: white;
          text-decoration: none;
          border-radius: 50px;
          font-weight: 600;
          margin: 20px 0;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
        }
        .footer {
          background: #f9fafb;
          padding: 30px;
          text-align: center;
          border-top: 1px solid #e5e7eb;
        }
        .social-links {
          margin: 20px 0;
        }
        .social-links a {
          color: #6b7280;
          text-decoration: none;
          margin: 0 10px;
          font-size: 20px;
        }
        .footer-text {
          color: #6b7280;
          font-size: 12px;
          line-height: 1.5;
        }
        @media (max-width: 600px) {
          .content {
            padding: 30px 20px;
          }
          .detail-row {
            flex-direction: column;
            gap: 5px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🌴</div>
          <h1 style="color: white; margin-bottom: 10px; font-size: 28px;">Suva's Place Resort</h1>
          <div class="status-badge">
            ${template.icon} ${template.action}
          </div>
        </div>
        
        <div class="content">
          <h2 style="color: #111827; font-size: 24px; margin-bottom: 10px;">${template.title}</h2>
          <p style="color: #4b5563; margin-bottom: 20px;">${template.subtitle}</p>
          
          <p style="color: #374151; margin-bottom: 20px;">Dear <strong>${guest.firstName} ${guest.lastName}</strong>,</p>
          
          <p style="color: #4b5563; margin-bottom: 25px;">${template.message}</p>
          
          <div class="reservation-details">
            <h3 style="color: #111827; margin-bottom: 15px; font-size: 18px;">📋 Reservation Details</h3>
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
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/bookings" class="button">
              ${template.buttonText} →
            </a>
          </div>
          
          <div style="margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 12px; border-left: 4px solid #f59e0b;">
            <p style="color: #92400e; font-size: 14px; margin: 0;">
              <strong>💡 Need Assistance?</strong><br>
              If you have any questions or need to modify your reservation, please contact us at (02) 8123 4567 or reply to this email.
            </p>
          </div>
        </div>
        
        <div class="footer">
          <div class="social-links">
            <a href="#">📘</a>
            <a href="#">📷</a>
            <a href="#">🐦</a>
          </div>
          <p class="footer-text">
            <strong>Suva's Place Resort</strong><br>
            Antipolo City, Rizal, Philippines<br>
            📞 (02) 8123 4567 | 📧 info@suvasplace.com<br>
            © ${new Date().getFullYear()} Suva's Place Resort. All rights reserved.
          </p>
          <p class="footer-text" style="margin-top: 15px;">
            This is an automated message. Please do not reply directly to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: guest.email, subject: template.subject, html });
};
