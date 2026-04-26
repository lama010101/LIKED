create or replace function create_user_profile(
  p_user_id uuid,
  p_display_name text,
  p_language_code text
)
returns void
language plpgsql
as $$
begin
  insert into users (id, display_name, normalized_display_name, language_code)
  values (
    p_user_id,
    p_display_name,
    lower(trim(p_display_name)),
    p_language_code
  );

  insert into activity_log (user_id, action)
  values (p_user_id, 'user_created');
end;
$$;
