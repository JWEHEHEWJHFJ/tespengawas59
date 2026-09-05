/* ============================================================
   SIM Sekolah — SMA Negeri 5 Pinrang
   Data dasar dibaca langsung dari file JSON di folder /data.
   Perubahan (tambah/ubah/hapus) disimpan di localStorage browser
   per koleksi data, menimpa data JSON asli hanya di perangkat itu.
   ============================================================ */

const DATA_PATH = 'data/';
const dataCache = {};
let tableCounter = 0;

async function loadData(name){
  if(dataCache[name]) return dataCache[name];
  const res = await fetch(DATA_PATH + name + '.json');
  if(!res.ok) throw new Error('Gagal memuat ' + name + '.json');
  const json = await res.json();
  dataCache[name] = json;
  return json;
}

/* ---------------- Format & badge helpers ---------------- */

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function fmtDate(iso){
  if(!iso) return '-';
  const parts = iso.split('-');
  if(parts.length !== 3) return iso;
  const [y,m,d] = parts;
  return `${parseInt(d,10)} ${BULAN[parseInt(m,10)-1]} ${y}`;
}
function fmtCurrency(n){
  if(n === null || n === undefined || n === '') return '-';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}
const STATUS_MAP = {
  'selesai':'badge-good','lunas':'badge-good','aktif':'badge-good','berjalan':'badge-good',
  'terkirim':'badge-good','baik':'badge-good',
  'proses':'badge-warn','diproses':'badge-warn','pemantauan':'badge-warn','cicilan':'badge-warn',
  'persiapan':'badge-warn','menunggu disposisi':'badge-warn','menunggu anggaran':'badge-warn',
  'peringatan':'badge-warn','perlu perbaikan':'badge-warn',
  'direncanakan':'badge-info',
  'belum lunas':'badge-bad','ditindaklanjuti':'badge-bad','rusak berat':'badge-bad',
  'belum mulai':'badge-neutral'
};
function badge(status){
  if(!status) return '<span class="badge badge-neutral">-</span>';
  const cls = STATUS_MAP[status.toLowerCase()] || 'badge-neutral';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}
function jenisBadge(jenis){
  const cls = jenis === 'Pemasukan' ? 'badge-good' : 'badge-bad';
  return `<span class="badge ${cls}">${escapeHtml(jenis)}</span>`;
}
function escapeHtml(v){
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- Read-only table builders ---------------- */

/* columns: [{label, render(row) -> html}], rows: array, searchFn optional */
function buildTable({columns, rows, searchFn, searchPlaceholder, emptyText}){
  const id = 'tbl' + (tableCounter++);
  const searchHtml = searchFn
    ? `<input type="text" class="search-box" placeholder="${searchPlaceholder || 'Cari...'}" data-table-search="${id}">`
    : '';
  let body;
  if(!rows.length){
    body = `<tr class="empty-row"><td colspan="${columns.length}">${emptyText || 'Belum ada data.'}</td></tr>`;
  }else{
    body = rows.map(r => {
      const key = searchFn ? escapeHtml(searchFn(r).toLowerCase()) : '';
      return `<tr${searchFn ? ` data-search="${key}"` : ''}>${columns.map(c => `<td>${c.render(r)}</td>`).join('')}</tr>`;
    }).join('');
  }
  const table = `
    <table id="${id}">
      <thead><tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  return { id, searchHtml, table };
}
function simpleTable(headers, rows){
  if(!rows.length){
    return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody><tr class="empty-row"><td colspan="${headers.length}">Belum ada data.</td></tr></tbody></table>`;
  }
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c===undefined||c===null||c===''?'-':c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function wireTableSearches(container){
  container.querySelectorAll('[data-table-search]').forEach(input => {
    input.addEventListener('input', () => {
      const table = document.getElementById(input.dataset.tableSearch);
      const q = input.value.trim().toLowerCase();
      table.querySelectorAll('tbody tr[data-search]').forEach(tr => {
        tr.style.display = tr.dataset.search.includes(q) ? '' : 'none';
      });
    });
  });
}

function panel(title, bodyHtml, headExtraHtml){
  return `
    <div class="panel">
      <div class="panel-head"><h3>${title}</h3>${headExtraHtml || ''}</div>
      <div class="panel-body">${bodyHtml}</div>
    </div>`;
}
function statRow(items){
  return `<div class="stat-row">${items.map(i => `
    <div class="stat-card">
      <div class="num">${i.value}</div>
      <div class="label">${i.label}</div>
    </div>`).join('')}</div>`;
}

/* ================================================================
   CRUD engine: local persistence + floating add form + edit/delete
   ================================================================ */

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';

function genId(){
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
function ensureIds(arr){
  arr.forEach(item => { if(!item._uid) item._uid = genId(); });
  return arr;
}
/* Returns the working array for a collection: local edits if any exist, else the original data. */
function getCollection(key, fallbackArr){
  const stored = localStorage.getItem('sim_data:' + key);
  if(stored){
    try { return ensureIds(JSON.parse(stored)); } catch(e){ /* corrupt, fall back */ }
  }
  return ensureIds(fallbackArr || []);
}
function saveCollection(key, arr){
  localStorage.setItem('sim_data:' + key, JSON.stringify(arr));
}

const collectionRegistry = {};
function registerCollection(key, arr, config){
  collectionRegistry[key] = { arr, config };
}

function actionCell(collectionKey, uid){
  return `<td class="action-cell">
    <button type="button" class="icon-btn" data-action="edit" data-collection="${collectionKey}" data-uid="${uid}" title="Ubah data">${ICON_EDIT}</button>
    <button type="button" class="icon-btn icon-btn-danger" data-action="delete" data-collection="${collectionKey}" data-uid="${uid}" title="Hapus data">${ICON_DELETE}</button>
  </td>`;
}

/* headers: string[]; dataRows: [{item, cells:[...html]}]; collectionKey: string */
function crudTable(headers, dataRows, collectionKey, opts){
  opts = opts || {};
  const id = 'tbl' + (tableCounter++);
  const heads = [...headers, 'Aksi'];
  const searchHtml = opts.searchFn
    ? `<input type="text" class="search-box" placeholder="${opts.searchPlaceholder || 'Cari...'}" data-table-search="${id}">`
    : '';
  let body;
  if(!dataRows.length){
    body = `<tr class="empty-row"><td colspan="${heads.length}">Belum ada data. Gunakan tombol + untuk menambah.</td></tr>`;
  }else{
    body = dataRows.map(r => {
      const searchAttr = opts.searchFn ? ` data-search="${escapeHtml(opts.searchFn(r.item).toLowerCase())}"` : '';
      return `<tr${searchAttr}>${r.cells.map(c => `<td>${c===undefined||c===null||c===''?'-':c}</td>`).join('')}${actionCell(collectionKey, r.item._uid)}</tr>`;
    }).join('');
  }
  const table = `
    <table id="${id}">
      <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  return { table, searchHtml };
}

function fab(collectionKey, label){
  return `<button type="button" class="fab-add" data-action="add" data-collection="${collectionKey}" title="${label || 'Tambah data'}">${ICON_PLUS}</button>`;
}

function openModal(html){
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('show');
}

function fieldInputHtml(field, value){
  const v = value === undefined || value === null ? '' : value;
  if(field.type === 'textarea'){
    return `<textarea data-field="${field.key}" rows="3">${escapeHtml(v)}</textarea>`;
  }
  if(field.type === 'select'){
    return `<select data-field="${field.key}">${field.options.map(o=>`<option value="${escapeHtml(o)}"${String(o)===String(v)?' selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  }
  return `<input type="${field.type || 'text'}" data-field="${field.key}" value="${escapeHtml(v)}">`;
}

function openItemModal(collectionKey, uid){
  const reg = collectionRegistry[collectionKey];
  if(!reg) return;
  const config = reg.config;
  const item = uid ? reg.arr.find(i => i._uid === uid) : null;
  const isEdit = !!item;
  const fieldsHtml = config.fields.map(f => `
    <div class="field">
      <label>${f.label}</label>
      ${fieldInputHtml(f, item ? item[f.key] : '')}
    </div>`).join('');
  openModal(`
    <h3>${isEdit ? 'Ubah' : 'Tambah'} ${config.title}</h3>
    <div class="modal-fields">${fieldsHtml}</div>
    <div class="modal-actions">
      <button type="button" class="btn-ghost" id="modal-cancel">Batal</button>
      <button type="button" class="btn-primary" id="modal-save">Simpan</button>
    </div>
  `);
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const box = document.getElementById('modal-box');
    const newItem = isEdit ? {...item} : { _uid: genId() };
    config.fields.forEach(f => {
      const el = box.querySelector(`[data-field="${f.key}"]`);
      let val = el.value;
      if(f.type === 'number') val = val === '' ? 0 : Number(val);
      newItem[f.key] = val;
    });
    const arr = isEdit
      ? reg.arr.map(i => i._uid === item._uid ? newItem : i)
      : [...reg.arr, newItem];
    saveCollection(collectionKey, arr);
    closeModal();
    renderTab();
  };
}

function deleteItemPrompt(collectionKey, uid){
  const reg = collectionRegistry[collectionKey];
  if(!reg) return;
  if(!confirm('Hapus data ini? Tindakan ini tidak bisa dibatalkan.')) return;
  const arr = reg.arr.filter(i => i._uid !== uid);
  saveCollection(collectionKey, arr);
  renderTab();
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if(overlay){
    overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });
  }
});

/* ---------------- CRUD field configurations per koleksi data ---------------- */

const CRUD_CONFIGS = {
  'guru-bk:kasus': { title:'Kasus Siswa', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'nisn', label:'NISN', type:'text'},
    {key:'siswa', label:'Nama Siswa', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'kategori', label:'Kategori', type:'select', options:['Pelanggaran Ringan','Pelanggaran Berat','Masalah Pribadi','Akademik','Sosial']},
    {key:'uraian', label:'Uraian', type:'textarea'},
    {key:'tindakLanjut', label:'Tindak Lanjut', type:'textarea'},
    {key:'status', label:'Status', type:'select', options:['Proses','Pemantauan','Selesai']}
  ]},
  'guru-bk:jadwalKonseling': { title:'Jadwal Konseling', fields:[
    {key:'hari', label:'Hari', type:'select', options:['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']},
    {key:'waktu', label:'Waktu (mis. 08.00 - 10.00)', type:'text'},
    {key:'agenda', label:'Agenda', type:'text'}
  ]},
  'wakasek-kesiswaan:prestasi': { title:'Prestasi Siswa', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'nisn', label:'NISN', type:'text'},
    {key:'siswa', label:'Nama Siswa', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'bidang', label:'Bidang', type:'text'},
    {key:'tingkat', label:'Tingkat', type:'select', options:['Sekolah','Kabupaten','Provinsi','Nasional']},
    {key:'capaian', label:'Capaian', type:'text'}
  ]},
  'wakasek-kesiswaan:ekstrakurikuler': { title:'Ekstrakurikuler', fields:[
    {key:'nama', label:'Nama', type:'text'},
    {key:'pembina', label:'Pembina', type:'text'},
    {key:'jadwal', label:'Jadwal', type:'text'},
    {key:'anggota', label:'Jumlah Anggota', type:'number'}
  ]},
  'wakasek-kesiswaan:pelanggaran': { title:'Pelanggaran Siswa', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'nisn', label:'NISN', type:'text'},
    {key:'siswa', label:'Nama Siswa', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'jenis', label:'Jenis Pelanggaran', type:'text'},
    {key:'poin', label:'Poin', type:'number'},
    {key:'status', label:'Status', type:'select', options:['Peringatan','Ditindaklanjuti','Selesai']}
  ]},
  'kurikulum:jadwalUjian': { title:'Jadwal Ujian', fields:[
    {key:'nama', label:'Nama Ujian', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'tanggal', label:'Tanggal', type:'text'},
    {key:'status', label:'Status', type:'select', options:['Direncanakan','Persiapan','Selesai']}
  ]},
  'kurikulum:capaianKurikulum': { title:'Capaian Kurikulum', fields:[
    {key:'mapel', label:'Mata Pelajaran', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'targetBab', label:'Target Bab', type:'number'},
    {key:'tercapai', label:'Tercapai', type:'number'},
    {key:'persentase', label:'Persentase (mis. 75%)', type:'text'}
  ]},
  'kurikulum:mataPelajaran': { title:'Mata Pelajaran', fields:[
    {key:'nama', label:'Nama', type:'text'},
    {key:'rumpun', label:'Rumpun', type:'select', options:['MIPA','Bahasa','IPS','Lainnya']},
    {key:'jamPerMinggu', label:'Jam per Minggu', type:'number'}
  ]},
  'humas:kegiatan': { title:'Kegiatan Humas', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'nama', label:'Nama Kegiatan', type:'text'},
    {key:'lokasi', label:'Lokasi', type:'text'},
    {key:'pic', label:'PIC', type:'text'},
    {key:'status', label:'Status', type:'select', options:['Direncanakan','Selesai']}
  ]},
  'humas:kerjasama': { title:'Kerja Sama Mitra', fields:[
    {key:'mitra', label:'Mitra', type:'text'},
    {key:'bidang', label:'Bidang Kerja Sama', type:'text'},
    {key:'mulai', label:'Mulai (Tahun)', type:'text'},
    {key:'status', label:'Status', type:'select', options:['Aktif','Tidak Aktif']}
  ]},
  'humas:publikasi': { title:'Publikasi', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'judul', label:'Judul', type:'text'},
    {key:'kanal', label:'Kanal', type:'text'}
  ]},
  'sarpras:inventaris': { title:'Inventaris', fields:[
    {key:'nama', label:'Nama Aset', type:'text'},
    {key:'jumlah', label:'Jumlah', type:'number'},
    {key:'kondisi', label:'Kondisi', type:'select', options:['Baik','Perlu Perbaikan','Rusak Berat']},
    {key:'lokasi', label:'Lokasi', type:'text'}
  ]},
  'sarpras:pengajuanPerbaikan': { title:'Pengajuan Perbaikan', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'item', label:'Item', type:'text'},
    {key:'pemohon', label:'Pemohon', type:'text'},
    {key:'prioritas', label:'Prioritas', type:'select', options:['Rendah','Sedang','Tinggi']},
    {key:'status', label:'Status', type:'select', options:['Diproses','Menunggu Anggaran','Selesai']}
  ]},
  'sarpras:kondisiRuang': { title:'Kondisi Ruang', fields:[
    {key:'ruang', label:'Ruang', type:'text'},
    {key:'kondisi', label:'Kondisi', type:'select', options:['Baik','Perlu Perbaikan','Rusak Berat']},
    {key:'catatan', label:'Catatan', type:'text'}
  ]},
  'tata-usaha:suratMasuk': { title:'Surat Masuk', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'nomorSurat', label:'Nomor Surat', type:'text'},
    {key:'asal', label:'Asal', type:'text'},
    {key:'perihal', label:'Perihal', type:'text'},
    {key:'status', label:'Status', type:'select', options:['Diproses','Menunggu Disposisi','Selesai']}
  ]},
  'tata-usaha:suratKeluar': { title:'Surat Keluar', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'nomorSurat', label:'Nomor Surat', type:'text'},
    {key:'tujuan', label:'Tujuan', type:'text'},
    {key:'perihal', label:'Perihal', type:'text'},
    {key:'status', label:'Status', type:'select', options:['Terkirim','Diproses']}
  ]},
  'tata-usaha:administrasiSiswa': { title:'Administrasi Siswa', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'siswa', label:'Nama Siswa', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'jenis', label:'Jenis', type:'select', options:['Siswa Baru','Update Data','Siswa Pindah','Lainnya']},
    {key:'keterangan', label:'Keterangan', type:'textarea'}
  ]},
  'tata-usaha:keuangan': { title:'Keuangan Siswa (SPP)', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'siswa', label:'Nama Siswa', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'keterangan', label:'Keterangan', type:'text'},
    {key:'nominal', label:'Nominal (Rp)', type:'number'},
    {key:'status', label:'Status', type:'select', options:['Lunas','Belum Lunas','Cicilan']}
  ]}
};
['osis','pramuka','pmr','paskibra'].forEach(orgId => {
  CRUD_CONFIGS[orgId + ':anggota'] = { title:'Anggota', fields:[
    {key:'nisn', label:'NISN', type:'text'},
    {key:'nama', label:'Nama', type:'text'},
    {key:'kelas', label:'Kelas', type:'text'},
    {key:'jabatan', label:'Jabatan', type:'text'}
  ]};
  CRUD_CONFIGS[orgId + ':prokja'] = { title:'Program Kerja', fields:[
    {key:'nama', label:'Nama Program', type:'text'},
    {key:'bidang', label:'Bidang', type:'text'},
    {key:'target', label:'Target', type:'text'},
    {key:'capaian', label:'Capaian', type:'text'},
    {key:'status', label:'Status', type:'select', options:['Belum Mulai','Berjalan','Selesai']}
  ]};
  CRUD_CONFIGS[orgId + ':kegiatan'] = { title:'Kegiatan', fields:[
    {key:'tanggalMulai', label:'Tanggal Mulai', type:'date'},
    {key:'tanggalSelesai', label:'Tanggal Selesai (opsional)', type:'date'},
    {key:'nama', label:'Nama Kegiatan', type:'text'},
    {key:'deskripsi', label:'Deskripsi', type:'textarea'},
    {key:'status', label:'Status', type:'select', options:['Direncanakan','Selesai']}
  ]};
  CRUD_CONFIGS[orgId + ':keuangan'] = { title:'Transaksi Keuangan', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'keterangan', label:'Keterangan', type:'text'},
    {key:'jenis', label:'Jenis', type:'select', options:['Pemasukan','Pengeluaran']},
    {key:'nominal', label:'Nominal (Rp)', type:'number'}
  ]};
  CRUD_CONFIGS[orgId + ':lpj'] = { title:'Laporan Pertanggungjawaban', fields:[
    {key:'tanggal', label:'Tanggal', type:'date'},
    {key:'periode', label:'Periode', type:'text'},
    {key:'disusunOleh', label:'Disusun Oleh', type:'text'},
    {key:'isi', label:'Isi Laporan', type:'textarea'}
  ]};
});

/* ---------------- Auth ---------------- */

let currentUser = null;
let roleInfo = {};
let currentTab = null;

async function boot(){
  const users = await loadData('users');
  roleInfo = users.ROLE_INFO;
  buildDivisionStrip();

  const saved = sessionStorage.getItem('simsekolah_user');
  if(saved){
    currentUser = JSON.parse(saved);
    showApp();
  }
}

function buildDivisionStrip(){
  const strip = document.getElementById('division-strip');
  strip.innerHTML = Object.values(roleInfo).map(r =>
    `<span class="division-chip"><i style="background:${r.color}"></i>${r.label}</span>`
  ).join('');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const users = await loadData('users');
  const match = users.USERS.find(u => u.username === username && u.password === password);
  const errBox = document.getElementById('login-error');
  if(!match){
    errBox.classList.add('show');
    return;
  }
  errBox.classList.remove('show');
  currentUser = match;
  sessionStorage.setItem('simsekolah_user', JSON.stringify(match));
  showApp();
});

document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('simsekolah_user');
  currentUser = null;
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'grid';
  document.getElementById('login-form').reset();
});

function showApp(){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'grid';
  const info = roleInfo[currentUser.role] || {label: currentUser.jabatan, color:'#586074'};
  document.getElementById('sidebar-role').textContent = info.label;
  document.getElementById('sidebar-role').style.background = info.color;
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-jabatan').textContent = currentUser.jabatan;
  buildNav();
  const menu = MENUS[currentUser.role] || [];
  currentTab = menu.length ? menu[0].id : null;
  renderNav();
  renderTab();
}

/* ---------------- Menus ---------------- */

const ORG_MENU = [
  {id:'ringkasan', label:'Ringkasan'},
  {id:'anggota', label:'Anggota'},
  {id:'prokja', label:'Program Kerja'},
  {id:'kegiatan', label:'Kegiatan'},
  {id:'keuangan', label:'Keuangan'},
  {id:'lpj', label:'Laporan (LPJ)'}
];

const MENUS = {
  guru_bk: [
    {id:'ringkasan', label:'Ringkasan'},
    {id:'kasus', label:'Kasus Siswa'},
    {id:'jadwal', label:'Jadwal Konseling'}
  ],
  wakasek_kesiswaan: [
    {id:'ringkasan', label:'Ringkasan'},
    {id:'prestasi', label:'Prestasi Siswa'},
    {id:'ekstrakurikuler', label:'Ekstrakurikuler'},
    {id:'pelanggaran', label:'Pelanggaran Siswa'},
    {id:'laporan-bk', label:'Laporan BK'},
    {id:'laporan-organisasi', label:'Laporan Organisasi'}
  ],
  kurikulum: [
    {id:'ringkasan', label:'Ringkasan'},
    {id:'jadwal-ujian', label:'Jadwal Ujian'},
    {id:'capaian', label:'Capaian Kurikulum'},
    {id:'mapel', label:'Mata Pelajaran'}
  ],
  humas: [
    {id:'ringkasan', label:'Ringkasan'},
    {id:'kegiatan', label:'Kegiatan'},
    {id:'kerjasama', label:'Kerja Sama'},
    {id:'publikasi', label:'Publikasi'}
  ],
  sarpras: [
    {id:'ringkasan', label:'Ringkasan'},
    {id:'inventaris', label:'Inventaris'},
    {id:'perbaikan', label:'Pengajuan Perbaikan'},
    {id:'kondisi-ruang', label:'Kondisi Ruang'}
  ],
  tata_usaha: [
    {id:'ringkasan', label:'Ringkasan'},
    {id:'surat-masuk', label:'Surat Masuk'},
    {id:'surat-keluar', label:'Surat Keluar'},
    {id:'administrasi', label:'Administrasi Siswa'},
    {id:'keuangan', label:'Keuangan Siswa'}
  ],
  osis: ORG_MENU, pramuka: ORG_MENU, pmr: ORG_MENU, paskibra: ORG_MENU,
  kepala_sekolah: [{id:'overview', label:'Ringkasan Sekolah'}],
  pengawas: [{id:'overview', label:'Ringkasan Sekolah'}]
};

function buildNav(){
  document.getElementById('nav-menu').innerHTML = '';
}
function renderNav(){
  const menu = MENUS[currentUser.role] || [];
  const nav = document.getElementById('nav-menu');
  nav.innerHTML = menu.map(m =>
    `<button class="nav-item${m.id === currentTab ? ' active' : ''}" data-tab="${m.id}">${m.label}</button>`
  ).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      renderNav();
      renderTab();
    });
  });
}

function pageHead(title){
  const today = new Date().toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  return `<div class="page-head"><h1>${title}</h1><div class="today">${today}</div></div>`;
}

async function renderTab(){
  const main = document.getElementById('main-content');
  main.innerHTML = '<div style="padding:40px;color:#68708a;">Memuat data...</div>';
  try{
    const html = await VIEWS[currentUser.role](currentTab);
    main.innerHTML = html;
    wireTableSearches(main);
    wireExtras(main);
  }catch(err){
    main.innerHTML = `<div class="panel"><div class="panel-body pad">Terjadi kesalahan memuat data: ${escapeHtml(err.message)}</div></div>`;
  }
}

function wireExtras(main){
  main.querySelectorAll('[data-org-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedOrg = btn.dataset.orgTab;
      renderTab();
    });
  });
  main.querySelectorAll('[data-action="add"]').forEach(btn => {
    btn.addEventListener('click', () => openItemModal(btn.dataset.collection, null));
  });
  main.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openItemModal(btn.dataset.collection, btn.dataset.uid));
  });
  main.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteItemPrompt(btn.dataset.collection, btn.dataset.uid));
  });
}

/* ---------------- View renderers ---------------- */

const VIEWS = {
  guru_bk: renderGuruBK,
  wakasek_kesiswaan: renderKesiswaan,
  kurikulum: renderKurikulum,
  humas: renderHumas,
  sarpras: renderSarpras,
  tata_usaha: renderTataUsaha,
  osis: (tab) => renderOrganisasi('osis', tab),
  pramuka: (tab) => renderOrganisasi('pramuka', tab),
  pmr: (tab) => renderOrganisasi('pmr', tab),
  paskibra: (tab) => renderOrganisasi('paskibra', tab),
  kepala_sekolah: renderOverview,
  pengawas: renderOverview
};

/* ---- Guru BK ---- */
async function renderGuruBK(tab){
  const d = (await loadData('guru-bk')).DATA_GURU_BK;
  const kasusArr = getCollection('guru-bk:kasus', d.kasus);
  registerCollection('guru-bk:kasus', kasusArr, CRUD_CONFIGS['guru-bk:kasus']);
  const jadwalArr = getCollection('guru-bk:jadwalKonseling', d.jadwalKonseling);
  registerCollection('guru-bk:jadwalKonseling', jadwalArr, CRUD_CONFIGS['guru-bk:jadwalKonseling']);

  if(tab === 'ringkasan'){
    const proses = kasusArr.filter(k => k.status !== 'Selesai').length;
    return pageHead('Ringkasan Bimbingan Konseling') + statRow([
      {value:kasusArr.length, label:'Total kasus tercatat'},
      {value:proses, label:'Masih ditangani'},
      {value:jadwalArr.length, label:'Sesi konseling terjadwal / minggu'}
    ]) + panel('Kasus terbaru', kasusPreviewTable(kasusArr.slice(-3).reverse()));
  }
  if(tab === 'kasus'){
    return pageHead('Kasus Siswa') + buildKasusPanelCrud(kasusArr) + fab('guru-bk:kasus', 'Tambah kasus');
  }
  if(tab === 'jadwal'){
    const {searchHtml, table} = crudTable(
      ['Hari','Waktu','Agenda'],
      jadwalArr.map(r => ({item:r, cells:[r.hari, `<span class="mono">${r.waktu}</span>`, r.agenda]})),
      'guru-bk:jadwalKonseling'
    );
    return pageHead('Jadwal Konseling Mingguan') + panel('Jadwal', table) + fab('guru-bk:jadwalKonseling', 'Tambah jadwal');
  }
}
function buildKasusPanelCrud(kasus){
  const {searchHtml, table} = crudTable(
    ['Tanggal','Siswa','Kelas','Kategori','Uraian','Tindak Lanjut','Status'],
    kasus.map(r => ({item:r, cells:[fmtDate(r.tanggal), r.siswa, r.kelas, r.kategori, r.uraian, r.tindakLanjut, badge(r.status)]})),
    'guru-bk:kasus',
    {searchFn:r => `${r.siswa} ${r.kelas} ${r.kategori}`, searchPlaceholder:'Cari nama, kelas, kategori...'}
  );
  return panel('Daftar kasus', table, searchHtml);
}
function kasusPanelReadOnly(kasus){
  const {searchHtml, table} = buildTable({
    columns:[
      {label:'Tanggal', render:r=>fmtDate(r.tanggal)},
      {label:'Siswa', render:r=>r.siswa},
      {label:'Kelas', render:r=>r.kelas},
      {label:'Kategori', render:r=>r.kategori},
      {label:'Uraian', render:r=>r.uraian},
      {label:'Tindak Lanjut', render:r=>r.tindakLanjut},
      {label:'Status', render:r=>badge(r.status)}
    ],
    rows:kasus,
    searchFn:r => `${r.siswa} ${r.kelas} ${r.kategori}`,
    searchPlaceholder:'Cari nama, kelas, kategori...'
  });
  return panel('Daftar kasus (lihat saja)', table, searchHtml);
}
function kasusPreviewTable(kasus){
  return simpleTable(['Tanggal','Siswa','Kelas','Kategori','Status'],
    kasus.map(r=>[fmtDate(r.tanggal), r.siswa, r.kelas, r.kategori, badge(r.status)]));
}

/* ---- Wakasek Kesiswaan ---- */
async function renderKesiswaan(tab){
  const d = (await loadData('wakasek-kesiswaan')).DATA_KESISWAAN;
  const full = await loadData('wakasek-kesiswaan');
  const prestasiArr = getCollection('wakasek-kesiswaan:prestasi', d.prestasi);
  registerCollection('wakasek-kesiswaan:prestasi', prestasiArr, CRUD_CONFIGS['wakasek-kesiswaan:prestasi']);
  const eksArr = getCollection('wakasek-kesiswaan:ekstrakurikuler', full.ekstrakurikuler || []);
  registerCollection('wakasek-kesiswaan:ekstrakurikuler', eksArr, CRUD_CONFIGS['wakasek-kesiswaan:ekstrakurikuler']);
  const pelArr = getCollection('wakasek-kesiswaan:pelanggaran', full.pelanggaran || []);
  registerCollection('wakasek-kesiswaan:pelanggaran', pelArr, CRUD_CONFIGS['wakasek-kesiswaan:pelanggaran']);

  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Kesiswaan') + statRow([
      {value:d.ringkasan.totalSiswa, label:'Total siswa aktif'},
      {value:d.ringkasan.ekstrakurikulerAktif, label:'Ekstrakurikuler aktif'},
      {value:prestasiArr.length, label:'Prestasi tercatat'}
    ]) + panel('Prestasi terbaru', simpleTable(['Tanggal','Siswa','Bidang','Tingkat','Capaian'],
      prestasiArr.slice(-3).reverse().map(r=>[fmtDate(r.tanggal), r.siswa, r.bidang, r.tingkat, `<span class="badge badge-good">${escapeHtml(r.capaian)}</span>`])));
  }
  if(tab === 'prestasi'){
    const {searchHtml, table} = crudTable(
      ['Tanggal','Siswa','Kelas','Bidang','Tingkat','Capaian'],
      prestasiArr.map(r => ({item:r, cells:[fmtDate(r.tanggal), r.siswa, r.kelas, r.bidang, r.tingkat, `<span class="badge badge-good">${escapeHtml(r.capaian)}</span>`]})),
      'wakasek-kesiswaan:prestasi',
      {searchFn:r=>`${r.siswa} ${r.kelas} ${r.bidang} ${r.tingkat}`, searchPlaceholder:'Cari nama, kelas, bidang...'}
    );
    return pageHead('Prestasi Siswa') + panel('Daftar prestasi', table, searchHtml) + fab('wakasek-kesiswaan:prestasi', 'Tambah prestasi');
  }
  if(tab === 'ekstrakurikuler'){
    const {table} = crudTable(
      ['Nama','Pembina','Jadwal','Anggota'],
      eksArr.map(r => ({item:r, cells:[r.nama, r.pembina, r.jadwal, `<span class="mono">${r.anggota}</span>`]})),
      'wakasek-kesiswaan:ekstrakurikuler'
    );
    return pageHead('Ekstrakurikuler') + panel('Daftar ekstrakurikuler', table) + fab('wakasek-kesiswaan:ekstrakurikuler', 'Tambah ekstrakurikuler');
  }
  if(tab === 'pelanggaran'){
    const {searchHtml, table} = crudTable(
      ['Tanggal','Siswa','Kelas','Jenis Pelanggaran','Poin','Status'],
      pelArr.map(r => ({item:r, cells:[fmtDate(r.tanggal), r.siswa, r.kelas, r.jenis, `<span class="mono">${r.poin}</span>`, badge(r.status)]})),
      'wakasek-kesiswaan:pelanggaran',
      {searchFn:r=>`${r.siswa} ${r.kelas}`, searchPlaceholder:'Cari nama atau kelas...'}
    );
    return pageHead('Pelanggaran Siswa') + panel('Catatan pelanggaran', table, searchHtml) + fab('wakasek-kesiswaan:pelanggaran', 'Tambah pelanggaran');
  }
  if(tab === 'laporan-bk'){
    const bk = (await loadData('guru-bk')).DATA_GURU_BK;
    const kasusArr = getCollection('guru-bk:kasus', bk.kasus);
    return pageHead('Laporan Bimbingan Konseling') +
      `<p style="color:var(--muted);margin-bottom:16px;font-size:13.5px;">Tampilan pemantauan aktivitas Guru BK untuk Wakasek Kesiswaan (hanya lihat).</p>` +
      statRow([
        {value:kasusArr.length, label:'Total kasus'},
        {value:kasusArr.filter(k=>k.status!=='Selesai').length, label:'Masih ditangani'},
        {value:bk.jadwalKonseling.length, label:'Sesi konseling / minggu'}
      ]) + kasusPanelReadOnly(kasusArr);
  }
  if(tab === 'laporan-organisasi'){
    return pageHead('Laporan Organisasi Siswa') + await organisasiSelector();
  }
}

/* ---- Organisasi selector (dipakai di dalam Wakasek Kesiswaan, hanya lihat) ---- */
let selectedOrg = 'osis';
async function organisasiSelector(){
  const list = (await loadData('laporan-organisasi')).ORGANISASI_LIST;
  const tabs = list.map(o => `
    <button type="button" class="org-tab${o.id===selectedOrg?' active':''}" data-org-tab="${o.id}"
      style="${o.id===selectedOrg ? `background:${o.color};` : ''}">
      <i style="background:${o.color}"></i>${o.label}
    </button>`).join('');
  const org = list.find(o => o.id === selectedOrg) || list[0];
  const orgData = await loadData(org.id);
  return `<div class="org-tabs">${tabs}</div>` + organisasiBody(org, orgData);
}
function organisasiBody(org, dRaw){
  const anggota = getCollection(org.id + ':anggota', dRaw.anggota || []);
  const prokja = getCollection(org.id + ':prokja', dRaw.prokja || []);
  const kegiatan = getCollection(org.id + ':kegiatan', dRaw.kegiatan || []);
  return `
    <div class="dept-grid" style="margin-bottom:20px;">
      <div class="dept-card" style="border-top-color:${org.color}">
        <h4>Pembina</h4>
        <div class="dept-meta">${escapeHtml(dRaw.pembina || '-')}</div>
      </div>
      <div class="dept-card" style="border-top-color:${org.color}">
        <h4>Anggota tercatat</h4>
        <div class="dept-meta">${anggota.length} orang</div>
      </div>
      <div class="dept-card" style="border-top-color:${org.color}">
        <h4>Program kerja berjalan</h4>
        <div class="dept-meta">${prokja.filter(p=>p.status==='Berjalan').length} dari ${prokja.length}</div>
      </div>
    </div>
    ${panel('Anggota', simpleTable(['Nama','Kelas','Jabatan'], anggota.map(a=>[a.nama,a.kelas,a.jabatan])))}
    ${panel('Program Kerja', simpleTable(['Nama Program','Bidang','Target','Capaian','Status'], prokja.map(p=>[p.nama,p.bidang,p.target,p.capaian,badge(p.status)])))}
    ${panel('Kegiatan', simpleTable(['Tanggal','Kegiatan','Deskripsi','Status'], kegiatan.map(k=>[fmtDate(k.tanggalMulai)+(k.tanggalSelesai&&k.tanggalSelesai!==k.tanggalMulai?' – '+fmtDate(k.tanggalSelesai):''),k.nama,k.deskripsi,badge(k.status)])))}
  `;
}

/* ---- Organisasi dashboards (login sebagai OSIS/Pramuka/PMR/Paskibra) — bisa kelola data sendiri ---- */
async function renderOrganisasi(orgId, tab){
  const orgList = (await loadData('laporan-organisasi')).ORGANISASI_LIST;
  const org = orgList.find(o => o.id === orgId);
  const dRaw = await loadData(orgId);
  const label = org ? org.label : orgId;

  const anggota = getCollection(orgId + ':anggota', dRaw.anggota || []);
  registerCollection(orgId + ':anggota', anggota, CRUD_CONFIGS[orgId + ':anggota']);
  const prokja = getCollection(orgId + ':prokja', dRaw.prokja || []);
  registerCollection(orgId + ':prokja', prokja, CRUD_CONFIGS[orgId + ':prokja']);
  const kegiatan = getCollection(orgId + ':kegiatan', dRaw.kegiatan || []);
  registerCollection(orgId + ':kegiatan', kegiatan, CRUD_CONFIGS[orgId + ':kegiatan']);
  const keuangan = getCollection(orgId + ':keuangan', dRaw.keuangan || []);
  registerCollection(orgId + ':keuangan', keuangan, CRUD_CONFIGS[orgId + ':keuangan']);
  const lpj = getCollection(orgId + ':lpj', dRaw.lpj || []);
  registerCollection(orgId + ':lpj', lpj, CRUD_CONFIGS[orgId + ':lpj']);

  if(tab === 'ringkasan'){
    return pageHead(`Ringkasan ${label}`) + statRow([
      {value:anggota.length, label:'Anggota'},
      {value:prokja.filter(p=>p.status==='Berjalan').length, label:'Program berjalan'},
      {value:kegiatan.filter(k=>k.status==='Selesai').length, label:'Kegiatan selesai'}
    ]) + panel('Pembina', `<div class="panel-body pad">${escapeHtml(dRaw.pembina||'-')}</div>`);
  }
  if(tab === 'anggota'){
    const {table} = crudTable(['Nama','NISN','Kelas','Jabatan'],
      anggota.map(a=>({item:a, cells:[a.nama, `<span class="mono">${a.nisn}</span>`, a.kelas, a.jabatan]})),
      orgId + ':anggota');
    return pageHead(`Anggota ${label}`) + panel('Daftar anggota', table) + fab(orgId + ':anggota', 'Tambah anggota');
  }
  if(tab === 'prokja'){
    const {table} = crudTable(['Nama Program','Bidang','Target','Capaian','Status'],
      prokja.map(p=>({item:p, cells:[p.nama, p.bidang, p.target, p.capaian, badge(p.status)]})),
      orgId + ':prokja');
    return pageHead(`Program Kerja ${label}`) + panel('Program kerja', table) + fab(orgId + ':prokja', 'Tambah program kerja');
  }
  if(tab === 'kegiatan'){
    const {table} = crudTable(['Tanggal','Kegiatan','Deskripsi','Status'],
      kegiatan.map(k=>({item:k, cells:[fmtDate(k.tanggalMulai)+(k.tanggalSelesai&&k.tanggalSelesai!==k.tanggalMulai?' – '+fmtDate(k.tanggalSelesai):''), k.nama, k.deskripsi, badge(k.status)]})),
      orgId + ':kegiatan');
    return pageHead(`Kegiatan ${label}`) + panel('Kegiatan', table) + fab(orgId + ':kegiatan', 'Tambah kegiatan');
  }
  if(tab === 'keuangan'){
    const masuk = keuangan.filter(k=>k.jenis==='Pemasukan').reduce((s,k)=>s+Number(k.nominal||0),0);
    const keluar = keuangan.filter(k=>k.jenis==='Pengeluaran').reduce((s,k)=>s+Number(k.nominal||0),0);
    const {table} = crudTable(['Tanggal','Keterangan','Jenis','Nominal'],
      keuangan.map(k=>({item:k, cells:[fmtDate(k.tanggal), k.keterangan, jenisBadge(k.jenis), fmtCurrency(k.nominal)]})),
      orgId + ':keuangan');
    return pageHead(`Keuangan ${label}`) + statRow([
      {value:fmtCurrency(masuk), label:'Total pemasukan'},
      {value:fmtCurrency(keluar), label:'Total pengeluaran'},
      {value:fmtCurrency(masuk-keluar), label:'Saldo'}
    ]) + panel('Transaksi', table) + fab(orgId + ':keuangan', 'Tambah transaksi');
  }
  if(tab === 'lpj'){
    const {table} = crudTable(['Tanggal','Periode','Disusun Oleh','Isi'],
      lpj.map(l=>({item:l, cells:[fmtDate(l.tanggal), l.periode, l.disusunOleh, l.isi]})),
      orgId + ':lpj');
    return pageHead(`Laporan (LPJ) ${label}`) + panel('Laporan pertanggungjawaban', table) + fab(orgId + ':lpj', 'Tambah laporan');
  }
}

/* ---- Kurikulum ---- */
async function renderKurikulum(tab){
  const d = (await loadData('kurikulum')).DATA_KURIKULUM;
  const jadwalUjian = getCollection('kurikulum:jadwalUjian', d.jadwalUjian);
  registerCollection('kurikulum:jadwalUjian', jadwalUjian, CRUD_CONFIGS['kurikulum:jadwalUjian']);
  const capaian = getCollection('kurikulum:capaianKurikulum', d.capaianKurikulum);
  registerCollection('kurikulum:capaianKurikulum', capaian, CRUD_CONFIGS['kurikulum:capaianKurikulum']);
  const mapel = getCollection('kurikulum:mataPelajaran', d.mataPelajaran);
  registerCollection('kurikulum:mataPelajaran', mapel, CRUD_CONFIGS['kurikulum:mataPelajaran']);

  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Kurikulum') + statRow([
      {value:d.ringkasan.totalMapel, label:'Total mata pelajaran'},
      {value:d.ringkasan.guruAktif, label:'Guru aktif'},
      {value:d.ringkasan.rataCapaianKurikulum, label:'Rata-rata capaian kurikulum'}
    ]) + panel('Jadwal ujian terdekat', simpleTable(['Nama Ujian','Kelas','Tanggal','Status'], jadwalUjian.map(j=>[j.nama,j.kelas,j.tanggal,badge(j.status)])));
  }
  if(tab === 'jadwal-ujian'){
    const {table} = crudTable(['Nama Ujian','Kelas','Tanggal','Status'],
      jadwalUjian.map(j=>({item:j, cells:[j.nama, j.kelas, j.tanggal, badge(j.status)]})),
      'kurikulum:jadwalUjian');
    return pageHead('Jadwal Ujian') + panel('Seluruh jadwal ujian', table) + fab('kurikulum:jadwalUjian', 'Tambah jadwal ujian');
  }
  if(tab === 'capaian'){
    const {table} = crudTable(['Mata Pelajaran','Kelas','Target Bab','Tercapai','Persentase'],
      capaian.map(c=>({item:c, cells:[c.mapel, c.kelas, c.targetBab, c.tercapai, `<span class="mono">${c.persentase}</span>`]})),
      'kurikulum:capaianKurikulum');
    return pageHead('Capaian Kurikulum') + panel('Capaian per mata pelajaran', table) + fab('kurikulum:capaianKurikulum', 'Tambah capaian');
  }
  if(tab === 'mapel'){
    const {table} = crudTable(['Nama','Rumpun','Jam / Minggu'],
      mapel.map(m=>({item:m, cells:[m.nama, m.rumpun, `<span class="mono">${m.jamPerMinggu}</span>`]})),
      'kurikulum:mataPelajaran');
    return pageHead('Mata Pelajaran') + panel('Daftar mata pelajaran', table) + fab('kurikulum:mataPelajaran', 'Tambah mata pelajaran');
  }
}

/* ---- Humas ---- */
async function renderHumas(tab){
  const d = (await loadData('humas')).DATA_HUMAS;
  const kegiatan = getCollection('humas:kegiatan', d.kegiatan);
  registerCollection('humas:kegiatan', kegiatan, CRUD_CONFIGS['humas:kegiatan']);
  const kerjasama = getCollection('humas:kerjasama', d.kerjasama);
  registerCollection('humas:kerjasama', kerjasama, CRUD_CONFIGS['humas:kerjasama']);
  const publikasi = getCollection('humas:publikasi', d.publikasi);
  registerCollection('humas:publikasi', publikasi, CRUD_CONFIGS['humas:publikasi']);

  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Humas') + statRow([
      {value:d.ringkasan.mitraAktif, label:'Mitra aktif'},
      {value:kegiatan.length, label:'Kegiatan tercatat'},
      {value:publikasi.length, label:'Publikasi tercatat'}
    ]) + panel('Kegiatan terdekat', simpleTable(['Tanggal','Kegiatan','Lokasi','PIC','Status'], kegiatan.map(k=>[fmtDate(k.tanggal),k.nama,k.lokasi,k.pic,badge(k.status)])));
  }
  if(tab === 'kegiatan'){
    const {table} = crudTable(['Tanggal','Kegiatan','Lokasi','PIC','Status'],
      kegiatan.map(k=>({item:k, cells:[fmtDate(k.tanggal), k.nama, k.lokasi, k.pic, badge(k.status)]})),
      'humas:kegiatan');
    return pageHead('Kegiatan Humas') + panel('Seluruh kegiatan', table) + fab('humas:kegiatan', 'Tambah kegiatan');
  }
  if(tab === 'kerjasama'){
    const {table} = crudTable(['Mitra','Bidang Kerja Sama','Mulai','Status'],
      kerjasama.map(k=>({item:k, cells:[k.mitra, k.bidang, k.mulai, badge(k.status)]})),
      'humas:kerjasama');
    return pageHead('Kerja Sama Mitra') + panel('Daftar mitra', table) + fab('humas:kerjasama', 'Tambah mitra');
  }
  if(tab === 'publikasi'){
    const {table} = crudTable(['Tanggal','Judul','Kanal'],
      publikasi.map(p=>({item:p, cells:[fmtDate(p.tanggal), p.judul, p.kanal]})),
      'humas:publikasi');
    return pageHead('Publikasi') + panel('Daftar publikasi', table) + fab('humas:publikasi', 'Tambah publikasi');
  }
}

/* ---- Sarpras ---- */
async function renderSarpras(tab){
  const d = (await loadData('sarpras')).DATA_SARPRAS;
  const inventaris = getCollection('sarpras:inventaris', d.inventaris);
  registerCollection('sarpras:inventaris', inventaris, CRUD_CONFIGS['sarpras:inventaris']);
  const perbaikan = getCollection('sarpras:pengajuanPerbaikan', d.pengajuanPerbaikan);
  registerCollection('sarpras:pengajuanPerbaikan', perbaikan, CRUD_CONFIGS['sarpras:pengajuanPerbaikan']);
  const ruang = getCollection('sarpras:kondisiRuang', d.kondisiRuang);
  registerCollection('sarpras:kondisiRuang', ruang, CRUD_CONFIGS['sarpras:kondisiRuang']);

  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Sarana & Prasarana') + statRow([
      {value:d.ringkasan.totalAset, label:'Total aset'},
      {value:d.ringkasan.kondisiBaik, label:'Kondisi baik'},
      {value:d.ringkasan.perluPerbaikan, label:'Perlu perbaikan'},
      {value:d.ringkasan.rusakBerat, label:'Rusak berat'}
    ]) + panel('Pengajuan perbaikan berjalan', simpleTable(['Tanggal','Item','Pemohon','Prioritas','Status'], perbaikan.map(p=>[fmtDate(p.tanggal),p.item,p.pemohon,p.prioritas,badge(p.status)])));
  }
  if(tab === 'inventaris'){
    const {table} = crudTable(['Nama Aset','Jumlah','Kondisi','Lokasi'],
      inventaris.map(i=>({item:i, cells:[i.nama, `<span class="mono">${i.jumlah}</span>`, badge(i.kondisi), i.lokasi]})),
      'sarpras:inventaris');
    return pageHead('Inventaris') + panel('Daftar inventaris', table) + fab('sarpras:inventaris', 'Tambah aset');
  }
  if(tab === 'perbaikan'){
    const {table} = crudTable(['Tanggal','Item','Pemohon','Prioritas','Status'],
      perbaikan.map(p=>({item:p, cells:[fmtDate(p.tanggal), p.item, p.pemohon, p.prioritas, badge(p.status)]})),
      'sarpras:pengajuanPerbaikan');
    return pageHead('Pengajuan Perbaikan') + panel('Daftar pengajuan', table) + fab('sarpras:pengajuanPerbaikan', 'Tambah pengajuan');
  }
  if(tab === 'kondisi-ruang'){
    const {table} = crudTable(['Ruang','Kondisi','Catatan'],
      ruang.map(r=>({item:r, cells:[r.ruang, badge(r.kondisi), r.catatan]})),
      'sarpras:kondisiRuang');
    return pageHead('Kondisi Ruang') + panel('Daftar ruang', table) + fab('sarpras:kondisiRuang', 'Tambah ruang');
  }
}

/* ---- Tata Usaha ---- */
async function renderTataUsaha(tab){
  const d = (await loadData('tata-usaha')).DATA_TATA_USAHA;
  const suratMasuk = getCollection('tata-usaha:suratMasuk', d.suratMasuk);
  registerCollection('tata-usaha:suratMasuk', suratMasuk, CRUD_CONFIGS['tata-usaha:suratMasuk']);
  const suratKeluar = getCollection('tata-usaha:suratKeluar', d.suratKeluar);
  registerCollection('tata-usaha:suratKeluar', suratKeluar, CRUD_CONFIGS['tata-usaha:suratKeluar']);
  const administrasi = getCollection('tata-usaha:administrasiSiswa', d.administrasiSiswa);
  registerCollection('tata-usaha:administrasiSiswa', administrasi, CRUD_CONFIGS['tata-usaha:administrasiSiswa']);
  const keuangan = getCollection('tata-usaha:keuangan', d.keuangan);
  registerCollection('tata-usaha:keuangan', keuangan, CRUD_CONFIGS['tata-usaha:keuangan']);

  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Tata Usaha') + statRow([
      {value:d.ringkasan.siswaAktif, label:'Siswa aktif'},
      {value:suratMasuk.length, label:'Surat masuk tercatat'},
      {value:suratKeluar.length, label:'Surat keluar tercatat'}
    ]) + panel('Surat masuk terbaru', simpleTable(['Tanggal','Nomor Surat','Asal','Perihal','Status'], suratMasuk.map(s=>[fmtDate(s.tanggal),`<span class="mono">${s.nomorSurat}</span>`,s.asal,s.perihal,badge(s.status)])));
  }
  if(tab === 'surat-masuk'){
    const {table} = crudTable(['Tanggal','Nomor Surat','Asal','Perihal','Status'],
      suratMasuk.map(s=>({item:s, cells:[fmtDate(s.tanggal), `<span class="mono">${s.nomorSurat}</span>`, s.asal, s.perihal, badge(s.status)]})),
      'tata-usaha:suratMasuk');
    return pageHead('Surat Masuk') + panel('Daftar surat masuk', table) + fab('tata-usaha:suratMasuk', 'Tambah surat masuk');
  }
  if(tab === 'surat-keluar'){
    const {table} = crudTable(['Tanggal','Nomor Surat','Tujuan','Perihal','Status'],
      suratKeluar.map(s=>({item:s, cells:[fmtDate(s.tanggal), `<span class="mono">${s.nomorSurat}</span>`, s.tujuan, s.perihal, badge(s.status)]})),
      'tata-usaha:suratKeluar');
    return pageHead('Surat Keluar') + panel('Daftar surat keluar', table) + fab('tata-usaha:suratKeluar', 'Tambah surat keluar');
  }
  if(tab === 'administrasi'){
    const {table} = crudTable(['Tanggal','Siswa','Kelas','Jenis','Keterangan'],
      administrasi.map(a=>({item:a, cells:[fmtDate(a.tanggal), a.siswa, a.kelas, a.jenis, a.keterangan]})),
      'tata-usaha:administrasiSiswa');
    return pageHead('Administrasi Siswa') + panel('Riwayat administrasi', table) + fab('tata-usaha:administrasiSiswa', 'Tambah data administrasi');
  }
  if(tab === 'keuangan'){
    const {table} = crudTable(['Tanggal','Siswa','Kelas','Keterangan','Nominal','Status'],
      keuangan.map(k=>({item:k, cells:[fmtDate(k.tanggal), k.siswa, k.kelas, k.keterangan, fmtCurrency(k.nominal), badge(k.status)]})),
      'tata-usaha:keuangan');
    return pageHead('Keuangan Siswa (SPP)') + panel('Riwayat pembayaran', table) + fab('tata-usaha:keuangan', 'Tambah pembayaran');
  }
}

/* ---- Kepala Sekolah / Pengawas: ringkasan lintas unit (hanya lihat) ---- */
async function renderOverview(){
  const [kes, kur, hum, sar, tu, bk, siswa] = await Promise.all([
    loadData('wakasek-kesiswaan'), loadData('kurikulum'), loadData('humas'),
    loadData('sarpras'), loadData('tata-usaha'), loadData('guru-bk'), loadData('siswa')
  ]);
  const K = kes.DATA_KESISWAAN, KU = kur.DATA_KURIKULUM, H = hum.DATA_HUMAS,
        S = sar.DATA_SARPRAS, T = tu.DATA_TATA_USAHA, B = bk.DATA_GURU_BK;
  const prestasiArr = getCollection('wakasek-kesiswaan:prestasi', K.prestasi);
  const kasusArr = getCollection('guru-bk:kasus', B.kasus);
  return pageHead('Ringkasan Sekolah') + statRow([
    {value:siswa.SISWA_LIST.length, label:'Total siswa terdaftar'},
    {value:KU.ringkasan.guruAktif, label:'Guru aktif'},
    {value:KU.ringkasan.rataCapaianKurikulum, label:'Rata-rata capaian kurikulum'}
  ]) + `<div class="dept-grid">
    ${deptCard('Kesiswaan', roleInfo.wakasek_kesiswaan.color, [
      [`${K.ringkasan.totalSiswa} siswa aktif`],[`${K.ringkasan.ekstrakurikulerAktif} ekstrakurikuler aktif`],[`${prestasiArr.length} prestasi tercatat`]
    ])}
    ${deptCard('Kurikulum', roleInfo.kurikulum.color, [
      [`${KU.ringkasan.totalMapel} mata pelajaran`],[`${KU.jadwalUjian.length} agenda ujian`],[`Capaian rata-rata ${KU.ringkasan.rataCapaianKurikulum}`]
    ])}
    ${deptCard('Humas', roleInfo.humas.color, [
      [`${H.ringkasan.mitraAktif} mitra aktif`],[`${H.kegiatan.length} kegiatan tercatat`],[`${H.publikasi.length} publikasi`]
    ])}
    ${deptCard('Sarana & Prasarana', roleInfo.sarpras.color, [
      [`${S.ringkasan.totalAset} total aset`],[`${S.ringkasan.perluPerbaikan} perlu perbaikan`],[`${S.ringkasan.rusakBerat} rusak berat`]
    ])}
    ${deptCard('Tata Usaha', roleInfo.tata_usaha.color, [
      [`${T.ringkasan.siswaAktif} siswa aktif`],[`${T.suratMasuk.length} surat masuk`],[`${T.suratKeluar.length} surat keluar`]
    ])}
    ${deptCard('Bimbingan Konseling', roleInfo.guru_bk.color, [
      [`${kasusArr.length} kasus tercatat`],[`${kasusArr.filter(k=>k.status!=='Selesai').length} masih ditangani`]
    ])}
  </div>`;
}
function deptCard(title, color, lines){
  return `<div class="dept-card" style="border-top-color:${color}">
    <h4>${title}</h4>
    ${lines.map(l=>`<div class="dept-meta">${l[0]}</div>`).join('')}
  </div>`;
}

boot();
