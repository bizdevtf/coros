/**
 * Authenticated HTTP client for the (unofficial) COROS Training Hub API.
 *
 * Handles login (MD5-hashed password, matching the Training Hub web app),
 * access-token caching, and one automatic re-login + retry when a request
 * fails — which covers expired tokens without needing to know every
 * error code the API can return.
 */

import { createHash } from "node:crypto";
import { COROS_OK_RESULT, REGION_BASE_URLS } from "../constants.js";

export class CorosApiError extends Error {
  constructor(
    message: string,
    public readonly resultCode?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "CorosApiError";
  }
}

interface CorosEnvelope {
  result?: string;
  message?: string;
  data?: unknown;
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export class CorosClient {
  private token: string | null = null;
  private readonly baseUrl: string;

  /**
   * @param password  Plaintext password, or a pre-computed 32-char MD5 hex
   *                  digest when `passwordIsMd5` is true — so the plaintext
   *                  never has to be shared or stored.
   */
  constructor(
    private readonly email: string,
    private readonly password: string,
    baseUrl?: string,
    private readonly passwordIsMd5 = false,
  ) {
    this.baseUrl = (baseUrl ?? REGION_BASE_URLS.global).replace(/\/+$/, "");
  }

  private async httpJson(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions = {},
    withAuth = true,
  ): Promise<CorosEnvelope> {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (withAuth && this.token) {
      headers["accessToken"] = this.token;
      headers["Cookie"] = `CPL-coros-token=${this.token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new CorosApiError(`Network error calling COROS API: ${reason}`);
    }

    if (!response.ok) {
      throw new CorosApiError(
        `COROS API returned HTTP ${response.status} for ${path}`,
        undefined,
        response.status,
      );
    }

    let json: CorosEnvelope;
    try {
      json = (await response.json()) as CorosEnvelope;
    } catch {
      throw new CorosApiError(`COROS API returned a non-JSON response for ${path}`);
    }
    return json;
  }

  async login(): Promise<void> {
    const pwd = this.passwordIsMd5
      ? this.password.toLowerCase()
      : createHash("md5").update(this.password).digest("hex");
    const envelope = await this.httpJson(
      "POST",
      "/account/login",
      { body: { account: this.email, accountType: 2, pwd } },
      false,
    );

    if (envelope.result !== COROS_OK_RESULT) {
      throw new CorosApiError(
        `COROS login failed: ${envelope.message ?? "unknown error"} ` +
          `(result=${envelope.result}). Check COROS_EMAIL / COROS_PASSWORD, ` +
          `and COROS_REGION if your account is on the EU or CN server.`,
        envelope.result,
      );
    }

    const data = envelope.data as { accessToken?: string; access_token?: string } | undefined;
    const token = data?.accessToken ?? data?.access_token;
    if (!token) {
      throw new CorosApiError("COROS login succeeded but no access token was returned.");
    }
    this.token = token;
  }

  /**
   * Perform an authenticated request and return the envelope's `data` payload.
   * On any API-level failure the token is refreshed once and the request retried,
   * which transparently recovers from expired sessions.
   */
  async request(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions = {},
    retryOnFailure = true,
  ): Promise<unknown> {
    if (!this.token) await this.login();

    const envelope = await this.httpJson(method, path, options);
    if (envelope.result !== COROS_OK_RESULT) {
      if (retryOnFailure) {
        this.token = null;
        return this.request(method, path, options, false);
      }
      throw new CorosApiError(
        `COROS API error on ${path}: ${envelope.message ?? "unknown error"} ` +
          `(result=${envelope.result})`,
        envelope.result,
      );
    }
    return envelope.data;
  }
}
