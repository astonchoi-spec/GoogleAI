export type DealStage = string;

export type Deal = {
  id: string;
  projectName: string;
  location: string;
  stage: DealStage;
  totalProjectCost: number;
  loanAmount: number;
  ltv: number;
  equityAmount: number;
  lenders: string;
  nextMilestone: string;
  nextMilestoneDate: string;
  notes: string;
};
