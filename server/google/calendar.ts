/**
 * Google Calendar API Connector
 * Create, update, and manage events with intelligent scheduling
 */

import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  location: string;
  isAllDay: boolean;
}

export interface CreateEventOptions {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
  location?: string;
  isAllDay?: boolean;
}

export interface UpdateEventOptions extends Partial<CreateEventOptions> {
  eventId: string;
}

export class CalendarConnector {
  private calendar: calendar_v3.Calendar;

  constructor(auth: any) {
    this.calendar = google.calendar({ version: "v3", auth });
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(maxResults: number = 10): Promise<CalendarEvent[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items || [];

      return events.map((event) => ({
        id: event.id || "",
        title: event.summary || "",
        description: event.description || "",
        startTime: new Date(event.start?.dateTime || event.start?.date || ""),
        endTime: new Date(event.end?.dateTime || event.end?.date || ""),
        attendees: event.attendees?.map((a) => a.email || "") || [],
        location: event.location || "",
        isAllDay: !event.start?.dateTime,
      }));
    } catch (error) {
      throw new Error(`Calendar API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create event
   */
  async createEvent(options: CreateEventOptions): Promise<string> {
    try {
      const event: calendar_v3.Schema$Event = {
        summary: options.title,
        description: options.description,
        location: options.location,
        attendees: options.attendees?.map((email) => ({ email })),
        start: options.isAllDay
          ? { date: options.startTime.toISOString().split("T")[0] }
          : { dateTime: options.startTime.toISOString() },
        end: options.isAllDay
          ? { date: options.endTime.toISOString().split("T")[0] }
          : { dateTime: options.endTime.toISOString() },
      };

      const response = await this.calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      });

      return response.data.id || "";
    } catch (error) {
      throw new Error(`Failed to create event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update event
   */
  async updateEvent(options: UpdateEventOptions): Promise<void> {
    try {
      const event: calendar_v3.Schema$Event = {
        summary: options.title,
        description: options.description,
        location: options.location,
        attendees: options.attendees?.map((email) => ({ email })),
        start: options.isAllDay
          ? { date: options.startTime?.toISOString().split("T")[0] }
          : { dateTime: options.startTime?.toISOString() },
        end: options.isAllDay
          ? { date: options.endTime?.toISOString().split("T")[0] }
          : { dateTime: options.endTime?.toISOString() },
      };

      await this.calendar.events.update({
        calendarId: "primary",
        eventId: options.eventId,
        requestBody: event,
      });
    } catch (error) {
      throw new Error(`Failed to update event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete event
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId: "primary",
        eventId,
      });
    } catch (error) {
      throw new Error(`Failed to delete event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search events by title
   */
  async searchEvents(query: string, maxResults: number = 10): Promise<CalendarEvent[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId: "primary",
        q: query,
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items || [];

      return events.map((event) => ({
        id: event.id || "",
        title: event.summary || "",
        description: event.description || "",
        startTime: new Date(event.start?.dateTime || event.start?.date || ""),
        endTime: new Date(event.end?.dateTime || event.end?.date || ""),
        attendees: event.attendees?.map((a) => a.email || "") || [],
        location: event.location || "",
        isAllDay: !event.start?.dateTime,
      }));
    } catch (error) {
      throw new Error(`Failed to search events: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get events for specific date range
   */
  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId: "primary",
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items || [];

      return events.map((event) => ({
        id: event.id || "",
        title: event.summary || "",
        description: event.description || "",
        startTime: new Date(event.start?.dateTime || event.start?.date || ""),
        endTime: new Date(event.end?.dateTime || event.end?.date || ""),
        attendees: event.attendees?.map((a) => a.email || "") || [],
        location: event.location || "",
        isAllDay: !event.start?.dateTime,
      }));
    } catch (error) {
      throw new Error(`Failed to get events: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default CalendarConnector;
