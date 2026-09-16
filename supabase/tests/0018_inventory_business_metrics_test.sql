begin;

do $$
begin
  if public.inventory_deviation_status(0.02) <> 'COINCIDE' then
    raise exception '2%% debe coincidir';
  end if;
  if public.inventory_deviation_status(-0.15) <> 'LEVE' then
    raise exception '15%% debe ser leve';
  end if;
  if public.inventory_deviation_status(0.150001) <> 'ELEVADA' then
    raise exception 'mas de 15%% debe ser elevada';
  end if;
  if public.inventory_deviation_impact(10, 8, -2, 50, 48) <> 10.00 then
    raise exception 'impacto con coste teorico incorrecto';
  end if;
  if public.inventory_deviation_impact(0, 4, 4, 0, 20) <> 20.00 then
    raise exception 'fallback a coste real incorrecto';
  end if;
end;
$$;

rollback;
