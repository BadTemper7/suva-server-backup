import OperationLog from "../models/OperationLog.js";
import { formatExportDateTime } from "./reportExportFormatting.js";

/** Same rules as reports date range (period + optional custom ISO dates). */
export function operationsLogsReportDateRange(period, startDate, endDate) {
  const now = new Date();
  let start;
  let end;

  switch (period) {
    case "daily":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    case "weekly":
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      end = new Date();
      break;
    case "monthly":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      break;
    case "custom":
      start = new Date(startDate);
      end = new Date(endDate);
      break;
    default:
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date();
  }

  return { start, end };
}

export function buildOperationsLogsMongoQuery({
  period = "weekly",
  startDate,
  endDate,
  unitType = "all",
  action = "all",
}) {
  const { start, end } = operationsLogsReportDateRange(
    period,
    startDate,
    endDate,
  );
  const query = {
    createdAt: { $gte: start, $lte: end },
  };

  if (unitType !== "all" && ["room", "cottage"].includes(unitType)) {
    query.unitType = unitType;
  }
  if (
    action !== "all" &&
    ["cleaning", "maintenance", "check_in", "check_out"].includes(action)
  ) {
    query.action = action;
  }

  return { start, end, query };
}

/**
 * Paginated operations report payload (Analytics + Operations Logs list).
 * Used by GET /api/reports/operations-logs and GET /api/rooms/operations-logs?format=report
 */
export async function fetchOperationsLogsReportPayload(reqQuery) {
  const {
    period = "weekly",
    startDate,
    endDate,
    unitType = "all",
    action = "all",
    page = 1,
    pageSize = 10,
  } = reqQuery;

  const { start, end, query } = buildOperationsLogsMongoQuery({
    period,
    startDate,
    endDate,
    unitType,
    action,
  });

  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const sizeNum = Math.min(
    100,
    Math.max(1, Number.parseInt(pageSize, 10) || 10),
  );
  const skip = (pageNum - 1) * sizeNum;

  const [total, logs, actionBreakdown, unitBreakdown] = await Promise.all([
    OperationLog.countDocuments(query),
    OperationLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(sizeNum)
      .populate("unitId", "roomNumber roomNo category")
      .populate("reservationId", "reservationNumber")
      .populate("performedBy", "firstName lastName username"),
    OperationLog.aggregate([
      { $match: query },
      { $group: { _id: "$action", count: { $sum: 1 } } },
    ]),
    OperationLog.aggregate([
      { $match: query },
      { $group: { _id: "$unitType", count: { $sum: 1 } } },
    ]),
  ]);

  const actions = {
    cleaning: 0,
    maintenance: 0,
    check_in: 0,
    check_out: 0,
  };
  actionBreakdown.forEach((row) => {
    const id = row?._id;
    if (id && Object.prototype.hasOwnProperty.call(actions, id)) {
      actions[id] = row.count || 0;
    }
  });

  const units = { room: 0, cottage: 0 };
  unitBreakdown.forEach((row) => {
    const id = row?._id;
    if (id && Object.prototype.hasOwnProperty.call(units, id)) {
      units[id] = row.count || 0;
    }
  });

  return {
    success: true,
    period,
    dateRange: { start, end },
    filters: { unitType, action },
    summary: {
      total,
      actions,
      units,
    },
    logs,
    pagination: {
      total,
      page: pageNum,
      pageSize: sizeNum,
      totalPages: Math.max(1, Math.ceil(total / sizeNum)),
    },
  };
}

/** Full log list for Excel/PDF export (no pagination). */
export async function fetchOperationsLogsForExport(params, fmt) {
  const {
    period = "weekly",
    startDate,
    endDate,
    unitType = "all",
    action = "all",
  } = params;
  const { query } = buildOperationsLogsMongoQuery({
    period,
    startDate,
    endDate,
    unitType,
    action,
  });

  const logs = await OperationLog.find(query)
    .sort({ createdAt: -1 })
    .populate("unitId", "roomNumber roomNo category")
    .populate("reservationId", "reservationNumber")
    .populate("performedBy", "firstName lastName username");

  return {
    columns: [
      { header: "Date", key: "createdAt", width: 20 },
      { header: "Unit Type", key: "unitType", width: 15 },
      { header: "Unit Number", key: "unitNumber", width: 15 },
      { header: "Action", key: "action", width: 15 },
      { header: "Reservation #", key: "reservationNumber", width: 20 },
      { header: "Performed By", key: "performedBy", width: 20 },
    ],
    rows: logs.map((log) => {
      const unitNo = log?.unitId?.roomNo || log?.unitId?.roomNumber || "N/A";
      const performedBy = log?.performedBy
        ? `${log.performedBy.firstName || ""} ${log.performedBy.lastName || ""}`.trim() ||
          log.performedBy.username ||
          "System"
        : "System";
      return {
        createdAt: log.createdAt
          ? formatExportDateTime(log.createdAt, fmt)
          : "N/A",
        unitType: log.unitType || "N/A",
        unitNumber: unitNo,
        action: String(log.action || "")
          .replace("_", " ")
          .toUpperCase(),
        reservationNumber: log?.reservationId?.reservationNumber || "N/A",
        performedBy,
      };
    }),
  };
}
