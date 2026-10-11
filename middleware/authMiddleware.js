import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export const checkAccountLock = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (user && user.isLocked()) {
      return res.status(403).json({
        message:
          "Your account has been locked due to suspicious activity. Please contact an administrator.",
      });
    }

    next();
  } catch (error) {
    console.error("checkAccountLock error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ No Bearer token found");
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  console.log("Token extracted, length:", token.length);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token decoded:", {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    });

    const user = await User.findById(decoded.id);
    if (!user) {
      console.log("❌ User not found in database");
      return res.status(401).json({ message: "User not found" });
    }

    if (user.status !== "active") {
      console.log("❌ User is inactive");
      return res.status(401).json({ message: "User account is inactive" });
    }

    req.user = {
      id: decoded.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    console.log("✅ User verified, proceeding...");
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }

    return res.status(401).json({ message: "Authentication failed" });
  }
};

// Non-blocking: populates req.user when a valid staff Bearer token is present,
// otherwise leaves req.user null and continues (for public routes that show
// more to staff than to guests, e.g. room visibility — see WT-03).
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.status !== "active") {
      req.user = null;
      return next();
    }

    req.user = {
      id: decoded.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  } catch {
    req.user = null;
  }

  next();
};

export const adminOnly = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Access forbidden: Admins only" });
  }
  next();
};

export const receptionistOrAdmin = (req, res, next) => {
  if (!["admin", "receptionist", "superadmin"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Access forbidden" });
  }
  next();
};
