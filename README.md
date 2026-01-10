# FloodSense Backend

Backend API cho FloodSense - Hệ thống cảnh báo lũ lụt thông minh

## Tính năng
- Xác thực người dùng
- Quản lý nâng cấp tài khoản
- Tích hợp PayOS thanh toán
- Webhook xử lý thanh toán tự động

## Cài đặt
```bash
npm install
```

## Chạy
```bash
npm start
```

## Environment Variables
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: JWT secret key
- `PAYOS_CLIENT_ID`: PayOS Client ID
- `PAYOS_API_KEY`: PayOS API Key
- `PAYOS_CHECKSUM_KEY`: PayOS Checksum Key
- `CLIENT_URL`: Frontend URL

## API Endpoints
- `POST /api/auth/signup` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `POST /api/payment/create-payment-link` - Tạo link thanh toán
- `POST /api/payment/webhook` - Webhook PayOS
