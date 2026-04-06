import mongoose from "mongoose";

const { Schema } = mongoose;

const operationLogSchema = new Schema(
  {
    unitType: {
      type: String,
      enum: ["room", "cottage"],
      required: true,
      index: true,
    },
    unitId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["cleaning", "maintenance", "check_in", "check_out"],
      required: true,
      index: true,
    },
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
      index: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

operationLogSchema.index({ createdAt: -1 });
operationLogSchema.index({ unitType: 1, action: 1, createdAt: -1 });

const OperationLog = mongoose.model("OperationLog", operationLogSchema);

export default OperationLog;
