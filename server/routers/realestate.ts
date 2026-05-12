import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { googleAuthManager } from "./google-workspace.ts";
import { DealPipeline, listDeals, getDeal, createDeal, updateDeal, deleteDeal } from "../realestate/dealPipeline.ts";
import {
  calculateFeasibility,
  formatSimpleFeasibilityReport,
  formatFeasibilityReport,
  runFeasibility,
  type SimpleFeasibilityInput,
} from "../realestate/feasibilityEngine.ts";
import {
  getBuildingInfo,
  getLandRegulation,
  getRealTransactionPrice,
  getLandUseRegulation,
  getLandPrice,
  getRealTransaction,
} from "../realestate/publicDataAPI.ts";

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

  feasibility: protectedProcedure
    .input(
      z.object({
        projectName: z.string().min(1),
        landCost: z.number().positive(),
        constructionCost: z.number().positive(),
        designFee: z.number().positive(),
        financeCost: z.number().positive(),
        taxAndFee: z.number().positive(),
        otherCost: z.number().positive(),
        totalUnits: z.number().positive(),
        avgSalePrice: z.number().positive(),
        projectMonths: z.number().positive(),
      })
    )
    .query(async ({ input }) => {
      return calculateFeasibility(input as SimpleFeasibilityInput);
    }),

  feasibilityReport: protectedProcedure
    .input(
      z.object({
        projectName: z.string().min(1),
        landCost: z.number().positive(),
        constructionCost: z.number().positive(),
        designFee: z.number().positive(),
        financeCost: z.number().positive(),
        taxAndFee: z.number().positive(),
        otherCost: z.number().positive(),
        totalUnits: z.number().positive(),
        avgSalePrice: z.number().positive(),
        projectMonths: z.number().positive(),
      })
    )
    .query(async ({ input }) => {
      const result = calculateFeasibility(input as SimpleFeasibilityInput);
      return formatSimpleFeasibilityReport(result, input as SimpleFeasibilityInput);
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

  deals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const auth = await googleAuthManager.getAuthenticatedClient(String(ctx.user.id));
      return listDeals(auth, spreadsheetIdFromEnv());
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const auth = await googleAuthManager.getAuthenticatedClient(String(ctx.user.id));
        return getDeal(auth, spreadsheetIdFromEnv(), input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectName: z.string().min(1),
        location: z.string().default(""),
        stage: z.enum(["discovery", "review", "dueDiligence", "contract", "construction", "completion"]),
        amount: z.number().default(0),
        manager: z.string().default(""),
        memo: z.string().default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        const auth = await googleAuthManager.getAuthenticatedClient(String(ctx.user.id));
        return createDeal(auth, spreadsheetIdFromEnv(), input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string().min(1),
        updates: z.object({
          projectName: z.string().optional(),
          location: z.string().optional(),
          stage: z.enum(["discovery", "review", "dueDiligence", "contract", "construction", "completion"]).optional(),
          amount: z.number().optional(),
          manager: z.string().optional(),
          memo: z.string().optional(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const auth = await googleAuthManager.getAuthenticatedClient(String(ctx.user.id));
        return updateDeal(auth, spreadsheetIdFromEnv(), input.id, input.updates);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const auth = await googleAuthManager.getAuthenticatedClient(String(ctx.user.id));
        return deleteDeal(auth, spreadsheetIdFromEnv(), input.id);
      }),
  }),

  // MODIFIED: Add simplified public data API procedures
  landUse: protectedProcedure
    .input(z.object({ pnu: z.string().min(1) }))
    .query(async ({ input }) => {
      return getLandUseRegulation(input.pnu);
    }),

  landPrice: protectedProcedure
    .input(z.object({ pnu: z.string().min(1), year: z.string().optional() }))
    .query(async ({ input }) => {
      return getLandPrice(input.pnu, input.year);
    }),

  realTransaction: protectedProcedure
    .input(z.object({ regionCode: z.string().min(1), yearMonth: z.string().regex(/^\d{6}$/) }))
    .query(async ({ input }) => {
      return getRealTransaction(input.regionCode, input.yearMonth);
    }),
});
