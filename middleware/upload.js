import multer from "multer";

// Use memory storage so files are available as buffers
const storage = multer.memoryStorage();

export const upload = multer({ storage });
