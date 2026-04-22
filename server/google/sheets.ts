/**
 * Google Sheets API Connector
 * Read and write spreadsheet data programmatically
 */

import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";

export interface SheetData {
  spreadsheetId: string;
  sheetTitle: string;
  data: any[][];
  headers: string[];
}

export interface WriteSheetOptions {
  spreadsheetId: string;
  range: string;
  values: any[][];
}

export interface AppendSheetOptions {
  spreadsheetId: string;
  range: string;
  values: any[][];
}

export class SheetsConnector {
  private sheets: sheets_v4.Sheets;

  constructor(auth: any) {
    this.sheets = google.sheets({ version: "v4", auth });
  }

  /**
   * Read spreadsheet data
   */
  async readSheet(spreadsheetId: string, range: string): Promise<SheetData> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];
      const headers = values[0] || [];
      const data = values.slice(1);

      // Get sheet title
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      const sheetTitle = spreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";

      return {
        spreadsheetId,
        sheetTitle,
        data,
        headers,
      };
    } catch (error) {
      throw new Error(`Sheets API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write data to sheet
   */
  async writeSheet(options: WriteSheetOptions): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: options.spreadsheetId,
        range: options.range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: options.values,
        },
      });
    } catch (error) {
      throw new Error(`Failed to write sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Append data to sheet
   */
  async appendSheet(options: AppendSheetOptions): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: options.spreadsheetId,
        range: options.range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: options.values,
        },
      });
    } catch (error) {
      throw new Error(`Failed to append sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear sheet range
   */
  async clearSheet(spreadsheetId: string, range: string): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });
    } catch (error) {
      throw new Error(`Failed to clear sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create new spreadsheet
   */
  async createSpreadsheet(title: string): Promise<string> {
    try {
      const response = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title,
          },
        },
      });

      return response.data.spreadsheetId || "";
    } catch (error) {
      throw new Error(`Failed to create spreadsheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get spreadsheet metadata
   */
  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      return {
        spreadsheetId: response.data.spreadsheetId,
        title: response.data.properties?.title,
        sheets: response.data.sheets?.map((sheet) => ({
          title: sheet.properties?.title,
          sheetId: sheet.properties?.sheetId,
          gridProperties: sheet.properties?.gridProperties,
        })),
      };
    } catch (error) {
      throw new Error(`Failed to get spreadsheet metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search for value in sheet
   */
  async searchInSheet(spreadsheetId: string, range: string, searchValue: string): Promise<any[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];
      const results: any[] = [];

      values.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          if (String(cell).toLowerCase().includes(searchValue.toLowerCase())) {
            results.push({
              row: rowIndex,
              col: colIndex,
              value: cell,
            });
          }
        });
      });

      return results;
    } catch (error) {
      throw new Error(`Failed to search in sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add sheet to spreadsheet
   */
  async addSheet(spreadsheetId: string, sheetTitle: string): Promise<number> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetTitle,
                },
              },
            },
          ],
        },
      });

      return response.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
    } catch (error) {
      throw new Error(`Failed to add sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete sheet from spreadsheet
   */
  async deleteSheet(spreadsheetId: string, sheetId: number): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId,
              },
            },
          ],
        },
      });
    } catch (error) {
      throw new Error(`Failed to delete sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default SheetsConnector;
