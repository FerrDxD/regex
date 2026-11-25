# Project Milestones & Roadmap — Regex

| Metadata | Detail | 
| ----- | ----- | 
| **Nama Produk** | Regex | 
| **Versi Dokumen** | 1.1 (Updated with DevOps, Testing & AI Workflow) | 
| **Target Rilis MVP** | 4 Fase Pengembangan (Estimasi 2–3 Minggu Kerja Fokus) | 
| **Strategi Rilis** | Iterative Delivery (Core Signaling -> P2P Data Engine -> UI Polish -> PWA & Edge Deploy) | 

## Ringkasan Fase Pengembangan

```
[Milestone 1] ──> [Milestone 2] ──> [Milestone 3] ──> [Milestone 4]
 Fondasi, Setup    WebRTC Engine     Radar UI &        PWA, Keamanan &
 & Signaling       & Stress-Test     Mobile UX         Split Deployment

```

## Panduan Eksekusi & Alur Kerja (AI Agent Workflow)

* **Struktur Dokumentasi Repositori:** Letakkan `PRD.md`, `ARCHITECT.md`, `DESIGN.md`, dan `MILESTONES.md` di dalam folder `docs/`, sementara **`AGENTS.md` wajib berada di *root* direktori proyek** agar otomatis terbaca sebagai konteks aturan oleh *AI coding agent*.
* **Isolasi Konteks:** Eksekusi pengembangan secara bertahap (**1 Milestone per sesi kerja**) agar *AI agent* tetap fokus dan tidak merusak modul inti yang sudah teruji.
* **Lingkungan Uji HTTPS Lokal:** Karena peramban mobile (Safari iOS & Chrome Android) memblokir WebRTC dan Clipboard API pada koneksi HTTP IP lokal biasa (`http://192.168.x.x`), wajib menggunakan **Cloudflare Tunnel (`cloudflared`)** atau **ngrok** selama pengujian lintas perangkat lokal.

## Milestone 1: Fondasi Proyek, Setup AI & Signaling Server

**Tujuan:** Menyiapkan struktur proyek yang ramah *AI agent*, membangun *lightweight signaling server*, dan memastikan dua perangkat dalam satu jaringan Wi-Fi dapat saling menemukan secara *real-time*.

### Daftar Tugas (Deliverables)

* \[ \] **Inisialisasi Repositori & Struktur Dokumen:**
  * \[ \] Setup Vite + React + TypeScript (`strict: true`), Tailwind CSS, dan konfigurasi Zustand store.
  * \[ \] Menempatkan `AGENTS.md` di *root* proyek dan menyimpan 4 dokumen spesifikasi lainnya di direktori `docs/`.
* \[ \] **Setup HTTPS Tunnel Lokal:** Konfigurasi skrip pengembangan agar dapat diakses melalui terowongan HTTPS (`cloudflared` / `ngrok`) untuk pengujian awal langsung di peramban HP.
* \[ \] **Generator Identitas Perangkat:** Implementasi utilitas pembuat nama alias acak (misal: *Cobalt Fox*), deteksi tipe perangkat (Desktop/Mobile), dan penyimpanan preferensi nama di `localStorage`.
* \[ \] **Signaling Server (WebSocket):**
  * \[ \] Implementasi pengelompokan otomatis berbasis *hashed IP* (`SHA-256` + *daily salt*) untuk *Local Network Discovery*.
  * \[ \] Implementasi manajemen *Room ID* 6-karakter sementara untuk *Cross-Network Pairing*.
  * \[ \] Penerusan pesan `SIGNAL` (SDP Offer/Answer & ICE Candidates) antar-peer.
* \[ \] **Klien WebSocket Auto-Reconnect:** Pembuatan modul `src/core/signaling.ts` yang otomatis menyambung ulang jika koneksi terputus sementara.

### Kriteria Selesai (Definition of Done)

* Membuka URL terowongan HTTPS di laptop dan HP pada Wi-Fi yang sama langsung menampilkan daftar perangkat satu sama lain dalam waktu < 2 detik tanpa alamat IP mentah terekspos di jaringan.

## Milestone 2: Core WebRTC Engine, File Transfer & Memory Stress-Test

**Tujuan:** Membangun koneksi *peer-to-peer* langsung dan memvalidasi stabilitas transfer file berukuran besar terhadap batasan memori peramban mobile sebelum membangun antarmuka visual penuh.

### Daftar Tugas (Deliverables)

* \[ \] **Manajemen Koneksi WebRTC (`src/core/webrtc.ts`):**
  * \[ \] Konfigurasi `RTCPeerConnection` dengan daftar STUN server publik gratis (Google & Cloudflare).
  * \[ \] Pembuatan `RTCDataChannel` andal (`ordered: true`, `binaryType: 'arraybuffer'`).
* \[ \] **Protokol Pesan Kontrol & Instant Text:**
  * \[ \] Implementasi pengiriman dan penerimaan teks/kode instan (`TEXT_DROP`) dengan sanitasi XSS.
  * \[ \] Implementasi alur persetujuan transfer (`TRANSFER_OFFER`, `TRANSFER_ACCEPT`, `TRANSFER_DECLINE`).
* \[ \] **Chunking & Backpressure Engine (`src/core/fileTransfer.ts`):**
  * \[ \] Pemecahan file menjadi paket `64 KB` dan pengendalian arus via `bufferedAmountLowThreshold`.
  * \[ \] Kalkulasi progres persentase, kecepatan transfer (`MB/s`), dan estimasi sisa waktu.
* \[ \] **Perakitan File & Multi-File ZIP:**
  * \[ \] Penggabungan *chunk* menjadi `Blob` dan pemicu unduhan otomatis di sisi penerima.
  * \[ \] Integrasi `jszip` untuk mengunduh banyak file sekaligus dalam satu arsip `.zip`.
* \[ \] **Early Memory & Bandwidth Stress-Test:** Melakukan uji coba transfer file `300–500 MB` dari laptop ke peramban HP (via UI minimalis sementara) untuk memverifikasi *backpressure* bekerja dan tab tidak mengalami *Out of Memory (OOM)*.

### Kriteria Selesai (Definition of Done)

* Berhasil mentransfer 1 file berukuran `500 MB` dan *batch* `10 file` sekaligus antara laptop dan HP secara P2P tanpa tab peramban mengalami *crash* atau *memory leak*.

## Milestone 3: Antarmuka Radar, QR Pairing & Pengalaman Mobile

**Tujuan:** Mengimplementasikan sistem desain dari `DESIGN.md` agar aplikasi terasa responsif, intuitif, dan nyaman digunakan baik lewat *drag-and-drop* desktop maupun sentuhan layar HP.

### Daftar Tugas (Deliverables)

* \[ \] **Komponen Radar Interaktif (`RadarView.tsx`):**
  * \[ \] Animasi gelombang sonar halus dengan dukungan `prefers-reduced-motion`.
  * \[ \] Visualisasi status koneksi pada setiap *node* perangkat (*Searching*, *Handshaking*, *Connected*).
* \[ \] **Full-Screen Drag & Drop & Global Paste:**
  * \[ \] Zona target layar penuh saat file diseret ke browser desktop.
  * \[ \] Dukungan pintasan `Ctrl/Cmd + V` untuk langsung mengirim teks atau *screenshot* dari *clipboard*.
* \[ \] **QR Code & Manual Room Modal:**
  * \[ \] Tab *Host* dengan generator QR Code kontras tinggi dan tombol salin tautan 1-klik.
  * \[ \] Tab *Guest* dengan pemindai kamera bawaan (`html5-qrcode`) dan input kode 6-digit manual.
* \[ \] **Transfer Sheet & Drawer Riwayat Sesi:**
  * \[ \] *Bottom sheet* (mobile) dan *centered modal* (desktop) untuk persetujuan dan progres transfer.
  * \[ \] Fitur tombol *Copy* sekali klik dan deteksi tautan otomatis pada *Instant Text Drop*.

### Kriteria Selesai (Definition of Done)

* Pengguna dapat menghubungkan laptop (Wi-Fi) dan HP (data seluler) dengan memindai QR Code, lalu mengirim teks maupun file dari ujung ke ujung tanpa hambatan tata letak di layar 360px hingga desktop.

## Milestone 4: PWA, NAT Fallback & Split Production Deployment

**Tujuan:** Menyiapkan aplikasi agar dapat diinstal di perangkat mobile/desktop, tahan terhadap jaringan ketat, dan men-deploy arsitektur *frontend* serta *signaling server* secara terpisah sesuai karakteristik masing-masing.

### Daftar Tugas (Deliverables)

* \[ \] **Progressive Web App (PWA) & Web Share Target:**
  * \[ \] Konfigurasi `manifest.json` dan *Service Worker* agar Regex dapat diinstal ke *Home Screen*.
  * \[ \] Dukungan *Web Share Target API* di Android agar pengguna bisa langsung memilih "Bagikan ke Regex" dari galeri atau manajer file HP.
* \[ \] **Konfigurasi Fallback STUN/TURN:**
  * \[ \] Penanganan *error* eksplisit jika koneksi P2P diblokir *firewall* kampus/kantor (*Symmetric NAT*).
  * \[ \] Menyediakan modal pengaturan opsional bagi pengguna untuk memasukkan kredensial TURN server kustom (misal dari Cloudflare Calls atau Metered.ca).
* \[ \] **Audit Keamanan & Kebersihan Memori:**
  * \[ \] Pembersihan seluruh `ObjectURL`, *event listener*, dan *buffer* memori setelah transfer selesai.
  * \[ \] *Rate limiting* koneksi pada *signaling server* untuk mencegah penyalahgunaan.
* \[ \] **Split Production Deployment:**
  * \[ \] **Deploy Frontend (Static/SPA):** Hosting ke Cloudflare Pages atau Vercel dengan HTTPS aktif.
  * \[ \] **Deploy Signaling Server (Stateful WebSocket):** Hosting terpisah di layanan yang mendukung koneksi WebSocket persisten (Cloudflare Workers dengan Durable Objects, PartyKit, atau Fly.io) dengan enkripsi `WSS://`.

### Kriteria Selesai (Definition of Done)

* Aplikasi berjalan di domain produksi HTTPS dengan koneksi `WSS://` yang stabil, skor Lighthouse PWA & Accessibility >= 90, dan seluruh skenario utama pada `PRD.md` lulus uji lintas perangkat (Chrome, Safari iOS, Firefox).