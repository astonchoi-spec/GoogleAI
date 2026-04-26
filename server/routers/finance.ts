import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import {
  getCompanyInfo,
  getDisclosures,
  getFinancialStatements,
  searchCompanyByName,
} from "../finance/dartAPI.ts";

const reportCodeSchema = z.enum(["11013", "11012", "11011", "11014"]).default("11011");

export const financeRouter = router({
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
});

