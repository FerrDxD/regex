# Design System & UI/UX Specification — Regex

| Metadata | Detail |
| :--- | :--- |
| **Nama Produk** | Regex |
| **Versi Dokumen** | 1.0 |
| **Estetika Visual** | Dark Technical Minimalism (Radar & Terminal Inspired) |
| **Target Viewport** | Mobile-First (360px+) hingga Ultrawide Desktop (1440px+) |

---

## 1. Filosofi Desain (Design Principles)

1. **Zero-Onboarding UI:** Tidak ada halaman *landing* panjang yang menghalangi fungsi utama. Begitu pengguna membuka website, antarmuka radar dan area *drop* langsung siap digunakan dalam hitungan milidetik.
2. **Tactile & Instant Feedback:** Karena tidak ada *loading* unggahan ke server, setiap interaksi (klik perangkat, seret file, *paste* teks) harus memberikan umpan balik visual yang instan, responsif, dan presisi.
3. **Calm Utility:** Menggunakan palet warna gelap (*dark mode* sebagai standar) dengan kontras tinggi agar nyaman dilihat di berbagai kondisi pencahayaan dan tidak melelahkan mata.

---

## 2. Identitas Visual & Token Desain (Design Tokens)

### 2.1. Palet Warna (Color Palette)
Menggunakan pendekatan warna netral gelap (*Zinc/Slate*) yang dipadukan dengan aksen hijau elektrik (*Emerald/Mint*) sebagai penanda koneksi aktif dan sinyal P2P.

| Token | Hex Code | Penggunaan |
| :--- | :--- | :--- |
| `--bg-canvas` | `#09090B` | Latar belakang utama aplikasi |
| `--bg-surface` | `#121215` | Kartu perangkat, panel *clipboard*, dan modal |
| `--bg-surface-hover` | `#1C1C21` | Status *hover* pada elemen interaktif |
| `--border-subtle` | `#27272A` | Garis pemisah tipis dan lingkaran radar |
| `--accent-primary` | `#10B981` | Status *Connected*, tombol aksi utama, indikator progres |
| `--accent-glow` | `rgba(16, 185, 129, 0.15)` | Efek pendaran halus (*glow*) pada animasi gelombang radar |
| `--text-primary` | `#F4F4F5` | Teks judul, nama perangkat, dan isi pesan |
| `--text-secondary` | `#A1A1AA` | Label sekunder, ukuran file, informasi kecepatan transfer |
| `--status-warning` | `#F59E0B` | Status menunggu persetujuan (*Pending Approval*) |
| `--status-danger` | `#EF4444` | Tombol tolak/batal dan status koneksi terputus |

### 2.2. Tipografi (Typography)
Memadukan huruf geometris bersih untuk antarmuka umum dan huruf *monospace* untuk elemen teknis (kode ruangan, kecepatan transfer, blok kode, dan nama alias).

* **Primary UI Font:** `Inter` atau `Plus Jakarta Sans` (Sans-serif).
* **Technical / Code Font:** `JetBrains Mono` atau `Fira Code` (Monospace).

| Skala | Ukuran | Weight | Line Height | Penggunaan |
| :--- | :--- | :--- | :--- | :--- |
| `Heading-1` | `20px` (1.25rem) | `600` (SemiBold) | `1.3` | Nama aplikasi / Header modal |
| `Device-Label` | `14px` (0.875rem) | `500` (Medium) | `1.4` | Nama alias perangkat di radar |
| `Body-Text` | `14px` (0.875rem) | `400` (Regular) | `1.5` | Teks pesan instan & deskripsi |
| `Mono-Badge` | `12px` (0.75rem) | `500` (Medium) | `1.2` | Kode ruangan (`RX-849A`), kecepatan (`42.5 MB/s`), persentase |

---

## 3. Tata Letak & Struktur Layar (Layout & Wireframe)

Aplikasi menggunakan tata letak **Single-Screen Viewport** (`100dvh`) tanpa *scroll* berlebih pada layar utama agar seluruh kontrol mudah dijangkau ibu jari pada perangkat mobile.

### 3.1. Struktur Layar Utama (Desktop & Mobile)

```
+-------------------------------------------------------------------+
| [Logo: REGEX]              [Status: Wi-Fi Local]   [QR / Room]    | -> Top Bar
+-------------------------------------------------------------------+
|                                                                   |
|                        . - ~ ~ ~ - .                              |
|                    . '   [Device B]  ' .                          |
|                  /        (Mobile)       \                        |
|                 |            o            |                       | -> Radar Zone
|                  \       (You: Fox)      /                        |   (Drop Target)
|                    ' .               . '                          |
|                        ' - . _ . - '                              |
|                                                                   |
+-------------------------------------------------------------------+
| [ Send Text / Paste Clipboard...                     ] [ Send ]   | -> Quick Text Bar
+-------------------------------------------------------------------+
| You are known as: Cobalt Fox (Edit) • Encrypted P2P (WebRTC)      | -> Footer Status
+-------------------------------------------------------------------+
```

### 3.2. Adaptasi Responsif
* **Desktop (`>= 768px`):**
  * Mendukung *Full-Screen Drag & Drop Overlay*: Saat pengguna menyeret file ke jendela browser mana pun, seluruh layar berubah menjadi zona target bergaris putus-putus dengan teks *"Lepaskan file untuk mengirim ke [Nama Perangkat]"*.
  * Panel *Instant Text / Clipboard* dapat diperluas menjadi *sidebar* kanan jika ada riwayat percakapan/potongan teks selama sesi berlangsung.
* **Mobile (`< 768px`):**
  * Tombol **Scan QR / Kode Ruangan** ditempatkan menonjol di bagian atas/bawah agar mudah diakses dengan satu tangan.
  * Mengetuk ikon perangkat di radar langsung membuka *native file picker* atau menu pilihan cepat (*Kirim File* vs *Kirim Teks*).

---

## 4. Komponen Antarmuka Utama (Core Components)

### 4.1. Radar Discovery Canvas
* **Visual:** 3 hingga 4 lingkaran konsentris tipis (`1px solid --border-subtle`) dengan animasi gelombang sonar halus yang memancar keluar setiap 3 detik saat mencari perangkat.
* **Node Perangkat (Peer Node):**
  * Berbentuk kapsul atau lingkaran berdiameter `64px` dengan ikon vektor perangkat (Laptop, Smartphone, Tablet) di tengah.
  * Label nama alias di bawahnya (misal: *Cobalt Fox*) beserta sub-label OS/Browser kecil (misal: *Android • Chrome*).
  * Ketika terhubung langsung (*P2P Active*), cincin luar node menyala dengan warna `--accent-primary`.

### 4.2. Modal Persetujuan & Progres Transfer (Transfer Sheet)
Muncul sebagai *Centered Modal* di desktop dan *Bottom Sheet* di mobile:
* **State 1: Incoming Offer (Sisi Penerima)**
  * Menampilkan nama pengirim, jumlah file, daftar nama file dengan ikon tipe file, dan total ukuran (misal: `3 files • 148.2 MB`).
  * Checkbox opsional: *"Otomatis terima file dari perangkat ini selama sesi ini"*.
  * Dua tombol jelas: **Tolak** (*Secondary/Ghost*) dan **Terima & Unduh** (*Primary Accent*).
* **State 2: Active Transfer (Pengirim & Penerima)**
  * *Progress bar* linear setinggi `6px` dengan sudut membulat penuh.
  * Metrik *real-time* dalam font monospace: `68% • 38.4 MB/s • Sisa ~3 dtk`.
  * Tombol **Batalkan** untuk memutus *stream* jika diperlukan.
* **State 3: Completed**
  * Tanda centang animasi singkat. Jika file berjumlah lebih dari 1, muncul tombol sekunder **Unduh Semua (.ZIP)**.

### 4.3. Instant Text & Clipboard Drawer
* Area input ringkas di bagian bawah layar yang otomatis membesar hingga 4 baris saat teks panjang ditempel (*paste*).
* **Tampilan Pesan Diterima:**
  * Muncul sebagai kartu ringkas di atas radar atau dalam *drawer* riwayat sesi.
  * Jika teks terdeteksi sebagai URL (`http://` atau `https://`), otomatis menampilkan tombol **Buka Tautan** di samping tombol **Salin Teks**.
  * Jika teks terdiri dari banyak baris atau mengandung sintaks kode, dirender dalam blok `monospace` dengan latar belakang gelap pekat (`#09090B`).

### 4.4. QR & Room Pairing Modal
Terbagi menjadi dua tab sederhana agar tidak membingungkan pengguna:
1. **Tab "Tampilkan Kode" (Host):** Menampilkan QR Code kontras tinggi (hitam di atas latar putih bersih agar mudah dipindai kamera apa pun) serta kode 6-digit besar (`RX-849A`) dengan tombol salin tautan sekali klik.
2. **Tab "Pindai / Gabung" (Guest):** Mengaktifkan pemindai kamera langsung di dalam browser (`html5-qrcode`) beserta input teks 6-digit di bawahnya jika pengguna ingin mengetik kode secara manual.

---

## 5. Micro-Interactions & Status Koneksi

| Status | Indikator Visual | Perilaku Interaksi |
| :--- | :--- | :--- |
| **Searching** | Gelombang radar berdenyut pelan (`opacity: 0.4 -> 0`) | Pengguna dapat membuka QR pairing sembari menunggu. |
| **Handshaking** | Garis penghubung putus-putus beranimasi antara titik tengah dan node tujuan | Menampilkan teks mikro *"Menghubungkan P2P..."*. |
| **Connected** | Garis penghubung solid berwarna hijau emerald | File atau teks langsung terkirim tanpa jeda jabat tangan ulang. |
| **Error / NAT Blocked** | Ikon peringatan kuning pada node perangkat | Menampilkan pesan ringkas dengan saran memakai mode QR Room atau jaringan Wi-Fi yang sama. |

---

## 6. Standar Aksesibilitas (Accessibility)
* **Kontras Warna:** Seluruh teks utama memenuhi rasio kontras minimal **WCAG AA (4.5:1)** terhadap latar belakang gelap.
* **Navigasi Keyboard:** Seluruh node perangkat di radar dapat difokuskan menggunakan tombol `Tab` dan dipilih dengan `Enter`/`Space`. Pintasan `Ctrl/Cmd + V` bekerja secara global untuk mengirim isi *clipboard* ke perangkat yang sedang dipilih.
* **Reduced Motion:** Menghormati preferensi sistem `prefers-reduced-motion` dengan mematikan animasi gelombang radar dan menggantinya dengan indikator statis.