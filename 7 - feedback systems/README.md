- Chủ đề lựa chọn: Phát triển và giới thiệu một ứng dụng đơn giản (Hệ thống Quản lý và tra cứu Tài khoản trực tuyến)
- Thành viên
  + Phạm Minh Thông B2605470 Đại học Cần Thơ: Tìm hiểu và viết các script, tín năng cốt lõi
  + Phạm Duy Thái B2605464 Đại học Cần Thơ: Thiết kế giao diện và soạn báo cáo, giới thiệu sản phẩm
- Link Repo riêng của project: https://github.com/valguypmt/Project-26-27HK1-CT005D05
- Link video Youtube: 

*** Ghi chú của project ***
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


