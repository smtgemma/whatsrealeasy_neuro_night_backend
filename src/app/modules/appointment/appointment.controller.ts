// ================== CONTROLLER - appointment.controller.ts ==================

import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { googleCalendarService } from "./appointment.service";
import { AppointmentEventData } from "./appointment.interface";
import config from "../../config";
import { google } from "googleapis";
import { tokenService } from "../token/token.service";

const AUTHORIZED_EMAILS = [
  config.superAdmin.email,
];

const handleOAuthCallback = catchAsync(async (req: Request, res: Response) => {
  const code = req.query.code as string;
  
  if (!code) {
    return res.status(status.BAD_REQUEST).send("No authorization code provided");
  }

  try {
    // Step 1: Exchange code for tokens
    const tokens = await googleCalendarService.setToken(code);
    
    // Step 2: Set credentials
    const oauth2Client = googleCalendarService.getAuthClient();
    oauth2Client.setCredentials(tokens);

    // Step 3: Get user info with proper error handling
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    
    let email: string;
    try {
      const {data} = await oauth2.userinfo.get();

     
      if (!data.email) {
        console.error("No email in userinfo response:", data);
        await tokenService.clearTokens();
        return res.redirect(
          `${config.url.frontend}/dashboard/super-admin/outbound/calender?error=no_email`
        );
      }
      
      email = data.email;
      console.log("Successfully retrieved user email:", email);
      
    } catch (userInfoError: any) {
      console.error("Error fetching user info:", userInfoError);
      console.error("Error response:", userInfoError.response?.data);
      
      await tokenService.clearTokens();
      return res.redirect(
        `${config.url.frontend}/dashboard/super-admin/outbound/calender?error=userinfo_failed`
      );
    }

    // Step 4: Check authorization
    if (!AUTHORIZED_EMAILS.includes(email)) {
      console.log(`Unauthorized email attempted access: ${email}`);
      await tokenService.clearTokens();
      return res.redirect(
        `${config.url.frontend}/dashboard/super-admin/outbound/calender?error=unauthorized&email=${encodeURIComponent(email)}`
      );
    }

    // Step 5: Success - redirect with success flag
    // console.log(`Authorized email successfully authenticated: ${email}`);
    return res.redirect(
      `${config.url.frontend}/dashboard/super-admin/outbound/calender?success=true&email=${encodeURIComponent(email)}`
    );
    
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    console.error("Error stack:", error.stack);
    
    return res.status(status.INTERNAL_SERVER_ERROR).send(
      `Authentication failed: ${error.message}`
    );
  }
});

const redirectToGoogleAuth = catchAsync(async (req: Request, res: Response) => {
  console.log("Redirecting to Google OAuth");
  const authUrl = googleCalendarService.generateAuthUrl();
  console.log("Auth URL:", authUrl);
  res.redirect(authUrl);
});

const getAuthStatus = catchAsync(async (req: Request, res: Response) => {
  const isAuthenticated = googleCalendarService.isAuthenticated();
  const hasRefreshToken = googleCalendarService.hasRefreshToken();

  sendResponse(res, {
    statusCode: status.OK,
    message: "Authentication status retrieved successfully",
    data: {
      authenticated: isAuthenticated,
      hasRefreshToken: hasRefreshToken,
    },
  });
});

const initiateAuth = catchAsync(async (req: Request, res: Response) => {
  console.log("Initiating auth");
  const authUrl = googleCalendarService.generateAuthUrl();
  console.log("Auth URL generated:", authUrl);

  res.json({
    success: true,
    url: authUrl,
    message: "Google Auth URL generated successfully",
  });
});

const setAppointment = catchAsync(async (req: Request, res: Response) => {
  const { summary, description, start, end, callLogId } = req.body;

  if (!summary || !start || !end) {
    return res.status(status.BAD_REQUEST).json({
      error: "Missing required fields: summary, start, end",
    });
  }

  if (!start.dateTime || !end.dateTime) {
    return res.status(status.BAD_REQUEST).json({
      error: "Both start and end must have dateTime properties",
    });
  }

  try {
    new Date(start.dateTime);
    new Date(end.dateTime);
  } catch (error) {
    return res.status(status.BAD_REQUEST).json({
      error: "Invalid date format. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss",
    });
  }

  const eventData: AppointmentEventData = {
    callLogId: callLogId || null,
    summary,
    description,
    start: {
      dateTime: start.dateTime,
      timeZone: start.timeZone || "UTC",
    },
    end: {
      dateTime: end.dateTime,
      timeZone: end.timeZone || "UTC",
    },
  };

  try {
    const result = await googleCalendarService.setAppointment(eventData);

    sendResponse(res, {
      statusCode: status.OK,
      message: "Appointment set successfully",
      data: {
        message: result.id ? "Appointment created" : "Appointment updated",
        appointment: result,
        meetLink: result.hangoutLink,
      },
    });
  } catch (error: any) {
    sendResponse(res, {
      statusCode: status.INTERNAL_SERVER_ERROR,
      message: error.message || "Failed to set appointment",
    });
  }
});

export const GoogleCalendarController = {
  redirectToGoogleAuth,
  handleOAuthCallback,
  getAuthStatus,
  initiateAuth,
  setAppointment,
};