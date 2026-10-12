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
        // sendReservationStatusEmail resolves to {success:false, error}
        // on an SMTP failure instead of throwing - checking .success is
        // required, otherwise every send looks "sent" even when the mail
        // server rejected it outright (e.g. bad auth) and nothing retries.
        const result = await sendReservationStatusEmail(
          emailData.reservation,
          emailData.guest,
          emailData.oldStatus,
          emailData.newStatus,
        );
        if (!result?.success) {
          throw new Error(result?.error || "Email send returned failure");
        }
        console.log(
          `✅ Email sent for reservation ${emailData.reservation.reservationNumber}`,
        );
      } catch (error) {
        console.error(`❌ Failed to send email: ${error.message}`);
        // Re-queue failed emails (optional)
        if ((emailData.retryCount || 0) < 3) {
          this.queue.push({
            ...emailData,
            retryCount: (emailData.retryCount || 0) + 1,
          });
        } else {
          console.error(
            `❌ Giving up on email for reservation ${emailData.reservation?.reservationNumber} after 3 retries`,
          );
        }
      }
    }

    this.isProcessing = false;
  }
}

export const emailQueue = new EmailQueue();
