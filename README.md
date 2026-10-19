
[Thêm quyền moderator cho user trong auth]
UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"moderator"}'::jsonb
WHERE lower(email) = lower('valguypmt@gmail.com');


[Cắt quyền moderator của user trong auth]
UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb) - 'role'
WHERE lower(email) = lower('valguypmt@gmail.com')
  AND raw_app_meta_data ->> 'role' = 'moderator';