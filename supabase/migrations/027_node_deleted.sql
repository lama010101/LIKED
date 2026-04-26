create or replace function set_node_deleted(
  p_node_id uuid,
  p_deleted boolean
)
returns void
language plpgsql
as $$
begin
  update nodes
  set deleted_at = case when p_deleted then now() else null end
  where id = p_node_id;
end;
$$;
