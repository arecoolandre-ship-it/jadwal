/**
 * Google Apps Script - Kirim Jadwal ke WhatsApp via Fonnte
 * 
 * Cara setup:
 * 1. Buka Google Sheet jadwal
 * 2. Extensions > Apps Script
 * 3. Paste kode ini ke script editor
 * 4. Simpan project dengan nama "Jadwal WhatsApp Sender"
 * 5. Run fungsi main() pertama kali untuk authorize
 * 6. Setup trigger untuk auto-send (lihat bagian di bawah)
 */

// ========== KONFIGURASI ==========
const CONFIG = {
  FONNTE_TOKEN: '5AvJaqu9i22qiN9WbNYg',
  WA_GROUP_ID: '120363420614252569@g.us',
  FONNTE_API: 'https://api.fonnte.com/send',
  SHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
  SHEET_NAME: 'Sheet1' // Sesuaikan dengan nama sheet Anda
};

// ========== FUNGSI UTAMA ==========

/**
 * Fungsi untuk fetch data dari sheet dan kirim ke WhatsApp
 */
function sendJadwalToWhatsApp() {
  try {
    Logger.log('🚀 Memulai proses pengiriman jadwal...');
    
    // Get data dari sheet
    const jadwalData = parseJadwalFromSheet();
    
    if (!jadwalData.success) {
      throw new Error(jadwalData.error);
    }
    
    // Format pesan
    const message = formatJadwalMessage(jadwalData.data);
    Logger.log('📝 Pesan yang akan dikirim:\n' + message);
    
    // Kirim ke WhatsApp
    const result = sendViaFonnte(message);
    
    if (result.success) {
      Logger.log('✅ Jadwal berhasil dikirim!');
      Logger.log('Message ID: ' + result.messageId);
      
      // Optional: Log ke sheet
      logToSheet('SUCCESS', 'Jadwal sent', result.messageId);
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    Logger.log('❌ Error: ' + error.message);
    logToSheet('ERROR', error.message, '');
  }
}

/**
 * Parse data jadwal dari Google Sheet
 */
function parseJadwalFromSheet() {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 3) {
      return {
        success: false,
        error: 'Sheet tidak memiliki data yang cukup'
      };
    }
    
    const parsed = {
      dates: [],
      days: [],
      teams: {},
      rawData: data
    };
    
    // Parse header dan data
    let teamCurrentIndex = -1;
    let dateRowIndex = -1;
    let dayRowIndex = -1;
    
    // Cari baris TANGGAL dan HARI
    for (let i = 0; i < data.length; i++) {
      const firstCell = String(data[i][0]).trim().toUpperCase();
      
      if (firstCell === 'TANGGAL') {
        dateRowIndex = i;
        parsed.dates = data[i].slice(1).filter(d => d !== '').map(d => String(d).trim());
      }
      
      const daysInRow = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];
      if (daysInRow.some(day => data[i].includes(day))) {
        dayRowIndex = i;
        parsed.days = data[i].slice(1).filter(d => d !== '').map(d => String(d).trim());
      }
      
      // Cari TIM
      if (/^TIM\s/.test(firstCell)) {
        const teamName = firstCell.replace(/^TIM\s*/i, '').trim();
        parsed.teams[teamName] = {
          rowIndex: i,
          schedule: {}
        };
        teamCurrentIndex = teamName;
      }
    }
    
    if (dateRowIndex === -1 || dayRowIndex === -1 || Object.keys(parsed.teams).length === 0) {
      return {
        success: false,
        error: 'Format sheet tidak valid. Pastikan ada baris TANGGAL dan HARI'
      };
    }
    
    // Parse schedule untuk setiap tim
    Object.entries(parsed.teams).forEach(([teamName, teamData]) => {
      const rowIndex = teamData.rowIndex;
      const scheduleRow = data[rowIndex + 1] || []; // Baris setelah TIM header
      
      parsed.dates.forEach((date, idx) => {
        if (!parsed.teams[teamName].schedule[date]) {
          parsed.teams[teamName].schedule[date] = {};
        }
        
        parsed.days.forEach((day, dayIdx) => {
          parsed.teams[teamName].schedule[date][day] = scheduleRow[dayIdx + 1] || '-';
        });
      });
    });
    
    Logger.log('✓ Data parsed: ' + Object.keys(parsed.teams).length + ' tim, ' + parsed.dates.length + ' tanggal');
    
    return {
      success: true,
      data: parsed
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'Error parsing sheet: ' + error.message
    };
  }
}

/**
 * Format jadwal menjadi pesan WhatsApp
 */
function formatJadwalMessage(jadwalData) {
  const { dates, days, teams } = jadwalData;
  
  // Gunakan tanggal hari ini jika ada
  const today = new Date();
  let targetDate = null;
  
  const dateNum = String(today.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStr = months[today.getMonth()];
  
  // Cari format tanggal yang match
  targetDate = dates.find(d => d.includes(dateNum) && d.includes(monthStr)) || dates[0];
  
  let message = '*📅 JADWAL FANTASTIC 4*\n';
  message += `*Tanggal: ${targetDate}*\n`;
  message += '━━━━━━━━━━━━━━━━\n\n';
  
  // Format untuk setiap tim
  Object.entries(teams).forEach(([teamName, teamData]) => {
    const schedule = teamData.schedule || teamData;
    
    if (schedule[targetDate]) {
      message += `*${teamName}*\n`;
      
      days.forEach((day) => {
        const shift = schedule[targetDate][day] || '-';
        const emojiDay = {
          'SENIN': '🔵', 'SELASA': '🟡', 'RABU': '🟢',
          'KAMIS': '🔴', 'JUMAT': '🟣', 'SABTU': '⚪', 'MINGGU': '⚫'
        }[day] || '•';
        
        message += `${emojiDay} ${day}: ${shift}\n`;
      });
      message += '\n';
    }
  });
  
  return message;
}

/**
 * Kirim pesan via Fonnte API
 */
function sendViaFonnte(message) {
  try {
    const payload = {
      token: CONFIG.FONNTE_TOKEN,
      to: CONFIG.WA_GROUP_ID,
      message: message
    };
    
    const options = {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(CONFIG.FONNTE_API, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.status === true) {
      return {
        success: true,
        messageId: result.data?.id || 'unknown'
      };
    } else {
      return {
        success: false,
        error: result.reason || 'Unknown error from Fonnte'
      };
    }
    
  } catch (error) {
    return {
      success: false,
      error: 'Error: ' + error.message
    };
  }
}

// ========== LOGGING & HELPER ==========

/**
 * Log ke sheet untuk tracking
 */
function logToSheet(status, message, messageId) {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName('Logs');
    if (!sheet) return; // Skip jika sheet 'Logs' tidak ada
    
    sheet.appendRow([
      new Date(),
      status,
      message,
      messageId
    ]);
  } catch (e) {
    // Ignore jika sheet tidak ada
  }
}

/**
 * Fungsi test - Run ini untuk test tanpa trigger
 */
function testSendJadwal() {
  sendJadwalToWhatsApp();
}

/**
 * Kirim jadwal dengan tanggal custom
 */
function sendJadwalForDate(targetDate) {
  try {
    Logger.log('🚀 Mengirim jadwal untuk: ' + targetDate);
    
    const jadwalData = parseJadwalFromSheet();
    if (!jadwalData.success) {
      throw new Error(jadwalData.error);
    }
    
    // Format dengan tanggal custom
    let message = '*📅 JADWAL FANTASTIC 4*\n';
    message += `*Tanggal: ${targetDate}*\n`;
    message += '━━━━━━━━━━━━━━━━\n\n';
    
    const { days, teams } = jadwalData.data;
    
    Object.entries(teams).forEach(([teamName, teamData]) => {
      const schedule = teamData.schedule || teamData;
      
      if (schedule[targetDate]) {
        message += `*${teamName}*\n`;
        
        days.forEach((day) => {
          const shift = schedule[targetDate][day] || '-';
          const emojiDay = {
            'SENIN': '🔵', 'SELASA': '🟡', 'RABU': '🟢',
            'KAMIS': '🔴', 'JUMAT': '🟣', 'SABTU': '⚪', 'MINGGU': '⚫'
          }[day] || '•';
          
          message += `${emojiDay} ${day}: ${shift}\n`;
        });
        message += '\n';
      }
    });
    
    const result = sendViaFonnte(message);
    
    if (result.success) {
      Logger.log('✅ Berhasil dikirim! Message ID: ' + result.messageId);
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    Logger.log('❌ Error: ' + error.message);
  }
}

// ========== SETUP TRIGGER ==========

/**
 * CARA SETUP TRIGGER OTOMATIS:
 * 
 * 1. Di Apps Script editor, klik "⏰ Triggers" (kiri sidebar)
 * 2. Klik "+ Create new trigger"
 * 3. Pilih:
 *    - Function to execute: sendJadwalToWhatsApp
 *    - Which deployment should execute?: Head
 *    - Select event source: Time-driven
 *    - Select type of time based trigger: Day timer
 *    - Select time of day: 07:00 - 08:00 (untuk kirim pagi)
 * 4. Klik Create
 * 
 * Untuk reminder malam, buat trigger kedua dengan waktu 22:00
 * 
 * CATATAN:
 * - Apps Script akan berjalan di timezone Google Cloud (UTC)
 * - Sesuaikan waktu dengan timezone Anda
 * - Untuk WIB (UTC+7), setting "07:00" ≈ 14:00 WIB (tergantung DST)
 */

/**
 * Fungsi untuk reminder malam (optional)
 * Setup trigger terpisah untuk fungsi ini
 */
function sendReminderMalam() {
  try {
    Logger.log('🌙 Mengirim reminder malam...');
    
    const jadwalData = parseJadwalFromSheet();
    if (!jadwalData.success) {
      throw new Error(jadwalData.error);
    }
    
    let message = '*🌙 REMINDER - CEK JADWAL ESOK HARI*\n';
    message += '━━━━━━━━━━━━━━━━\n\n';
    message += formatJadwalMessage(jadwalData.data);
    
    const result = sendViaFonnte(message);
    
    if (result.success) {
      Logger.log('✅ Reminder terkirim!');
      logToSheet('SUCCESS', 'Reminder sent', result.messageId);
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    Logger.log('❌ Error: ' + error.message);
    logToSheet('ERROR', 'Reminder failed: ' + error.message, '');
  }
}

// ========== DEPLOYMENT ==========

/**
 * JIKA INGIN TRIGGER DARI LUAR (via REST API):
 * 
 * 1. Deploy sebagai API:
 *    - Klik Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: [Your email]
 *    - Who has access: Anyone
 *    - Deploy
 * 
 * 2. Copy URL yang diberikan (misal: https://script.google.com/macros/d/xxxxx/userweb)
 * 
 * 3. Panggil dari aplikasi lain:
 *    curl -X POST https://script.google.com/macros/d/xxxxx/userweb
 * 
 * Atau dari Zapier, IFTTT, dll
 */

/**
 * Fungsi untuk deployment as web app
 */
function doPost(e) {
  try {
    const action = e.parameter.action || 'send';
    const targetDate = e.parameter.date || null;
    
    let response = {};
    
    if (action === 'send') {
      if (targetDate) {
        sendJadwalForDate(targetDate);
        response.message = 'Jadwal ' + targetDate + ' sent';
      } else {
        sendJadwalToWhatsApp();
        response.message = 'Jadwal today sent';
      }
      response.status = 'success';
    } else if (action === 'reminder') {
      sendReminderMalam();
      response.message = 'Reminder sent';
      response.status = 'success';
    } else if (action === 'test') {
      const jadwalData = parseJadwalFromSheet();
      response.status = jadwalData.success ? 'success' : 'error';
      response.message = jadwalData.error || 'Data fetched successfully';
      response.data = jadwalData.data;
    } else {
      response.status = 'error';
      response.message = 'Unknown action';
    }
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
