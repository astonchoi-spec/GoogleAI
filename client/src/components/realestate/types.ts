export type DealStage = string;

export type Deal = {
  id: string;
  name: string;
  projectName?: string;
  location: string;
  stage: DealStage;
  amount?: number;
  totalProjectCost?: number;
  loanAmount: number;
  ltv: number;
  equityAmount?: number;
  lenders?: string;
  sponsor?: string;
  nextMilestone?: string;
  nextMilestoneDate?: string;
  notes?: string;
  memo?: string;
};
