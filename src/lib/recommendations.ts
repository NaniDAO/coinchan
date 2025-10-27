import type { RecommendationsResponse } from "@/types/recommendations";

const API_BASE_URL = "https://tx-recs-worker-production.up.railway.app";

export class RecommendationsService {
  /**
   * Fetch recommendations for a wallet address
   * Note: Caching is handled by React Query, not at the service layer
   */
  static async getRecommendations(address: string): Promise<RecommendationsResponse> {
    const response = await fetch(`${API_BASE_URL}/v1/recommendations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Failed to fetch recommendations: ${error.error || error.details || response.statusText}`);
    }

    const data: RecommendationsResponse = await response.json();
    return data;
  }
}
