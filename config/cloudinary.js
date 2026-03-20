import dotenv from "dotenv";
dotenv.config(); // ensure env variables are loaded before using them

import { v2 as cloudinary } from "cloudinary";

console.log("Cloudinary API Key:", process.env.CLOUDINARY_API_KEY); // should now print correctly
console.log("Cloudinary Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
