// import cloudinary from "../config/cloudinary.js";
// import fs from "fs";

// /**
//  * Upload multiple files to Cloudinary
//  * @param {Array} files - array of file objects (from multer)
//  * @param {String} folder - Cloudinary folder to save images
//  * @returns {Promise<Array<{ url: string, publicId: string }>>}
//  */
// export const uploadImagesToCloudinary = async (
//   files = [],
//   folder = "hotel/rooms"
// ) => {
//   const uploaded = [];

//   for (const file of files) {
//     try {
//       const result = await cloudinary.uploader.upload(file.path, {
//         folder,
//         resource_type: "image",
//       });

//       uploaded.push({
//         url: result.secure_url,
//         publicId: result.public_id,
//       });

//       // Remove local file after upload
//       fs.unlink(file.path, (err) => {
//         if (err) console.error("Failed to delete temp file:", err);
//       });
//     } catch (err) {
//       console.error("Cloudinary upload error:", err);
//       throw new Error("Failed to upload image to Cloudinary");
//     }
//   }

//   return uploaded;
// };

// /**
//  * Delete a single image from Cloudinary by publicId
//  * @param {string} publicId
//  * @returns {Promise<void>}
//  */
// export const deleteImageFromCloudinary = async (publicId) => {
//   if (!publicId) return;
//   try {
//     await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
//   } catch (err) {
//     console.error("Cloudinary delete error:", err);
//   }
// };
// config/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // always use https
});

/**
 * Upload a buffer to Cloudinary using upload_stream
 * @param {Buffer} buffer - The file buffer
 * @param {String} folder - Folder in Cloudinary to upload to
 * @returns {Promise} - Resolves with Cloudinary result
 */
export const uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary by publicId
 * @param {String} publicId
 */
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw error;
  }
};

export default cloudinary;
