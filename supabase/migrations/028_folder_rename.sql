create or replace function rename_folder(
  p_folder_id uuid,
  p_name text
)
returns void
language plpgsql
as $$
begin
  update folders
  set name = p_name
  where id = p_folder_id;
end;
$$;
