import mongoose from "mongoose";

const { Schema } = mongoose;

const amenitySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true, // This creates a unique index automatically
      maxlength: 80,
    },
    rate: { type: Number, required: true, min: 0 }, // price per unit
    stock: { type: Number, required: true, min: 0 }, // available qty, e.g. 50
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

// Remove this line since 'unique: true' already creates the index
// amenitySchema.index({ name: 1 }, { unique: true });

const Amenity = mongoose.model("Amenity", amenitySchema);
export default Amenity;
