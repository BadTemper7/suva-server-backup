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

  // If no token, continue as unauthenticated guest
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("ℹ️ Guest: No token found, continuing as unauthenticated");
    req.guest = null;
    return next();
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
      console.log(
        "⚠️ Invalid role for guest route, continuing as unauthenticated",
      );
      req.guest = null;
      return next();
    }

    // Set req.guest (not req.user) for guest
    req.guest = {
      id: decoded.id,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      role: decoded.role,
    };

    console.log("req.guest set:", req.guest);

    // Verify guest exists and is active
    const guest = await Guest.findById(decoded.id);
    if (!guest) {
      console.log(
        "⚠️ Guest not found in database, continuing as unauthenticated",
      );
      req.guest = null;
      return next();
    }

    if (guest.status !== "active") {
      console.log(
        "⚠️ Guest account is inactive, continuing as unauthenticated",
      );
      req.guest = null;
      return next();
    }

    console.log("✅ Guest verified, proceeding with authentication");
    next();
  } catch (err) {
    console.error("❌ Guest JWT verification failed:", err.message);
    // Don't block the request, just treat as unauthenticated
    req.guest = null;
    next();
  }
};

// Optional: Require guest authentication for certain routes
export const requireGuestAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "guest") {
      return res.status(403).json({
        success: false,
        message: "Access forbidden: Guest access only.",
      });
    }

    req.guest = {
      id: decoded.id,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      role: "guest",
    };

    // Verify guest exists and is active
    const guest = await Guest.findById(decoded.id);
    if (!guest || guest.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive account.",
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token. Please log in again.",
    });
  }
};
