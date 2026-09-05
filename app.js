/* ============================================================
   SIM Sekolah — SMA Negeri 5 Pinrang
   Semua data dibaca langsung dari file JSON di folder /data,
   sehingga tampilan selalu sinkron dengan isi file tersebut.
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

/* ---------------- Helpers ---------------- */

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function fmtDate(iso){
  if(!iso) return '-';
  const parts = iso.split('-');
  if(parts.length !== 3) return iso;
  const [y,m,d] = parts;
  return `${parseInt(d,10)} ${BULAN[parseInt(m,10)-1]} ${y}`;
}
function fmtCurrency(n){
  if(n === null || n === undefined) return '-';
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

/* Generic table builder.
   columns: [{label, render(row) -> html string}]
   rows: array of data objects
   searchFn(row) -> string used for the search box filter (optional)      */
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
    btn.addEventListener('click', async () => {
      selectedOrg = btn.dataset.orgTab;
      renderTab();
    });
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
  if(tab === 'ringkasan'){
    const proses = d.kasus.filter(k => k.status !== 'Selesai').length;
    return pageHead('Ringkasan Bimbingan Konseling') + statRow([
      {value:d.kasus.length, label:'Total kasus tercatat'},
      {value:proses, label:'Masih ditangani'},
      {value:d.jadwalKonseling.length, label:'Sesi konseling terjadwal / minggu'}
    ]) + panel('Kasus terbaru', kasusTable(d.kasus.slice(-3).reverse(), false));
  }
  if(tab === 'kasus'){
    return pageHead('Kasus Siswa') + buildKasusPanel(d.kasus);
  }
  if(tab === 'jadwal'){
    const {searchHtml, table} = buildTable({
      columns:[
        {label:'Hari', render:r=>r.hari},
        {label:'Waktu', render:r=>`<span class="mono">${r.waktu}</span>`},
        {label:'Agenda', render:r=>r.agenda}
      ],
      rows:d.jadwalKonseling
    });
    return pageHead('Jadwal Konseling Mingguan') + panel('Jadwal', table);
  }
}
function buildKasusPanel(kasus, hideNisn){
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
  return panel('Daftar kasus', table, searchHtml);
}
function kasusTable(kasus){
  const {table} = buildTable({
    columns:[
      {label:'Tanggal', render:r=>fmtDate(r.tanggal)},
      {label:'Siswa', render:r=>r.siswa},
      {label:'Kelas', render:r=>r.kelas},
      {label:'Kategori', render:r=>r.kategori},
      {label:'Status', render:r=>badge(r.status)}
    ],
    rows:kasus
  });
  return table;
}

/* ---- Wakasek Kesiswaan ---- */
async function renderKesiswaan(tab){
  const d = (await loadData('wakasek-kesiswaan')).DATA_KESISWAAN;
  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Kesiswaan') + statRow([
      {value:d.ringkasan.totalSiswa, label:'Total siswa aktif'},
      {value:d.ringkasan.ekstrakurikulerAktif, label:'Ekstrakurikuler aktif'},
      {value:d.prestasi.length, label:'Prestasi tercatat'}
    ]) + panel('Prestasi terbaru', prestasiTable(d.prestasi.slice(-3).reverse()));
  }
  if(tab === 'prestasi'){
    return pageHead('Prestasi Siswa') + prestasiPanel(d.prestasi);
  }
  if(tab === 'ekstrakurikuler'){
    const full = (await loadData('wakasek-kesiswaan'));
    const eks = full.ekstrakurikuler || [];
    const {table} = buildTable({
      columns:[
        {label:'Nama', render:r=>r.nama},
        {label:'Pembina', render:r=>r.pembina},
        {label:'Jadwal', render:r=>r.jadwal},
        {label:'Anggota', render:r=>`<span class="mono">${r.anggota}</span>`}
      ],
      rows:eks
    });
    return pageHead('Ekstrakurikuler') + panel('Daftar ekstrakurikuler', table);
  }
  if(tab === 'pelanggaran'){
    const full = (await loadData('wakasek-kesiswaan'));
    const pel = full.pelanggaran || [];
    const {searchHtml, table} = buildTable({
      columns:[
        {label:'Tanggal', render:r=>fmtDate(r.tanggal)},
        {label:'Siswa', render:r=>r.siswa},
        {label:'Kelas', render:r=>r.kelas},
        {label:'Jenis Pelanggaran', render:r=>r.jenis},
        {label:'Poin', render:r=>`<span class="mono">${r.poin}</span>`},
        {label:'Status', render:r=>badge(r.status)}
      ],
      rows:pel,
      searchFn:r=>`${r.siswa} ${r.kelas}`,
      searchPlaceholder:'Cari nama atau kelas...'
    });
    return pageHead('Pelanggaran Siswa') + panel('Catatan pelanggaran', table, searchHtml);
  }
  if(tab === 'laporan-bk'){
    const bk = (await loadData('guru-bk')).DATA_GURU_BK;
    return pageHead('Laporan Bimbingan Konseling') +
      `<p style="color:var(--muted);margin-bottom:16px;font-size:13.5px;">Tampilan pemantauan aktivitas Guru BK untuk Wakasek Kesiswaan.</p>` +
      statRow([
        {value:bk.kasus.length, label:'Total kasus'},
        {value:bk.kasus.filter(k=>k.status!=='Selesai').length, label:'Masih ditangani'},
        {value:bk.jadwalKonseling.length, label:'Sesi konseling / minggu'}
      ]) + buildKasusPanel(bk.kasus);
  }
  if(tab === 'laporan-organisasi'){
    return pageHead('Laporan Organisasi Siswa') + await organisasiSelector();
  }
}
function prestasiTable(prestasi){
  const {table} = buildTable({
    columns:[
      {label:'Tanggal', render:r=>fmtDate(r.tanggal)},
      {label:'Siswa', render:r=>r.siswa},
      {label:'Bidang', render:r=>r.bidang},
      {label:'Tingkat', render:r=>r.tingkat},
      {label:'Capaian', render:r=>`<span class="badge badge-good">${escapeHtml(r.capaian)}</span>`}
    ],
    rows:prestasi
  });
  return table;
}
function prestasiPanel(prestasi){
  const {searchHtml, table} = buildTable({
    columns:[
      {label:'Tanggal', render:r=>fmtDate(r.tanggal)},
      {label:'Siswa', render:r=>r.siswa},
      {label:'Kelas', render:r=>r.kelas},
      {label:'Bidang', render:r=>r.bidang},
      {label:'Tingkat', render:r=>r.tingkat},
      {label:'Capaian', render:r=>`<span class="badge badge-good">${escapeHtml(r.capaian)}</span>`}
    ],
    rows:prestasi,
    searchFn:r=>`${r.siswa} ${r.kelas} ${r.bidang} ${r.tingkat}`,
    searchPlaceholder:'Cari nama, kelas, bidang...'
  });
  return panel('Daftar prestasi', table, searchHtml);
}

/* ---- Organisasi selector (used inside Wakasek Kesiswaan) ---- */
let selectedOrg = 'osis';
async function organisasiSelector(){
  const list = (await loadData('laporan-organisasi')).ORGANISASI_LIST;
  const tabs = list.map(o => `
    <button class="org-tab${o.id===selectedOrg?' active':''}" data-org-tab="${o.id}"
      style="${o.id===selectedOrg ? `background:${o.color};` : ''}">
      <i style="background:${o.color}"></i>${o.label}
    </button>`).join('');
  const org = list.find(o => o.id === selectedOrg) || list[0];
  const orgData = await loadData(org.id);
  return `<div class="org-tabs">${tabs}</div>` + organisasiBody(org, orgData);
}
function organisasiBody(org, d){
  return `
    <div class="dept-grid" style="margin-bottom:20px;">
      <div class="dept-card" style="border-top-color:${org.color}">
        <h4>Pembina</h4>
        <div class="dept-meta">${escapeHtml(d.pembina || '-')}</div>
      </div>
      <div class="dept-card" style="border-top-color:${org.color}">
        <h4>Anggota tercatat</h4>
        <div class="dept-meta">${(d.anggota||[]).length} orang</div>
      </div>
      <div class="dept-card" style="border-top-color:${org.color}">
        <h4>Program kerja berjalan</h4>
        <div class="dept-meta">${(d.prokja||[]).filter(p=>p.status==='Berjalan').length} dari ${(d.prokja||[]).length}</div>
      </div>
    </div>
    ${panel('Anggota', simpleTable(['Nama','Kelas','Jabatan'], (d.anggota||[]).map(a=>[a.nama,a.kelas,a.jabatan])))}
    ${panel('Program Kerja', simpleTable(['Nama Program','Bidang','Target','Capaian','Status'], (d.prokja||[]).map(p=>[p.nama,p.bidang,p.target,p.capaian,badge(p.status)])))}
    ${panel('Kegiatan', simpleTable(['Tanggal','Kegiatan','Deskripsi','Status'], (d.kegiatan||[]).map(k=>[fmtDate(k.tanggalMulai)+(k.tanggalSelesai&&k.tanggalSelesai!==k.tanggalMulai?' – '+fmtDate(k.tanggalSelesai):''),k.nama,k.deskripsi,badge(k.status)])))}
  `;
}
function simpleTable(headers, rows){
  if(!rows.length){
    return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody><tr class="empty-row"><td colspan="${headers.length}">Belum ada data.</td></tr></tbody></table>`;
  }
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c===undefined||c===null||c===''?'-':c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ---- Organisasi dashboards (login sebagai OSIS/Pramuka/PMR/Paskibra) ---- */
async function renderOrganisasi(orgId, tab){
  const orgList = (await loadData('laporan-organisasi')).ORGANISASI_LIST;
  const org = orgList.find(o => o.id === orgId);
  const d = await loadData(orgId);
  const label = org ? org.label : orgId;
  if(tab === 'ringkasan'){
    return pageHead(`Ringkasan ${label}`) + statRow([
      {value:(d.anggota||[]).length, label:'Anggota'},
      {value:(d.prokja||[]).filter(p=>p.status==='Berjalan').length, label:'Program berjalan'},
      {value:(d.kegiatan||[]).filter(k=>k.status==='Selesai').length, label:'Kegiatan selesai'}
    ]) + panel('Pembina', `<div class="panel-body pad">${escapeHtml(d.pembina||'-')}</div>`);
  }
  if(tab === 'anggota'){
    return pageHead(`Anggota ${label}`) + panel('Daftar anggota', simpleTable(['Nama','NISN','Kelas','Jabatan'], (d.anggota||[]).map(a=>[a.nama,`<span class="mono">${a.nisn}</span>`,a.kelas,a.jabatan])));
  }
  if(tab === 'prokja'){
    return pageHead(`Program Kerja ${label}`) + panel('Program kerja', simpleTable(['Nama Program','Bidang','Target','Capaian','Status'], (d.prokja||[]).map(p=>[p.nama,p.bidang,p.target,p.capaian,badge(p.status)])));
  }
  if(tab === 'kegiatan'){
    return pageHead(`Kegiatan ${label}`) + panel('Kegiatan', simpleTable(['Tanggal','Kegiatan','Deskripsi','Status'], (d.kegiatan||[]).map(k=>[fmtDate(k.tanggalMulai)+(k.tanggalSelesai&&k.tanggalSelesai!==k.tanggalMulai?' – '+fmtDate(k.tanggalSelesai):''),k.nama,k.deskripsi,badge(k.status)])));
  }
  if(tab === 'keuangan'){
    const rows = d.keuangan||[];
    const masuk = rows.filter(k=>k.jenis==='Pemasukan').reduce((s,k)=>s+k.nominal,0);
    const keluar = rows.filter(k=>k.jenis==='Pengeluaran').reduce((s,k)=>s+k.nominal,0);
    return pageHead(`Keuangan ${label}`) + statRow([
      {value:fmtCurrency(masuk), label:'Total pemasukan'},
      {value:fmtCurrency(keluar), label:'Total pengeluaran'},
      {value:fmtCurrency(masuk-keluar), label:'Saldo'}
    ]) + panel('Transaksi', simpleTable(['Tanggal','Keterangan','Jenis','Nominal'], rows.map(k=>[fmtDate(k.tanggal),k.keterangan,jenisBadge(k.jenis),fmtCurrency(k.nominal)])));
  }
  if(tab === 'lpj'){
    const rows = d.lpj||[];
    if(!rows.length) return pageHead(`Laporan (LPJ) ${label}`) + panel('Laporan pertanggungjawaban', '<div class="panel-body pad">Belum ada laporan.</div>');
    return pageHead(`Laporan (LPJ) ${label}`) + rows.map(l => `
      <div class="note-card">
        <div class="meta">${fmtDate(l.tanggal)} — ${escapeHtml(l.periode)} — disusun oleh ${escapeHtml(l.disusunOleh)}</div>
        <div class="body-txt">${escapeHtml(l.isi)}</div>
      </div>`).join('');
  }
}

/* ---- Kurikulum ---- */
async function renderKurikulum(tab){
  const d = (await loadData('kurikulum')).DATA_KURIKULUM;
  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Kurikulum') + statRow([
      {value:d.ringkasan.totalMapel, label:'Total mata pelajaran'},
      {value:d.ringkasan.guruAktif, label:'Guru aktif'},
      {value:d.ringkasan.rataCapaianKurikulum, label:'Rata-rata capaian kurikulum'}
    ]) + panel('Jadwal ujian terdekat', simpleTable(['Nama Ujian','Kelas','Tanggal','Status'], d.jadwalUjian.map(j=>[j.nama,j.kelas,j.tanggal,badge(j.status)])));
  }
  if(tab === 'jadwal-ujian'){
    return pageHead('Jadwal Ujian') + panel('Seluruh jadwal ujian', simpleTable(['Nama Ujian','Kelas','Tanggal','Status'], d.jadwalUjian.map(j=>[j.nama,j.kelas,j.tanggal,badge(j.status)])));
  }
  if(tab === 'capaian'){
    return pageHead('Capaian Kurikulum') + panel('Capaian per mata pelajaran', simpleTable(['Mata Pelajaran','Kelas','Target Bab','Tercapai','Persentase'], d.capaianKurikulum.map(c=>[c.mapel,c.kelas,c.targetBab,c.tercapai,`<span class="mono">${c.persentase}</span>`])));
  }
  if(tab === 'mapel'){
    return pageHead('Mata Pelajaran') + panel('Daftar mata pelajaran', simpleTable(['Nama','Rumpun','Jam / Minggu'], d.mataPelajaran.map(m=>[m.nama,m.rumpun,`<span class="mono">${m.jamPerMinggu}</span>`])));
  }
}

/* ---- Humas ---- */
async function renderHumas(tab){
  const d = (await loadData('humas')).DATA_HUMAS;
  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Humas') + statRow([
      {value:d.ringkasan.mitraAktif, label:'Mitra aktif'},
      {value:d.kegiatan.length, label:'Kegiatan tercatat'},
      {value:d.publikasi.length, label:'Publikasi tercatat'}
    ]) + panel('Kegiatan terdekat', simpleTable(['Tanggal','Kegiatan','Lokasi','PIC','Status'], d.kegiatan.map(k=>[fmtDate(k.tanggal),k.nama,k.lokasi,k.pic,badge(k.status)])));
  }
  if(tab === 'kegiatan'){
    return pageHead('Kegiatan Humas') + panel('Seluruh kegiatan', simpleTable(['Tanggal','Kegiatan','Lokasi','PIC','Status'], d.kegiatan.map(k=>[fmtDate(k.tanggal),k.nama,k.lokasi,k.pic,badge(k.status)])));
  }
  if(tab === 'kerjasama'){
    return pageHead('Kerja Sama Mitra') + panel('Daftar mitra', simpleTable(['Mitra','Bidang Kerja Sama','Mulai','Status'], d.kerjasama.map(k=>[k.mitra,k.bidang,k.mulai,badge(k.status)])));
  }
  if(tab === 'publikasi'){
    return pageHead('Publikasi') + panel('Daftar publikasi', simpleTable(['Tanggal','Judul','Kanal'], d.publikasi.map(p=>[fmtDate(p.tanggal),p.judul,p.kanal])));
  }
}

/* ---- Sarpras ---- */
async function renderSarpras(tab){
  const d = (await loadData('sarpras')).DATA_SARPRAS;
  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Sarana & Prasarana') + statRow([
      {value:d.ringkasan.totalAset, label:'Total aset'},
      {value:d.ringkasan.kondisiBaik, label:'Kondisi baik'},
      {value:d.ringkasan.perluPerbaikan, label:'Perlu perbaikan'},
      {value:d.ringkasan.rusakBerat, label:'Rusak berat'}
    ]) + panel('Pengajuan perbaikan berjalan', simpleTable(['Tanggal','Item','Pemohon','Prioritas','Status'], d.pengajuanPerbaikan.map(p=>[fmtDate(p.tanggal),p.item,p.pemohon,p.prioritas,badge(p.status)])));
  }
  if(tab === 'inventaris'){
    return pageHead('Inventaris') + panel('Daftar inventaris', simpleTable(['Nama Aset','Jumlah','Kondisi','Lokasi'], d.inventaris.map(i=>[i.nama,`<span class="mono">${i.jumlah}</span>`,badge(i.kondisi),i.lokasi])));
  }
  if(tab === 'perbaikan'){
    return pageHead('Pengajuan Perbaikan') + panel('Daftar pengajuan', simpleTable(['Tanggal','Item','Pemohon','Prioritas','Status'], d.pengajuanPerbaikan.map(p=>[fmtDate(p.tanggal),p.item,p.pemohon,p.prioritas,badge(p.status)])));
  }
  if(tab === 'kondisi-ruang'){
    return pageHead('Kondisi Ruang') + panel('Daftar ruang', simpleTable(['Ruang','Kondisi','Catatan'], d.kondisiRuang.map(r=>[r.ruang,badge(r.kondisi),r.catatan])));
  }
}

/* ---- Tata Usaha ---- */
async function renderTataUsaha(tab){
  const d = (await loadData('tata-usaha')).DATA_TATA_USAHA;
  if(tab === 'ringkasan'){
    return pageHead('Ringkasan Tata Usaha') + statRow([
      {value:d.ringkasan.siswaAktif, label:'Siswa aktif'},
      {value:d.suratMasuk.length, label:'Surat masuk tercatat'},
      {value:d.suratKeluar.length, label:'Surat keluar tercatat'}
    ]) + panel('Surat masuk terbaru', simpleTable(['Tanggal','Nomor Surat','Asal','Perihal','Status'], d.suratMasuk.map(s=>[fmtDate(s.tanggal),`<span class="mono">${s.nomorSurat}</span>`,s.asal,s.perihal,badge(s.status)])));
  }
  if(tab === 'surat-masuk'){
    return pageHead('Surat Masuk') + panel('Daftar surat masuk', simpleTable(['Tanggal','Nomor Surat','Asal','Perihal','Status'], d.suratMasuk.map(s=>[fmtDate(s.tanggal),`<span class="mono">${s.nomorSurat}</span>`,s.asal,s.perihal,badge(s.status)])));
  }
  if(tab === 'surat-keluar'){
    return pageHead('Surat Keluar') + panel('Daftar surat keluar', simpleTable(['Tanggal','Nomor Surat','Tujuan','Perihal','Status'], d.suratKeluar.map(s=>[fmtDate(s.tanggal),`<span class="mono">${s.nomorSurat}</span>`,s.tujuan,s.perihal,badge(s.status)])));
  }
  if(tab === 'administrasi'){
    return pageHead('Administrasi Siswa') + panel('Riwayat administrasi', simpleTable(['Tanggal','Siswa','Kelas','Jenis','Keterangan'], d.administrasiSiswa.map(a=>[fmtDate(a.tanggal),a.siswa,a.kelas,a.jenis,a.keterangan])));
  }
  if(tab === 'keuangan'){
    return pageHead('Keuangan Siswa (SPP)') + panel('Riwayat pembayaran', simpleTable(['Tanggal','Siswa','Kelas','Keterangan','Nominal','Status'], d.keuangan.map(k=>[fmtDate(k.tanggal),k.siswa,k.kelas,k.keterangan,fmtCurrency(k.nominal),badge(k.status)])));
  }
}

/* ---- Kepala Sekolah / Pengawas: ringkasan lintas unit ---- */
async function renderOverview(){
  const [kes, kur, hum, sar, tu, bk, siswa] = await Promise.all([
    loadData('wakasek-kesiswaan'), loadData('kurikulum'), loadData('humas'),
    loadData('sarpras'), loadData('tata-usaha'), loadData('guru-bk'), loadData('siswa')
  ]);
  const K = kes.DATA_KESISWAAN, KU = kur.DATA_KURIKULUM, H = hum.DATA_HUMAS,
        S = sar.DATA_SARPRAS, T = tu.DATA_TATA_USAHA, B = bk.DATA_GURU_BK;
  return pageHead('Ringkasan Sekolah') + statRow([
    {value:siswa.SISWA_LIST.length, label:'Total siswa terdaftar'},
    {value:KU.ringkasan.guruAktif, label:'Guru aktif'},
    {value:KU.ringkasan.rataCapaianKurikulum, label:'Rata-rata capaian kurikulum'}
  ]) + `<div class="dept-grid">
    ${deptCard('Kesiswaan', roleInfo.wakasek_kesiswaan.color, [
      [`${K.ringkasan.totalSiswa} siswa aktif`],[`${K.ringkasan.ekstrakurikulerAktif} ekstrakurikuler aktif`],[`${K.prestasi.length} prestasi tercatat`]
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
      [`${B.kasus.length} kasus tercatat`],[`${B.kasus.filter(k=>k.status!=='Selesai').length} masih ditangani`]
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
