"""Build an idempotent SQL import from the legacy Shoronpo workbook."""

from __future__ import annotations

import argparse
import datetime as dt
import decimal
from pathlib import Path

import openpyxl


HISTORICO_HEADERS = (
    "Quincena", "Fecha", "Familia", "Producto", "Unidad", "Cant. teorica",
    "Cant. real", "Desviacion", "% Desviacion", "Coste teorico",
    "Coste real", "Impacto", "Estado",
)
CONC_HEADERS = (
    "Semana", "Producto", "Familia", "Causa", "Cantidad", "Unidad",
    "Comentario", "Fecha", "ID",
)


def sql(value):
    if value is None or value == "":
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float, decimal.Decimal)):
        return format(decimal.Decimal(str(value)), "f")
    if isinstance(value, (dt.datetime, dt.date)):
        value = value.isoformat()
    return "'" + str(value).replace("'", "''") + "'"


def rows(sheet, headers):
    values = list(sheet.iter_rows(values_only=True))
    if not values or tuple(values[0]) != headers:
        raise ValueError(f"Encabezados inesperados en {sheet.title}: {values[0] if values else 'vacía'}")
    return [dict(zip(headers, row)) for row in values[1:] if any(v not in (None, "") for v in row)]


def values_sql(records, columns):
    return ",\n".join("(" + ",".join(sql(row[column]) for column in columns) + ")" for row in records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--location-code", default="OBR-TEST")
    args = parser.parse_args()

    workbook = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    historical = rows(workbook["Historico"], HISTORICO_HEADERS)
    reconciliations = rows(workbook["Conciliaciones"], CONC_HEADERS)

    period_product = [(str(r["Quincena"]).strip(), str(r["Producto"]).strip()) for r in historical]
    if len(period_product) != len(set(period_product)):
        raise ValueError("Hay productos duplicados dentro de un mismo período.")
    reconciliation_ids = [str(r["ID"]).strip() for r in reconciliations]
    if len(reconciliation_ids) != len(set(reconciliation_ids)):
        raise ValueError("Hay IDs de conciliación duplicados.")
    missing = [(r["Semana"], r["Producto"]) for r in reconciliations if (str(r["Semana"]).strip(), str(r["Producto"]).strip()) not in set(period_product)]
    if missing:
        raise ValueError(f"Conciliaciones sin línea histórica: {missing}")

    products = {}
    periods = {}
    for row in historical:
        name = str(row["Producto"]).strip()
        candidate = (str(row["Familia"]).strip(), str(row["Unidad"]).strip())
        if name in products and products[name] != candidate:
            raise ValueError(f"Familia/unidad inconsistente para {name}: {products[name]} vs {candidate}")
        products[name] = candidate
        label = str(row["Quincena"]).strip()
        periods.setdefault(label, row["Fecha"])

    product_rows = [{"name": k, "family": v[0], "unit": v[1]} for k, v in sorted(products.items())]
    period_rows = [{"label": k, "recorded_at": v} for k, v in periods.items()]
    hcols = ("Quincena", "Producto", "Cant. teorica", "Cant. real", "Desviacion", "% Desviacion", "Coste teorico", "Coste real", "Impacto", "Estado")
    ccols = ("ID", "Semana", "Producto", "Causa", "Cantidad", "Comentario", "Fecha")

    output = f"""-- Generado desde {args.workbook.name}. No contiene secretos.
begin;

create temporary table import_products(name text, family text, unit text) on commit drop;
insert into import_products values
{values_sql(product_rows, ('name', 'family', 'unit'))};

create temporary table import_periods(label text, recorded_at timestamptz) on commit drop;
insert into import_periods values
{values_sql(period_rows, ('label', 'recorded_at'))};

create temporary table import_lines(period_label text, product_name text, theoretical_quantity numeric, actual_quantity numeric, deviation_quantity numeric, deviation_pct numeric, theoretical_cost numeric, actual_cost numeric, impact numeric, deviation_status public.inventory_deviation_status) on commit drop;
insert into import_lines values
{values_sql(historical, hcols)};

create temporary table import_reconciliations(id uuid, period_label text, product_name text, cause text, quantity numeric, comment text, occurred_at timestamptz) on commit drop;
insert into import_reconciliations values
{values_sql(reconciliations, ccols)};

do $$ begin
  if not exists (select 1 from public.locations where code={sql(args.location_code)} and is_active) then
    raise exception 'No existe la ubicación activa %', {sql(args.location_code)};
  end if;
end $$;

insert into public.products(name,family,unit)
select name,family,unit from import_products
on conflict(normalized_name) do update set family=excluded.family,unit=excluded.unit,is_active=true;

insert into public.inventory_periods(location_id,label,recorded_at,status,source)
select l.id,p.label,p.recorded_at,'CLOSED','SHEETS_IMPORT'
from import_periods p cross join public.locations l where l.code={sql(args.location_code)}
on conflict(location_id,label) do update set recorded_at=excluded.recorded_at,status='CLOSED',source='SHEETS_IMPORT';

insert into public.inventory_lines(period_id,product_id,theoretical_quantity,actual_quantity,deviation_quantity,deviation_pct,theoretical_cost,actual_cost,impact,deviation_status)
select ip.id,p.id,s.theoretical_quantity,s.actual_quantity,s.deviation_quantity,s.deviation_pct,s.theoretical_cost,s.actual_cost,s.impact,s.deviation_status
from import_lines s
join public.products p on p.normalized_name=lower(trim(s.product_name))
join public.inventory_periods ip on ip.label=s.period_label
join public.locations l on l.id=ip.location_id and l.code={sql(args.location_code)}
on conflict(period_id,product_id) do update set
 theoretical_quantity=excluded.theoretical_quantity,actual_quantity=excluded.actual_quantity,
 deviation_quantity=excluded.deviation_quantity,deviation_pct=excluded.deviation_pct,
 theoretical_cost=excluded.theoretical_cost,actual_cost=excluded.actual_cost,
 impact=excluded.impact,deviation_status=excluded.deviation_status;

insert into public.inventory_reconciliations(id,inventory_line_id,cause,quantity,comment,occurred_at)
select s.id,il.id,s.cause,s.quantity,s.comment,s.occurred_at
from import_reconciliations s
join public.products p on p.normalized_name=lower(trim(s.product_name))
join public.inventory_periods ip on ip.label=s.period_label
join public.locations l on l.id=ip.location_id and l.code={sql(args.location_code)}
join public.inventory_lines il on il.period_id=ip.id and il.product_id=p.id
on conflict(id) do update set cause=excluded.cause,quantity=excluded.quantity,comment=excluded.comment,occurred_at=excluded.occurred_at;

do $$ declare v_products int; v_periods int; v_lines int; v_reconciliations int; begin
 select count(*) into v_products from import_products;
 select count(*) into v_periods from import_periods;
 select count(*) into v_lines from import_lines;
 select count(*) into v_reconciliations from import_reconciliations;
 if v_products<>40 or v_periods<>6 or v_lines<>236 or v_reconciliations<>6 then
   raise exception 'Conteos inesperados: productos %, períodos %, líneas %, conciliaciones %',v_products,v_periods,v_lines,v_reconciliations;
 end if;
end $$;

commit;
"""
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8", newline="\n")
    print(f"products={len(product_rows)} periods={len(period_rows)} lines={len(historical)} reconciliations={len(reconciliations)}")


if __name__ == "__main__":
    main()
