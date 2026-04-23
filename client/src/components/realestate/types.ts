export type DealStage = "소싱" | "심사" | "약정" | "실행" | "회수";

export type Deal = {
  id: string;
  name: string;
  location: string;
  amount: string;
  ltv: string;
  stage: DealStage;
  sponsor: string;
  memo: string;
};
