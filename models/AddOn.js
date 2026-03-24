// models/AddOn.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const addOnSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 80,
    },
    rate: { type: Number, required: true, min: 0 }, // price per unit
    stock: { type: Number, required: true, min: 0 }, // available quantity
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    category: {
      type: String,
      enum: ["food", "beverage", "equipment", "service", "other"],
      default: "other",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

const AddOn = mongoose.model("AddOn", addOnSchema);
export default AddOn;
