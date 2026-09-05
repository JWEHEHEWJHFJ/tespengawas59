/**
 * SIM Sekolah — sync worker
 *
 * Proxy kecil yang berdiri di antara aplikasi SIM Sekolah (statis, di
 * browser) dan GitHub API. Tugasnya cuma satu: menyimpan GITHUB_TOKEN
 * secara aman di server (bukan di kode front-end), lalu memakainya
 * untuk meng-update file JSON di repo saat menerima permintaan yang
 * membawa kode sinkronisasi (SYNC_PASSCODE) yang benar.
 *
 * Environment variables yang dibutuhkan (diatur lewat `wrangler secret
 * put` atau dashboard Cloudflare, BUKAN ditulis di file ini):
 *   GITHUB_TOKEN     - personal access token GitHub, scope "repo" saja
 *   SYNC_PASSCODE     - kode rahasia yang dipakai admin untuk sinkron
 *   GITHUB_OWNER      - username/organisasi pemilik repo
 *   GITHUB_REPO       - nama repo
 *   GITHUB_BRANCH     - branch tujuan (default "main")
 *   ALLOWED_ORIGIN    - origin situs GitHub Pages kamu, mis.
 *                        https://username.github.io (untuk CORS)
 */

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Metode tidak diizinkan.' }, 405, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Isi permintaan bukan JSON yang valid.' }, 400, corsHeaders);
    }

    const { passcode, file, content, message } = body;

    if (!env.SYNC_PASSCODE || passcode !== env.SYNC_PASSCODE) {
      return json({ error: 'Kode sinkronisasi salah atau belum diatur di server.' }, 401, corsHeaders);
    }
    if (!file || !/^([a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_-]+\.json$/.test(file)) {
      return json({ error: 'Nama file tidak valid.' }, 400, corsHeaders);
    }
    if (content === undefined || content === null) {
      return json({ error: 'Isi data (content) kosong.' }, 400, corsHeaders);
    }
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return json({ error: 'Worker belum dikonfigurasi lengkap (token/owner/repo).' }, 500, corsHeaders);
    }

    const branch = env.GITHUB_BRANCH || 'main';
    const path = `data/${file}`;
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
    const ghHeaders = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'sim-sekolah-sync-worker',
    };

    try {
      // 1) Ambil sha file saat ini (dibutuhkan GitHub API untuk update file yang sudah ada).
      //    Kalau file belum pernah ada (mis. organisasi baru dari fitur Ekstrakurikuler),
      //    GitHub akan membalas 404 — dalam hal ini kita lanjut membuat file baru (tanpa sha).
      let sha;
      const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
      if (getRes.ok) {
        const current = await getRes.json();
        sha = current.sha;
      } else if (getRes.status !== 404) {
        const detail = await getRes.text();
        return json({ error: `Gagal membaca ${path} dari GitHub (${getRes.status}): ${detail}` }, 502, corsHeaders);
      }

      // 2) Susun ulang isi file baru lalu kirim sebagai commit baru (update jika sha ada, buat baru jika tidak)
      const newContentStr = JSON.stringify(content, null, 2) + '\n';
      const newContentB64 = toBase64Utf8(newContentStr);

      const putBody = {
        message: message || `Perbarui ${path} lewat SIM Sekolah`,
        content: newContentB64,
        branch,
      };
      if (sha) putBody.sha = sha;

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      });

      if (!putRes.ok) {
        const detail = await putRes.text();
        return json({ error: `Gagal menyimpan ${path} ke GitHub (${putRes.status}): ${detail}` }, 502, corsHeaders);
      }

      return json({ ok: true }, 200, corsHeaders);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500, corsHeaders);
    }
  },
};

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}
