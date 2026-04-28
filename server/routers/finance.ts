import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import {
  getCompanyInfo,
  getDisclosures,
  getFinancialStatements,
  getRecentDisclosures,
  searchCompanyByName,
} from "../finance/dartAPI.ts";

const reportCodeSchema = z.enum(["11013", "11012", "11011", "11014"]).default("11011");

export const financeRouter = router({
  // ─── 기존 프로시저 (수정 금지) ────────────────────────────────────────────
  getDisclosures: protectedProcedure
    .input(z.object({
      corpCode: z.string().min(1),
      startDate: z.string().min(8),
      endDate: z.string().min(8),
    }))
    .query(async ({ input }) => {
      return getDisclosures(input.corpCode, input.startDate, input.endDate);
    }),

  getFinancialStatements: protectedProcedure
    .input(z.object({
      corpCode: z.string().min(1),
      year: z.union([z.string().min(4), z.number()]),
      reportCode: reportCodeSchema,
    }))
    .query(async ({ input }) => {
      return getFinancialStatements(input.corpCode, input.year, input.reportCode);
    }),

  getCompanyInfo: protectedProcedure
    .input(z.object({ corpCode: z.string().min(1) }))
    .query(async ({ input }) => {
      return getCompanyInfo(input.corpCode);
    }),

  searchCompanyByName: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }) => {
      return searchCompanyByName(input.name);
    }),

  // ─── DART 신규 프로시저 ────────────────────────────────────────────────────
  dart: router({
    recent: protectedProcedure
      .input(z.object({
        corpCode: z.string().optional(),
        beginDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return getRecentDisclosures(input.corpCode, input.beginDate, input.endDate);
      }),

    company: protectedProcedure
      .input(z.object({ corpCode: z.string().min(1) }))
      .query(async ({ input }) => {
        return getCompanyInfo(input.corpCode);
      }),

    financial: protectedProcedure
      .input(z.object({
        corpCode: z.string().min(1),
        year: z.string().min(4),
        reportCode: z.string().default("11011"),
      }))
      .query(async ({ input }) => {
        return getFinancialStatements(input.corpCode, input.year, input.reportCode);
      }),
  }),
});

