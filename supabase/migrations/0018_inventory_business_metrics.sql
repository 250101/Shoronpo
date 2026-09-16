-- Fase 7: cálculos de negocio autoritativos en Postgres.

create or replace function public.inventory_deviation_status(p_deviation_pct numeric)
returns public.inventory_deviation_status
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when abs(p_deviation_pct) <= 0.02 then 'COINCIDE'::public.inventory_deviation_status
    when abs(p_deviation_pct) <= 0.15 then 'LEVE'::public.inventory_deviation_status
    else 'ELEVADA'::public.inventory_deviation_status
  end
$$;

create or replace function public.inventory_deviation_impact(
  p_theoretical_quantity numeric,
  p_actual_quantity numeric,
  p_deviation_quantity numeric,
  p_theoretical_cost numeric,
  p_actual_cost numeric
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    abs(
      case
        when abs(coalesce(p_deviation_quantity, 0)) > 0.000001 then p_deviation_quantity
        else coalesce(p_actual_quantity, 0) - coalesce(p_theoretical_quantity, 0)
      end
    ) *
    case
      when abs(coalesce(p_theoretical_quantity, 0)) > 0.000001
       and abs(coalesce(p_theoretical_cost, 0)) > 0.000001
        then abs(p_theoretical_cost / p_theoretical_quantity)
      when abs(coalesce(p_actual_quantity, 0)) > 0.000001
       and abs(coalesce(p_actual_cost, 0)) > 0.000001
        then abs(p_actual_cost / p_actual_quantity)
      else 0
    end,
    2
  )
$$;

create or replace function public.get_inventory_period_metrics(p_period_id uuid)
returns table (
  period_id uuid,
  total_products bigint,
  coincident_products bigint,
  slight_products bigint,
  elevated_products bigint,
  pending_products bigint,
  partial_products bigint,
  reconciled_products bigint,
  accuracy_pct integer,
  total_impact numeric,
  explained_impact numeric,
  unexplained_impact numeric,
  health_score integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible_lines as (
    select
      l.id,
      l.deviation_quantity,
      l.deviation_status,
      l.impact,
      coalesce(sum(r.quantity), 0) as explained_quantity
    from public.inventory_lines l
    join public.inventory_periods p on p.id = l.period_id
    left join public.inventory_reconciliations r on r.inventory_line_id = l.id
    where l.period_id = p_period_id
    group by l.id, l.deviation_quantity, l.deviation_status, l.impact
  ), classified as (
    select *,
      case
        when deviation_status = 'COINCIDE' then 'NOT_REQUIRED'
        when greatest(abs(deviation_quantity) - explained_quantity, 0) <= 0.01 then 'RECONCILED'
        when explained_quantity > 0 then 'PARTIAL'
        else 'PENDING'
      end as reconciliation_status,
      case
        when abs(deviation_quantity) > 0
          then least(1::numeric, explained_quantity / abs(deviation_quantity))
        else 0
      end as explained_ratio
    from visible_lines
  ), totals as (
    select
      count(*) as total_count,
      count(*) filter (where deviation_status = 'COINCIDE') as coincident_count,
      count(*) filter (where deviation_status = 'LEVE') as slight_count,
      count(*) filter (where deviation_status = 'ELEVADA') as elevated_count,
      count(*) filter (where reconciliation_status = 'PENDING') as pending_count,
      count(*) filter (where reconciliation_status = 'PARTIAL') as partial_count,
      count(*) filter (where reconciliation_status = 'RECONCILED') as reconciled_count,
      coalesce(sum(impact) filter (where deviation_status <> 'COINCIDE'), 0) as impact_total,
      coalesce(sum(impact * explained_ratio) filter (where deviation_status <> 'COINCIDE'), 0) as impact_explained,
      coalesce(sum(impact * (1 - explained_ratio)) filter (where deviation_status <> 'COINCIDE'), 0) as impact_unexplained,
      coalesce(sum(
        case
          when reconciliation_status = 'PENDING' and deviation_status = 'ELEVADA' then 60
          when reconciliation_status = 'PARTIAL' and deviation_status = 'ELEVADA' then 30
          when reconciliation_status = 'PENDING' and deviation_status = 'LEVE' then 25
          when reconciliation_status = 'PARTIAL' and deviation_status = 'LEVE' then 12.5
          else 0
        end
      ), 0) as penalty
    from classified
  )
  select
    p_period_id,
    total_count,
    coincident_count,
    slight_count,
    elevated_count,
    pending_count,
    partial_count,
    reconciled_count,
    case when total_count = 0 then 0 else round(coincident_count::numeric / total_count * 100)::integer end,
    round(impact_total, 2),
    round(impact_explained, 2),
    round(impact_unexplained, 2),
    case when total_count = 0 then 0 else greatest(0, round(100 - penalty / total_count)::integer) end
  from totals
$$;

revoke all on function public.inventory_deviation_status(numeric) from public, anon;
revoke all on function public.inventory_deviation_impact(numeric,numeric,numeric,numeric,numeric) from public, anon;
revoke all on function public.get_inventory_period_metrics(uuid) from public, anon;

grant execute on function public.inventory_deviation_status(numeric) to authenticated, service_role;
grant execute on function public.inventory_deviation_impact(numeric,numeric,numeric,numeric,numeric) to authenticated, service_role;
grant execute on function public.get_inventory_period_metrics(uuid) to authenticated, service_role;
