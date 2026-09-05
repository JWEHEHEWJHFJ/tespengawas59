# SIM Sekolah — SMA Negeri 5 Pinrang

Portal manajemen sekolah statis (HTML/CSS/JS, tanpa backend/build tool). Semua
data dibaca langsung dari file JSON di folder `data/`, jadi kalau file JSON
itu diedit lalu di-push ke GitHub, tampilan aplikasi otomatis ikut berubah —
tidak perlu ubah kode.

## Struktur

```
index.html      -> halaman login + kerangka aplikasi
style.css       -> semua styling
app.js          -> logic login, routing, dan render tiap dashboard
data/*.json     -> sumber data (persis dari file yang kamu unggah)
```

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
