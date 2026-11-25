# Design Doc — Milestone 1: Fondasi & Signaling Server

**Tanggal:** 2026-11-25
**Status:** Disetujui oleh human partner
**Milestone:** 1 dari 4 (Fondasi, Setup & Signaling)

---

## 1. Intent & Why

Regex adalah aplikasi web utilitas transfer file dan teks instan berbasis P2P (WebRTC Data Channels) tanpa penyimpanan server (zero-server storage). Sebelum data file atau teks dapat mengalir secara langsung antar-perangkat, dua browser harus:

1. Saling menemukan (device discovery) melalui signaling server ringan.
2. Bertukar metadata SDP Offer/Answer dan ICE Candidates (WebRTC handshake).
3. Membangun jalur WebRTC DataChannel langsung (DTLS-encrypted).

Milestone 1 membangun fondasi ini saja: struktur repo yang ramah AI agent, signaling server ringan (WebSocket), klien WebSocket dengan auto-reconnect, generator identitas perangkat, dan HTTPS tunnel lokal agar uji lintas perangkat (laptop + HP dalam satu Wi-Fi) bisa dilakukan.

Transfer file P2P, WebRTC DataChannel, UI Radar, QR pairing, dan fitur lainnya ditangguhkan ke Milestone 2–4.

---

## 2. Goals, Non-Goals, Anti-Goals

### Goals
1. Dua perangkat dalam satu jaringan Wi-Fi (diakses via HTTPS tunnel) saling terdeteksi dalam waktu < 2 detik setelah membuka aplikasi.
2. Signaling server hanya meneruskan metadata SDP/ICE dan mengelola in-memory room/peer map. Tidak ada database, tidak ada object storage.
3. Alamat IP klien di-hash satu arah (`SHA-256(ip + daily salt)`) sebelum digunakan untuk pengelompokan jaringan lokal. IP mentah tidak pernah dikirim ke klien lain dalam payload JSON.
4. Klien WebSocket (`src/core/signaling.ts`) otomatis menyambung ulang jika koneksi terputus sementara.
5. Tidak ada warning/error TypeScript (`tsc --noEmit` lolos).

### Non-Goals (Milestone 1)
- WebRTC `RTCPeerConnection` dan `RTCDataChannel` (Milestone 2).
- Chunking file, backpressure, perakitan file (Milestone 2).
- UI Radar, Drag & Drop, Clipboard box (Milestone 3).
- QR Code pairing, Instant Text Drop, Transfer Sheet (Milestone 3).
- PWA, Service Worker, TURN fallback, split deployment (Milestone 4).
- Landing page, login/register, onboarding (dilarang sepenuhnya per AGENTS.md).

### Anti-Goals
- Tidak ada halaman landing sebelum radar utama muncul.
- Tidak ada pustaka UI berat (Material UI, Ant Design, dll.); hanya Tailwind CSS + lucide-react.
- Tidak ada konversi chunk file ke Base64 (binary-first, ArrayBuffer mentah).
- Tidak ada `CHUNK_SIZE` di atas 64 KB (65536 bytes).

---

## 3. Constraints (dari AGENTS.md, ARCHITECT.md, DESIGN.md)

| Aspek | Constraint |
|-------|------------|
| Bahasa | TypeScript, `strict: true`, hindari `any`; gunakan `unknown` + type guards |
| Frontend | Vite + React (functional components + hooks) + Tailwind CSS + Zustand |
| Pemisahan logika | WebRTC, WebSocket, chunking, kalkulasi kecepatan di `src/core/` (murni TS, terpisah dari React) |
| UI | Komponen hanya baca state dari Zustand dan panggil actions |
| Cleanup | Setiap event listener WebRTC/WebSocket dan object URL dibersihkan saat unmount/selesai |
| Desain | Dark theme first (`#09090B` bg, `#121215` surface, `#10B981` accent), monospace untuk metrik angka |
| Signaling | Cloudflare Workers + Durable Objects (disetujui), in-memory room/peer map |
| IP privacy | SHA-256(ip + daily salt), daily salt reset tiap 24 jam |
| Room ID | 6 karakter alfanumerik acak (misal `RX-849A`) |
| Uji lokal | HTTPS tunnel (`cloudflared` atau `ngrok`) wajib untuk WebRTC + Clipboard API di HP |

---

## 4. Approaches Considered

### Approach A (Dipilih): Cloudflare Workers + Durable Objects
- **Keuntungan:** Zero-storage cocok dengan in-memory Durable Objects, WSS bawaan, latency rendah secara global, tidak perlu mengelola server sendiri.
- **Trade-off:** Terikat ke ekosistem Cloudflare; konfigurasi Durable Objects sedikit lebih kompleks dari WebSocket sederhana.
- **Alasan dipilih:** Sesuai dengan prinsip zero-storage dan ARCHITECT.md opsi A; deploy terpisah dari frontend SPA.

### Approach B (Ditinggalkan): Node.js + Fastify + `ws`
- **Keuntungan:** Kontrol penuh, mudah dijalankan lokal untuk develop.
- **Trade-off:** Perlu manajemen server/VPS sendiri, stateful WebSocket memerlukan pengelolaan proses, tidak cocok dengan zero-storage tanpa effort tambahan.
- **Alasan ditinggalkan:** Milestone 1 difokuskan pada fondasi cepat; Cloudflare Workers lebih ringan dan tidak perlu infrastruktur server dedikasi.

---

## 5. Struktur Direktori (The How)

```
regex/
├── AGENTS.md                      # di root (sudah ada)
├── docs/
│   ├── PRD.md
│   ├── ARCHITECT.md
│   ├── DESIGN.md
│   ├── MILESTONES.md
│   └── superpowers/
│       └── specs/
│           └── 2026-11-25-milestone-1-design.md
├── public/
│   ├── manifest.json              # PWA (nanti, Milestone 4)
│   └── sw.js                      # Service Worker (nanti, Milestone 4)
├── src/
│   ├── core/
│   │   ├── signaling.ts           # WebSocket client + auto-reconnect
│   │   ├── webrtc.ts              # (Milestone 2)
│   │   ├── fileTransfer.ts        # (Milestone 2)
│   │   └── storage.ts             # (Milestone 2)
│   ├── store/
│   │   └── useSessionStore.ts     # Zustand: device, peer, transfer queue
│   ├── components/
│   │   ├── RadarView.tsx          # (Milestone 3)
│   │   ├── TransferModal.tsx      # (Milestone 3)
│   │   └── ClipboardBox.tsx       # (Milestone 3)
│   ├── utils/
│   │   └── identity.ts            # Generator alias acak, deteksi OS/Browser
│   ├── App.tsx
│   └── main.tsx
├── worker/
│   └── signaling-server.ts        # Cloudflare Worker + Durable Objects
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── wrangler.toml                  # Cloudflare Workers config
```

---

## 6. Kontrak Tipe (Types First)

**SignalingMessage** (JSON over WebSocket, client ↔ server):

```typescript
type PeerMetadata = {
  peerId: string;
  alias: string;
  deviceType: 'desktop' | 'mobile';
  os: string;
  browser: string;
  ipHash: string;        // SHA-256(ip + daily salt), never raw IP
  joinedAt: number;
};

type SignalingMessage =
  | { type: 'JOIN_LOCAL'; peerInfo: PeerMetadata }
  | { type: 'JOIN_ROOM'; roomId: string; peerInfo: PeerMetadata }
  | { type: 'PEER_LIST'; peers: PeerMetadata[] }
  | { type: 'PEER_JOINED'; peer: PeerMetadata }
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'SIGNAL'; targetId: string; senderId: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit };
```

**P2PControlMessage** (di dalam RTCDataChannel, Milestone 2, didefinisikan di sini untuk konsistensi):

```typescript
type P2PControlMessage =
  | { type: 'TEXT_DROP'; text: string; senderId: string }
  | { type: 'TRANSFER_OFFER'; files: FileMeta[]; senderId: string }
  | { type: 'TRANSFER_ACCEPT'; fileId: string; receiverId: string }
  | { type: 'TRANSFER_DECLINE'; fileId: string; receiverId: string }
  | { type: 'FILE_COMPLETE'; fileId: string; receiverId: string };

type FileMeta = {
  fileId: string;
  name: string;
  size: number;
  type: string;          // MIME type
  chunkCount: number;
};
```

---

## 7. Alur Kerja Utama (Milestone 1)

1. Klien buka aplikasi via HTTPS tunnel.
2. `identity.ts` menghasilkan alias acak (contoh: *Cobalt Fox*), deteksi Desktop/Mobile, simpan ke `localStorage`.
3. `signaling.ts` buat koneksi WebSocket ke signaling server, kirim `JOIN_LOCAL` dengan `peerInfo` (termasuk `ipHash`, tidak ada IP mentah).
4. Signaling server grouped client ke channel berdasarkan `ipHash`, kirim balas `PEER_LIST` dengan perangkat aktif lain di jaringan yang sama.
5. Saat ada peer baru, server siaran `PEER_JOINED` ke semua anggota channel.
6. Saat klien putus, server siaran `PEER_LEFT` dan bersihkan entri dari in-memory map.
7. Jika WebSocket terputus, `signaling.ts` mencoba reconnect dengan exponential backoff.

---

## 8. Yang Tersisa kepada Builder

- Implementasi file concrete sesuai struktur di atas.
- Konfigurasi Vite, Tailwind CSS, Zustand, TypeScript strict.
- Skrip pengembangan untuk HTTPS tunnel (`cloudflared` atau `ngrok`).
- Uji manual: buka URL tunnel di laptop dan HP dalam satu Wi-Fi, verifikasi daftar perangkat muncul di kedua sisi dalam < 2 detik.

---

## 9. Approval

Design doc ini telah disetujui oleh human partner. Langkah berikutnya: rencana implementasi melalui `superpowers:writing-plans`, lalu implementasi Milestone 1.