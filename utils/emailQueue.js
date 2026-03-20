// utils/emailQueue.js
import { sendReservationStatusEmail } from "../config/email.js";

class EmailQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  add(emailData) {
    this.queue.push(emailData);
    this.process();
  }

  async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const emailData = this.queue.shift();
      try {
        await sendReservationStatusEmail(
          emailData.reservation,
          emailData.guest,
          emailData.oldStatus,
          emailData.newStatus,
        );
        console.log(
          `✅ Email sent for reservation ${emailData.reservation.reservationNumber}`,
        );
      } catch (error) {
        console.error(`❌ Failed to send email: ${error.message}`);
        // Re-queue failed emails (optional)
        if (emailData.retryCount < 3) {
          this.queue.push({
            ...emailData,
            retryCount: (emailData.retryCount || 0) + 1,
          });
        }
      }
    }

    this.isProcessing = false;
  }
}

export const emailQueue = new EmailQueue();
