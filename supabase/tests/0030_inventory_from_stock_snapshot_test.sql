begin;
select set_config('request.jwt.claim.sub',(
  select p.user_id::text from public.profiles p
  join public.user_roles ur on ur.user_id=p.user_id
  join public.roles r on r.id=ur.role_id
  where p.is_active and r.code='ADMINISTRADOR' limit 1
),true);
set local role authenticated;

do $$
declare n integer; v_period_id uuid; v_lines jsonb; v_run_id uuid;
begin
  select count(*) into n from public.get_latest_inventory_snapshot('10000000-0000-0000-0000-000000000001');
  if n<>40 then raise exception 'Se esperaban 40 productos de Elaborados y llegaron %',n; end if;

  if exists(select 1 from public.get_latest_inventory_snapshot('10000000-0000-0000-0000-000000000001') where theoretical_quantity is null or theoretical_cost is null) then
    raise exception 'La precarga contiene cantidad o coste nulos.';
  end if;

  select (array_agg(snapshot_run_id))[1],jsonb_agg(jsonb_build_object(
    'product_name',product_name,'theoretical_quantity',theoretical_quantity,
    'actual_quantity',theoretical_quantity,'theoretical_cost',theoretical_cost
  )) into v_run_id,v_lines
  from public.get_latest_inventory_snapshot('10000000-0000-0000-0000-000000000001');
  v_period_id:=public.close_inventory_period(
    '10000000-0000-0000-0000-000000000001','TEST SNAPSHOT 0030',now(),v_lines,v_run_id
  );
  select count(*) into n from public.inventory_lines where period_id=v_period_id;
  if n<>40 then raise exception 'El cierre debía crear 40 líneas y creó %',n; end if;
  if (select source from public.inventory_periods where id=v_period_id)<>'TSPOON_SNAPSHOT' then
    raise exception 'El cierre no conservó el origen del snapshot.';
  end if;
end $$;

rollback;
