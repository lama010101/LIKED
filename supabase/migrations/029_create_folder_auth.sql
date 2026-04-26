create or replace function create_folder(
  p_name text,
  p_parent_folder_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_folder_id uuid;
  v_is_project boolean;
  v_color_hex text;
  v_now timestamptz := now();
begin
  -- Determine is_project: true if no parent
  v_is_project := (p_parent_folder_id is null);

  -- Assign deterministic color based on owner's folder count
  select palette.color_hex into v_color_hex
  from (
    select '#D85A30' as color_hex, 0 as n union all
    select '#E8B34B', 1 union all
    select '#4A9FD4', 2 union all
    select '#5FB878', 3 union all
    select '#9B6ED5', 4 union all
    select '#E07A8A', 5 union all
    select '#6BBAA4', 6 union all
    select '#F2C94C', 7 union all
    select '#56CCF2', 8 union all
    select '#EB5757', 9 union all
    select '#27AE60', 10 union all
    select '#2D9CDB', 11 union all
    select '#9B51E0', 12 union all
    select '#F2994A', 13 union all
    select '#BDBDBD', 14 union all
    select '#6FCF97', 15 union all
    select '#2F80ED', 16 union all
    select '#F9AFAE', 17 union all
    select '#4F4F4F', 18 union all
    select '#8E44AD', 19
  ) palette
  where palette.n = (
    select coalesce(count(*)::int % 20, 0)
    from folders
    where owner_id = auth.uid()
  );

  -- Fallback for first folder (count = 0 matches index 0, but guard anyway)
  if v_color_hex is null then
    v_color_hex := '#D85A30';
  end if;

  -- Insert folder
  insert into folders (
    id,
    name,
    owner_id,
    parent_folder_id,
    is_project,
    color_hex,
    deleted_at,
    created_at
  ) values (
    gen_random_uuid(),
    p_name,
    auth.uid(),
    p_parent_folder_id,
    v_is_project,
    v_color_hex,
    null,
    v_now
  )
  returning id into v_folder_id;

  -- Insert folder_tree self-reference
  insert into folder_tree (folder_id, ancestor_id, depth)
  values (v_folder_id, v_folder_id, 0);

  -- Insert folder_tree ancestor references
  if p_parent_folder_id is not null then
    insert into folder_tree (folder_id, ancestor_id, depth)
    select v_folder_id, ancestor_id, depth + 1
    from folder_tree
    where folder_id = p_parent_folder_id;
  end if;

  return v_folder_id;
end;
$$;

-- Grant execute on new signature
grant execute on function create_folder(text, uuid) to authenticated;
grant execute on function create_folder(text, uuid) to service_role;
