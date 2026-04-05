import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { legacyReceptionistPermissions } from "../config/receptionistPermissions.js";
dotenv.config();

export const generateToken = (user) => {
  let receptionistPermissions = null;
  if (user.role === "receptionist") {
    if (user.receptionistPermissions) {
      receptionistPermissions =
        typeof user.receptionistPermissions.toObject === "function"
          ? user.receptionistPermissions.toObject()
          : { ...user.receptionistPermissions };
    } else {
      receptionistPermissions = legacyReceptionistPermissions();
    }
  }

  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      email: user.email,
      receptionistPermissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};
