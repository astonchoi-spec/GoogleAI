import fs from "node:fs/promises";
import path from "node:path";

export type AssetClass = "coin" | "kr-stock" | "us-stock" | "futures" | "default";

export type RiskSettings = {
  dailyLossLimitPercent: number;
  consecutiveLossWarn: number;
  consecutiveLossBlock: number;
  leverageCaps: Record<AssetClass, number>;
  defaultRiskPercent: number;
};

export type DailyPnlRecord = {
  date: string; // YYYY-MM-DD (KST)
  realizedPnl: number;
  startingBalance: number;
  losses: number;
  wins: number;
};

export type RiskState = {
  settings: RiskSettings;
  daily: DailyPnlRecord;
  consecutiveLosses: number;
  manualLock: { locked: boolean; reason?: string; since?: string };
  lastUpdated: string;
};

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  dailyLossLimitPercent: 3,
  consecutiveLossWarn: 2,
  consecutiveLossBlock: 3,
  leverageCaps: {
    coin: 5,
    "kr-stock": 1,
    "us-stock": 1,
    futures: 10,
    default: 1,
  },
  defaultRiskPercent: 2,
};

function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function defaultState(): RiskState {
  return {
    settings: { ...DEFAULT_RISK_SETTINGS, leverageCaps: { ...DEFAULT_RISK_SETTINGS.leverageCaps } },
    daily: {
      date: todayKst(),
      realizedPnl: 0,
      startingBalance: 0,
      losses: 0,
      wins: 0,
    },
    consecutiveLosses: 0,
    manualLock: { locked: false },
    lastUpdated: new Date().toISOString(),
  };
}

export interface RiskStore {
  getState(): Promise<RiskState>;
  saveState(state: RiskState): Promise<void>;
  updateSettings(partial: Partial<RiskSettings>): Promise<RiskState>;
  recordTradeResult(args: { pnl: number; isLoss: boolean; balance?: number }): Promise<RiskState>;
  setLock(locked: boolean, reason?: string): Promise<RiskState>;
  resetDaily(balance?: number): Promise<RiskState>;
}

export class JsonRiskStore implements RiskStore {
  private cache: RiskState | null = null;
  private writing: Promise<void> | null = null;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getState(): Promise<RiskState> {
    if (this.cache) return this.rolloverIfNeeded(this.cache);
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as RiskState;
      this.cache = parsed;
    } catch {
      this.cache = defaultState();
      await this.persist(this.cache);
    }
    return this.rolloverIfNeeded(this.cache);
  }

  async saveState(state: RiskState): Promise<void> {
    this.cache = state;
    await this.persist(state);
  }

  async updateSettings(partial: Partial<RiskSettings>): Promise<RiskState> {
    const state = await this.getState();
    const merged: RiskSettings = {
      ...state.settings,
      ...partial,
      leverageCaps: { ...state.settings.leverageCaps, ...(partial.leverageCaps ?? {}) },
    };
    const next: RiskState = { ...state, settings: merged, lastUpdated: new Date().toISOString() };
    await this.saveState(next);
    return next;
  }

  async recordTradeResult(args: { pnl: number; isLoss: boolean; balance?: number }): Promise<RiskState> {
    const state = await this.getState();
    const daily: DailyPnlRecord = {
      ...state.daily,
      realizedPnl: state.daily.realizedPnl + args.pnl,
      startingBalance:
        state.daily.startingBalance > 0 ? state.daily.startingBalance : args.balance ?? 0,
      losses: state.daily.losses + (args.isLoss ? 1 : 0),
      wins: state.daily.wins + (!args.isLoss ? 1 : 0),
    };
    const consecutiveLosses = args.isLoss ? state.consecutiveLosses + 1 : 0;
    const next: RiskState = { ...state, daily, consecutiveLosses, lastUpdated: new Date().toISOString() };
    await this.saveState(next);
    return next;
  }

  async setLock(locked: boolean, reason?: string): Promise<RiskState> {
    const state = await this.getState();
    const next: RiskState = {
      ...state,
      manualLock: { locked, reason, since: locked ? new Date().toISOString() : undefined },
      lastUpdated: new Date().toISOString(),
    };
    await this.saveState(next);
    return next;
  }

  async resetDaily(balance?: number): Promise<RiskState> {
    const state = await this.getState();
    const next: RiskState = {
      ...state,
      daily: {
        date: todayKst(),
        realizedPnl: 0,
        startingBalance: balance ?? state.daily.startingBalance,
        losses: 0,
        wins: 0,
      },
      lastUpdated: new Date().toISOString(),
    };
    await this.saveState(next);
    return next;
  }

  private async rolloverIfNeeded(state: RiskState): Promise<RiskState> {
    const today = todayKst();
    if (state.daily.date === today) return state;
    const next: RiskState = {
      ...state,
      daily: {
        date: today,
        realizedPnl: 0,
        startingBalance: state.daily.startingBalance,
        losses: 0,
        wins: 0,
      },
      lastUpdated: new Date().toISOString(),
    };
    await this.saveState(next);
    return next;
  }

  private async persist(state: RiskState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const data = JSON.stringify(state, null, 2);
    if (this.writing) await this.writing;
    this.writing = (async () => {
      await fs.writeFile(tmp, data, "utf-8");
      await fs.rename(tmp, this.filePath);
    })();
    await this.writing;
    this.writing = null;
  }
}

export class MemoryRiskStore implements RiskStore {
  private state: RiskState = defaultState();

  async getState(): Promise<RiskState> {
    const today = todayKst();
    if (this.state.daily.date !== today) {
      this.state = {
        ...this.state,
        daily: {
          date: today,
          realizedPnl: 0,
          startingBalance: this.state.daily.startingBalance,
          losses: 0,
          wins: 0,
        },
      };
    }
    return this.state;
  }

  async saveState(state: RiskState): Promise<void> {
    this.state = state;
  }

  async updateSettings(partial: Partial<RiskSettings>): Promise<RiskState> {
    const state = await this.getState();
    const merged: RiskSettings = {
      ...state.settings,
      ...partial,
      leverageCaps: { ...state.settings.leverageCaps, ...(partial.leverageCaps ?? {}) },
    };
    this.state = { ...state, settings: merged, lastUpdated: new Date().toISOString() };
    return this.state;
  }

  async recordTradeResult(args: { pnl: number; isLoss: boolean; balance?: number }): Promise<RiskState> {
    const state = await this.getState();
    this.state = {
      ...state,
      daily: {
        ...state.daily,
        realizedPnl: state.daily.realizedPnl + args.pnl,
        startingBalance: state.daily.startingBalance > 0 ? state.daily.startingBalance : args.balance ?? 0,
        losses: state.daily.losses + (args.isLoss ? 1 : 0),
        wins: state.daily.wins + (!args.isLoss ? 1 : 0),
      },
      consecutiveLosses: args.isLoss ? state.consecutiveLosses + 1 : 0,
      lastUpdated: new Date().toISOString(),
    };
    return this.state;
  }

  async setLock(locked: boolean, reason?: string): Promise<RiskState> {
    const state = await this.getState();
    this.state = {
      ...state,
      manualLock: { locked, reason, since: locked ? new Date().toISOString() : undefined },
      lastUpdated: new Date().toISOString(),
    };
    return this.state;
  }

  async resetDaily(balance?: number): Promise<RiskState> {
    const state = await this.getState();
    this.state = {
      ...state,
      daily: {
        date: todayKst(),
        realizedPnl: 0,
        startingBalance: balance ?? state.daily.startingBalance,
        losses: 0,
        wins: 0,
      },
    };
    return this.state;
  }
}

const RISK_STORE_PATH = path.resolve(process.cwd(), "data", "risk-state.json");
export const riskStore: RiskStore = new JsonRiskStore(RISK_STORE_PATH);
