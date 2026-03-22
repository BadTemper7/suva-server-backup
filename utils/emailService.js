// utils/emailService.js
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: `"Suva's Place Resort" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      text: text || "",
      html: html || "",
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email sending failed:", error);
    return { success: false, error: error.message };
  }
};
