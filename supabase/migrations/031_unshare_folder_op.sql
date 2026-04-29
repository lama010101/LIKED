create or replace function unshare_folder_op(
  p_folder_share_op_id text,
  p_requesting_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  delete from causes
  where metadata->>'folder_share_op_id' = p_folder_share_op_id
    and created_by = p_requesting_user_id;
end;
$$;

grant execute on function unshare_folder_op(text, uuid) to authenticated;
grant execute on function unshare_folder_op(text, uuid) to service_role;
