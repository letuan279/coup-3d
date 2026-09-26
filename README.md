# Coup — Quán Bài Nắng 🃏

Game bài **Coup** (luật gốc) chơi online nhiều người trên trình duyệt máy tính, với bàn chơi 3D
phong cách quán rượu đầy nắng — lấy cảm hứng từ *Liar's Bar* nhưng tươi sáng hơn.

- 2–6 người/phòng, tạo phòng & vào bằng mã (hoặc link mời `/?room=MÃ`)
- Thêm bot vào ghế trống (Dễ / Vừa / Khó) — bot biết đếm bài đã lộ, bluff và thách thức hợp lý
- Mất kết nối vẫn vào lại được ván đang chơi; quá 30 giây thì bot chơi thay (vào lại là lấy lại quyền)
- Đồng hồ đếm ngược cho mỗi lượt và mỗi quyết định Thách thức / Chặn
- Tiếng Việt mặc định, có tiếng Anh

## Chạy thử

Yêu cầu Node.js ≥ 22.12 (có sẵn `.nvmrc`).

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

## Chơi với bạn bè

`localhost` chỉ dùng được trên chính máy của bạn — link mời phải trỏ tới địa chỉ mà bạn bè truy cập được.

**Cùng mạng LAN / Wi-Fi**

1. Chạy bản production (`npm run build`, rồi `npm start`) — server lắng nghe trên mọi địa chỉ mạng của máy, cổng `PORT` (mặc định 3000).
2. Xem IP nội bộ của máy (macOS: `ipconfig getifaddr en0`, Windows: `ipconfig`), ví dụ `192.168.1.23`.
3. Mở `http://192.168.1.23:3000` trên máy bạn, tạo phòng và bấm **Sao chép link mời** — link sẽ dùng đúng địa chỉ đó. Nếu tường lửa hỏi, cho phép Node nhận kết nối.

**Qua Internet**

- Nhanh nhất: mở đường hầm tới cổng 3000, ví dụ `cloudflared tunnel --url http://localhost:3000` hoặc `ngrok http 3000`, rồi mở địa chỉ https mà công cụ cấp và gửi link mời từ đó.
- Lâu dài: deploy lên bất kỳ dịch vụ chạy Node (Render, Railway, Fly.io, VPS…): lệnh build `npm ci && npm run build`, lệnh chạy `npm start`, đặt biến `PORT` nếu dịch vụ yêu cầu. Server giữ phòng trong bộ nhớ nên chỉ chạy **một** instance.

**Vào lại ván**

- Mất mạng/tải lại trang: mở lại trang là tự vào lại ghế (phiên được nhớ trong trình duyệt). Sau 30 giây mất kết nối, bot sẽ chơi thay cho tới khi bạn quay lại.
- Đổi thiết bị/trình duyệt: trong menu ván đấu chọn **Sao chép link vào lại** rồi mở link đó ở thiết bị mới (link chứa khoá bí mật của ghế — đừng gửi cho người khác).

## Deploy lên Google Cloud (VM)

Bản đang chạy: **https://34-177-105-194.sslip.io** — VM `instance-20260916-072852` (project `hermes-agent-01-508807`, zone `asia-southeast1-b`, IP tĩnh `coup3d-ip` = 34.177.105.194). `sslip.io` là tên miền miễn phí tự trỏ về IP trong tên.

Kiến trúc: Caddy (HTTPS tự động Let's Encrypt, cổng 80/443) → server Node chạy bằng systemd (`coup3d.service`, chỉ nghe `127.0.0.1:3000`). Firewall `coup3d-allow-web` chỉ mở 80/443 cho VM có tag `coup3d-web`.

- Cài VM lần đầu: copy thư mục `deploy/` lên VM rồi chạy `COUP_DOMAIN=<tên-miền> bash deploy/setup-vm.sh`.
- Deploy bản mới (build ở máy, gửi lên VM, giữ 3 bản gần nhất):

```bash
scripts/deploy.sh
```

- Xem log trên VM: `sudo journalctl -u coup3d -f`.
- Đổi sang tên miền riêng: trỏ bản ghi A về 34.177.105.194, sửa `COUP_DOMAIN` trong `/etc/default/caddy`, rồi `sudo systemctl restart caddy`.
- Lưu ý: phòng nằm trong bộ nhớ nên mỗi lần deploy/restart sẽ kết thúc các ván đang chơi.

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
