// node generateSecret.js
import crypto from "crypto";

const secret = crypto.randomBytes(64).toString("hex"); // 64 bytes -> 128 hex characters
console.log(secret);
