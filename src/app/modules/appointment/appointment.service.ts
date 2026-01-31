import { google, calendar_v3 } from "googleapis";
import {
  AppointmentEventData,
  CalendarEvent,
  GoogleTokens,
} from "./appointment.interface";
import { tokenService } from "../token/token.service";
import prisma from "../../utils/prisma";
import config from "../../config";

let oAuth2Client: any = null;
let calendar: any = null;
const calendarId: string = "primary";

const initializeOAuthClient = (): void => {
  oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID!,
    process.env.SECRET_ID!,
    process.env.REDIRECT!
  );

  calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  // Load tokens from database on initialization
  loadTokensFromDB();
};

const loadTokensFromDB = async (): Promise<void> => {
  try {
    const tokens = await tokenService.getTokens();
    if (tokens) {
      oAuth2Client.setCredentials(tokens);
      console.log("Tokens loaded from database successfully");

      // Auto-refresh if token is expired
      if (await tokenService.isTokenExpired()) {
        await refreshAccessToken();
      }
    }
  } catch (error) {
    console.log("No valid tokens found in database, need to authenticate");
  }
};

const refreshAccessToken = async (): Promise<void> => {
  try {
    const tokens = await tokenService.getTokens();
    if (!tokens?.refresh_token) {
      throw new Error("No refresh token available");
    }

    oAuth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
    });

    const { credentials } = await oAuth2Client.refreshAccessToken();

    await tokenService.updateAccessToken(
      credentials.access_token,
      credentials.expiry_date
    );

    oAuth2Client.setCredentials(credentials as any);
  } catch (error: any) {
    if (
      (error.response && error.response.data && error.response.data.error === "invalid_grant") ||
      error.message?.includes("invalid_grant") ||
      error.code === '400'
    ) {
      console.log("Refresh token is invalid or expired. Clearing tokens from database...");
      await tokenService.clearTokens();
    } else {
      console.error("Error refreshing access token:", error);
    }
    throw error;
  }
};

const ensureValidToken = async (): Promise<void> => {
  if (await tokenService.isTokenExpired()) {
    await refreshAccessToken();
  }
};

const generateAuthUrl = (): string => {
  console.log("Generating auth URL");
  if (!oAuth2Client) initializeOAuthClient();

  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
    ],
    prompt: "consent", // Force consent screen to get refresh token
  });
};

const isAuthenticated = (): boolean => {
  if (!oAuth2Client) initializeOAuthClient();
  const credentials = oAuth2Client.credentials;
  return !!(credentials && credentials.access_token);
};

const hasRefreshToken = (): boolean => {
  if (!oAuth2Client) initializeOAuthClient();
  const credentials = oAuth2Client.credentials;
  return !!(credentials && credentials.refresh_token);
};

const setToken = async (code: string): Promise<GoogleTokens> => {
  try {
    if (!oAuth2Client) initializeOAuthClient();

    const { tokens } = await oAuth2Client.getToken(code);
    console.log("Tokens received:", tokens);
    oAuth2Client.setCredentials(tokens);

    await tokenService.saveTokens(tokens as GoogleTokens);

    console.log("Tokens saved to database successfully");
    return tokens as GoogleTokens;
  } catch (error) {
    console.error("Error getting token:", (error as Error).message);
    throw error;
  }
};

const setAppointment = async (
  eventData: AppointmentEventData
): Promise<CalendarEvent> => {
  try {
    if (!oAuth2Client || !calendar) initializeOAuthClient();
    await ensureValidToken();

    let response: any;
    const requestId = `appointment_${Date.now()}`;

    const conferenceData = {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };

    const event = {
      summary: eventData.summary,
      description: eventData.description || "",
      start: {
        dateTime: eventData.start.dateTime,
        timeZone: eventData.start.timeZone || "UTC",
      },
      end: {
        dateTime: eventData.end.dateTime,
        timeZone: eventData.end.timeZone || "UTC",
      },
      attendees: [{ email: config.superAdmin.secondary_email || "" }],
      conferenceData: conferenceData,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    };

    if (!event.start.dateTime || !event.end.dateTime) {
      throw new Error("Both start and end must have dateTime properties");
    }

    const startDateTime = new Date(event.start.dateTime).toISOString();
    const endDateTime = new Date(event.end.dateTime).toISOString();

    event.start.dateTime = startDateTime;
    event.end.dateTime = endDateTime;

    response = await calendar.events.insert({
      calendarId,
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    const bookingData = {
      callLogId: eventData?.callLogId,
      title: event.summary || "No Title",
      description: event.description || "",
      startTime: new Date(event.start.dateTime!),
      endTime: new Date(event.end.dateTime!),
      timeZone: event.start.timeZone || "UTC",
      googleEventId: response.data.id || null,
      meetLink: response.data.hangoutLink || null,
      calendarLink: response.data.htmlLink || null,
      status: response.data.status ? "confirmed" : "unknown",
    };

    await prisma.booking.create({
      data: bookingData as any,
    });

    return response.data as CalendarEvent;
  } catch (error) {
    console.error("Error setting appointment:", (error as Error).message);
    if ((error as any).response) {
      console.error("Error details:", (error as any).response.data);
    }
    throw error;
  }
};

const cancelAppointment = async (
  eventId: string
): Promise<{ message: string }> => {
  try {
    if (!oAuth2Client || !calendar) initializeOAuthClient();

    if (!eventId) {
      return { message: "No event ID provided" };
    }

    await ensureValidToken();

    await calendar.events.delete({
      calendarId,
      eventId: eventId,
    });

    return { message: "Appointment successfully cancelled" };
  } catch (error) {
    console.error("Error cancelling appointment:", (error as Error).message);
    if ((error as any).code === 404) {
      return { message: "Appointment was already deleted" };
    }
    throw error;
  }
};

const clearAppointment = (): { message: string } => {
  return { message: "Appointment reference cleared (deprecated)" };
};

const getAuthClient = (): any => {
  if (!oAuth2Client) initializeOAuthClient();
  return oAuth2Client;
};

const manualRefreshToken = async (): Promise<boolean> => {
  try {
    if (!oAuth2Client) initializeOAuthClient();
    await refreshAccessToken();
    return true;
  } catch (error) {
    console.error("Manual token refresh failed:", error);
    return false;
  }
};

// NEW: Get user email from tokens
const getUserEmail = async (): Promise<string | null> => {
  try {
    if (!oAuth2Client) initializeOAuthClient();

    const oauth2 = google.oauth2({
      auth: oAuth2Client,
      version: "v2",
    });

    const { data } = await oauth2.userinfo.get();
    return data.email || null;
  } catch (error) {
    console.error("Error getting user email:", error);
    return null;
  }
};

// Initialize the service when imported
initializeOAuthClient();

export const googleCalendarService = {
  generateAuthUrl,
  isAuthenticated,
  hasRefreshToken,
  setToken,
  setAppointment,
  cancelAppointment,
  clearAppointment,
  getAuthClient,
  manualRefreshToken,
  getUserEmail, // Export new function
};