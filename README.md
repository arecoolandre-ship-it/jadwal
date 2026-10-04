# Jadwal Fantastic 4 (PWA)

Webapp jadwal shift yang membaca data langsung dari Google Sheets, bisa dipasang di layar utama HP/PC dan tetap terbuka saat offline (menampilkan data terakhir yang tersimpan).

## Isi folder
- `index.html` - aplikasi
- `manifest.json` - identitas aplikasi (nama, ikon, warna)
- `sw.js` - service worker (offline)
- `icons/` - ikon aplikasi

## Deploy ke GitHub Pages
1. Upload semua isi folder ini ke root repo (bukan folder pembungkusnya).
2. Repo > Settings > Pages > Source: Deploy from a branch > Branch: `main` / `(root)` > Save.
3. Buka `https://<username>.github.io/<nama-repo>/` lewat HTTPS.

## Pasang di perangkat
- Android/Chrome/Edge: tombol "Pasang aplikasi" muncul di header, atau menu browser > Install app.
- iPhone/Safari: tombol Bagikan > Add to Home Screen.

## Update aplikasi
Ubah file lalu commit. Halaman memuat versi terbaru saat online. Jika ikon atau daftar file berubah, naikkan `VERSION` di `sw.js` (mis. `v2`).
