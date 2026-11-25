# System Architecture Document — Regex

| Metadata | Detail |
| :--- | :--- |
| **Nama Produk** | Regex |
| **Versi Dokumen** | 1.0 |
| **Tipe Arsitektur** | Hybrid P2P (WebRTC Data Channels + Lightweight WebSocket Signaling) |
| **Target Stack** | TypeScript, React/Next.js (atau Vite SPA), Node.js/Cloudflare Workers (Signaling) |

---

## 1. Gambaran Umum Arsitektur (High-Level Architecture)

**Regex** menggunakan arsitektur **Peer-to-Peer (P2P)** murni untuk jalur data (*Data Plane*) dan arsitektur **Client-Server** yang sangat ringan hanya untuk proses penemuan perangkat dan jabat tangan awal (*Control/Signaling Plane*).

```
+-------------------------------------------------------------------+
|                   SIGNALING SERVER (Control Plane)                |
|   - Mengelompokkan peer berdasarkan IP Hash (Local Discovery)     |
|   - Mengelola Room Code sementara (Cross-Network Pairing)         |
|   - Meneruskan SDP Offer/Answer & ICE Candidates (Stateless)      |
+-------------------------------------------------------------------+
                 ^                                 ^
                 | WebSocket (WSS)                 | WebSocket (WSS)
                 v                                 v
+---------------------------------+ +---------------------------------+
|      CLIENT A (Browser)         | |      CLIENT B (Browser)         |
|  - WebRTC Engine (DataChannel)  | |  - WebRTC Engine (DataChannel)  |
|  - File Chunker & Flow Control  | |  - Stream Assembler / ZIP       |
|  - IndexedDB / Memory Buffer    | |  - IndexedDB / Memory Buffer    |
+---------------------------------+ +---------------------------------+
                 |                                 ^
                 +=================================+
                  Direct P2P WebRTC DataChannel (DTLS)
                    (File Chunks & Instant Text)
```

### Prinsip Desain Utama
1. **Zero Data Persistence di Server:** Server tidak memiliki *database* permanen maupun *object storage* (seperti S3). Seluruh status ruangan dan daftar perangkat aktif hanya disimpan di memori sementara (*in-memory Map* atau *Durable Objects*).
2. **Binary-First Protocol:** Transfer file melalui WebRTC menggunakan `ArrayBuffer` mentah tanpa *encoding* Base64 untuk menghindari pembengkakan ukuran payload sebesar ~33%.
3. **Strict Backpressure Control:** Pengiriman paket data dikendalikan sepenuhnya oleh kapasitas *buffer* jaringan browser untuk mencegah *crash* memori pada file berukuran besar.

---

## 2. Rekomendasi Tech Stack

* **Frontend (Client SPA):**
  * **Framework:** Vite + React + TypeScript (ringan, *build* cepat, mudah dikonfigurasi sebagai PWA).
  * **State Management:** Zustand (untuk mengelola status koneksi P2P, antrean transfer, dan daftar perangkat secara reaktif).
  * **Utilitas Klien:** `jszip` (untuk fitur *Download All as ZIP*), `qrcode.react` (generator QR Code), `html5-qrcode` (pemindai QR lewat kamera HP).
* **Signaling Server:**
  * **Opsi A (Serverless Edge):** Cloudflare Workers + Durable Objects (latensi sangat rendah secara global, manajemen WebSocket bawaan per ruangan/IP).
  * **Opsi B (Node.js):** Fastify + `ws` (native WebSocket) berjalan di atas Docker/VPS.
* **NAT Traversal:**
  * **STUN:** Google Public STUN (`stun:stun.l.google.com:19302`) & Cloudflare STUN (`stun:stun.cloudflare.com:3478`).
  * **TURN (Opsional/Fallback):** Cloudflare Calls TURN atau self-hosted `coturn` untuk jaringan seluler/kantor dengan *Symmetric NAT*.

---

## 3. Mekanisme Penemuan & Persinyalan (Discovery & Signaling)

### 3.1. Dua Mode Penemuan Perangkat
1. **Auto-Discovery (Jaringan Lokal / Wi-Fi Sama):**
   * Saat klien terhubung ke WebSocket, server mengekstrak alamat IP publik klien (dari header `CF-Connecting-IP` atau `X-Forwarded-For`).
   * Server melakukan *hashing* satu arah pada IP tersebut (`SHA-256(ip + daily_salt)`) untuk menjaga privasi IP pengguna.
   * Klien otomatis dimasukkan ke dalam *channel* virtual berbasis *hash* IP tersebut dan menerima daftar perangkat aktif lain di jaringan yang sama.
2. **Manual Room / QR Pairing (Lintas Jaringan):**
   * Pengirim meminta pembuatan *Room ID* acak 6 karakter alfanumerik (misal: `RX-849A`).
   * URL pairing dibentuk: `https://regex.app/?room=RX-849A` dan dirender menjadi QR Code.
   * Penerima yang memindai QR Code akan bergabung ke *channel* WebSocket ruangan tersebut dan langsung memulai jabat tangan WebRTC.

### 3.2. Protokol Pesan Signaling (JSON over WebSocket)
Semua pesan antara Klien dan Signaling Server mengikuti skema JSON berikut:

```typescript
type SignalingMessage =
  | { type: 'JOIN_LOCAL'; peerInfo: PeerMetadata }
  | { type: 'JOIN_ROOM'; roomId: string; peerInfo: PeerMetadata }
  | { type: 'PEER_LIST'; peers: PeerMetadata[] }
  | { type: 'PEER_JOINED'; peer: PeerMetadata }
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'SIGNAL'; targetId: string; senderId: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit };
```

---

## 4. Arsitektur Transfer Data P2P (WebRTC Engine)

### 4.1. Konfigurasi `RTCDataChannel`
Untuk menjamin keutuhan data file dan teks, kanal data dikonfigurasi dalam mode andal (*reliable & ordered*):
* `ordered: true` (menjamin urutan potongan file tiba sesuai urutan pengiriman).
* `binaryType = 'arraybuffer'` (mengirim data biner murni).

### 4.2. Protokol Komunikasi P2P (Control vs Binary Frames)
Di dalam satu `RTCDataChannel`, pesan dibedakan berdasarkan tipe datanya (`string` untuk kontrol JSON, `ArrayBuffer` untuk isi file):

1. **Control Messages (`typeof event.data === 'string'`):**
   * `TEXT_DROP`: Mengirim pesan teks/kode instan.
   * `TRANSFER_OFFER`: Mengirim metadata daftar file (nama, ukuran, tipe MIME, jumlah *chunk*) sebelum pengiriman biner dimulai.
   * `TRANSFER_ACCEPT` / `TRANSFER_DECLINE`: Respons penerima atas tawaran file.
   * `FILE_COMPLETE`: Penanda akhir satu file agar penerima bisa merakit ulang file tersebut.
2. **Binary Chunks (`event.data instanceof ArrayBuffer`):**
   * Potongan data mentah berukuran tetap (**64 KB / `65536` bytes**) yang aman untuk batas ukuran paket SCTP di seluruh browser modern.

### 4.3. Manajemen Memori & Backpressure (Anti-Crash)
Mengirim file 1 GB tanpa jeda akan memenuhi memori RAM browser (*Out of Memory*). Sistem menerapkan siklus *backpressure* berikut di sisi pengirim:

```typescript
const CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_BUFFER_AMOUNT = 4 * 1024 * 1024; // 4 MB threshold

dataChannel.bufferedAmountLowThreshold = 1024 * 1024; // 1 MB

async function sendFile(file: File, channel: RTCDataChannel) {
  let offset = 0;
  while (offset < file.size) {
    // Tunggu jika buffer jaringan sedang penuh
    if (channel.bufferedAmount > MAX_BUFFER_AMOUNT) {
      await new Promise<void>((resolve) => {
        channel.onbufferedamountlow = () => {
          channel.onbufferedamountlow = null;
          resolve();
        };
      });
    }

    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    channel.send(buffer);
    offset += buffer.byteLength;
  }
}
```

### 4.4. Perakitan File di Sisi Penerima (File Assembly)
* **File Kecil - Menengah (< 250 MB):** *Chunk* `ArrayBuffer` dikumpulkan dalam array di memori, lalu digabung menjadi `new Blob(chunks, { type: mimeType })` dan dipicu unduhannya via `URL.createObjectURL()`.
* **File Besar (> 250 MB) / Multi-File:** Menggunakan penyimpanan sementara di **IndexedDB** (atau *File System Access API* `showSaveFilePicker()` pada browser berbasis Chromium) agar penggunaan RAM tetap rendah selama proses penerimaan berlangsung.

---

## 5. Struktur Direktori Proyek (Frontend Monorepo/SPA)

```text
regex-app/
├── public/
│   ├── manifest.json         # Konfigurasi PWA (mendukung Web Share Target)
│   └── sw.js                 # Service Worker minimal
├── src/
│   ├── core/
│   │   ├── signaling.ts      # Manajemen koneksi WebSocket & auto-reconnect
│   │   ├── webrtc.ts         # Wrapper RTCPeerConnection & ICE handling
│   │   ├── fileTransfer.ts   # Logic chunking, backpressure, & kalkulasi kecepatan
│   │   └── storage.ts        # Helper IndexedDB & pembungkus ZIP
│   ├── store/
│   │   └── useSessionStore.ts # State global perangkat, peer aktif, & antrean transfer
│   ├── components/
│   │   ├── RadarView.tsx     # Visualisasi perangkat lokal & QR pairing
│   │   ├── TransferModal.tsx # Dialog persetujuan & progres transfer
│   │   └── ClipboardBox.tsx  # Panel kirim/terima teks & kode instan
│   ├── utils/
│   │   └── identity.ts       # Generator nama alias acak & deteksi OS/Browser
│   └── App.tsx
└── worker/                   # Kode Signaling Server (Cloudflare Worker / Node)
    └── signaling-server.ts
```

---

## 6. Pertimbangan Keamanan & Privasi

1. **Enkripsi End-to-End Bawaan:** WebRTC mewajibkan enkripsi **DTLS (Datagram Transport Layer Security)** untuk seluruh `RTCDataChannel`. Kunci enkripsi dinegosiasikan langsung oleh kedua browser menggunakan sidik jari sertifikat (*certificate fingerprint*) di dalam SDP.
2. **Isolasi IP Publik:** Signaling server tidak pernah membocorkan alamat IP asli pengguna kepada klien lain di radar lokal; pengelompokan murni menggunakan nilai *hash* yang di-reset setiap 24 jam.
3. **Sanitasi Input Teks:** Seluruh teks yang diterima melalui fitur *Instant Text Drop* di-render sebagai teks murni (*escaped string*) untuk mencegah serangan XSS (*Cross-Site Scripting*) jika pengirim mengirimkan potongan kode HTML/JS berbahaya.
4. **Rate Limiting pada Signaling:** Membatasi frekuensi pembuatan ruangan dan pengiriman pesan sinyal per koneksi WebSocket untuk mencegah penyalahgunaan (*spamming*) pada server persinyalan.