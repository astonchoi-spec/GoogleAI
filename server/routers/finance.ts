import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { getDisclosures, getFinancialStatements, searchCompanyByName } from "../finance/dartAPI.ts";

export const financeRouter = router({
  getDisclosures: protectedProcedure
    .input(z.object({
      corpCode: z.string().min(1),
      startDate: z.string().regex(/^\d{8}$/),
      endDate: z.string().regex(/^\d{8}$/),
    }))
    .query(async ({ input }) => {
      return getDisclosures(input.corpCode, input.startDate, input.endDate);
    }),

  getFinancialStatements: protectedProcedure
    .input(z.object({
      corpCode: z.string().min(1),
      year: z.union([z.number().int().min(2000).max(2100), z.string().regex(/^\d{4}$/)]),
      reportCode: z.string().default("11011"),
    }))
    .query(async ({ input }) => {
      return getFinancialStatements(input.corpCode, input.year, input.reportCode);
    }),

  searchCompany: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }) => {
      return searchCompanyByName(input.name);
    }),
});

