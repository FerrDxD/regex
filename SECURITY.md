# Security

## Model ancaman

Regex dirancang untuk meminimalkan permukaan serangan dari awal.

- **Tidak ada penyimpanan server.** File dan teks tidak pernah menyentuh server dalam bentuk apa pun. Signaling server hanya meneruskan metadata SDP/ICE untuk membangun koneksi WebRTC, lalu keluar dari jalur.
- **Data bergerak langsung antar browser** melalui RTCDataChannel yang dienkripsi oleh DTLS (standar WebRTC). Tidak ada layer enkripsi tambahan yang diimplementasikan oleh aplikasi ini karena DTLS sudah wajib di semua browser modern.
- **IP tidak disebarkan.** Server menghash alamat IP klien dengan SHA-256 dan daily salt sebelum digunakan untuk pengelompokan jaringan lokal. Alamat IP mentah tidak pernah dikirim ke klien lain.
- **Konten teks dirender sebagai teks biasa.** Fitur Instant Text Drop tidak menggunakan `dangerouslySetInnerHTML`. Tautan dideteksi dengan regex dan dirender sebagai `<a target="_blank" rel="noopener noreferrer">`.

## Yang perlu dipahami pengguna

WebRTC menggunakan ICE untuk menemukan jalur koneksi terbaik. Dalam proses ini, alamat IP lokal dan publik perangkat bisa terekspos ke peer yang terhubung. Ini adalah perilaku standar WebRTC di semua browser dan bukan bug Regex.

Jika privasi IP adalah kebutuhan utama, gunakan browser dengan WebRTC leak protection atau VPN sebelum membuka sesi.

## Melaporkan kerentanan

Jangan buka issue publik untuk kerentanan keamanan.

Kirim laporan ke: **[email di profil GitHub]**

Sertakan:
- Deskripsi kerentanan
- Langkah reproduksi
- Dampak yang mungkin terjadi
- Versi browser dan OS

Laporan akan direspons dalam 72 jam. Jika kerentanan dikonfirmasi, patch akan dirilis sebelum detail dipublikasikan.

## Cakupan

Yang masuk cakupan:
- Kerentanan di signaling server (`worker/`)
- Kerentanan di logika transfer (`src/core/`)
- Kebocoran data antar peer yang tidak seharusnya terjadi
- Bypass validasi konten yang memungkinkan XSS

Yang tidak masuk cakupan:
- Perilaku WebRTC standar yang ada di semua browser (termasuk IP leak via ICE)
- Bug di browser itu sendiri
- Serangan yang membutuhkan akses fisik ke perangkat target
