import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { googleAuthManager } from "./google-workspace.ts";
import { DealPipeline } from "../realestate/dealPipeline.ts";
import { formatFeasibilityReport, runFeasibility } from "../realestate/feasibilityEngine.ts";
import { getBuildingInfo, getLandRegulation, getRealTransactionPrice } from "../realestate/publicDataAPI.ts";

const dealStageSchema = z.string().min(1);

function spreadsheetIdFromEnv(): string {
  const spreadsheetId = process.env.WORKSPACE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("WORKSPACE_SPREADSHEET_ID is missing");
  }
  return spreadsheetId;
}

async function createDealPipeline(userId: string): Promise<DealPipeline> {
  const auth = await googleAuthManager.getAuthenticatedClient(userId);
  return new DealPipeline(auth, spreadsheetIdFromEnv());
}

export const realestateRouter = router({
  getDeals: protectedProcedure.query(async ({ ctx }) => {
    const pipeline = await createDealPipeline(String(ctx.user.id));
    return pipeline.getAllDeals();
  }),

  addDeal: protectedProcedure
    .input(z.object({
      projectName: z.string().min(1),
      location: z.string().default(""),
      stage: dealStageSchema.default("초기"),
      totalProjectCost: z.number().default(0),
      loanAmount: z.number().default(0),
      ltv: z.number().default(0),
      equityAmount: z.number().default(0),
      lenders: z.string().default(""),
      nextMilestone: z.string().default(""),
      nextMilestoneDate: z.string().default(""),
      notes: z.string().default(""),
    }))
    .mutation(async ({ ctx, input }) => {
      const pipeline = await createDealPipeline(String(ctx.user.id));
      return pipeline.addDeal(input as any);
    }),

  updateDealStage: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      stage: dealStageSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const pipeline = await createDealPipeline(String(ctx.user.id));
      return pipeline.updateDealStage(input.id, input.stage as any);
    }),

  getPortfolioSummary: protectedProcedure.query(async ({ ctx }) => {
    const pipeline = await createDealPipeline(String(ctx.user.id));
    const summary = await pipeline.getPortfolioSummary();
    return { summary };
  }),

  runFeasibility: protectedProcedure
    .input(z.object({
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
    }))
    .mutation(async ({ input }) => {
      const result = runFeasibility(input);
      const report = formatFeasibilityReport(input, result);
      return { result, report };
    }),

  getLandRegulation: protectedProcedure
    .input(z.object({ pnu: z.string().min(1) }))
    .query(async ({ input }) => {
      return getLandRegulation(input.pnu);
    }),

  getBuildingInfo: protectedProcedure
    .input(z.object({
      sigunguCd: z.string().min(1),
      bjdongCd: z.string().min(1),
      bun: z.string().min(1),
      ji: z.string().min(1),
    }))
    .query(async ({ input }) => {
      return getBuildingInfo(input.sigunguCd, input.bjdongCd, input.bun, input.ji);
    }),

  getRealTransactions: protectedProcedure
    .input(z.object({
      lawdCd: z.string().min(1),
      dealYmd: z.string().regex(/^\d{6}$/),
      type: z.enum(["apt", "land", "office"]),
    }))
    .query(async ({ input }) => {
      return getRealTransactionPrice(input.lawdCd, input.dealYmd, input.type);
    }),
});
