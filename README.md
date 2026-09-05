# SIM Sekolah — SMA Negeri 5 Pinrang

Portal manajemen sekolah statis (HTML/CSS/JS, tanpa backend/build tool). Semua
data dibaca langsung dari file JSON di folder `data/`, jadi kalau file JSON
itu diedit lalu di-push ke GitHub, tampilan aplikasi otomatis ikut berubah —
tidak perlu ubah kode.

## Struktur

```
index.html      -> halaman login + kerangka aplikasi
style.css       -> semua styling
app.js          -> logic login, routing, dashboard, dan fitur tambah/ubah/hapus data
data/*.json     -> sumber data awal (persis dari file yang kamu unggah)
```

## Fitur tambah / ubah / hapus data

Setiap tabel data di semua unit (BK, Kesiswaan, Kurikulum, Humas, Sarpras,
Tata Usaha, OSIS/Pramuka/PMR/Paskibra) punya:

- **Tombol bulat "+" mengambang** di kanan bawah untuk membuka form tambah data.
- **Ikon pensil** di setiap baris tabel untuk mengubah data itu.
- **Ikon tempat sampah** di setiap baris tabel untuk menghapus data (dengan konfirmasi).

Perubahan disimpan otomatis di **localStorage browser** (per divisi/koleksi
data), lalu langsung dipakai untuk menggantikan data JSON asli saat aplikasi
dibuka lagi di perangkat/browser yang sama. Tab yang sifatnya laporan lintas
unit (mis. "Laporan BK" dan "Laporan Organisasi" di Wakasek Kesiswaan, serta
ringkasan Kepala Sekolah/Pengawas) sengaja dibuat **hanya lihat**, karena itu
tempat memantau data unit lain, bukan tempat mengubahnya.

**Catatan penting:** localStorage tersimpan per browser/perangkat, jadi
perubahan yang dibuat di laptop kamu tidak otomatis muncul di HP orang lain
yang membuka situs yang sama — beda dengan mengedit file JSON langsung yang
otomatis sinkron untuk semua orang. Untuk sinkron ke semua perangkat lewat
GitHub, cara paling aman adalah lewat backend kecil (mis. GitHub Action atau
serverless function) yang menyimpan token secara aman di server — **jangan
pernah menaruh personal access token GitHub di kode JavaScript sisi
browser**, karena kode itu bisa dibaca siapa saja yang membuka situsnya.

## Cara deploy ke GitHub Pages

1. Buat repository baru di GitHub, upload semua isi folder ini ke branch `main`.
2. Buka **Settings → Pages**, pilih source `Deploy from a branch`, branch `main`, folder `/root`.
3. Tunggu 1–2 menit, situs akan aktif di `https://<username>.github.io/<nama-repo>/`.

Karena aplikasi memakai `fetch()` untuk membaca file JSON, ia harus diakses
lewat server (GitHub Pages, atau `python3 -m http.server` untuk tes lokal) —
membuka `index.html` langsung dari file explorer (`file://`) akan diblokir
browser (CORS).

## Login

Akun ada di `data/users.json`. Contoh:

| Username   | Password      | Peran                  |
|------------|---------------|-------------------------|
| gurubk     | bk123         | Guru BK                 |
| wakesis    | wakesis123    | Wakasek Kesiswaan       |
| wakur      | wakur123      | Wakasek Kurikulum       |
| wahumas    | wahumas123    | Wakasek Humas           |
| wasarpras  | wasarpras123  | Wakasek Sarana Prasarana|
| tu         | tu123         | Tata Usaha              |
| osis / pramuka / pmr / paskibra | ...123 | Pengurus organisasi |
| kepsek     | kepsek123     | Kepala Sekolah (ringkasan lintas unit) |
| pengawas   | pengawas123   | Pengawas Sekolah (ringkasan lintas unit) |

**Catatan keamanan:** username & password disimpan sebagai teks biasa di
`data/users.json` yang bisa dibaca siapa saja lewat browser. Ini cocok untuk
demo/prototipe internal, tapi jangan dipakai untuk data sungguhan yang
sensitif tanpa backend otentikasi yang semestinya.

## Menambah/mengubah data

Cukup edit file JSON terkait di `data/`, commit, push — tidak ada langkah build.
Struktur setiap file mengikuti persis file yang diunggah sebelumnya (kunci
`DATA_GURU_BK`, `DATA_KESISWAAN`, dst.), kecuali `osis.json`, `pramuka.json`,
`pmr.json`, `paskibra.json` yang masing-masing ditambah field `pembina` di
level atas.
