import ReservationModels from "../models/Reservation.js";
import Room from "../models/Room.js";
import Amenity from "../models/Amenity.js";
import mongoose from "mongoose";
import Billing from "../models/Billing.js";

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

// Helper function to validate amenities stock
async function validateAmenityStock(reservation, amenities) {
  const { checkIn, checkOut } = reservation;

  for (const item of amenities) {
    const { amenityId, quantity } = item;
    const amenity = await Amenity.findById(amenityId);
    if (!amenity) throw new Error(`Amenity not found: ${amenityId}`);
    if (amenity.status !== "active")
      throw new Error(`Amenity is not active: ${amenity.name}`);

    // Calculate reserved stock during this reservation period
    const reservedCountAgg = await ReservationRoom.aggregate([
      { $unwind: "$amenities" },
      {
        $match: {
          "amenities.amenityId": new mongoose.Types.ObjectId(amenityId),
        },
      },
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
        },
      },
      { $group: { _id: null, totalReserved: { $sum: "$amenities.quantity" } } },
    ]);

    const totalReserved = reservedCountAgg[0]?.totalReserved || 0;
    if (totalReserved + quantity > amenity.stock) {
      throw new Error(
        `Amenity '${amenity.name}' does not have enough stock. Requested: ${quantity}, Available: ${
          amenity.stock - totalReserved
        }`,
      );
    }
  }
}
const generateBillingForUpdatedReservation = async (reservationId) => {
  try {
    // Fetch the reservation
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return;

    // Fetch all the reservation rooms and their amenities
    const reservationRooms = await ReservationRoom.find({
      reservationId,
    })
      .populate("roomId")
      .populate("amenities.amenityId");

    // Calculate subtotal for all rooms and amenities
    let subTotal = 0;
    reservationRooms.forEach((resRoom) => {
      const roomRate = resRoom.roomId?.rate || 0;
      subTotal += roomRate;

      if (resRoom.amenities && resRoom.amenities.length > 0) {
        resRoom.amenities.forEach((a) => {
          const amenityRate = a.amenityId?.rate || 0;
          subTotal += amenityRate * a.quantity;
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
// Add multiple rooms with amenities to a reservation
// Add multiple rooms with amenities to a reservation
export const addReservationRooms = async (req, res) => {
  try {
    const { reservationId, rooms } = req.body;

    // Validate reservation exists
    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found" });

    // Add rooms and amenities to the reservation
    for (const room of rooms) {
      // Validate room existence
      const { valid, missingRooms } = await validateRoomsExist([room.roomId]);
      if (!valid) {
        return res
          .status(404)
          .json({ error: `Room not found: ${missingRooms.join(", ")}` });
      }

      // Validate amenities stock
      if (room.amenities && room.amenities.length > 0) {
        await validateAmenityStock(reservation, room.amenities);
      }

      let reservationRoom = await ReservationRoom.findOne({
        reservationId,
        roomId: room.roomId,
      });

      if (!reservationRoom) {
        reservationRoom = new ReservationRoom({
          reservationId,
          roomId: room.roomId,
          amenities: room.amenities || [],
        });
      } else {
        // Merge amenities if already exists
        reservationRoom.amenities = [
          ...reservationRoom.amenities,
          ...(room.amenities || []),
        ];
      }

      await reservationRoom.save();
    }

    return res.status(201).json({
      message: "Rooms added to reservation successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

export const updateReservationRoom = async (req, res) => {
  try {
    const { reservationRoomId } = req.params;
    const { amenities } = req.body;
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

    // Validate amenities stock (excluding current reservation room from stock calculation)
    if (amenities && amenities.length > 0) {
      await validateAmenityStock(reservation, amenities, reservationRoom._id);
    }

    // Update amenities
    reservationRoom.amenities = amenities || [];
    await reservationRoom.save();

    return res.status(200).json({
      message: "Reservation room updated successfully",
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Get reservation rooms with amenities
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
        path: "amenities.amenityId",
        model: "Amenity",
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

    // Find the existing reservationRoom
    const reservationRoom = await ReservationRoom.findOne({ reservationId });
    if (!reservationRoom) {
      return res
        .status(404)
        .json({ error: "Rooms not assigned to this reservation" });
    }

    // Ensure roomIds is an array (in case only a single roomId is provided)
    const roomsToRemove = Array.isArray(roomIds) ? roomIds : [roomIds];

    // Remove the rooms from the reservation
    reservationRoom.roomIds = reservationRoom.roomIds.filter(
      (roomId) => !roomsToRemove.includes(roomId.toString()),
    );

    // Save the updated reservationRoom
    await reservationRoom.save();

    return res.status(200).json({
      message: "Rooms removed from reservation successfully",
      reservationRoom: reservationRoom,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
export const deleteMultipleReservationRooms = async (req, res) => {
  try {
    const { reservationRoomIds, reservationId } = req.body;

    if (!Array.isArray(reservationRoomIds) || !reservationId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const deleteResult = await ReservationRoom.deleteMany({
      _id: {
        $in: reservationRoomIds.filter((id) => mongoose.isValidObjectId(id)),
      },
      reservationId,
    });

    return res.status(200).json({
      success: true,
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Failed to delete rooms" });
  }
};
