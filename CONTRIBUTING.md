# Contributing to Regex

Terima kasih sudah tertarik berkontribusi. Dokumen ini menjelaskan cara kerja codebase, aturan yang tidak boleh dilanggar, dan alur kerja untuk pull request.

---

## Sebelum mulai

Buka issue terlebih dahulu untuk perubahan besar, fitur baru, atau refactor yang menyentuh banyak file. Untuk bugfix kecil dan typo, langsung pull request tidak masalah.

---

## Setup lokal

```bash
git clone https://github.com/ferrdxd/regex.git
cd regex
npm install
npm run dev
```

Jalankan signaling server secara terpisah:

```bash
cd worker
npm install
npm run dev
```

Pastikan `VITE_SIGNALING_URL` mengarah ke signaling server yang aktif sebelum membuka browser.

---

## Aturan arsitektur (wajib)

Ini bukan preferensi gaya. Melanggar aturan ini berarti PR tidak bisa diterima.

### Pemisahan logika

Semua logika WebRTC, WebSocket, pemecahan chunk, dan kalkulasi kecepatan transfer masuk ke `src/core/` sebagai modul TypeScript murni. Komponen di `src/components/` hanya membaca state dari Zustand store dan memanggil actions yang tersedia. Komponen tidak boleh memanggil WebRTC API secara langsung.

### Transfer file

- Kirim file sebagai `ArrayBuffer` mentah melalui `RTCDataChannel`. Jangan konversi chunk ke Base64.
- Pantau `channel.bufferedAmount` dan tunggu event `bufferedamountlow` sebelum membaca slice berikutnya.
- Jangan muat file utuh ke memori. Gunakan `file.slice(offset, offset + CHUNK_SIZE)`, bukan `file.arrayBuffer()` untuk seluruh file.
- Batas chunk: **64 KB (`65536` bytes)**. Jangan naikkan batas ini. Browser tertentu (Firefox, Safari) punya batas SCTP yang lebih rendah dari Chromium.

### Privasi

IP klien tidak boleh dikirim ke klien lain dalam payload JSON. Server menggunakan SHA-256 dengan daily salt untuk hashing sebelum IP dipakai untuk pengelompokan jaringan lokal.

### Storage

Jangan tambahkan integrasi database (PostgreSQL, MongoDB, Firebase, dll.) atau cloud object storage (S3, R2, Cloudflare R2) untuk menyimpan file atau pesan pengguna. Signaling server hanya boleh meneruskan metadata SDP/ICE dan mengelola in-memory room/peer map.

---

## Standar kode

- TypeScript dengan `strict: true`. Hindari `any`; gunakan `unknown` dengan type guards atau definisi interface/type yang eksplisit.
- Setiap event listener WebRTC, WebSocket, maupun object URL (`URL.createObjectURL`) wajib dibersihkan saat transfer selesai atau komponen unmount.
- Jalankan `npm run typecheck` sebelum commit. PR dengan error TypeScript tidak akan di-review.

---

## Alur kerja

```bash
# dari main terbaru
git checkout -b nama-fitur-atau-fix

# kerjakan perubahan, lalu:
npm run typecheck
npm run test

# commit dan buka PR ke main
```

Pastikan state transfer di-reset dengan bersih setelah selesai atau dibatalkan, sehingga pengguna bisa langsung mengirim file berikutnya tanpa refresh.

---

## UI dan styling

- Tailwind CSS untuk semua styling. Jangan instal library UI berat seperti Material UI atau Ant Design.
- Icon dari `lucide-react` yang sudah terpasang.
- Gunakan font monospace (`font-mono` + `tabular-nums`) untuk semua metrik angka dinamis: persentase progres, kecepatan MB/s, ukuran file, kode ruangan.
- Teks yang diterima lewat Instant Text Drop harus dirender sebagai teks biasa. Jangan gunakan `dangerouslySetInnerHTML`.
- Latar utama `#09090B`, permukaan `#121215`, aksen `#10B981`.

---

## Referensi

- `AGENTS.md` — aturan lengkap untuk AI coding agents dan pengembang
- `src/core/types.ts` — tipe pesan WebSocket dan P2P
