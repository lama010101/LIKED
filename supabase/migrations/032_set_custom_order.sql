create or replace function set_custom_order(
  p_user_id uuid,
  p_scope_key text,
  p_node_ids uuid[]
)
returns void
language plpgsql
security definer
as $$
begin
  delete from user_node_preferences
  where user_id = p_user_id
    and scope_key = p_scope_key;

  if array_length(p_node_ids, 1) is not null then
    insert into user_node_preferences (user_id, scope_key, node_id, position, updated_at)
    select
      p_user_id,
      p_scope_key,
      unnest(p_node_ids),
      generate_subscripts(p_node_ids, 1) - 1,
      now();
  end if;
end;
$$;

grant execute on function set_custom_order(uuid, text, uuid[]) to authenticated;
grant execute on function set_custom_order(uuid, text, uuid[]) to service_role;
