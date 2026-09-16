import { TspoonlabError } from "./tspoonlab-client.ts";
type R = Record<string, unknown>;
const obj = (v: unknown, l: string): R => {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new TspoonlabError(`${l} invalido`, "INVALID_RESPONSE");
  }
  return v as R;
};
const req = (v: unknown, l: string) => {
  if (typeof v !== "string" || !v.trim()) {
    throw new TspoonlabError(`${l} invalido`, "INVALID_RESPONSE");
  }
  return v.trim();
};
const opt = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const number = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? null
    : Number.isFinite(Number(v))
    ? Number(v)
    : null;
const iso = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function mapOrder(detailInput: unknown, runId: string) {
  const d = obj(detailInput, "pedido");
  return {
    external_id: req(d.id, "pedido.id"),
    description: req(d.descr, "pedido.descr"),
    generated_at: iso(d.dateGenerated ?? d.data),
    currency: opt(d.currency),
    total_cost: number(d.cost),
    is_locked: d.locked === true,
    last_run_id: runId,
    synced_at: new Date().toISOString(),
  };
}

export function mapDeliveries(detailInput: unknown, runId: string) {
  const d = obj(detailInput, "pedido");
  const orderId = req(d.id, "pedido.id");
  if (!Array.isArray(d.listComandes)) {
    throw new TspoonlabError("entregas invalidas", "INVALID_RESPONSE");
  }
  return d.listComandes.map((v) => {
    const x = obj(v, "entrega");
    const customer = x.customer && typeof x.customer === "object"
      ? x.customer as R
      : {};
    return {
      external_id: `${orderId}:${req(x.id, "entrega.id")}`,
      order_external_id: orderId,
      customer_external_id: opt(customer.id ?? x.idCustomerVenda),
      customer_name: opt(customer.descr),
      responsible: opt(x.responsable),
      generated_at: iso(x.dateGenerated ?? x.date),
      reception_at: iso(x.dateReception),
      is_closed: x.closed === true,
      total_cost: number(x.cost),
      last_run_id: runId,
      synced_at: new Date().toISOString(),
    };
  });
}

export function mapOrderLines(
  deliveryInput: unknown,
  runId: string,
  orderExternalId?: string,
) {
  const d = obj(deliveryInput, "entrega");
  const rawDeliveryId = req(d.id, "entrega.id");
  const deliveryId = orderExternalId
    ? `${req(orderExternalId, "pedido.id")}:${rawDeliveryId}`
    : rawDeliveryId;
  if (!Array.isArray(d.listComponents)) {
    throw new TspoonlabError("lineas invalidas", "INVALID_RESPONSE");
  }
  return d.listComponents.map((v) => {
    const x = obj(v, "linea");
    const lots = Array.isArray(x.listLots)
      ? x.listLots.map((l) => typeof l === "string" ? l : opt((l as R)?.descr))
        .filter(Boolean)
      : [];
    return {
      delivery_external_id: deliveryId,
      line_external_id: req(x.id, "linea.id"),
      component_external_id: req(x.idComponent, "linea.idComponent"),
      description: req(x.descr, "linea.descr"),
      quantity: number(x.quantity),
      unit_external_id: opt(x.idUnit),
      unit_name: opt(x.unit),
      store_external_id: opt(x.idStore),
      store_name: opt(x.store),
      unit_cost: number(x.costUnit),
      is_sent: x.enviat === true,
      lots,
      last_run_id: runId,
      synced_at: new Date().toISOString(),
    };
  });
}
