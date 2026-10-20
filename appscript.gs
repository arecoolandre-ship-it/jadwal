/**
 * Jadwal Fantastic 4 - kirim jadwal BESOK ke grup WhatsApp lewat Fonnte.
 *
 * SETUP (sekali saja):
 * 1. Buka Google Sheet jadwal > Extensions > Apps Script, tempel kode ini.
 * 2. Project Settings (ikon roda gigi) > Script Properties > Add script property:
 *      FONNTE_TOKEN = token Fonnte kamu
 *      WA_GROUP_ID  = ID grup, contoh 1203xxxxxxxxxxxx@g.us
 *    Token JANGAN ditulis di kode ini, karena file ini ada di repo publik.
 * 3. Jalankan pratinjau() untuk melihat isi pesan di Execution log (tidak mengirim).
 * 4. Jalankan kirimJadwalBesok() sekali untuk memberi izin dan tes kirim.
 * 5. Jalankan pasangTrigger() untuk mengirim otomatis tiap hari (atur JAM_KIRIM).
 *    Hapus trigger lama di menu Triggers kalau sebelumnya sudah ada.
 *
 * Penulisan backup di sel jadwal: DN>FC, DN>RAMBI, DN>ES, DN>ODEN
 * (shift DN, hari itu bertugas membackup tim tujuan).
 */

const SHEET_NAME = 'Sheet1';
const TZ = 'Asia/Jakarta';
const JAM_KIRIM = 20; // jam kirim jadwal besok (WIB)

const SHIFT = {
  CF: '06:00–14:00', CG: '07:00–15:00', EF: '06:00–12:00', EG: '07:00–13:00',
  CK: '11:00–19:00', CL: '12:00–20:00', DN: '14:30–22:30', FP: '16:30–22:30'
};
const URUTAN = ['CF', 'EF', 'CG', 'EG', 'CK', 'CL', 'DN', 'FP'];
const HARI = { SENIN: 'Senin', SELASA: 'Selasa', RABU: 'Rabu', KAMIS: 'Kamis', JUMAT: 'Jumat', SABTU: 'Sabtu', MINGGU: 'Minggu' };
const BULAN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ========== BACA SHEET ==========

function bacaSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" tidak ditemukan');
  const rows = sheet.getDataRange().getDisplayValues();

  const teams = {};
  let dates = null, days = null, team = null, tahap = '';

  rows.forEach(raw => {
    const a = raw.map(x => String(x || '').trim());
    const isi = a.filter(Boolean);
    if (!isi.length) return;
    const first = a[0];

    if (isi.length === 1 && /^TIM\s/i.test(first)) {
      team = first.toUpperCase();
      teams[team] = {};
      tahap = 'tanggal';
      return;
    }
    if (team && /^NAMA$/i.test(first)) {
      if (tahap === 'tanggal') { if (!dates) dates = a.slice(1); tahap = 'hari'; }
      else if (tahap === 'hari') { if (!days) days = a.slice(1); tahap = 'orang'; }
      return;
    }
    if (team && tahap === 'orang' && first && !/^(KODE SHIFT|WAKTU)$/i.test(first)) {
      teams[team][first] = a.slice(1);
    }
  });

  if (!dates || !Object.keys(teams).length) throw new Error('Format sheet tidak terbaca');
  return { dates: dates, days: days || [], teams: teams };
}

// "DN>FC" -> {kode:'DN', ke:'FC'}
function urai(v) {
  const s = String(v || '').trim().toUpperCase();
  const m = s.match(/^([A-Z]+)\s*>\s*([A-Z][A-Z ]*?)\s*$/);
  return m ? { kode: m[1], ke: m[2] } : { kode: s, ke: null };
}

// "ES" -> "TIM ES CREAM"
function cariTim(teams, token) {
  if (!token) return null;
  const kata = token.split(/\s+/);
  const nama = Object.keys(teams).filter(function (t) {
    return t.replace(/^TIM\s+/i, '').split(/\s+/).some(function (w) { return kata.indexOf(w) >= 0; });
  });
  return nama.length ? nama[0] : null;
}

function pendek(t) { return t.replace(/^TIM\s+/i, ''); }

function cariIndeksTanggal(dates, tanggal) {
  const tgl = Number(Utilities.formatDate(tanggal, TZ, 'd'));
  const bln = BULAN[Number(Utilities.formatDate(tanggal, TZ, 'M')) - 1];
  for (let i = 0; i < dates.length; i++) {
    const m = String(dates[i]).trim().toLowerCase().match(/^0?(\d{1,2})-([a-z]{3})/);
    if (m && Number(m[1]) === tgl && m[2] === bln) return i;
  }
  return -1;
}

// ========== SUSUN PESAN ==========

function susunPesan(data, idx, judul) {
  const teams = data.teams;
  const hari = HARI[String(data.days[idx] || '').toUpperCase()] || '';
  let pesan = '*' + judul + '*\n';
  pesan += '*' + (hari ? hari + ', ' : '') + data.dates[idx] + '*\n';
  pesan += '━━━━━━━━━━━━━━━━\n';

  Object.keys(teams).forEach(function (t) {
    const bertugas = [];
    const libur = [], cuti = [];

    // orang tim ini
    Object.keys(teams[t]).forEach(function (nama) {
      const c = urai(teams[t][nama][idx]);
      const tujuan = cariTim(teams, c.ke);
      if (c.kode === 'X') libur.push(nama);
      else if (c.kode === 'AL') cuti.push(nama);
      else if (SHIFT[c.kode]) {
        const catatan = tujuan && tujuan !== t ? ' → dipindah ke ' + pendek(tujuan) : '';
        bertugas.push({ nama: nama, kode: c.kode, catatan: catatan });
      }
    });

    // backup dari tim lain yang masuk ke tim ini
    Object.keys(teams).forEach(function (asal) {
      if (asal === t) return;
      Object.keys(teams[asal]).forEach(function (nama) {
        const c = urai(teams[asal][nama][idx]);
        if (SHIFT[c.kode] && cariTim(teams, c.ke) === t) {
          bertugas.push({ nama: nama, kode: c.kode, catatan: ' (backup dari ' + pendek(asal) + ')' });
        }
      });
    });

    bertugas.sort(function (x, y) { return URUTAN.indexOf(x.kode) - URUTAN.indexOf(y.kode); });

    pesan += '\n*' + t + '*\n';
    if (!bertugas.length) pesan += '- tidak ada yang bertugas\n';
    bertugas.forEach(function (b) {
      pesan += '• ' + b.nama + ' — ' + b.kode + ' (' + SHIFT[b.kode] + ')' + b.catatan + '\n';
    });
    if (libur.length) pesan += '_Libur: ' + libur.join(', ') + '_\n';
    if (cuti.length) pesan += '_Cuti: ' + cuti.join(', ') + '_\n';
  });

  return pesan;
}

function pesanUntuk(tanggal, judul) {
  const data = bacaSheet();
  const idx = cariIndeksTanggal(data.dates, tanggal);
  if (idx < 0) throw new Error('Tanggal ' + Utilities.formatDate(tanggal, TZ, 'd MMM yyyy') + ' belum ada di sheet');
  return susunPesan(data, idx, judul);
}

function besok() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

// ========== KIRIM ==========

function kirimWA(pesan) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('FONNTE_TOKEN');
  const grup = props.getProperty('WA_GROUP_ID');
  if (!token || !grup) throw new Error('FONNTE_TOKEN / WA_GROUP_ID belum diisi di Script Properties');

  const res = UrlFetchApp.fetch('https://api.fonnte.com/send', {
    method: 'post',
    headers: { Authorization: token },
    payload: { target: grup, message: pesan },
    muteHttpExceptions: true
  });
  const hasil = JSON.parse(res.getContentText());
  if (hasil.status !== true) throw new Error('Fonnte: ' + (hasil.reason || res.getContentText()));
  return hasil;
}

function kirimJadwalBesok() {
  const pesan = pesanUntuk(besok(), '📅 JADWAL BESOK - FANTASTIC 4');
  kirimWA(pesan);
  Logger.log('Terkirim:\n' + pesan);
}

// ========== PRATINJAU & TRIGGER ==========

function pratinjau() {
  Logger.log(pesanUntuk(besok(), '📅 JADWAL BESOK - FANTASTIC 4'));
}

function pasangTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kirimJadwalBesok') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kirimJadwalBesok')
    .timeBased().atHour(JAM_KIRIM).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  Logger.log('Trigger dipasang: tiap hari sekitar jam ' + JAM_KIRIM + ':00 WIB');
}
