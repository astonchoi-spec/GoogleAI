import { z } from "zod";

import { protectedProcedure, router } from "../../_core/trpc.ts";
import { getDisclosures } from "../../finance/dartAPI.ts";
import { googleAuthManager } from "../../routers/google-workspace.ts";
import { DealPipeline, type KoreanDealStage, type NewPFDeal } from "../../realestate/dealPipeline.ts";
import { runFeasibility, formatFeasibilityReport } from "../../realestate/feasibilityEngine.ts";
import { getLandRegulation, getRealTransactionPrice } from "../../realestate/publicDataAPI.ts";

const realTransactionTypeSchema = z.enum(["apt", "land", "office"]);

const feasibilityInputSchema = z.object({
  projectName: z.string().min(1),
  landCost: z.number().positive(),
  landArea: z.number().positive(),
  buildingCoverageRate: z.number().positive(),
  floorAreaRate: z.number().positive(),
  floors: z.number().positive(),
  constructionCostPerPyeong: z.number().positive(),
  sellingPricePerPyeong: z.number().positive(),
  sellingRate: z.number().positive().optional(),
  loanRate: z.number().positive().optional(),
  loanLTV: z.number().positive().optional(),
  projectDurationMonths: z.number().positive().optional(),
  equityRatio: z.number().positive().optional(),
});

const dealInputSchema = z.object({
  id: z.string().min(1).optional(),
  projectName: z.string().min(1),
  location: z.string().default(""),
  stage: z.string().min(1),
  totalProjectCost: z.number().nonnegative(),
  loanAmount: z.number().nonnegative(),
  ltv: z.number().nonnegative(),
  equityAmount: z.number().nonnegative(),
  lenders: z.string().default(""),
  nextMilestone: z.string().default(""),
  nextMilestoneDate: z.string().default(""),
  notes: z.string().default(""),
});

function getWorkspaceSpreadsheetId(): string {
  const spreadsheetId = process.env.WORKSPACE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("WORKSPACE_SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID is required");
  }
  return spreadsheetId;
}

async function createDealPipeline(userId: number): Promise<DealPipeline> {
  const auth = await googleAuthManager.getAuthenticatedClient(String(userId));
  return new DealPipeline(auth, getWorkspaceSpreadsheetId());
}

export const realestateRouter = router({
  feasibility: protectedProcedure
    .input(feasibilityInputSchema)
    .query(async ({ input }) => {
      const result = runFeasibility(input);
      return {
        result,
        report: formatFeasibilityReport(input, result),
      };
    }),

  landCheck: protectedProcedure
    .input(z.object({ pnu: z.string().min(1) }))
    .query(async ({ input }) => {
      return getLandRegulation(input.pnu);
    }),

  realPrice: protectedProcedure
    .input(
      z.object({
        lawdCd: z.string().min(1),
        dealYmd: z.string().min(1),
        type: realTransactionTypeSchema,
      })
    )
    .query(async ({ input }) => {
      return getRealTransactionPrice(input.lawdCd, input.dealYmd, input.type);
    }),

  getDealList: protectedProcedure.query(async ({ ctx }) => {
    const pipeline = await createDealPipeline(ctx.user.id);
    return pipeline.getAllDeals();
  }),

  addDeal: protectedProcedure
    .input(dealInputSchema)
    .mutation(async ({ ctx, input }) => {
      const pipeline = await createDealPipeline(ctx.user.id);
      return pipeline.addDeal(input as NewPFDeal);
    }),

  updateDealStage: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        stage: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pipeline = await createDealPipeline(ctx.user.id);
      return pipeline.updateDealStage(input.id, input.stage as KoreanDealStage);
    }),

  portfolioSummary: protectedProcedure.query(async ({ ctx }) => {
    const pipeline = await createDealPipeline(ctx.user.id);
    return { summary: await pipeline.getPortfolioSummary() };
  }),

  getDisclosures: protectedProcedure
    .input(
      z.object({
        corpCode: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return getDisclosures(input.corpCode, input.startDate, input.endDate);
    }),
});

export default realestateRouter;
