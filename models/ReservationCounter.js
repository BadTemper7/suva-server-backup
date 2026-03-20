// models/ReservationCounter.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const reservationCounterSchema = new Schema(
  {
    year: { type: Number, required: true, unique: true },
    counter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ReservationCounter = mongoose.model(
  "ReservationCounter",
  reservationCounterSchema
);
export default ReservationCounter;
