begin;

do $$
declare
  v_run uuid;
  v_count integer;
begin
  insert into public.tspoon_sync_runs(request_key,block,status,trigger_type)
  values('test-atomic-replacements','PRODUCTION','RUNNING','MANUAL')
  returning id into v_run;

  perform public.replace_tspoon_production(
    jsonb_build_object('external_id','atomic-production','component_external_id','component','description','Original','is_started',false,'is_done',false,'is_closed',false,'last_run_id',v_run,'synced_at',now()),
    jsonb_build_array(jsonb_build_object('production_external_id','atomic-production','line_external_id','line-1','component_external_id','ingredient','description','Original ingredient','last_run_id',v_run,'synced_at',now()))
  );

  begin
    perform public.replace_tspoon_production(
      jsonb_build_object('external_id','atomic-production','component_external_id','component','description','Changed','is_started',false,'is_done',false,'is_closed',false,'last_run_id',v_run,'synced_at',now()),
      jsonb_build_array(jsonb_build_object('production_external_id','atomic-production','line_external_id','line-2','component_external_id','ingredient','description','','last_run_id',v_run,'synced_at',now()))
    );
    raise exception 'EXPECTED_PRODUCTION_FAILURE';
  exception when check_violation then null;
  end;

  select count(*) into v_count from public.tspoon_production_ingredients
  where production_external_id='atomic-production' and line_external_id='line-1';
  if v_count<>1 then raise exception 'Production rollback failed'; end if;
  if (select description from public.tspoon_productions where external_id='atomic-production')<>'Original' then
    raise exception 'Production header rollback failed';
  end if;

  update public.tspoon_sync_runs set block='ORDER' where id=v_run;
  perform public.replace_tspoon_order(
    jsonb_build_object('external_id','atomic-order','description','Original order','is_locked',false,'last_run_id',v_run,'synced_at',now()),
    jsonb_build_array(jsonb_build_object('external_id','atomic-order:delivery-1','order_external_id','atomic-order','is_closed',false,'last_run_id',v_run,'synced_at',now())),
    jsonb_build_array(jsonb_build_object('delivery_external_id','atomic-order:delivery-1','line_external_id','line-1','component_external_id','component','description','Original line','is_sent',false,'lots','[]'::jsonb,'last_run_id',v_run,'synced_at',now()))
  );

  begin
    perform public.replace_tspoon_order(
      jsonb_build_object('external_id','atomic-order','description','Changed order','is_locked',false,'last_run_id',v_run,'synced_at',now()),
      jsonb_build_array(jsonb_build_object('external_id','atomic-order:delivery-1','order_external_id','atomic-order','is_closed',false,'last_run_id',v_run,'synced_at',now())),
      jsonb_build_array(jsonb_build_object('delivery_external_id','atomic-order:delivery-1','line_external_id','line-2','component_external_id','component','description','','is_sent',false,'lots','[]'::jsonb,'last_run_id',v_run,'synced_at',now()))
    );
    raise exception 'EXPECTED_ORDER_FAILURE';
  exception when check_violation then null;
  end;

  select count(*) into v_count from public.tspoon_order_lines
  where delivery_external_id='atomic-order:delivery-1' and line_external_id='line-1';
  if v_count<>1 then raise exception 'Order rollback failed'; end if;
  if (select description from public.tspoon_orders where external_id='atomic-order')<>'Original order' then
    raise exception 'Order header rollback failed';
  end if;
end;
$$;

rollback;
