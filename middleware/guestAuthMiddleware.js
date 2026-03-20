// src/middleware/guestAuthMiddleware.js
import jwt from "jsonwebtoken";
import Guest from "../models/Guest.js";

export const checkGuestAccountLock = async (req, res, next) => {
  try {
    const guest = await Guest.findById(req.user.id);

    if (guest && guest.isLocked && guest.isLocked()) {
      const remainingTime = Math.ceil((guest.lockUntil - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        message: `Your account has been locked due to multiple failed login attempts. Please try again in ${remainingTime} minutes or contact support.`,
        lockUntil: guest.lockUntil,
      });
    }

    next();
  } catch (error) {
    console.error("checkGuestAccountLock error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const protectGuest = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Guest: No Bearer token found");
    return res.status(401).json({
      success: false,
      message: "Access denied. Please log in to continue.",
    });
  }

  const token = authHeader.split(" ")[1];
  console.log("Guest token extracted, length:", token.length);

  try {
    // Decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Guest token decoded:", {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    });

    // Verify role is guest
    if (decoded.role !== "guest") {
      console.log("❌ Invalid role for guest route");
      return res.status(403).json({
        success: false,
        message: "Access forbidden: Invalid user type",
      });
    }

    // Set req.user for guest
    req.user = {
      id: decoded.id,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      role: decoded.role,
    };

    console.log("req.user set for guest:", req.user);

    // Verify guest exists and is active
    const guest = await Guest.findById(decoded.id);
    if (!guest) {
      console.log("❌ Guest not found in database");
      return res.status(401).json({
        success: false,
        message: "Guest account not found",
      });
    }

    if (guest.status !== "active") {
      console.log("❌ Guest account is inactive");
      return res.status(401).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }

    console.log("✅ Guest verified, proceeding...");
    next();
  } catch (err) {
    console.error("❌ Guest JWT verification failed:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please log in again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed. Please log in.",
    });
  }
};

// Optional: Verify email middleware
export const requireEmailVerification = async (req, res, next) => {
  try {
    const guest = await Guest.findById(req.user.id);

    if (!guest.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email address before continuing",
        requireVerification: true,
      });
    }

    next();
  } catch (error) {
    console.error("Email verification check error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
