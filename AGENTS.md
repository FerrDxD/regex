# AGENTS.md — Engineering Guidelines & AI Context for Regex

Dokumen ini berisi instruksi teknis, standar penulisan kode, serta batasan arsitektur yang wajib dipatuhi oleh *AI Coding Agents* maupun pengembang manusia saat berkontribusi pada proyek **Regex**.

---

## 1. Konteks Proyek & Tujuan Inti
* **Nama Proyek:** Regex
* **Deskripsi:** Aplikasi web utilitas transfer file dan teks instan berbasis *Peer-to-Peer* (WebRTC Data Channels) tanpa penyimpanan server (*zero-server storage*).
* **Referensi Utama:** Selalu selaraskan implementasi dengan `PRD.md` (fitur), `ARCHITECT.md` (protokol & sistem), dan `DESIGN.md` (UI/UX).

---

## 2. Aturan Arsitektur Mutlak (Hard Constraints)
1. **Zero-Storage Backend:** Jangan pernah menambahkan integrasi *database* (PostgreSQL, MongoDB, Firebase, dll.) atau *cloud object storage* (S3, R2) untuk menyimpan file maupun pesan pengguna. *Signaling server* hanya boleh meneruskan metadata SDP/ICE dan mengelola *in-memory room/peer map*.
2. **Binary-First Data Channel:** Pengiriman file melalui `RTCDataChannel` wajib menggunakan `ArrayBuffer` mentah (`binaryType = 'arraybuffer'`). **Dilarang keras** mengonversi *chunk* file menjadi string Base64 karena akan menurunkan performa dan membengkakkan ukuran data.
3. **Mandatory Backpressure Handling:** Setiap fungsi pengiriman file harus memantau `channel.bufferedAmount` dan menunggu event `bufferedamountlow` sebelum membaca *slice* file berikutnya. Jangan membaca seluruh file ke dalam memori sekaligus (`file.arrayBuffer()` untuk file utuh dilarang; gunakan `file.slice(offset, offset + CHUNK_SIZE)`).
4. **Privasi IP Pengguna:** Di sisi *signaling server*, alamat IP klien hanya digunakan untuk pengelompokan jaringan lokal setelah di-*hash* satu arah (`SHA-256` dengan *daily salt*). Jangan pernah mengirimkan alamat IP mentah klien ke klien lain dalam payload JSON.

---

## 3. Standar Kode & Tech Stack
* **Bahasa:** TypeScript dengan `strict: true`. Hindari penggunaan tipe `any`; gunakan `unknown` dengan *type guards* atau definisi *interface/type* yang eksplisit.
* **Frontend:** React (Functional Components + Hooks), Vite, Tailwind CSS, dan Zustand untuk manajemen *state* global.
* **Pemisahan Logika (Separation of Concerns):**
  * Seluruh logika WebRTC, WebSocket, pemecahan *chunk*, dan kalkulasi kecepatan transfer harus berada di dalam direktori `src/core/` sebagai modul TypeScript murni yang terpisah dari komponen React (`src/components/`).
  * Komponen UI hanya bertugas membaca *state* dari Zustand store dan memanggil *actions* yang tersedia.
* **Penanganan Resource & Cleanup:** Setiap *event listener* WebRTC (`ondatachannel`, `onicecandidate`, `onmessage`), WebSocket, maupun *object URL* (`URL.createObjectURL`) wajib dibersihkan (`revokeObjectURL` / `.close()`) saat transfer selesai atau komponen di-*unmount* untuk mencegah *memory leak*.

---

## 4. Pedoman UI/UX & Styling
* **Dark Theme First:** Gunakan palet warna dari `DESIGN.md` (latar utama `#09090B`, permukaan `#121215`, aksen utama `#10B981`). Jangan gunakan tema terang sebagai *default*.
* **Tipografi Teknis:** Gunakan font *monospace* (`font-mono`) untuk semua metrik angka dinamis (persentase progres, kecepatan MB/s, ukuran file, dan kode ruangan 6-digit) serta terapkan `tabular-nums` agar angka tidak bergeser saat berubah cepat.
* **Keamanan Konten Teks:** Teks yang diterima lewat fitur *Instant Text Drop* wajib dirender sebagai teks biasa (tanpa `dangerouslySetInnerHTML`). Deteksi tautan URL menggunakan *regex* yang aman dan render sebagai tag `<a target="_blank" rel="noopener noreferrer">`.

---

## 5. Protokol Pengembangan & Testing (Workflow for Agents)
Saat diminta membuat atau memodifikasi fitur, ikuti urutan kerja berikut:
1. **Cek Kontrak Tipe (Types First):** Definisikan atau perbarui tipe pesan WebSocket (`SignalingMessage`) dan pesan P2P (`P2PControlMessage`) terlebih dahulu sebelum menulis logika pengirim/penerima.
2. **Penanganan Error Eksplisit:** Selalu tangani kasus gagal koneksi ICE (`iceConnectionState === 'failed'`), penolakan izin kamera saat *scan* QR, dan pembatalan transfer di tengah jalan.
3. **Verifikasi Mandiri:**
   * Pastikan tidak ada *warning* atau *error* TypeScript (`tsc --noEmit`).
   * Pastikan *state* transfer di-reset dengan bersih setelah proses selesai atau dibatalkan sehingga pengguna bisa langsung mengirim file berikutnya tanpa perlu *refresh* halaman.

---

## 6. Larangan Umum (Anti-Patterns)
* Jangan membuat halaman *landing*, formulir *login/register*, atau layar *onboarding* berlapis sebelum radar utama muncul.
* Jangan menginstal pustaka UI yang berat (seperti Material UI atau Ant Design); gunakan Tailwind CSS dan ikon ringan seperti `lucide-react`.
* Jangan mengubah ukuran `CHUNK_SIZE` di atas `64 KB` (`65536` bytes) karena berisiko melewati batas *Maximum Message Size* SCTP pada beberapa peramban (terutama Firefox dan Safari).