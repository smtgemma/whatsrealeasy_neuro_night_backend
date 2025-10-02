import { User } from "@prisma/client";
import {
  IPaginationOptions,
  paginationHelper,
} from "../../utils/paginationHelpers";
import prisma from "../../utils/prisma";

const getCallLogsManagement = async (
  options: IPaginationOptions,
  filters: any = {}
) => {
  let searchTerm = filters?.searchTerm as string;
  const call_Status = filters?.call_status as string;
  const callType = filters?.callType as string;

  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelper.calculatePagination(options);

  let whereClause: any = {};

  if (callType) {
    whereClause.callType = callType;
  }

  if (call_Status) {
    whereClause.call_status = call_Status;
  }

  if (searchTerm) {
    whereClause.OR = [
      // { from_number: { contains: searchTerm, mode: "insensitive" } },
      // { to_number: { contains: searchTerm, mode: "insensitive" } },
      // { call_status: { contains: searchTerm, mode: "insensitive" } },
      // { callType: { contains: searchTerm, mode: "insensitive" } },
      // { name: { contains: searchTerm, mode: "insensitive" } },
      // { contact_number: { contains: searchTerm, mode: "insensitive" } },
      // { company: { contains: searchTerm, mode: "insensitive" } },
      // { description: { contains: searchTerm, mode: "insensitive" } },
      { area: { contains: searchTerm, mode: "insensitive" } },
      {
        service: { serviceName: { contains: searchTerm, mode: "insensitive" } },
      },
    ];
  }

  // console.log("Where Clause:", whereClause)

  // Add await here and use whereClause
  const result = await prisma.callLog.findMany({
    where: whereClause, // Use the whereClause you defined
    select: {
      id: true,
      call_sid: true,
      agent_id: true,
      call_recording: true,
      // call_started_at: true,
      // call_completed_at: true,
      // call_duration: true,
      // recording_duration: true,
      // conversation_id: true,
      from_number: true,
      to_number: true,
      callType: true,
      call_status: true,
      call_time: true,
      call_transcript: true,

      name: true,
      contact_number: true,
      company: true,
      area: true,
      description: true,

      createdAt: true,
      updatedAt: true,
      service: {
        select: {
          serviceName: true,
          // voiceName: true,
        },
      },
      bookings: {
        select: {
          title: true,
          startTime: true,
          endTime: true,
          googleEventId: true,
          meetLink: true,
          calendarLink: true,
        },
      },
    },
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: skip,
    take: limit,
  });

  const total = await prisma.callLog.count({ where: whereClause });

  return {
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
    data: result,
  };
};

export const CallLogsService = {
  getCallLogsManagement,
};
