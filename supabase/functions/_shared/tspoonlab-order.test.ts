import assert from "node:assert/strict";
import test from "node:test";
import { mapDeliveries, mapOrder, mapOrderLines } from "./tspoonlab-order.ts";
const delivery = {
  id: "d1",
  customer: { id: "c1", descr: "Restaurante" },
  dateReception: 1789500000000,
  closed: true,
  listComponents: [{
    id: "l1",
    idComponent: "p1",
    descr: "Salsa",
    quantity: 2,
    enviat: true,
    listLots: [{ descr: "2026.09.16" }],
  }],
};
const order = {
  id: "o1",
  descr: "Pedido",
  dateGenerated: "2026-09-16T10:00:00Z",
  listComandes: [delivery],
};
test("normaliza pedido y entrega", () => {
  assert.equal(mapOrder(order, "r").external_id, "o1");
  assert.equal(mapDeliveries(order, "r")[0].customer_name, "Restaurante");
});
test("normaliza salida y lotes", () => {
  const x = mapOrderLines(delivery, "r")[0];
  assert.equal(x.is_sent, true);
  assert.deepEqual(x.lots, ["2026.09.16"]);
});
test("rechaza lineas sin identidad", () =>
  assert.throws(
    () => mapOrderLines({ ...delivery, listComponents: [{}] }, "r"),
    /linea.id/,
  ));
