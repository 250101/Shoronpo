const DEFAULT_BASE_URL = "https://app.tspoonlab.com/recipes/api";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type ConnectorCode =
  | "AUTH_EXPIRED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "HTTP_ERROR";

export class TspoonlabError extends Error {
  readonly code: ConnectorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: ConnectorCode,
    status?: number,
    retryable = false,
  ) {
    super(message);
    this.name = "TspoonlabError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class TspoonlabClient {
  #rememberme: string;
  readonly options: {
    baseUrl?: string;
    timezone?: string;
    timeoutMs?: number;
    maxRetries?: number;
    baseDelayMs?: number;
    fetchImpl?: typeof fetch;
  };

  constructor(
    rememberme: string,
    options: {
      baseUrl?: string;
      timezone?: string;
      timeoutMs?: number;
      maxRetries?: number;
      baseDelayMs?: number;
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    if (!rememberme) {
      throw new TspoonlabError(
        "Sesion no configurada",
        "AUTH_EXPIRED",
        401,
      );
    }
    this.#rememberme = rememberme;
    this.options = options;
  }

  async get(path: string, query: Record<string, unknown> = {}) {
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      "",
    );
    const url = new URL(`${baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const maxRetries = this.options.maxRetries ?? 2;
    const baseDelayMs = this.options.baseDelayMs ?? 500;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: {
            rememberme: this.#rememberme,
            accept: "application/json",
            language: "es",
            timezone: this.options.timezone ?? "Europe/Madrid",
            source: "tspoonback-web",
          },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
        });
      } catch {
        if (attempt < maxRetries) {
          await sleep(baseDelayMs * (2 ** attempt));
          continue;
        }
        throw new TspoonlabError(
          "No se pudo conectar con tSpoonLab",
          "NETWORK_ERROR",
          undefined,
          true,
        );
      }

      const text = await response.text();
      if (response.ok) {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          throw new TspoonlabError(
            "Respuesta JSON invalida",
            "INVALID_RESPONSE",
            response.status,
          );
        }
      }

      const retryable = RETRYABLE_STATUS.has(response.status);
      if (retryable && attempt < maxRetries) {
        await sleep(baseDelayMs * (2 ** attempt));
        continue;
      }

      if (response.status === 401) {
        throw new TspoonlabError("Sesion vencida", "AUTH_EXPIRED", 401);
      }
      if (response.status === 403) {
        throw new TspoonlabError("Permiso rechazado", "FORBIDDEN", 403);
      }
      if (response.status === 429) {
        throw new TspoonlabError("Limite temporal", "RATE_LIMITED", 429, true);
      }
      if (response.status >= 500) {
        throw new TspoonlabError(
          "Servicio no disponible",
          "UPSTREAM_ERROR",
          response.status,
          true,
        );
      }
      throw new TspoonlabError(
        `HTTP ${response.status}`,
        "HTTP_ERROR",
        response.status,
      );
    }
  }

  async healthCheck() {
    const products = await this.get("listIngredientsPaged", {
      rows: 1,
      start: 0,
      filter: "",
    });
    if (!Array.isArray(products)) {
      throw new TspoonlabError(
        "Formato de productos inesperado",
        "INVALID_RESPONSE",
      );
    }
    return true;
  }

  async listStores() {
    const stores = await this.get("listStoresPaged", {
      rows: 100,
      start: 0,
      filter: "",
    });
    if (!Array.isArray(stores)) {
      throw new TspoonlabError(
        "Formato de almacenes inesperado",
        "INVALID_RESPONSE",
      );
    }
    return stores;
  }

  async getStock(storeId: string, limit = 5000) {
    if (!storeId) {
      throw new TspoonlabError("Almacen sin identificador", "INVALID_RESPONSE");
    }
    const stock = await this.get(
      `store/${
        encodeURIComponent(storeId)
      }/inventory/last/components/num/${limit}`,
    );
    if (
      !stock || typeof stock !== "object" || Array.isArray(stock) ||
      !Array.isArray((stock as { listComponent?: unknown }).listComponent)
    ) {
      throw new TspoonlabError(
        "Formato de existencias inesperado",
        "INVALID_RESPONSE",
      );
    }
    return stock as { listComponent: unknown[] };
  }

  async listProductions(searchType = 12, start = 0, rows = 100) {
    const data = await this.get("productionComponentList", {
      searchType,
      search: "",
      onlyDishes: false,
      includeFromPreviousDay: true,
      start,
      rows,
    });
    if (
      !data || typeof data !== "object" || Array.isArray(data) ||
      !Array.isArray((data as { listComponents?: unknown }).listComponents)
    ) {
      throw new TspoonlabError(
        "Formato de producciones inesperado",
        "INVALID_RESPONSE",
      );
    }
    return (data as { listComponents: Array<Record<string, unknown>> })
      .listComponents;
  }

  async getProduction(productionId: string) {
    if (!productionId) {
      throw new TspoonlabError(
        "Produccion sin identificador",
        "INVALID_RESPONSE",
      );
    }
    const data = await this.get(
      `productionComponent/${encodeURIComponent(productionId)}`,
    );
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TspoonlabError(
        "Formato de produccion inesperado",
        "INVALID_RESPONSE",
      );
    }
    return data;
  }

  async listOrders(start = 0, rows = 25) {
    const data = await this.get("listVendesPagedExt", {
      filter: "",
      start,
      rows,
      searchType: 0,
    });
    if (!Array.isArray(data)) {
      throw new TspoonlabError(
        "Formato de pedidos inesperado",
        "INVALID_RESPONSE",
      );
    }
    return data as Array<Record<string, unknown>>;
  }

  async getOrder(orderId: string, limit = 500) {
    if (!orderId) {
      throw new TspoonlabError("Pedido sin identificador", "INVALID_RESPONSE");
    }
    const data = await this.get(
      `venda/${encodeURIComponent(orderId)}/num/${limit}`,
      { orderByDescr: true },
    );
    if (
      !data || typeof data !== "object" || Array.isArray(data) ||
      !Array.isArray((data as { listComandes?: unknown }).listComandes)
    ) {
      throw new TspoonlabError(
        "Formato de pedido inesperado",
        "INVALID_RESPONSE",
      );
    }
    return data;
  }

  toJSON() {
    return { timezone: this.options.timezone ?? "Europe/Madrid" };
  }
}
