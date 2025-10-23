import type { RecommendationsResponse } from "@/types/recommendations";

const API_BASE_URL = "https://tx-recs-worker-production.up.railway.app";
const CACHE_KEY_PREFIX = "swap-recommendations";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedResponse {
  data: RecommendationsResponse;
  timestamp: number;
}

export class RecommendationsService {
  /**
   * Fetch recommendations for a wallet address
   * Automatically caches responses for 24 hours in localStorage
   */
  static async getRecommendations(address: string): Promise<RecommendationsResponse> {
    const normalizedAddress = address.toLowerCase();
    const cacheKey = `${CACHE_KEY_PREFIX}:${normalizedAddress}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log("[Recommendations] Cache hit:", normalizedAddress);
      return cached;
    }

    console.log("[Recommendations] Cache miss, fetching from API:", normalizedAddress);

    // Fetch from API
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

    // Cache the response
    this.saveToCache(cacheKey, data);

    return data;
  }

  /**
   * Get cached recommendations if not expired
   */
  private static getFromCache(key: string): RecommendationsResponse | null {
    if (typeof window === "undefined") return null;

    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const parsed: CachedResponse = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      if (age > CACHE_TTL_MS) {
        // Expired, remove it
        localStorage.removeItem(key);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error("[Recommendations] Cache read error:", error);
      return null;
    }
  }

  /**
   * Save recommendations to cache
   */
  private static saveToCache(key: string, data: RecommendationsResponse): void {
    if (typeof window === "undefined") return;

    try {
      const cached: CachedResponse = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(cached));
    } catch (error) {
      console.error("[Recommendations] Cache write error:", error);
      // Silently fail if localStorage is full or unavailable
    }
  }

  /**
   * Clear cached recommendations for an address
   */
  static clearCache(address: string): void {
    if (typeof window === "undefined") return;

    const normalizedAddress = address.toLowerCase();
    const cacheKey = `${CACHE_KEY_PREFIX}:${normalizedAddress}`;
    localStorage.removeItem(cacheKey);
  }

  /**
   * Clear all cached recommendations
   */
  static clearAllCache(): void {
    if (typeof window === "undefined") return;

    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter((k) => k.startsWith(CACHE_KEY_PREFIX));
      recommendationKeys.forEach((k) => localStorage.removeItem(k));
    } catch (error) {
      console.error("[Recommendations] Failed to clear cache:", error);
    }
  }
}
