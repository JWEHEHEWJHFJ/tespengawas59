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
data/organisasi/     -> profil semua organisasi/ekstrakurikuler (lihat di bawah)
sync-worker/    -> proxy Cloudflare Worker opsional untuk sinkron ke GitHub (lihat di bawah)
```

## Folder `data/organisasi/`

Semua data organisasi siswa disimpan terpisah di folder ini, satu file JSON
per organisasi:

```
data/organisasi/index.json     -> daftar semua organisasi (id, nama, warna)
data/organisasi/osis.json      -> profil OSIS (anggota, prokja, kegiatan, keuangan, lpj)
data/organisasi/pramuka.json
data/organisasi/pmr.json
data/organisasi/paskibra.json
data/organisasi/futsal.json
data/organisasi/paduan-suara.json
data/organisasi/karya-ilmiah-remaja.json
data/organisasi/<slug-baru>.json  -> dibuat otomatis untuk ekstrakurikuler baru (lihat di bawah)
```

**Tab "Ekstrakurikuler" di Wakasek Kesiswaan SEKARANG memakai daftar ini
langsung** — bukan daftar terpisah lagi. Nama, Pembina, dan Jadwal yang
tampil di sana diambil dan diedit langsung dari `data/organisasi/index.json`;
kolom Anggota dihitung otomatis dari isi `anggota` di file profil masing-masing
organisasi. Jadi menambah "ekstrakurikuler" = menambah organisasi baru, dan
keduanya selalu sinkron karena sumber datanya sama persis.

**Organisasi baru dibuat otomatis dari tab Ekstrakurikuler.** Saat Wakasek
Kesiswaan menambah data baru di tab "Ekstrakurikuler" (mis. menambah "Klub
Robotik"), aplikasi otomatis:

1. Menambahkan entri baru ke `data/organisasi/index.json` (id dibuat dari nama,
   mis. `klub-robotik`, plus warna yang dipilih otomatis).
2. Menyiapkan profil kosong (anggota, prokja, kegiatan, keuangan, lpj) yang
   nantinya tersimpan di `data/organisasi/klub-robotik.json`.
3. Organisasi itu langsung muncul di tab **Laporan Organisasi** milik Wakasek
   Kesiswaan, lengkap dengan tombol **"+ Tambah anggota/program/kegiatan"** di
   tiap panel, karena organisasi baru ini belum tentu punya akun login sendiri
   di `data/users.json` — jadi Wakasek Kesiswaan yang mengelola datanya untuk
   sementara.

Seperti data lain, ini pertama-tama hanya tersimpan di localStorage browser.
Untuk benar-benar membuat file `data/organisasi/klub-robotik.json` yang baru
di repo GitHub, tekan **"Sinkronkan ke GitHub"** setelah mengatur Worker (lihat
bagian di bawah) — Worker akan membuat file itu otomatis kalau belum ada.

Kalau nanti organisasi itu diberi akun login sendiri (tambahkan manual di
`data/users.json` dengan role sesuai id-nya, lalu tambahkan role itu ke daftar
`MENUS`/`VIEWS` di `app.js`), dashboard pengurusnya akan otomatis membaca dan
menyimpan ke file `data/organisasi/<id>.json` yang sama.

## Fitur tambah / ubah / hapus data

Setiap tabel data di semua unit (BK, Kesiswaan, Kurikulum, Humas, Sarpras,
Tata Usaha, OSIS/Pramuka/PMR/Paskibra, dan organisasi baru dari Ekstrakurikuler)
punya:

- **Tombol bulat "+" mengambang** (atau tombol "+ Tambah" di panel untuk
  Laporan Organisasi) untuk membuka form tambah data.
- **Ikon pensil** di setiap baris tabel untuk mengubah data itu.
- **Ikon tempat sampah** di setiap baris tabel untuk menghapus data (dengan konfirmasi).

Perubahan disimpan otomatis di **localStorage browser** (per divisi/koleksi
data), lalu langsung dipakai untuk menggantikan data JSON asli saat aplikasi
dibuka lagi di perangkat/browser yang sama. Tab "Laporan BK" di Wakasek
Kesiswaan serta ringkasan Kepala Sekolah/Pengawas sengaja dibuat **hanya
lihat**, karena itu tempat memantau data unit lain, bukan tempat mengubahnya.

**Catatan penting:** localStorage tersimpan per browser/perangkat, jadi
perubahan yang dibuat di laptop kamu tidak otomatis muncul di HP orang lain
yang membuka situs yang sama — beda dengan mengedit file JSON langsung yang
otomatis sinkron untuk semua orang. Untuk membuat perubahan benar-benar
ter-push ke repo GitHub secara otomatis, ikuti bagian "Sinkronisasi otomatis
ke GitHub" di bawah.

## Sinkronisasi otomatis ke GitHub

Karena situs ini statis (tidak ada server sendiri), ia **tidak bisa** langsung
memakai personal access token GitHub di kode JavaScript-nya — kode itu
berjalan di browser semua pengunjung, jadi token apa pun yang ditaruh di
sana otomatis bisa diambil siapa saja. Solusinya: token disimpan di server
kecil terpisah (Cloudflare Worker, gratis) yang bertindak sebagai perantara.
Alurnya:

```
Browser (app.js) --POST (kode sinkron)--> Cloudflare Worker --token--> GitHub API
```

Worker-nya sudah disiapkan di folder `sync-worker/`. Langkah deploy:

1. **Cabut token lama** yang pernah kamu kirim di chat (GitHub → Settings →
   Developer settings → Personal access tokens → Revoke), lalu buat token
   baru dengan scope minimal (`repo` saja untuk classic token, atau
   "Contents: Read and write" saja untuk fine-grained token, dibatasi ke
   repo ini saja). Jangan kirim token barunya ke siapa pun, termasuk lewat
   chat AI mana pun — cukup dipakai sekali saat setup di langkah 4.
2. Buat akun gratis di [Cloudflare](https://dash.cloudflare.com/sign-up) (kalau belum punya), lalu install Wrangler (CLI Cloudflare):
   ```
   npm install -g wrangler
   wrangler login
   ```
3. Buka `sync-worker/wrangler.toml`, ganti tiga nilai berikut sesuai repo kamu:
   - `GITHUB_OWNER` → username GitHub kamu
   - `GITHUB_REPO` → nama repo tempat situs ini di-deploy
   - `ALLOWED_ORIGIN` → alamat GitHub Pages kamu, mis. `https://usernamekamu.github.io`
4. Dari dalam folder `sync-worker/`, atur dua rahasia (tidak pernah tersimpan di file, langsung ke server Cloudflare):
   ```
   cd sync-worker
   wrangler secret put GITHUB_TOKEN
   ```
   (tempel token baru dari langkah 1 saat diminta), lalu:
   ```
   wrangler secret put SYNC_PASSCODE
   ```
   (buat kode rahasia sendiri, bebas — ini yang nanti diketik admin/staf di
   aplikasi setiap mau sinkron, BUKAN password login OSIS/BK/dsb).
5. Deploy worker-nya:
   ```
   wrangler deploy
   ```
   Wrangler akan menampilkan URL worker, contoh:
   `https://sim-sekolah-sync.usernamekamu.workers.dev`
6. Buka `app.js` di root proyek (bukan yang di folder `sync-worker/`), cari
   baris `const SYNC_ENDPOINT = '';` lalu isi dengan URL dari langkah 5.
   Commit & push perubahan ini ke repo, tunggu GitHub Pages redeploy.

Setelah itu, di sidebar aplikasi akan ada tombol **"Sinkronkan ke GitHub"**.
Setiap kali ada data yang ditambah/diubah/dihapus, tombol itu menunjukkan
jumlah perubahan yang belum disinkron. Saat ditekan, aplikasi akan meminta
kode sinkron (yang kamu buat di langkah 4) satu kali per sesi browser, lalu
mengirim file JSON yang berubah ke Worker, yang kemudian meng-commit-nya ke
repo GitHub atas nama akun token itu.

**Kenapa perlu kode sinkron terpisah dari password login?** Semua password
login (guru BK, OSIS, dst.) tersimpan sebagai teks biasa di `data/users.json`
yang bisa dibaca siapa saja — kalau kode sinkron memakai password itu juga,
siapa pun yang tahu satu password saja bisa mendorong perubahan ke repo
GitHub kamu. Kode sinkron hanya diberitahukan admin ke staf yang memang
berwenang menyimpan perubahan secara permanen.

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
`DATA_GURU_BK`, `DATA_KESISWAAN`, dst.), kecuali file di `data/organisasi/`
yang masing-masing berstruktur `{ pembina, anggota, prokja, kegiatan, keuangan, lpj }`.
