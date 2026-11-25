# Product Requirements Document (PRD) — Regex

| Metadata | Detail |
| :--- | :--- |
| **Nama Produk** | Regex |
| **Versi Dokumen** | 1.0 (MVP) |
| **Status** | Draft / Ready for Architecture |
| **Target Platform** | Web App (Desktop & Mobile Browser, PWA-ready) |

---

## 1. Ringkasan Produk (Product Overview)
**Regex** adalah aplikasi web utilitas berbasis *peer-to-peer* (P2P) untuk mentransfer file, gambar, dan potongan teks/kode secara instan antar-perangkat tanpa melalui penyimpanan server (*zero-server storage*). 

Dengan memanfaatkan teknologi **WebRTC Data Channels**, Regex memungkinkan pengguna bertukar data secara langsung dalam jaringan lokal (Wi-Fi yang sama) maupun lintas jaringan melalui mekanisme *pairing* kode ruangan/QR, dengan privasi penuh dan tanpa batasan ukuran file dari sisi server.

### Masalah yang Diselesaikan
* Mengirim file atau teks cepat antara laptop dan HP sering kali bergantung pada aplikasi pihak ketiga (WhatsApp, Telegram, Google Drive) yang membutuhkan *login*, mengompresi kualitas media, atau membatasi ukuran file.
* Data sensitif (seperti file `.env`, *snippet* kode, atau dokumen pribadi) tersimpan di server pihak ketiga saat dikirim lewat aplikasi pesan instan.

### Proposisi Nilai Utama
1. **Zero Friction:** Buka browser, langsung terhubung, tanpa registrasi atau instalasi aplikasi wajib.
2. **Direct P2P & Privasi Total:** Data mengalir langsung antar-perangkat dengan enkripsi *end-to-end* bawaan WebRTC (DTLS).
3. **Hybrid Transfer:** Mendukung pengiriman banyak file sekaligus (*multi-file*) serta *live clipboard/text drop* dalam satu antarmuka.

---

## 2. Target Pengguna & Skenario Penggunaan
* **Developer & Kreator:** Memindahkan aset desain, APK/build, atau potongan *snippet* kode/URL dari laptop ke HP (dan sebaliknya) saat pengujian.
* **Pengguna Lintas Ekosistem:** Pengguna kombinasi Windows/Linux + Android/iOS yang tidak memiliki fitur bawaan seperti AirDrop.

### Skenario Utama (User Stories)
* *Sebagai pengguna di Wi-Fi yang sama*, saya ingin perangkat saya otomatis mendeteksi perangkat lain yang membuka Regex agar bisa mengirim file dalam satu klik.
* *Sebagai pengguna di jaringan berbeda (misal Laptop pakai Wi-Fi, HP pakai data seluler)*, saya ingin memindai QR Code atau memasukkan kode 6-digit untuk terhubung secara langsung.
* *Sebagai pengguna*, saya ingin menempel (*paste*) teks atau gambar dari *clipboard* (`Ctrl+V`) agar langsung terkirim ke perangkat tujuan tanpa perlu menyimpannya menjadi file terlebih dahulu.

---

## 3. Ruang Lingkup Fitur (Functional Requirements)

### 3.1. MVP (Fase 1)
1. **Identitas Perangkat Otomatis**
   * Menghasilkan nama alias acak yang mudah dikenali saat sesi dimulai (misal: *Cobalt Fox*, *Neon Falcon*) beserta ikon tipe perangkat (Desktop/Mobile).
   * Pengguna dapat mengubah nama alias sesi tersebut secara lokal.
2. **Device Discovery & Pairing**
   * **Auto-Discovery (Local Network):** Mendeteksi perangkat lain di jaringan publik/IP yang sama secara otomatis menggunakan *lightweight signaling server*.
   * **Manual Room / QR Pairing:** Membuat kode ruangan sementara (6 karakter) dan QR Code untuk menghubungkan dua perangkat yang berada di jaringan berbeda (Wi-Fi vs Seluler).
3. **Transfer File (Drag & Drop / File Picker)**
   * Mendukung pengiriman satu atau banyak file sekaligus (*batch transfer*) dengan tipe file bebas.
   * Mekanisme *chunking* (pemecahan paket data) untuk mencegah *browser crash* saat mengirim file berukuran besar (ratusan MB hingga GB).
   * Indikator progres *real-time* (persentase, kecepatan transfer MB/s, dan estimasi waktu selesai) di sisi pengirim maupun penerima.
4. **Instant Text & Clipboard Drop**
   * Kotak input cepat untuk mengirim teks biasa, tautan (*auto-clickable*), atau blok kode dengan tombol *one-click copy*.
   * Mendukung *global paste* (`Ctrl+V` / `Cmd+V`) untuk langsung mengirim teks atau *screenshot* dari *clipboard*.
5. **Konfirmasi & Manajemen Unduhan**
   * Opsi persetujuan sebelum menerima file (*Accept / Decline*) serta opsi *Auto-Accept* untuk perangkat yang sudah terhubung dalam satu sesi.
   * Fitur *Download All as ZIP* jika penerima menerima lebih dari 3 file sekaligus.

### 3.2. Out of Scope (Bukan untuk MVP)
* Akun pengguna, autentikasi, dan riwayat transfer berbasis *cloud*.
* Pengiriman ke banyak penerima sekaligus (*1-to-many broadcast*).
* *Background transfer* saat tab browser mobile ditutup sepenuhnya.

---

## 4. Kebutuhan Non-Fungsional (Non-Functional Requirements)

| Kategori | Spesifikasi |
| :--- | :--- |
| **Keamanan & Privasi** | Wajib menggunakan enkripsi DTLS standar WebRTC. *Signaling server* hanya meneruskan metadata SDP/ICE dan **tidak pernah** menyimpan isi pesan maupun file. |
| **Performa** | Latensi *handshake* koneksi maksimal < 3 detik pada jaringan lokal normal. Kecepatan transfer memaksimalkan *bandwidth* lokal/P2P dengan manajemen *backpressure* memori. |
| **Kompatibilitas** | Mendukung versi terbaru Chrome, Edge, Firefox, dan Safari (iOS 15+ & macOS). |
| **Responsivitas** | Desain *mobile-first* yang adaptif untuk layar sentuh (HP) maupun interaksi *drag-and-drop* (Desktop). |

---

## 5. Alur Pengguna Utama (Core User Flow)

1. **Inisialisasi:** User A (Laptop) dan User B (HP) membuka URL aplikasi **Regex**.
2. **Penemuan (Discovery):**
   * *Jalur A (Satu Wi-Fi):* Radar menampilkan ikon perangkat User B di layar User A. User A mengklik ikon User B.
   * *Jalur B (Beda Jaringan):* User A mengklik "Tampilkan QR / Kode", lalu User B memindai QR Code tersebut.
3. **Koneksi P2P:** Kedua browser bertukar informasi koneksi lewat *signaling server*, lalu membangun jalur WebRTC langsung (status berubah menjadi *Connected*).
4. **Pengiriman:** User A menyeret file ke layar atau mengetik teks lalu menekan kirim.
5. **Penerimaan:** User B menyetujui file masuk, progres berjalan hingga 100%, dan file otomatis tersimpan ke perangkat User B.

---

## 6. Batasan Teknis & Penanganan Kasus Khusus (Edge Cases)
* **Strict NAT / Firewall:** Pada jaringan kampus/kantor yang memblokir koneksi P2P langsung, aplikasi harus menyediakan konfigurasi STUN server publik dan opsi konfigurasi TURN server cadangan.
* **Koneksi Terputus di Tengah Transfer:** Jika salah satu tab ditutup atau koneksi terputus saat transfer berjalan, sistem harus membatalkan *stream* dengan bersih, membersihkan memori *buffer*, dan menampilkan status *Disconnected* yang jelas.
* **Batasan Memori Browser Mobile:** Untuk file sangat besar di perangkat seluler, sistem perlu menerapkan *flow control* (`bufferedAmountLowThreshold`) agar tab browser tidak mengalami *Out of Memory* (OOM).

---

## 7. Metrik Keberhasilan (Success Metrics)
* **Connection Success Rate:** Minimal 90% percobaan *pairing* berhasil membangun kanal data WebRTC.
* **Transfer Reliability:** Transfer file berukuran 500MB selesai tanpa *memory leak* atau *crash* pada browser desktop maupun mobile.
* **Time-to-First-Transfer:** Pengguna baru dapat mengirim file pertama mereka dalam waktu kurang dari 20 detik sejak membuka website.