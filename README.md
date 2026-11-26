# Regex

Transfer file dan teks langsung antar perangkat, tanpa server menyimpan apa pun.

Koneksi terbentuk lewat WebRTC. Begitu dua perangkat terhubung, data bergerak dari browser ke browser secara langsung. Server hanya membantu pertukaran sinyal awal, lalu keluar dari jalur.

---

## Cara kerja

1. Buka Regex di dua perangkat yang terhubung ke jaringan yang sama
2. Perangkat muncul di radar sebagai titik bernama
3. Klik titik tersebut, kirim file atau teks

Untuk jaringan berbeda, gunakan QR code untuk memulai sesi manual.

---

## Fitur

- **Transfer file** tanpa batas ukuran, dikirim dalam potongan 64 KB dengan kontrol backpressure
- **Instant Text Drop** untuk berbagi teks pendek tanpa perlu membuka file
- **QR pairing** untuk menghubungkan perangkat di jaringan berbeda
- **Drag and drop** langsung ke jendela
- **Multi-file** otomatis dikemas sebagai ZIP saat diterima
- **PWA** bisa dipasang di perangkat mobile dan desktop

---

## Jalankan secara lokal

Butuh Node.js 18+ dan npm.

```bash
npm install
npm run dev
```

Signaling server berjalan terpisah. Pastikan `VITE_SIGNALING_URL` mengarah ke instance yang aktif, atau jalankan server lokal:

```bash
# dari direktori worker/
npm install
npm run dev
```

Variabel lingkungan:

```
VITE_SIGNALING_URL=ws://localhost:8080/signaling
```

---

## Arsitektur

[![Architecture diagram of ferrdxd/regex](https://gitdiagram.com/ferrdxd/regex/diagram.png)](https://gitdiagram.com/ferrdxd/regex?utm_source=readme&utm_medium=picture)


```
src/
├── core/           # WebRTC, signaling, transfer, protokol — tidak menyentuh UI
│   ├── webrtc.ts
│   ├── signaling.ts
│   ├── fileTransfer.ts
│   ├── controlProtocol.ts
│   └── types.ts
├── components/     # Komponen UI murni, membaca dari Zustand store
├── store/          # Zustand state global
└── lib/            # Utilitas ringan

worker/             # Cloudflare Worker — signaling server
```

Logika transfer tidak menyentuh state React. Komponen tidak memanggil WebRTC secara langsung.

### Protokol data channel

File dikirim sebagai `ArrayBuffer` mentah. Setiap potongan berukuran maksimal 65.536 byte. Pengirim menunggu event `bufferedamountlow` sebelum membaca potongan berikutnya. File tidak pernah dimuat ke memori secara penuh.

Pesan kontrol (penawaran transfer, persetujuan, penolakan, selesai) dikirim sebagai JSON melalui channel yang sama sebelum data biner mulai mengalir.

IP klien tidak pernah dikirim ke klien lain. Server menghash alamat IP dengan SHA-256 dan salt harian untuk mengelompokkan perangkat di jaringan lokal.

---

## Build dan deploy

```bash
npm run build        # output ke dist/
npm run typecheck    # periksa tipe tanpa build
npm run test         # jalankan test suite
```

Deploy frontend ke mana saja yang melayani file statis. Deploy `worker/` ke Cloudflare Workers:

```bash
cd worker && wrangler deploy
```

---

## Stack

- React 18, Vite, TypeScript strict
- Zustand untuk state global
- Tailwind CSS
- Cloudflare Workers untuk signaling
- WebRTC Data Channels untuk transfer

---

## Kontribusi

Ikuti aturan di `AGENTS.md`. Poin penting:

- Jangan konversi chunk ke Base64
- Jangan muat file utuh ke memori (`file.arrayBuffer()` untuk seluruh file dilarang)
- Jangan tambah database atau object storage
- Batas chunk: 64 KB (`65536` bytes)
- Logika WebRTC masuk ke `src/core/`, bukan komponen

Buka issue terlebih dahulu sebelum pull request untuk perubahan besar.

---

## Lisensi

MIT
