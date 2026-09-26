# Coup — Quán Bài Nắng 🃏

Game bài **Coup** (luật gốc) chơi online nhiều người trên trình duyệt máy tính, với bàn chơi 3D
phong cách quán rượu đầy nắng — lấy cảm hứng từ *Liar's Bar* nhưng tươi sáng hơn.

- 2–6 người/phòng, tạo phòng & vào bằng mã (hoặc link mời `/?room=MÃ`)
- Thêm bot vào ghế trống (Dễ / Vừa / Khó) — bot biết đếm bài đã lộ, bluff và thách thức hợp lý
- Mất kết nối vẫn vào lại được ván đang chơi; quá 30 giây thì bot chơi thay (vào lại là lấy lại quyền)
- Đồng hồ đếm ngược cho mỗi lượt và mỗi quyết định Thách thức / Chặn
- Tiếng Việt mặc định, có tiếng Anh

## Chạy thử

Yêu cầu Node.js ≥ 20.

```bash
npm install
```

```bash
npm run dev
```

Mở http://localhost:5173 (Vite, tự proxy socket tới server cổng 3000).

## Bản production

```bash
npm run build
```

```bash
npm start
```

Server phục vụ cả giao diện lẫn socket trên `PORT` (mặc định 3000): http://localhost:3000

## Kiểm thử

```bash
npm test
```

```bash
npm run typecheck
```

Mô phỏng bot-vs-bot (tỉ lệ thắng theo cấp độ, tỉ lệ bluff/thách thức):

```bash
npx tsx scripts/simulate.ts 3000
```

## Kiến trúc

| Thư mục | Nội dung |
|---|---|
| `shared/` | Kiểu dữ liệu, hằng số, giao thức socket, **engine luật** thuần (deterministic) và **bot AI** |
| `server/` | Node + Socket.IO: phòng chờ, chủ phòng, bot, đồng hồ, reconnect/bot thay thế, phục vụ file tĩnh |
| `client/` | Vite + React 19 + zustand; cảnh 3D bằng react-three-fiber/drei; HUD 2D; âm thanh WebAudio tổng hợp |
| `docs/SPEC.md` | Đặc tả đầy đủ: luật, máy trạng thái, hành vi server, bot, UI |

Server là nguồn sự thật duy nhất: client chỉ nhận *view* đã được che giấu thông tin (không bao giờ thấy
bài úp của người khác hay thứ tự bộ bài).

### Xem trước giao diện không cần server (dev)

Khi chạy `npm run dev`, thêm `?mock=home|lobby|game|respond|block|blockresp|lose|exchange|waiting|six|over`
vào URL để xem từng màn hình với dữ liệu giả; `&events=1` phát lại chuỗi sự kiện để xem hoạt ảnh;
`?gallery=1` xem toàn bộ artwork lá bài/avatar.
