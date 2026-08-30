// controllers/reservationRoomController.js
import ReservationModels from "../models/Reservation.js";
import Room from "../models/Room.js";
import AddOn from "../models/AddOn.js";
import mongoose from "mongoose";
import Billing from "../models/Billing.js";
import OperationLog from "../models/OperationLog.js";
import {
  getRoomStayCharge,
  roomOffersHourlyPackage,
} from "../utils/stayPricing.js";

const { Reservation, ReservationRoom } = ReservationModels;

// Helper function to validate rooms exist
async function validateRoomsExist(roomIds) {
  const rooms = await Room.find({ _id: { $in: roomIds } });
  if (rooms.length !== roomIds.length) {
    const missingRooms = roomIds.filter(
      (roomId) => !rooms.some((room) => room._id.toString() === roomId),
    );
    return { valid: false, missingRooms };
  }
  return { valid: true };
}

// Helper function to validate add-ons stock
async function validateAddOnStock(
  reservation,
  addOns,
  excludeReservationRoomId = null,
) {
  const { checkIn, checkOut } = reservation;

  for (const item of addOns) {
    const { addOnId, quantity } = item;
    const addOn = await AddOn.findById(addOnId);
    if (!addOn) throw new Error(`Add-on not found: ${addOnId}`);
    if (addOn.status !== "active")
      throw new Error(`Add-on is not active: ${addOn.name}`);

    // Calculate reserved stock during this reservation period
    const matchStage = {
      "addOns.addOnId": new mongoose.Types.ObjectId(addOnId),
    };

    // Exclude current reservation room if provided
    if (excludeReservationRoomId) {
      matchStage._id = {
        $ne: new mongoose.Types.ObjectId(excludeReservationRoomId),
      };
    }

    const reservedCountAgg = await ReservationRoom.aggregate([
      { $unwind: "$addOns" },
      { $match: matchStage },
      {
        $lookup: {
          from: "reservations",
          localField: "reservationId",
          foreignField: "_id",
          as: "reservation",
        },
      },
      { $unwind: "$reservation" },
      {
        $match: {
          "reservation.checkIn": { $lt: new Date(checkOut) },
          "reservation.checkOut": { $gt: new Date(checkIn) },
          "reservation.status": { $nin: ["cancelled", "expired"] }, // Exclude cancelled/expired reservations
        },
      },
      { $group: { _id: null, totalReserved: { $sum: "$addOns.quantity" } } },
    ]);

    const totalReserved = reservedCountAgg[0]?.totalReserved || 0;
    const availableStock = addOn.stock - totalReserved;

    if (quantity > availableStock) {
      throw new Error(
        `Add-on '${addOn.name}' does not have enough stock. Requested: ${quantity}, Available: ${availableStock}`,
      );
    }
  }
}

// Helper function to calculate discount
async function calculateDiscount(reservation) {
  // Implementation depends on your discount logic
  return 0;
}

// Helper function to generate billing
const generateBillingForUpdatedReservation = async (reservationId) => {
  try {
    // Fetch the reservation
    const reservation = await Reservation.findById(reservationId).populate(
      "paymentOption",
    );
    if (!reservation) return;

    // Fetch all the reservation rooms and their add-ons
    const reservationRooms = await ReservationRoom.find({
      reservationId,
    })
      .populate("roomId")
      .populate("addOns.addOnId");

    // Calculate subtotal for all rooms and add-ons
    let subTotal = 0;
    reservationRooms.forEach((resRoom) => {
      subTotal += getRoomStayCharge(resRoom.roomId, reservation);

      if (resRoom.addOns && resRoom.addOns.length > 0) {
        resRoom.addOns.forEach((addOn) => {
          const addOnRate = addOn.addOnId?.rate || 0;
          subTotal += addOnRate * addOn.quantity;
        });
      }
    });

    // Compute discount based on any confirmed discount images
    let discountAmount = await calculateDiscount(reservation);

    // Final total amount after discount
    const totalAmount = subTotal - discountAmount;

    // Recalculate amountDueNow based on the payment option (partial/full)
    let amountDueNow = totalAmount;
    if (reservation.paymentOption) {
      if (
        reservation.paymentOption.paymentType === "partial" &&
        reservation.paymentOption.amount
      ) {
        amountDueNow = totalAmount * (reservation.paymentOption.amount / 100);
      }
    }

    // Find the existing billing or create a new one
    let billing = await Billing.findOne({ reservationId });
    if (!billing) {
      billing = new Billing({
        reservationId,
        subTotal,
        discountAmount,
        totalAmount,
        amountDueNow,
      });
    } else {
      billing.subTotal = subTotal;
      billing.discountAmount = discountAmount;
      billing.totalAmount = totalAmount;
      billing.amountDueNow = amountDueNow;
    }

    await billing.save();
    return billing;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to update billing");
  }
};

// Add multiple rooms with add-ons to a reservation
export const addReservationRooms = async (req, res) => {
  try {
    const { reservationId, rooms } = req.body;

    // Validate reservation exists
    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found" });

    // Add rooms and add-ons to the reservation
    for (const room of rooms) {
      // Validate room existence
      const { valid, missingRooms } = await validateRoomsExist([room.roomId]);
      if (!valid) {
        return res
          .status(404)
          .json({ error: `Room not found: ${missingRooms.join(", ")}` });
      }

      // Validate add-ons stock
      if (room.addOns && room.addOns.length > 0) {
        await validateAddOnStock(reservation, room.addOns);
      }

      let reservationRoom = await ReservationRoom.findOne({
        reservationId,
        roomId: room.roomId,
      });

      if (!reservationRoom) {
        reservationRoom = new ReservationRoom({
          reservationId,
          roomId: room.roomId,
          addOns: room.addOns || [],
        });
      } else {
        // Merge add-ons if already exists
        reservationRoom.addOns = [
          ...reservationRoom.addOns,
          ...(room.addOns || []),
        ];
      }

      await reservationRoom.save();
    }

    // Update billing after adding rooms
    await generateBillingForUpdatedReservation(reservationId);

    return res.status(201).json({
      message: "Rooms added to reservation successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Update reservation room add-ons
export const updateReservationRoom = async (req, res) => {
  try {
    const { reservationRoomId } = req.params;
    const { addOns } = req.body;

    // Validate reservation room exists
    const reservationRoom = await ReservationRoom.findById(reservationRoomId);
    if (!reservationRoom) {
      return res.status(404).json({ error: "Reservation room not found" });
    }

    // Get the associated reservation for validation
    const reservation = await Reservation.findById(
      reservationRoom.reservationId,
    );
    if (!reservation) {
      return res
        .status(404)
        .json({ error: "Associated reservation not found" });
    }

    // Validate add-ons stock (excluding current reservation room from stock calculation)
    if (addOns && addOns.length > 0) {
      await validateAddOnStock(reservation, addOns, reservationRoom._id);
    }

    // Update add-ons
    reservationRoom.addOns = addOns || [];
    await reservationRoom.save();

    // Update billing after updating add-ons
    await generateBillingForUpdatedReservation(reservationRoom.reservationId);

    return res.status(200).json({
      message: "Reservation room updated successfully",
      success: true,
      reservationRoom,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Get reservation rooms with add-ons
export const getRoomsByReservationId = async (req, res) => {
  try {
    const { reservationId } = req.params;

    const populatedRooms = await ReservationRoom.find({ reservationId })
      .populate("roomId")
      .populate({
        path: "roomId",
        populate: {
          path: "roomType",
          model: "RoomType",
        },
      })
      .populate({
        path: "addOns.addOnId",
        model: "AddOn",
      });

    if (!populatedRooms || populatedRooms.length === 0) {
      return res
        .status(404)
        .json({ error: "No rooms found for this reservation" });
    }

    return res.status(200).json({
      message: "Rooms retrieved successfully",
      rooms: populatedRooms,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Remove multiple rooms from a reservation
export const removeReservationRooms = async (req, res) => {
  try {
    const { reservationId, roomIds } = req.body;

    // Validate the reservation
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    // Find the existing reservationRooms
    const reservationRooms = await ReservationRoom.find({
      reservationId,
      roomId: { $in: roomIds },
    });

    if (!reservationRooms || reservationRooms.length === 0) {
      return res
        .status(404)
        .json({ error: "Rooms not found in this reservation" });
    }

    // Delete the reservation rooms
    const deleteResult = await ReservationRoom.deleteMany({
      reservationId,
      roomId: { $in: roomIds },
    });

    // Update billing after removing rooms
    await generateBillingForUpdatedReservation(reservationId);

    return res.status(200).json({
      message: "Rooms removed from reservation successfully",
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Delete multiple reservation rooms
export const deleteMultipleReservationRooms = async (req, res) => {
  try {
    const { reservationRoomIds, reservationId } = req.body;

    if (!Array.isArray(reservationRoomIds) || !reservationId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const validIds = reservationRoomIds.filter((id) =>
      mongoose.isValidObjectId(id),
    );

    const deleteResult = await ReservationRoom.deleteMany({
      _id: { $in: validIds },
      reservationId,
    });

    // Update billing after deleting rooms
    await generateBillingForUpdatedReservation(reservationId);

    return res.status(200).json({
      success: true,
      deletedCount: deleteResult.deletedCount,
      message: `${deleteResult.deletedCount} room(s) removed from reservation`,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Failed to delete rooms" });
  }
};

// Add add-ons to a specific room in a reservation
export const addAddOnsToRoom = async (req, res) => {
  try {
    const { reservationRoomId } = req.params;
    const { addOns } = req.body;

    // Validate reservation room exists
    const reservationRoom = await ReservationRoom.findById(reservationRoomId);
    if (!reservationRoom) {
      return res.status(404).json({ error: "Reservation room not found" });
    }

    // Get the associated reservation for validation
    const reservation = await Reservation.findById(
      reservationRoom.reservationId,
    );
    if (!reservation) {
      return res
        .status(404)
        .json({ error: "Associated reservation not found" });
    }

    // Validate add-ons stock
    if (addOns && addOns.length > 0) {
      await validateAddOnStock(reservation, addOns, reservationRoom._id);
    }

    // Merge existing add-ons with new ones
    const existingAddOns = reservationRoom.addOns || [];

    for (const newAddOn of addOns) {
      const existingIndex = existingAddOns.findIndex(
        (ao) => ao.addOnId.toString() === newAddOn.addOnId,
      );

      if (existingIndex !== -1) {
        // Update quantity if add-on already exists
        existingAddOns[existingIndex].quantity += newAddOn.quantity;
      } else {
        // Add new add-on
        existingAddOns.push(newAddOn);
      }
    }

    reservationRoom.addOns = existingAddOns;
    await reservationRoom.save();

    // Update billing
    await generateBillingForUpdatedReservation(reservationRoom.reservationId);

    return res.status(200).json({
      message: "Add-ons added successfully",
      success: true,
      reservationRoom,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Remove add-ons from a specific room
export const removeAddOnsFromRoom = async (req, res) => {
  try {
    const { reservationRoomId } = req.params;
    const { addOnIds } = req.body;

    // Validate reservation room exists
    const reservationRoom = await ReservationRoom.findById(reservationRoomId);
    if (!reservationRoom) {
      return res.status(404).json({ error: "Reservation room not found" });
    }

    // Remove specified add-ons
    reservationRoom.addOns = reservationRoom.addOns.filter(
      (addOn) => !addOnIds.includes(addOn.addOnId.toString()),
    );

    await reservationRoom.save();

    // Update billing
    await generateBillingForUpdatedReservation(reservationRoom.reservationId);

    return res.status(200).json({
      message: "Add-ons removed successfully",
      success: true,
      reservationRoom,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Update add-on quantity in a room
export const updateAddOnQuantity = async (req, res) => {
  try {
    const { reservationRoomId, addOnId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: "Valid quantity is required" });
    }

    // Validate reservation room exists
    const reservationRoom = await ReservationRoom.findById(reservationRoomId);
    if (!reservationRoom) {
      return res.status(404).json({ error: "Reservation room not found" });
    }

    // Get the associated reservation for validation
    const reservation = await Reservation.findById(
      reservationRoom.reservationId,
    );
    if (!reservation) {
      return res
        .status(404)
        .json({ error: "Associated reservation not found" });
    }

    // Find and update the add-on
    const addOnIndex = reservationRoom.addOns.findIndex(
      (ao) => ao.addOnId.toString() === addOnId,
    );

    if (addOnIndex === -1) {
      return res.status(404).json({ error: "Add-on not found in this room" });
    }

    // Validate stock with new quantity
    const updatedAddOns = [...reservationRoom.addOns];
    updatedAddOns[addOnIndex].quantity = quantity;

    await validateAddOnStock(
      reservation,
      [{ addOnId, quantity }],
      reservationRoom._id,
    );

    reservationRoom.addOns = updatedAddOns;
    await reservationRoom.save();

    // Update billing
    await generateBillingForUpdatedReservation(reservationRoom.reservationId);

    return res.status(200).json({
      message: "Add-on quantity updated successfully",
      success: true,
      reservationRoom,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

export const transferReservationRoom = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { reservationRoomId } = req.params;
    const { newRoomId, reason } = req.body;
    const transferReason = String(reason || "").trim();

    if (!newRoomId || !mongoose.isValidObjectId(String(newRoomId))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "A valid newRoomId is required" });
    }
    if (!transferReason) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Transfer reason is required" });
    }

    const reservationRoom = await ReservationRoom.findById(reservationRoomId)
      .populate("roomId")
      .session(session);
    if (!reservationRoom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Reservation room not found" });
    }

    const reservation = await Reservation.findById(
      reservationRoom.reservationId,
    ).session(session);
    if (!reservation) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (!["confirmed", "checked_in"].includes(reservation.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "Room can only be changed while the stay is confirmed or in-house",
      });
    }

    const oldRoom = reservationRoom.roomId;
    const oldRoomId = oldRoom?._id || reservationRoom.roomId;
    if (String(oldRoomId) === String(newRoomId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Select a different room" });
    }

    const newRoom = await Room.findById(newRoomId).session(session);
    if (!newRoom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Replacement room not found" });
    }
    if (newRoom.status !== "active") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "Replacement room must be active",
      });
    }
    if (oldRoom?.category && newRoom.category !== oldRoom.category) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "Replacement must be the same category (room or cottage)",
      });
    }
    if (
      reservation.stayType === "hourly" &&
      !roomOffersHourlyPackage(newRoom, reservation.hourlyDuration)
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: `Replacement does not offer a ${reservation.hourlyDuration}-hour rate`,
      });
    }

    const alreadyLinked = await ReservationRoom.findOne({
      reservationId: reservation._id,
      roomId: newRoom._id,
      _id: { $ne: reservationRoom._id },
    }).session(session);
    if (alreadyLinked) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "That room is already on this reservation",
      });
    }

    const windowStart =
      reservation.status === "checked_in" ? new Date() : reservation.checkIn;
    const windowEnd = reservation.checkOut;
    const overlapping = await Reservation.find({
      _id: { $ne: reservation._id },
      status: { $in: ["pending", "confirmed", "checked_in"] },
      checkIn: { $lt: windowEnd },
      checkOut: { $gt: windowStart },
    })
      .select("_id")
      .session(session);
    const overlapIds = overlapping.map((r) => r._id);
    if (overlapIds.length > 0) {
      const conflict = await ReservationRoom.findOne({
        reservationId: { $in: overlapIds },
        roomId: newRoom._id,
      }).session(session);
      if (conflict) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          error: "Replacement room is not available for the remaining stay",
        });
      }
    }

    reservationRoom.roomId = newRoom._id;
    await reservationRoom.save({ session });

    if (oldRoom && oldRoom.status !== "maintenance") {
      oldRoom.status = "to-clean";
      await oldRoom.save({ session });
    }

    const actorUserId = req.user?._id || req.user?.id || null;
    await OperationLog.create(
      [
        {
          unitType: oldRoom?.category === "cottage" ? "cottage" : "room",
          unitId: oldRoomId,
          action: "room_transfer",
          reservationId: reservation._id,
          performedBy: actorUserId,
          reason: transferReason,
        },
        {
          unitType: newRoom.category === "cottage" ? "cottage" : "room",
          unitId: newRoom._id,
          action: "room_transfer",
          reservationId: reservation._id,
          performedBy: actorUserId,
          reason: transferReason,
        },
        ...(oldRoom && oldRoom.status !== "maintenance"
          ? [
              {
                unitType: oldRoom.category === "cottage" ? "cottage" : "room",
                unitId: oldRoom._id,
                action: "cleaning",
                reservationId: reservation._id,
                performedBy: actorUserId,
                reason: `Vacated for transfer: ${transferReason}`,
              },
            ]
          : []),
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    await generateBillingForUpdatedReservation(reservation._id);

    const updated = await ReservationRoom.findById(reservationRoom._id)
      .populate("roomId")
      .populate({
        path: "roomId",
        populate: { path: "roomType", model: "RoomType" },
      })
      .populate({ path: "addOns.addOnId", model: "AddOn" });

    return res.status(200).json({
      success: true,
      message: `Moved from ${oldRoom?.roomNumber || "previous room"} to ${newRoom.roomNumber}`,
      reservationRoom: updated,
      oldRoomId,
      newRoomId: newRoom._id,
      reason: transferReason,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("transferReservationRoom error:", error);
    return res.status(500).json({ error: error.message });
  }
};

