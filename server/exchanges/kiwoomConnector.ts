import axios from "axios";
import type { AxiosInstance } from "axios";

export interface KiwoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface KiwoomBalance {
  totalAsset: number;
  cashBalance: number;
  holdingAssets: number;
  holdings: KiwoomHolding[];
}

export interface KiwoomHolding {
  stockCode: string;
  stockName: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface KiwoomQuote {
  stockCode: string;
  stockName: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

export interface KiwoomOrderbook {
  stockCode: string;
  bids: KiwoomOrderbookLevel[];
  asks: KiwoomOrderbookLevel[];
}

export interface KiwoomOrderbookLevel {
  price: number;
  volume: number;
  quantityCount: number;
}

export interface KiwoomOrder {
  orderId: string;
  stockCode: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  orderType: "limit" | "market";
  status: string;
  filledQuantity: number;
  timestamp: string;
}

export interface KiwoomExecution {
  executionId: string;
  orderId: string;
  stockCode: string;
  side: "buy" | "sell";
  executedPrice: number;
  executedQuantity: number;
  executionTime: string;
  executionDate: string;
}

export class KiwoomConnector {
  private appKey: string;
  private appSecret: string;
  private accountNo: string;
  private apiClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor() {
    this.appKey = process.env.KIWOOM_APP_KEY || "";
    this.appSecret = process.env.KIWOOM_APP_SECRET || "";
    this.accountNo = process.env.KIWOOM_ACCOUNT_NO || "";

    this.apiClient = axios.create({
      baseURL: "https://openapi.kiwoom.com/",
      timeout: 10000,
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    try {
      const response = await this.apiClient.post<KiwoomTokenResponse>("oauth2/tokenP", {
        grant_type: "client_credentials",
        appkey: this.appKey,
        appsecret: this.appSecret,
      });

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiresAt = Date.now() + expiresIn * 1000;

      return this.accessToken;
    } catch (error) {
      throw this.handleError("토큰 발급", error);
    }
  }

  private async kiwoomRequest(
    method: string,
    path: string,
    trId: string,
    params?: Record<string, any>
  ): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const config: any = {
        method,
        url: path,
        headers: {
          authorization: `Bearer ${token}`,
          appkey: this.appKey,
          appsecret: this.appSecret,
          "tr-id": trId,
        },
      };

      if (method.toUpperCase() === "GET" && params) {
        config.params = params;
      } else if (method.toUpperCase() !== "GET" && params) {
        config.data = params;
      }

      const response = await this.apiClient.request(config);
      return response.data;
    } catch (error) {
      throw this.handleError(`${trId} API 호출`, error);
    }
  }

  async getBalance(): Promise<KiwoomBalance> {
    try {
      // TODO: 키움 API 문서에서 정확한 tr_id 확인 필요
      const response = await this.kiwoomRequest("GET", "uapi/domestic-stock/v1/trading/inquire-balance", "CTRP6414R", {
        CANO: this.accountNo.substring(0, 8),
        ACNT_PRDT_CD: this.accountNo.substring(8, 10),
      });

      const holdings: KiwoomHolding[] = [];
      let totalAsset = 0;
      let cashBalance = 0;

      if (response.output1) {
        cashBalance = Number(response.output1.dnca_tot_amt ?? 0);
        totalAsset = Number(response.output1.tot_asst_amt ?? 0);
      }

      if (Array.isArray(response.output2)) {
        response.output2.forEach((holding: any) => {
          holdings.push({
            stockCode: holding.pdno ?? "",
            stockName: holding.prdt_name ?? "",
            quantity: Number(holding.hldg_qty ?? 0),
            purchasePrice: Number(holding.pchs_avg_pric ?? 0),
            currentPrice: Number(holding.prpr ?? 0),
            unrealizedPnL: Number(holding.evlu_pfls_amt ?? 0),
            unrealizedPnLPercent: Number(holding.evlu_pfls_rt ?? 0),
          });
        });
      }

      return {
        totalAsset,
        cashBalance,
        holdingAssets: totalAsset - cashBalance,
        holdings,
      };
    } catch (error) {
      throw this.handleError("계좌 잔고 조회", error);
    }
  }

  async getQuote(stockCode: string): Promise<KiwoomQuote> {
    try {
      // TODO: 키움 API 문서에서 정확한 tr_id 확인 필요
      const response = await this.kiwoomRequest("GET", "uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", {
        fid_cond_mrkt_div_code: "J",
        fid_input_iscd: stockCode,
      });

      const output = response.output ?? {};

      return {
        stockCode,
        stockName: output.hts_kor_isnm ?? "",
        price: Number(output.stck_prpr ?? 0),
        change: Number(output.cntg_vrts ?? 0),
        changePercent: Number(output.prdy_ctrt ?? 0),
        volume: Number(output.acml_vol ?? 0),
        high: Number(output.stck_hgpr ?? 0),
        low: Number(output.stck_lwpr ?? 0),
        open: Number(output.stck_oprc ?? 0),
      };
    } catch (error) {
      throw this.handleError(`${stockCode} 현재가 조회`, error);
    }
  }

  async getOrderbook(stockCode: string): Promise<KiwoomOrderbook> {
    try {
      // TODO: 키움 API 문서에서 정확한 tr_id 확인 필요
      const response = await this.kiwoomRequest("GET", "uapi/domestic-stock/v1/quotations/inquire-orderbook", "FHKST01010200", {
        fid_cond_mrkt_div_code: "J",
        fid_input_iscd: stockCode,
      });

      const bids: KiwoomOrderbookLevel[] = [];
      const asks: KiwoomOrderbookLevel[] = [];

      if (response.output?.bid) {
        for (let i = 1; i <= 10; i++) {
          const level = (response.output.bid as any)[`bid${i}`];
          if (level) {
            bids.push({
              price: Number(level.price ?? 0),
              volume: Number(level.volume ?? 0),
              quantityCount: Number(level.cnt ?? 0),
            });
          }
        }
      }

      if (response.output?.ask) {
        for (let i = 1; i <= 10; i++) {
          const level = (response.output.ask as any)[`ask${i}`];
          if (level) {
            asks.push({
              price: Number(level.price ?? 0),
              volume: Number(level.volume ?? 0),
              quantityCount: Number(level.cnt ?? 0),
            });
          }
        }
      }

      return { stockCode, bids, asks };
    } catch (error) {
      throw this.handleError(`${stockCode} 호가 조회`, error);
    }
  }

  async placeOrder(params: {
    stockCode: string;
    side: "buy" | "sell";
    qty: number;
    price: number;
    orderType: "limit" | "market";
  }): Promise<KiwoomOrder> {
    try {
      // TODO: 키움 API 문서에서 정확한 tr_id 확인 필요
      const response = await this.kiwoomRequest("POST", "uapi/domestic-stock/v1/trading/order-cash", "TTTC0802U", {
        CANO: this.accountNo.substring(0, 8),
        ACNT_PRDT_CD: this.accountNo.substring(8, 10),
        PDNO: params.stockCode,
        ORD_QTY: params.qty,
        ORD_UNPR: params.price,
      });

      const output = response.output ?? {};

      return {
        orderId: output.odno ?? "",
        stockCode: params.stockCode,
        side: params.side,
        quantity: params.qty,
        price: params.price,
        orderType: params.orderType,
        status: "접수",
        filledQuantity: 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw this.handleError(`${params.stockCode} 주문 실패`, error);
    }
  }

  async getExecutions(startDate?: string, endDate?: string): Promise<KiwoomExecution[]> {
    try {
      // TODO: 키움 API 문서에서 정확한 tr_id 확인 필요
      const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0].replace(/-/g, "");

      const response = await this.kiwoomRequest("GET", "uapi/domestic-stock/v1/trading/inquire-daily-ccld", "TTTC8434R", {
        CANO: this.accountNo.substring(0, 8),
        ACNT_PRDT_CD: this.accountNo.substring(8, 10),
        INQR_STRT_DT: startDate ?? thirtyDaysAgo,
        INQR_END_DT: endDate ?? today,
      });

      const executions: KiwoomExecution[] = [];

      if (Array.isArray(response.output)) {
        response.output.forEach((exec: any) => {
          executions.push({
            executionId: exec.ccld_dvsn_name ?? "",
            orderId: exec.odno ?? "",
            stockCode: exec.pdno ?? "",
            side: exec.sll_buy_dvsn_cd === "02" ? "buy" : "sell",
            executedPrice: Number(exec.ccld_prc ?? 0),
            executedQuantity: Number(exec.ccld_qty ?? 0),
            executionTime: exec.ccld_tm ?? "",
            executionDate: exec.ccld_dt ?? "",
          });
        });
      }

      return executions;
    } catch (error) {
      throw this.handleError("체결 내역 조회", error);
    }
  }

  private handleError(context: string, error: unknown): Error {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        this.accessToken = null;
        this.tokenExpiresAt = null;
        return new Error(`키움 인증 만료 (${context}): 토큰을 재발급했습니다.`);
      }
      if (error.response?.status === 403) {
        return new Error(`키움 권한 오류 (${context}): API 사용 권한을 확인하세요.`);
      }
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        return new Error(`키움 네트워크 오류 (${context}): 연결을 확인하세요.`);
      }
      const message = error.response?.data?.msg ?? error.message ?? "알 수 없는 오류";
      return new Error(`키움 ${context}: ${message}`);
    }
    if (error instanceof Error) {
      return new Error(`키움 ${context}: ${error.message}`);
    }
    return new Error(`키움 ${context}: 알 수 없는 오류`);
  }
}

export const kiwoomConnector = new KiwoomConnector();
