// controllers/messageController.js
import Message from "../models/Message.js";
import { createNotification } from "../models/Notification.js";
import { sendEmail } from "../utils/emailService.js";

/* -------------------- CREATE MESSAGE (PUBLIC) -------------------- */
export const createMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: "Subject is required" });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Check if there's an authenticated guest
    const guestId = req.guest?.id || null;
    let finalEmail = email.trim().toLowerCase();
    let finalName = name.trim();

    // If guest is authenticated, use their registered info for consistency
    if (guestId && req.guest) {
      finalEmail = req.guest.email;
      finalName = `${req.guest.firstName} ${req.guest.lastName}`.trim();

      console.log(`✅ Authenticated guest ${guestId} sending message:`, {
        name: finalName,
        email: finalEmail,
        subject,
      });
    } else {
      console.log(`📧 Unauthenticated guest sending message:`, {
        name: finalName,
        email: finalEmail,
        subject,
      });
    }

    // Create message with guest ID if authenticated
    const newMessage = await Message.create({
      name: finalName,
      email: finalEmail,
      subject: subject.trim(),
      message: message.trim(),
      guestId: guestId, // This will be null if not authenticated, or ObjectId if authenticated
      ipAddress:
        req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    console.log(`✅ Message created with guestId: ${guestId}`);

    // Create notification for admin
    await createNotification({
      actorUserId: guestId,
      type: "message",
      title: "New Message Received",
      description: `New message from ${finalName} (${finalEmail}): ${subject}`,
      source: "Contact",
      entity: { kind: "Message", id: newMessage._id },
      priority: "high",
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully! We'll get back to you soon.",
      data: newMessage,
    });
  } catch (error) {
    console.error("Error creating message:", error);
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET ALL MESSAGES (ADMIN) -------------------- */
export const getMessages = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .sort({ status: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("reply.repliedBy", "name email username"),
      Message.countDocuments(filter),
    ]);

    return res.json({
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET MESSAGE BY ID (ADMIN) -------------------- */
export const getMessageById = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id).populate(
      "reply.repliedBy",
      "name email username role",
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Mark as read if it was unread
    if (message.status === "unread") {
      message.status = "read";
      await message.save();
    }

    return res.json(message);
  } catch (error) {
    console.error("Error fetching message:", error);
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- REPLY TO MESSAGE (ADMIN) -------------------- */
export const replyToMessage = async (req, res) => {
  try {
    const { replyMessage } = req.body;
    const { id } = req.params;

    if (!replyMessage || !replyMessage.trim()) {
      return res.status(400).json({ message: "Reply message is required" });
    }

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Update message with reply
    message.reply = {
      message: replyMessage.trim(),
      repliedBy: req.user.id, // Using req.user.id from your auth middleware
      repliedAt: new Date(),
    };
    message.status = "replied";
    message.repliedAt = new Date();
    await message.save();

    // Send email reply
    const emailSent = await sendEmail({
      to: message.email,
      subject: `Re: ${message.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Reply to Your Message</h2>
          <p>Hello ${message.name},</p>
          <p>Thank you for reaching out to us. Here's our response:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #3b82f6; margin: 15px 0;">
            <p style="margin: 0; white-space: pre-wrap;">${replyMessage}</p>
          </div>
          <p>Your original message:</p>
          <div style="background-color: #f9f9f9; padding: 15px; margin: 10px 0;">
            <p><strong>Subject:</strong> ${message.subject}</p>
            <p><strong>Message:</strong> ${message.message}</p>
          </div>
          <p style="margin-top: 20px;">Best regards,<br />Suva's Place Resort Team</p>
          <hr style="margin: 20px 0;" />
          <p style="font-size: 12px; color: #666;">
            This is an automated reply. Please do not reply directly to this email.
          </p>
        </div>
      `,
    });

    // Populate the repliedBy field before sending response
    const populatedMessage = await Message.findById(id).populate(
      "reply.repliedBy",
      "name email username",
    );

    // Create notification
    await createNotification({
      actorUserId: req.user.id,
      type: "message",
      title: "Message Replied",
      description: `Replied to message from ${message.name} (${message.email})`,
      source: "Admin",
      entity: { kind: "Message", id: message._id },
    });

    return res.json({
      success: true,
      message: emailSent.success
        ? "Reply sent successfully and email delivered"
        : "Reply saved but email delivery failed",
      data: populatedMessage,
      emailSent,
    });
  } catch (error) {
    console.error("Error replying to message:", error);
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- UPDATE MESSAGE STATUS (ADMIN) -------------------- */
export const updateMessageStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!["unread", "read", "replied"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const message = await Message.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true },
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    return res.json({
      success: true,
      message: "Status updated successfully",
      data: message,
    });
  } catch (error) {
    console.error("Error updating status:", error);
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- DELETE MESSAGE (ADMIN) -------------------- */
export const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    await createNotification({
      actorUserId: req.user.id,
      type: "message",
      title: "Message Deleted",
      description: `Deleted message from ${message.name} (${message.email})`,
      source: "Admin",
      entity: { kind: "Message", id: message._id },
    });

    return res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting message:", error);
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- DELETE MULTIPLE MESSAGES (ADMIN) -------------------- */
export const deleteMultipleMessages = async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: "messageIds array is required" });
    }

    const messagesToDelete = await Message.find({
      _id: { $in: messageIds },
    }).select("name email");

    const result = await Message.deleteMany({ _id: { $in: messageIds } });

    await createNotification({
      actorUserId: req.user.id,
      type: "message",
      title: "Messages Deleted",
      description: `Deleted ${result.deletedCount} message(s) by ${req.user.username || req.user.email}`,
      source: "Admin",
      entity: { kind: "Message", id: null },
    });

    return res.json({
      success: true,
      message: `Deleted ${result.deletedCount} message(s) successfully`,
      deletedCount: result.deletedCount,
      deletedMessages: messagesToDelete.map((m) => ({
        name: m.name,
        email: m.email,
      })),
    });
  } catch (error) {
    console.error("Error deleting multiple messages:", error);
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET MESSAGE STATS (ADMIN) -------------------- */
export const getMessageStats = async (req, res) => {
  try {
    const [total, unread, read, replied, today, thisWeek] = await Promise.all([
      Message.countDocuments(),
      Message.countDocuments({ status: "unread" }),
      Message.countDocuments({ status: "read" }),
      Message.countDocuments({ status: "replied" }),
      Message.countDocuments({
        createdAt: {
          $gte: new Date().setHours(0, 0, 0, 0),
          $lte: new Date().setHours(23, 59, 59, 999),
        },
      }),
      Message.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setDate(new Date().getDate() - 7)),
        },
      }),
    ]);

    // Get recent activity (last 5 messages)
    const recentMessages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name email subject status createdAt");

    return res.json({
      total,
      unread,
      read,
      replied,
      today,
      thisWeek,
      recentMessages,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ message: error.message });
  }
};
