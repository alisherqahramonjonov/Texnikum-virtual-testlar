// ==========================================================================
// Smart Test Hub - Asosiy Dastur Koding (app.js)
// Word (.docx), Excel (.xlsx/.xls) va JSON import/eksport bilan to'ldirilgan
// ==========================================================================

// ==========================================
// 1. HOLAT (STATE) BOSHQARUVI
// ==========================================
const state = {
  currentView: 'home-view',
  createdTest: {
    title: 'Yangi Test',
    duration: 20,
    author: "O'qituvchi",
    questions: [],
    shuffle: false
  },
  activeTest: null,
  studentName: '',
  currentQuestionIndex: 0,
  studentAnswers: {}, // savol indeksi => tanlangan variant indeksi
  timerInterval: null,
  timeLeft: 0, // soniyalarda
  viewingResult: null, // o'quvchi natijasi ko'rilayotgan bo'lsa
  editingQuestionIndex: -1, // -1: yangi qo'shish, >= 0: mavjudini tahrirlash
  currentQrUrl: '', // QR modalda ko'rsatilayotgan havola
  lastResultForCert: null // sertifikat uchun natija obyekti
};

// ==========================================
// 2. JURNAL (localStorage) BOSHQARUVI
// ==========================================
const JOURNAL_KEY = 'smart_test_hub_journal';

function getJournal() {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Jurnalni o'qishda xatolik:", e);
    return [];
  }
}

function saveToJournal(result) {
  if (!result || !result.studentName || !result.testTitle) return;

  const journal = getJournal();
  const percent = result.totalQuestions > 0
    ? Math.round((result.correctCount / result.totalQuestions) * 100)
    : 0;

  // Takroriy yozuvlarni oldini olish
  const isDuplicate = journal.some(entry =>
    entry.studentName === result.studentName &&
    entry.testTitle === result.testTitle &&
    entry.correctCount === result.correctCount &&
    entry.totalQuestions === result.totalQuestions
  );

  if (isDuplicate) return;

  journal.unshift({
    studentName: result.studentName,
    testTitle: result.testTitle,
    author: result.author || "Noma'lum",
    correctCount: result.correctCount,
    totalQuestions: result.totalQuestions,
    percent: percent,
    timestamp: new Date().toLocaleString('uz-UZ')
  });

  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    refreshDashboard();
  } catch (e) {
    console.error("Jurnalni saqlashda xatolik:", e);
  }
}

function refreshDashboard() {
  const tbody = document.getElementById('journal-tbody');
  if (!tbody) return;

  const journal = getJournal();
  const total = journal.length;

  const statTotal = document.getElementById('stat-total');
  const statAvg = document.getElementById('stat-avg');
  const statMax = document.getElementById('stat-max');
  const statMin = document.getElementById('stat-min');

  if (statTotal) statTotal.textContent = total;

  if (total === 0) {
    if (statAvg) statAvg.textContent = '—';
    if (statMax) statMax.textContent = '—';
    if (statMin) statMin.textContent = '—';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-secondary); padding: 2rem;">Hali hech qanday natija saqlanmagan.</td></tr>`;
    return;
  }

  const percents = journal.map(r => r.percent);
  const avg = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
  if (statAvg) statAvg.textContent = avg + '%';
  if (statMax) statMax.textContent = Math.max(...percents) + '%';
  if (statMin) statMin.textContent = Math.min(...percents) + '%';

  tbody.innerHTML = journal.map((row, i) => {
    const pct = row.percent;
    const color = pct >= 85 ? 'var(--success)' : pct >= 60 ? '#f59e0b' : 'var(--error)';
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(row.studentName)}</strong></td>
      <td>${escapeHtml(row.testTitle)}</td>
      <td>${row.correctCount}</td>
      <td>${row.totalQuestions}</td>
      <td style="color:${color}; font-weight:700;">${pct}%</td>
      <td>${escapeHtml(row.timestamp)}</td>
    </tr>`;
  }).join('');
}

function exportJournalCsv() {
  const journal = getJournal();
  if (!journal.length) {
    showToast("Jurnal bo'sh!", 'error');
    return;
  }
  // Excelda o'zbek harflari buzilmasligi uchun UTF-8 BOM qo'shamiz
  const BOM = "\uFEFF";
  const header = "O'quvchi ismi,Test nomi,O'qituvchi,To'g'ri,Jami,Ball (%),Sana\n";
  const rows = journal.map(r =>
    `"${(r.studentName || '').replace(/"/g, '""')}","${(r.testTitle || '').replace(/"/g, '""')}","${(r.author || '').replace(/"/g, '""')}",${r.correctCount},${r.totalQuestions},${r.percent}%,"${r.timestamp}"`
  ).join('\n');

  downloadFile(BOM + header + rows, 'natijalar_jurnali.csv', 'text/csv;charset=utf-8;');
  showToast('CSV fayl yuklab olindi!');
}

function clearJournal() {
  if (confirm("Rostdan ham barcha natijalar jurnalini tozalamoqchimisiz? Bu amalni bekor qilib bo'lmaydi!")) {
    localStorage.removeItem(JOURNAL_KEY);
    refreshDashboard();
    showToast("Jurnal tozalandi!");
  }
}

// ==========================================
// 3. YORDAMCHI FUNKSIYALAR (Base64, Siqish & Fayllar)
// ==========================================

// Test ma'lumotlarini qisqartirilgan massiv formatiga o'tkazish
function packTest(test) {
  if (!test) return null;
  return {
    t: test.title || '',
    d: test.duration || 0,
    a: test.author || '',
    s: test.shuffle ? 1 : 0,
    q: (test.questions || []).map(q => [
      q.text || '',
      (q.options && q.options[0]) || '',
      (q.options && q.options[1]) || '',
      (q.options && q.options[2]) || '',
      (q.options && q.options[3]) || '',
      q.correctAnswer !== undefined ? q.correctAnswer : 0
    ])
  };
}

// Qisqartirilgan test formatini to'liq obyektga tiklash
function unpackTest(data) {
  if (!data) return null;
  if (data.questions && Array.isArray(data.questions)) {
    return data;
  }
  if (data.q && Array.isArray(data.q)) {
    return {
      title: data.t || 'Yangi Test',
      duration: data.d !== undefined ? data.d : 20,
      author: data.a || "O'qituvchi",
      shuffle: data.s === 1,
      questions: data.q.map(item => {
        if (Array.isArray(item)) {
          return {
            text: item[0] || '',
            options: [item[1] || '', item[2] || '', item[3] || '', item[4] || ''],
            correctAnswer: item[5] !== undefined ? item[5] : 0
          };
        }
        return item;
      })
    };
  }
  return data;
}

// Natija ma'lumotlarini qisqartirilgan formatga o'tkazish
function packResult(res) {
  if (!res) return null;
  return {
    s: res.studentName || '',
    t: res.testTitle || '',
    a: res.author || '',
    c: res.correctCount || 0,
    n: res.totalQuestions || 0,
    ans: res.answers || {},
    q: (res.questions || []).map(q => [
      q.text || '',
      (q.options && q.options[0]) || '',
      (q.options && q.options[1]) || '',
      (q.options && q.options[2]) || '',
      (q.options && q.options[3]) || '',
      q.correctAnswer !== undefined ? q.correctAnswer : 0
    ])
  };
}

// Qisqartirilgan natijani to'liq obyektga tiklash
function unpackResult(data) {
  if (!data) return null;
  if (data.studentName && data.questions) {
    return data;
  }
  if (data.s !== undefined && data.q) {
    return {
      studentName: data.s || "O'quvchi",
      testTitle: data.t || "Test",
      author: data.a || "O'qituvchi",
      correctCount: data.c !== undefined ? data.c : 0,
      totalQuestions: data.n !== undefined ? data.n : 0,
      answers: data.ans || {},
      questions: data.q.map(item => {
        if (Array.isArray(item)) {
          return {
            text: item[0] || '',
            options: [item[1] || '', item[2] || '', item[3] || '', item[4] || ''],
            correctAnswer: item[5] !== undefined ? item[5] : 0
          };
        }
        return item;
      })
    };
  }
  return data;
}

// Havolani 4-5 barobargacha kichraytirib kodlash
function compressPayload(obj, isResult = false) {
  try {
    const packed = isResult ? packResult(obj) : packTest(obj);
    const jsonStr = JSON.stringify(packed);

    // LZString mavjud bo'lsa, maxsus URL-xavfsiz siqish (eng kichik hajm)
    if (typeof LZString !== 'undefined' && LZString.compressToEncodedURIComponent) {
      return 'z_' + LZString.compressToEncodedURIComponent(jsonStr);
    }

    return encodeBase64(packed);
  } catch (e) {
    console.error("Payload siqishda xatolik:", e);
    return encodeBase64(obj);
  }
}

// Kichraytirilgan yoki oddiy Base64 havolani ochish
function decompressPayload(inputStr, isResult = false) {
  if (!inputStr || typeof inputStr !== 'string') return null;
  let str = inputStr.trim();

  // Agar to'liq havola kiritilgan bo'lsa
  if (str.includes('=')) {
    const match = str.match(/(?:test|result)=([^&#\s]+)/);
    if (match) str = match[1];
  }

  try {
    str = decodeURIComponent(str);
  } catch (e) {}

  // 1. Agar 'z_' bilan boshlansa (LZ-String orqali qisqartirilgan)
  if (str.startsWith('z_')) {
    if (typeof LZString !== 'undefined' && LZString.decompressFromEncodedURIComponent) {
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(str.slice(2));
        if (decompressed) {
          const parsed = JSON.parse(decompressed);
          return isResult ? unpackResult(parsed) : unpackTest(parsed);
        }
      } catch (e) {
        console.warn("LZString ochishda xatolik:", e);
      }
    }
  }

  // 2. Oddiy Base64 holatini ochish (eski havolalar bilan 100% moslik)
  const decoded = decodeBase64(str);
  if (decoded) {
    return isResult ? unpackResult(decoded) : unpackTest(decoded);
  }

  return null;
}

function encodeBase64(obj) {
  try {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const chunkSz = 8192;
    for (let i = 0; i < bytes.length; i += chunkSz) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSz));
    }
    return btoa(binary);
  } catch (e) {
    console.error("Encoding error:", e);
    showToast("Ma'lumotlarni kodlashda xatolik yuz berdi!", "error");
    return '';
  }
}

function decodeBase64(base64) {
  try {
    if (!base64 || typeof base64 !== 'string') return null;
    let normalized = base64.trim();

    if (normalized.includes('=')) {
      const match = normalized.match(/(?:test|result)=([^&#\s]+)/);
      if (match) {
        normalized = match[1];
      }
    }

    try {
      normalized = decodeURIComponent(normalized);
    } catch (e) {}

    normalized = normalized.replace(/\s/g, '+');

    const binary = atob(normalized);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const str = new TextDecoder().decode(bytes);
    return JSON.parse(str);
  } catch (e) {
    console.error("Decoding error:", e);
    return null;
  }
}

function getSafeBaseUrl() {
  if (window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null') {
    return window.location.href.split('?')[0].split('#')[0];
  }
  return `${window.location.origin}${window.location.pathname}`;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = content instanceof Blob ? content : new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJsonFile(file, successCallback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      successCallback(data);
    } catch (err) {
      console.error("JSON parsing error:", err);
      showToast("Faylni o'qishda xatolik yuz berdi. JSON formati noto'g'ri.", "error");
    }
  };
  reader.readAsText(file);
}

async function copyToClipboard(inputId, successMessage) {
  const copyText = document.getElementById(inputId);
  if (!copyText) return;
  copyText.select();
  copyText.setSelectionRange(0, 99999);

  let success = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(copyText.value);
      success = true;
    } catch (err) {
      success = false;
    }
  }

  if (!success) {
    try {
      success = document.execCommand('copy');
    } catch (err) {
      success = false;
    }
  }

  if (success) {
    showToast(successMessage);
  } else {
    showToast("Nusxalab bo'lmadi, iltimos matnni qo'lda nusxalang", "error");
  }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ==========================================
// 4. WORD VA EXCEL FORMATLARI BILAN ISHLASH
// ==========================================

// Word (.docx) va matndan savollarni aniqlash
function parseBulkText(text) {
  const questions = [];
  // Savol bloklarini raqamlar orqali ajratish (1. yoki 1) yoki Savol 1: ...)
  const qBlocks = text.trim().split(/\n\s*(?=(?:[0-9]{1,4}[\.\)]|Savol\s*[0-9]{1,4}[:\.\)]))\s*/i);

  for (const block of qBlocks) {
    if (!block.trim()) continue;
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    // Savol matnini birinchi qatordan ajratib olish
    let qText = lines[0].replace(/^(?:Savol\s*)?[0-9]{1,4}[\.\)]\s*/i, '').trim();
    let lineIdx = 1;

    // Agar savol matni bir necha qatorga cho'zilgan bo'lsa
    while (lineIdx < lines.length && !/^[A-Da-d\*\+][\.\)]/i.test(lines[lineIdx]) && !/^[A-Da-d][\*\+]/i.test(lines[lineIdx])) {
      qText += ' ' + lines[lineIdx];
      lineIdx++;
    }

    if (!qText) continue;

    const options = [];
    let correctIndex = -1;
    let answerLineKey = '';

    for (let i = lineIdx; i < lines.length; i++) {
      const line = lines[i];

      // Alohida qatorda belgilangan to'g'ri javob: masalan "Javob: B" yoki "To'g'ri: A"
      const ansMatch = line.match(/(?:to'g'ri|javob|ans|correct)\s*(?:javob)?\s*[:=\-]?\s*([A-D])/i);
      if (ansMatch) {
        answerLineKey = ansMatch[1].toUpperCase();
        continue;
      }

      // Variantlar formati: A), B*), *C), D+) va boshqalar
      if (!/^[A-Da-d\*\+][\.\)]/i.test(line) && !/^[A-Da-d][\*\+]/i.test(line)) continue;

      const isMarkedCorrect = /[\*\+]/.test(line.slice(0, 6));
      const cleanText = line.replace(/^[A-Da-d\*\+][\.\)]\*?\+?\s*|^[A-Da-d][\*\+][\.\)]?\s*/i, '').trim();

      if (isMarkedCorrect) {
        correctIndex = options.length;
      }
      options.push(cleanText);
      if (options.length === 4) break;
    }

    // Agar alohida javob qatori bo'lsa
    if (answerLineKey) {
      const mappedIdx = answerLineKey.charCodeAt(0) - 65;
      if (mappedIdx >= 0 && mappedIdx < options.length) {
        correctIndex = mappedIdx;
      }
    }

    if (options.length >= 2) {
      while (options.length < 4) {
        options.push(`Variant ${String.fromCharCode(65 + options.length)}`);
      }
      if (correctIndex === -1) correctIndex = 0;
      questions.push({
        text: qText,
        options: options.slice(0, 4),
        correctAnswer: correctIndex
      });
    }
  }

  return questions;
}

// Excel (.xlsx / .xls) faylidan savollarni o'qish
function parseExcelData(arrayBuffer) {
  if (typeof XLSX === 'undefined') {
    throw new Error("SheetJS (xlsx) kutubxonasi mavjud emas");
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rows || rows.length === 0) return [];

  const questions = [];
  let startIdx = 0;

  // Agar birinchi qatorda sarlavhalar bo'lsa, uni o'tkazib yuboramiz
  if (rows.length > 1) {
    const firstCell = String(rows[0][0] || '').toLowerCase();
    if (firstCell.includes('savol') || firstCell.includes('question') || firstCell.includes('matn')) {
      startIdx = 1;
    }
  }

  for (let r = startIdx; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;

    const qText = String(row[0] || '').trim();
    const optA = String(row[1] || '').trim();
    const optB = String(row[2] || '').trim();
    const optC = String(row[3] || '').trim();
    const optD = String(row[4] || '').trim();
    let correctRaw = String(row[5] || '').trim().toUpperCase();

    if (!qText || !optA || !optB) continue;

    const options = [optA, optB];
    if (optC) options.push(optC);
    if (optD) options.push(optD);
    while (options.length < 4) {
      options.push(`Variant ${String.fromCharCode(65 + options.length)}`);
    }

    let correctIndex = 0;
    if (correctRaw === 'A' || correctRaw === '1' || correctRaw.startsWith('A')) {
      correctIndex = 0;
    } else if (correctRaw === 'B' || correctRaw === '2' || correctRaw.startsWith('B')) {
      correctIndex = 1;
    } else if (correctRaw === 'C' || correctRaw === '3' || correctRaw.startsWith('C')) {
      correctIndex = 2;
    } else if (correctRaw === 'D' || correctRaw === '4' || correctRaw.startsWith('D')) {
      correctIndex = 3;
    } else {
      // Agar variant ichida * yoki + belgisi qo'yilgan bo'lsa
      options.forEach((opt, idx) => {
        if (opt.includes('*') || opt.includes('+')) {
          correctIndex = idx;
          options[idx] = opt.replace(/[\*\+]/g, '').trim();
        }
      });
    }

    questions.push({
      text: qText,
      options: options.slice(0, 4),
      correctAnswer: correctIndex
    });
  }

  return questions;
}

// Fayllarni (Word / Excel / JSON) yuklashni boshqaruvchi markaziy funksiya
async function handleDocumentImport(file, isStudentMode = false) {
  if (!file) return;

  const fileName = file.name.toLowerCase();

  try {
    if (fileName.endsWith('.docx')) {
      if (typeof mammoth === 'undefined') {
        showToast("Mammoth kutubxonasi yuklanmadi. Internet ulanishingizni tekshiring.", "error");
        return;
      }
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      const parsedQuestions = parseBulkText(text);

      if (!parsedQuestions.length) {
        showToast("Word faylidan savollar topilmadi. Format namunadagidek ekanligini tekshiring!", "error");
        return;
      }

      applyImportedQuestions(parsedQuestions, file.name.replace(/\.docx$/i, ''), isStudentMode);
      showToast(`✅ Word hujjatidan ${parsedQuestions.length} ta savol yuklandi!`);

    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      if (typeof XLSX === 'undefined') {
        showToast("SheetJS kutubxonasi yuklanmadi. Internet ulanishingizni tekshiring.", "error");
        return;
      }
      const arrayBuffer = await file.arrayBuffer();
      const parsedQuestions = parseExcelData(arrayBuffer);

      if (!parsedQuestions.length) {
        showToast("Excel faylidan savollar topilmadi. Ustunlar andozaga mosligini tekshiring!", "error");
        return;
      }

      applyImportedQuestions(parsedQuestions, file.name.replace(/\.xlsx?$|\.xls$/i, ''), isStudentMode);
      showToast(`✅ Excel jadvalidan ${parsedQuestions.length} ta savol yuklandi!`);

    } else if (fileName.endsWith('.json')) {
      importJsonFile(file, (data) => {
        if (!data || !data.questions || !Array.isArray(data.questions)) {
          showToast("JSON fayl formati noto'g'ri!", "error");
          return;
        }
        if (isStudentMode) {
          state.activeTest = data;
          initStudentWelcomeScreen();
          showView('runner-view');
          showToast("Test JSON fayldan yuklandi!");
        } else {
          state.createdTest = {
            title: data.title || 'Yuklangan Test',
            duration: data.duration !== undefined ? data.duration : 20,
            author: data.author || "O'qituvchi",
            questions: data.questions,
            shuffle: !!data.shuffle
          };
          const titleInput = document.getElementById('test-title');
          const durationInput = document.getElementById('test-duration');
          const authorInput = document.getElementById('test-author');
          if (titleInput) titleInput.value = state.createdTest.title;
          if (durationInput) durationInput.value = state.createdTest.duration;
          if (authorInput) authorInput.value = state.createdTest.author;
          updateQuestionsListUI();
          showToast(`✅ JSON fayldan ${data.questions.length} ta savol yuklandi!`);
        }
      });
    } else {
      showToast("Noma'lum fayl formati! Iltimos, .docx, .xlsx yoki .json yuklang", "error");
    }
  } catch (err) {
    console.error("Faylni o'qishda xatolik:", err);
    showToast("Faylni o'qishda xatolik yuz berdi: " + err.message, "error");
  }
}

function applyImportedQuestions(questions, defaultTitle, isStudentMode) {
  if (isStudentMode) {
    state.activeTest = {
      title: defaultTitle || 'Yuklangan Test',
      duration: 20,
      author: "O'qituvchi",
      questions: questions,
      shuffle: false
    };
    initStudentWelcomeScreen();
    showView('runner-view');
  } else {
    const titleInput = document.getElementById('test-title');
    if (titleInput && (!titleInput.value || titleInput.value === 'Yangi Test')) {
      titleInput.value = defaultTitle || 'Yangi Test';
      state.createdTest.title = titleInput.value;
    }
    state.createdTest.questions.push(...questions);
    updateQuestionsListUI();
  }
}

// Namunaviy Excel faylini yuklab berish
function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') {
    showToast("Excel kutubxonasi yuklanmadi. Internetni tekshiring.", "error");
    return;
  }

  const data = [
    ["Savol matni", "A varianti", "B varianti", "C varianti", "D varianti", "To'g'ri javob (A, B, C yoki D)"],
    ["O'zbekiston Respublikasi poytaxti qaysi shahar?", "Samarqand", "Toshkent", "Buxoro", "Xiva", "B"],
    ["25 ning kvadrat ildizi nechaga teng?", "5", "10", "25", "50", "A"],
    ["Quyosh tizimidagi eng katta sayyora qaysi?", "Mars", "Venera", "Yupiter", "Saturn", "C"],
    ["Suvning kimyoviy formulasi qanday?", "CO2", "NaCl", "O2", "H2O", "D"]
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 45 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 25 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Namuna");

  XLSX.writeFile(wb, "namuna_test.xlsx");
  showToast("Namunaviy Excel andozasi yuklab olindi!");
}

// Testni Excel (.xlsx) formatida eksport qilish
function exportTestToExcel() {
  const test = state.createdTest;
  if (!test.questions.length) {
    showToast("Eksport qilish uchun testda savollar mavjud emas!", "error");
    return;
  }
  if (typeof XLSX === 'undefined') {
    showToast("Excel kutubxonasi yuklanmadi", "error");
    return;
  }

  const optionLetters = ['A', 'B', 'C', 'D'];
  const data = [
    ["Savol matni", "A varianti", "B varianti", "C varianti", "D varianti", "To'g'ri javob"]
  ];

  test.questions.forEach((q) => {
    data.push([
      q.text,
      q.options[0] || '',
      q.options[1] || '',
      q.options[2] || '',
      q.options[3] || '',
      optionLetters[q.correctAnswer] || 'A'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 45 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 15 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Savollar");

  const rawTitle = (test.title || 'test').toLowerCase().replace(/[^a-z0-9]/gi, '_');
  XLSX.writeFile(wb, `test_${rawTitle}.xlsx`);
  showToast("Test Excel (.xlsx) fayl sifatida yuklab olindi!");
}

// Testni Word (.doc) formatida eksport qilish
function exportTestToWord() {
  const test = state.createdTest;
  if (!test.questions.length) {
    showToast("Eksport qilish uchun testda savollar mavjud emas!", "error");
    return;
  }

  const optionLetters = ['A', 'B', 'C', 'D'];
  let htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${escapeHtml(test.title)}</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1e293b; }
        h1 { font-size: 18pt; color: #4338ca; text-align: center; margin-bottom: 5px; }
        .meta { text-align: center; color: #64748b; margin-bottom: 25px; font-size: 10.5pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
        .question-block { margin-bottom: 18px; page-break-inside: avoid; }
        .question-text { font-weight: bold; margin-bottom: 6px; font-size: 11.5pt; }
        .option { margin-left: 20px; margin-bottom: 3px; }
        .correct { color: #16a34a; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(test.title)}</h1>
      <div class="meta">O'qituvchi: <strong>${escapeHtml(test.author)}</strong> | Vaqt limiti: <strong>${test.duration > 0 ? test.duration + ' daqiqa' : 'Cheksiz'}</strong> | Savollar: <strong>${test.questions.length} ta</strong></div>
  `;

  test.questions.forEach((q, idx) => {
    htmlContent += `<div class="question-block">
      <div class="question-text">${idx + 1}. ${escapeHtml(q.text)}</div>`;
    q.options.forEach((opt, optIdx) => {
      const isCorrect = optIdx === q.correctAnswer;
      htmlContent += `<div class="option ${isCorrect ? 'correct' : ''}">
        ${optionLetters[optIdx]}) ${escapeHtml(opt)}${isCorrect ? ' *' : ''}
      </div>`;
    });
    htmlContent += `</div>`;
  });

  htmlContent += `</body></html>`;

  const blob = new Blob(['\ufeff', htmlContent], {
    type: 'application/msword;charset=utf-8'
  });
  const rawTitle = (test.title || 'test').toLowerCase().replace(/[^a-z0-9]/gi, '_');
  downloadFile(blob, `test_${rawTitle}.doc`, 'application/msword');
  showToast("Test Word (.doc) fayl sifatida yuklab olindi!");
}

// ==========================================
// 5. SAHIFA VA VIEW BOSHQARUVI
// ==========================================
function showView(viewId) {
  state.currentView = viewId;

  document.querySelectorAll('.view-section').forEach(view => {
    view.classList.remove('active');
  });

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }

  document.querySelectorAll('.btn-nav').forEach(btn => {
    if (btn.getAttribute('data-target') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const navRunner = document.getElementById('nav-runner');
  const navResult = document.getElementById('nav-result');

  if (navRunner) {
    if (viewId === 'runner-view' || state.activeTest !== null) {
      navRunner.style.display = 'inline-flex';
    } else {
      navRunner.style.display = 'none';
    }
  }

  if (navResult) {
    if (viewId === 'result-view' || state.viewingResult !== null || Object.keys(state.studentAnswers).length > 0) {
      navResult.style.display = 'inline-flex';
    } else {
      navResult.style.display = 'none';
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let toastTimer = null;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  if (!toast || !toastText) return;

  clearTimeout(toastTimer);
  toastText.textContent = message;

  if (type === 'error') {
    toast.style.borderColor = 'var(--error)';
    toast.style.background = '#311218';
  } else {
    toast.style.borderColor = 'var(--primary)';
    toast.style.background = '#1e1b4b';
  }

  toast.classList.add('show');
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

function resetToHome() {
  clearInterval(state.timerInterval);
  state.activeTest = null;
  state.viewingResult = null;
  state.studentAnswers = {};
  state.currentQuestionIndex = 0;

  const timerElem = document.getElementById('quiz-timer');
  if (timerElem) timerElem.classList.remove('warning');

  try {
    const cleanUrl = getSafeBaseUrl();
    window.history.pushState({}, document.title, cleanUrl);
  } catch (e) {
    console.warn("Could not update history state:", e);
  }

  const studentNameInput = document.getElementById('student-name');
  if (studentNameInput) studentNameInput.value = '';

  showView('home-view');
}

// ==========================================
// 6. O'QITUVCHI: TEST YARATISH BO'LIMI
// ==========================================
function addQuestionToTest() {
  const textInput = document.getElementById('question-text-input');
  const optAInput = document.getElementById('option-a');
  const optBInput = document.getElementById('option-b');
  const optCInput = document.getElementById('option-c');
  const optDInput = document.getElementById('option-d');

  const text = textInput ? textInput.value.trim() : '';
  const optionA = optAInput ? optAInput.value.trim() : '';
  const optionB = optBInput ? optBInput.value.trim() : '';
  const optionC = optCInput ? optCInput.value.trim() : '';
  const optionD = optDInput ? optDInput.value.trim() : '';

  const correctOptionRadio = document.querySelector('input[name="correct-option"]:checked');

  if (!text || !optionA || !optionB || !optionC || !optionD) {
    showToast("Iltimos, savol matni va barcha 4 ta variantni to'ldiring!", "error");
    return;
  }

  if (!correctOptionRadio) {
    showToast("Iltimos, to'g'ri javob variantini belgilang!", "error");
    return;
  }

  const correctIndex = parseInt(correctOptionRadio.value, 10);

  const questionData = {
    text: text,
    options: [optionA, optionB, optionC, optionD],
    correctAnswer: correctIndex
  };

  if (state.editingQuestionIndex >= 0) {
    state.createdTest.questions[state.editingQuestionIndex] = questionData;
    cancelEdit();
    updateQuestionsListUI();
    showToast("✅ Savol muvaffaqiyatli tahrirlandi!");
  } else {
    state.createdTest.questions.push(questionData);

    textInput.value = '';
    optAInput.value = '';
    optBInput.value = '';
    optCInput.value = '';
    optDInput.value = '';
    const firstRadio = document.querySelector('input[name="correct-option"][value="0"]');
    if (firstRadio) firstRadio.checked = true;

    updateQuestionsListUI();
    showToast("Savol muvaffaqiyatli qo'shildi!");
  }
}

function startEditQuestion(index) {
  const q = state.createdTest.questions[index];
  if (!q) return;

  state.editingQuestionIndex = index;

  const textInput = document.getElementById('question-text-input');
  const optA = document.getElementById('option-a');
  const optB = document.getElementById('option-b');
  const optC = document.getElementById('option-c');
  const optD = document.getElementById('option-d');
  const cancelBtn = document.getElementById('btn-cancel-edit');
  const addBtn = document.getElementById('btn-add-question');
  const builderNum = document.getElementById('builder-q-number');

  if (textInput) textInput.value = q.text;
  if (optA) optA.value = q.options[0] || '';
  if (optB) optB.value = q.options[1] || '';
  if (optC) optC.value = q.options[2] || '';
  if (optD) optD.value = q.options[3] || '';

  const radio = document.querySelector(`input[name="correct-option"][value="${q.correctAnswer}"]`);
  if (radio) radio.checked = true;

  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  if (addBtn) addBtn.textContent = "💾 O'zgarishlarni saqlash";
  if (builderNum) builderNum.textContent = `Savol #${index + 1} tahrirlash`;

  const builderCard = document.querySelector('.question-builder-card');
  if (builderCard) builderCard.scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  state.editingQuestionIndex = -1;

  const cancelBtn = document.getElementById('btn-cancel-edit');
  const addBtn = document.getElementById('btn-add-question');
  const builderNum = document.getElementById('builder-q-number');

  if (cancelBtn) cancelBtn.style.display = 'none';
  if (addBtn) addBtn.textContent = "Savolni ro'yxatga qo'shish";

  const textInput = document.getElementById('question-text-input');
  const optA = document.getElementById('option-a');
  const optB = document.getElementById('option-b');
  const optC = document.getElementById('option-c');
  const optD = document.getElementById('option-d');

  if (textInput) textInput.value = '';
  if (optA) optA.value = '';
  if (optB) optB.value = '';
  if (optC) optC.value = '';
  if (optD) optD.value = '';

  const firstRadio = document.querySelector('input[name="correct-option"][value="0"]');
  if (firstRadio) firstRadio.checked = true;

  if (builderNum) {
    const qCount = state.createdTest.questions.length;
    builderNum.textContent = `Savol #${qCount + 1}`;
  }
}

function deleteQuestion(index) {
  if (confirm("Ushbu savolni o'chirishni tasdiqlaysizmi?")) {
    if (state.editingQuestionIndex === index) {
      cancelEdit();
    } else if (state.editingQuestionIndex > index) {
      state.editingQuestionIndex--;
    }
    state.createdTest.questions.splice(index, 1);
    updateQuestionsListUI();
    showToast("Savol o'chirildi");
  }
}

window.startEditQuestion = startEditQuestion;
window.deleteQuestion = deleteQuestion;

function updateQuestionsListUI() {
  const container = document.getElementById('questions-list-container');
  const countSpan = document.getElementById('questions-count');
  const qNumSpan = document.getElementById('builder-q-number');

  const qCount = state.createdTest.questions.length;
  if (countSpan) countSpan.textContent = qCount;
  if (qNumSpan && state.editingQuestionIndex === -1) {
    qNumSpan.textContent = `Savol #${qCount + 1}`;
  }

  if (!container) return;

  if (qCount === 0) {
    container.innerHTML = `<p style="text-align: center; font-style: italic; color: var(--text-secondary); margin: 2rem 0;">Hozircha hech qanday savol qo'shilmadi.</p>`;
    return;
  }

  container.innerHTML = '';
  state.createdTest.questions.forEach((q, idx) => {
    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `
      <span class="question-item-text"><strong>${idx + 1}.</strong> ${escapeHtml(q.text)}</span>
      <div style="display:flex; gap:0.5rem; flex-shrink:0;">
        <button class="btn btn-secondary btn-sm" onclick="startEditQuestion(${idx})" title="Tahrirlash">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${idx})" title="O'chirish">🗑</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function generateTestLink() {
  const titleInput = document.getElementById('test-title');
  const durationInput = document.getElementById('test-duration');
  const authorInput = document.getElementById('test-author');
  const shuffleEl = document.getElementById('shuffle-questions');

  const title = titleInput ? titleInput.value.trim() || 'Yangi Test' : 'Yangi Test';
  const duration = durationInput ? Math.max(0, parseInt(durationInput.value, 10) || 0) : 0;
  const author = authorInput ? authorInput.value.trim() || "O'qituvchi" : "O'qituvchi";
  const shuffle = shuffleEl ? shuffleEl.checked : false;

  if (state.createdTest.questions.length === 0) {
    showToast("Iltimos, avval kamida bitta savol qo'shing!", "error");
    return;
  }

  state.createdTest.title = title;
  state.createdTest.duration = duration;
  state.createdTest.author = author;
  state.createdTest.shuffle = shuffle;

  const payload = compressPayload(state.createdTest, false);
  if (!payload) return;

  const baseUrl = getSafeBaseUrl();
  const shareUrl = `${baseUrl}?test=${payload}`;

  const shareLinkInput = document.getElementById('share-link-input');
  const sharingSection = document.getElementById('sharing-section');

  if (shareLinkInput) shareLinkInput.value = shareUrl;
  if (sharingSection) {
    sharingSection.style.display = 'block';
    sharingSection.scrollIntoView({ behavior: 'smooth' });
  }

  showToast("Test havolasi yaratildi!");
}

function downloadTestJson() {
  if (state.createdTest.questions.length === 0) {
    showToast("Testda savollar mavjud emas!", "error");
    return;
  }
  const jsonContent = JSON.stringify(state.createdTest, null, 2);
  const rawTitle = (state.createdTest.title || 'test').toLowerCase().replace(/[^a-z0-9]/gi, '_');
  downloadFile(jsonContent, `test_${rawTitle}.json`, 'application/json');
  showToast("Test fayli (.json) yuklab olindi!");
}

// Matndan tezkor yuklash
function openBulkModal() {
  const modal = document.getElementById('bulk-import-modal');
  if (modal) modal.classList.add('active');
}

function closeBulkModal() {
  const modal = document.getElementById('bulk-import-modal');
  if (modal) modal.classList.remove('active');
  const ta = document.getElementById('bulk-text-input');
  if (ta) ta.value = '';
}

function doBulkImport() {
  const ta = document.getElementById('bulk-text-input');
  const text = ta ? ta.value : '';
  if (!text.trim()) {
    showToast("Iltimos, savol matnini kiriting!", 'error');
    return;
  }
  const parsed = parseBulkText(text);
  if (!parsed.length) {
    showToast("Savollar o'qilmadi. Namunadagi formatga mosligini tekshiring!", 'error');
    return;
  }
  state.createdTest.questions.push(...parsed);
  updateQuestionsListUI();
  closeBulkModal();
  showToast(`✅ ${parsed.length} ta savol muvaffaqiyatli yuklandi!`);
}

// ==========================================
// 7. O'QUVCHI: TESTNI BAJARISH BO'LIMI
// ==========================================
function initStudentWelcomeScreen() {
  const test = state.activeTest;
  if (!test) return;

  const titleElem = document.getElementById('welcome-test-title');
  const authorElem = document.getElementById('welcome-author');
  const countElem = document.getElementById('welcome-q-count');
  const durationElem = document.getElementById('welcome-duration');

  if (titleElem) titleElem.textContent = test.title;
  if (authorElem) authorElem.textContent = test.author || 'Ustoz';
  if (countElem) countElem.textContent = test.questions ? test.questions.length : 0;
  if (durationElem) durationElem.textContent = test.duration > 0 ? test.duration : 'Cheksiz';

  const welcomeCard = document.getElementById('student-welcome-card');
  const activeQuiz = document.getElementById('active-quiz-container');
  if (welcomeCard) welcomeCard.style.display = 'block';
  if (activeQuiz) activeQuiz.style.display = 'none';
}

function startQuiz() {
  const nameInput = document.getElementById('student-name');
  const nameVal = nameInput ? nameInput.value.trim() : '';
  if (!nameVal) {
    showToast("Iltimos, ism familiyangizni kiriting!", "error");
    return;
  }

  state.studentName = nameVal;
  state.currentQuestionIndex = 0;
  state.studentAnswers = {};

  if (state.activeTest && state.activeTest.shuffle && Array.isArray(state.activeTest.questions)) {
    state.activeTest.questions = shuffleArray(state.activeTest.questions);
  }

  const welcomeCard = document.getElementById('student-welcome-card');
  const activeQuiz = document.getElementById('active-quiz-container');
  if (welcomeCard) welcomeCard.style.display = 'none';
  if (activeQuiz) activeQuiz.style.display = 'block';

  const runnerTitle = document.getElementById('runner-test-title');
  if (runnerTitle) runnerTitle.textContent = state.activeTest.title;

  const timerElem = document.getElementById('quiz-timer');
  if (timerElem) timerElem.classList.remove('warning');

  const durationMinutes = state.activeTest.duration;
  if (durationMinutes > 0) {
    state.timeLeft = durationMinutes * 60;
    if (timerElem) timerElem.style.display = 'flex';
    updateTimerDisplay();

    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.timeLeft--;
      updateTimerDisplay();

      if (state.timeLeft <= 30 && timerElem) {
        timerElem.classList.add('warning');
      }

      if (state.timeLeft <= 0) {
        clearInterval(state.timerInterval);
        showToast("Vaqt tugadi! Test avtomatik ravishda topshirilmoqda.", "error");
        submitQuiz();
      }
    }, 1000);
  } else {
    if (timerElem) timerElem.style.display = 'none';
  }

  renderQuestion();
}

function updateTimerDisplay() {
  const timerDisplay = document.getElementById('timer-display');
  if (!timerDisplay) return;
  const minutes = Math.floor(Math.max(0, state.timeLeft) / 60);
  const seconds = Math.max(0, state.timeLeft) % 60;
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function renderQuestion() {
  if (!state.activeTest || !state.activeTest.questions.length) return;

  const question = state.activeTest.questions[state.currentQuestionIndex];
  const qCount = state.activeTest.questions.length;

  const qTextElem = document.getElementById('current-question-text');
  if (qTextElem) {
    qTextElem.textContent = `${state.currentQuestionIndex + 1}. ${question.text}`;
  }

  const progressPercent = ((state.currentQuestionIndex + 1) / qCount) * 100;
  const progressBar = document.getElementById('quiz-progress-bar');
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  const indexDisplay = document.getElementById('question-index-display');
  if (indexDisplay) {
    indexDisplay.textContent = `Savol ${state.currentQuestionIndex + 1} / ${qCount}`;
  }

  const optionsContainer = document.getElementById('current-options-list');
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    const optionLetters = ['A', 'B', 'C', 'D'];

    question.options.forEach((optText, optIdx) => {
      const button = document.createElement('button');
      button.className = 'option-button';
      if (state.studentAnswers[state.currentQuestionIndex] === optIdx) {
        button.classList.add('selected');
      }

      button.innerHTML = `
        <span class="option-letter">${optionLetters[optIdx]}</span>
        <span class="option-content-text">${escapeHtml(optText)}</span>
      `;

      button.addEventListener('click', () => selectOption(optIdx));
      optionsContainer.appendChild(button);
    });
  }

  const btnPrev = document.getElementById('btn-prev-question');
  const btnNext = document.getElementById('btn-next-question');
  const btnSubmit = document.getElementById('btn-submit-quiz');

  if (btnPrev) btnPrev.disabled = state.currentQuestionIndex === 0;

  if (state.currentQuestionIndex === qCount - 1) {
    if (btnNext) btnNext.style.display = 'none';
    if (btnSubmit) btnSubmit.style.display = 'inline-flex';
  } else {
    if (btnNext) btnNext.style.display = 'inline-flex';
    if (btnSubmit) btnSubmit.style.display = 'none';
  }

  renderQuestionPalette();
}

function selectOption(optionIndex) {
  state.studentAnswers[state.currentQuestionIndex] = optionIndex;

  const buttons = document.querySelectorAll('.option-button');
  buttons.forEach((btn, idx) => {
    if (idx === optionIndex) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });

  renderQuestionPalette();
}

function nextQuestion() {
  if (state.activeTest && state.currentQuestionIndex < state.activeTest.questions.length - 1) {
    state.currentQuestionIndex++;
    renderQuestion();
  }
}

function prevQuestion() {
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
    renderQuestion();
  }
}

function renderQuestionPalette() {
  const palette = document.getElementById('question-palette');
  if (!palette || !state.activeTest) return;

  const total = state.activeTest.questions.length;
  palette.innerHTML = '';

  for (let i = 0; i < total; i++) {
    const btn = document.createElement('button');
    btn.className = 'palette-btn';
    btn.textContent = i + 1;

    if (i === state.currentQuestionIndex) btn.classList.add('current');
    if (state.studentAnswers[i] !== undefined) btn.classList.add('answered');

    btn.addEventListener('click', () => {
      state.currentQuestionIndex = i;
      renderQuestion();
    });
    palette.appendChild(btn);
  }
}

// ==========================================
// 8. NATIJALAR VA TAHLIL BO'LIMI
// ==========================================
function submitQuiz() {
  clearInterval(state.timerInterval);
  const timerElem = document.getElementById('quiz-timer');
  if (timerElem) timerElem.classList.remove('warning');

  const test = state.activeTest;
  if (!test) return;

  let correctCount = 0;
  test.questions.forEach((q, idx) => {
    if (state.studentAnswers[idx] === q.correctAnswer) {
      correctCount++;
    }
  });

  const result = {
    studentName: state.studentName,
    testTitle: test.title,
    author: test.author || "O'qituvchi",
    correctCount: correctCount,
    totalQuestions: test.questions.length,
    answers: state.studentAnswers,
    questions: test.questions
  };

  state.lastResultForCert = result;
  saveToJournal(result);

  displayResults(result, false);
  showView('result-view');
}

function displayResults(result, isTeacherView = false) {
  state.lastResultForCert = result;

  const pageTitle = document.getElementById('result-page-title');
  const studentNameElem = document.getElementById('result-student-name');
  const subtitleElem = document.getElementById('result-subtitle');

  if (pageTitle) pageTitle.textContent = isTeacherView ? "Natijani Tekshirish" : "Sizning Natijangiz";
  if (studentNameElem) studentNameElem.textContent = result.studentName;
  if (subtitleElem) {
    subtitleElem.innerHTML = `
      O'quvchi: <strong>${escapeHtml(result.studentName)}</strong> <br/>
      Test: <strong>${escapeHtml(result.testTitle)}</strong> (O'qituvchi: ${escapeHtml(result.author || 'Ustoz')})
    `;
  }

  const percent = result.totalQuestions > 0
    ? Math.round((result.correctCount / result.totalQuestions) * 100)
    : 0;

  const percentText = document.getElementById('score-percentage-text');
  const fractionText = document.getElementById('score-fraction-text');
  const correctElem = document.getElementById('result-correct-count');
  const incorrectElem = document.getElementById('result-incorrect-count');

  if (percentText) percentText.textContent = `${percent}%`;
  if (fractionText) fractionText.textContent = `${result.correctCount}/${result.totalQuestions}`;
  if (correctElem) correctElem.textContent = result.correctCount;
  if (incorrectElem) incorrectElem.textContent = result.totalQuestions - result.correctCount;

  const ring = document.getElementById('score-ring');
  if (ring) {
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = 440;
    void ring.offsetHeight;
    ring.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
    const dashoffset = 440 - (440 * percent) / 100;
    setTimeout(() => {
      ring.style.strokeDashoffset = dashoffset;
    }, 50);
  }

  const reviewContainer = document.getElementById('review-list-container');
  if (reviewContainer && Array.isArray(result.questions)) {
    reviewContainer.innerHTML = '';
    const optionLetters = ['A', 'B', 'C', 'D'];

    result.questions.forEach((q, idx) => {
      const studentAns = result.answers ? result.answers[idx] : undefined;
      const correctAns = q.correctAnswer;
      const isCorrect = studentAns === correctAns;
      const isAnswered = studentAns !== undefined;

      const reviewItem = document.createElement('div');
      reviewItem.className = `review-item ${isCorrect ? 'correct' : 'incorrect'}`;

      let optionsHtml = '';
      q.options.forEach((optText, optIdx) => {
        let statusClass = '';
        let badgeHtml = '';

        if (optIdx === correctAns) {
          statusClass = 'correct';
          badgeHtml = isCorrect
            ? `<span class="review-badge correct">To'g'ri javob ✓ (Sizning javobingiz)</span>`
            : `<span class="review-badge correct">To'g'ri javob</span>`;
        } else if (optIdx === studentAns) {
          statusClass = 'selected';
          badgeHtml = `<span class="review-badge selected-incorrect">Sizning javobingiz ✗</span>`;
        }

        optionsHtml += `
          <div class="review-option ${statusClass}">
            <span><strong>${optionLetters[optIdx]}.</strong> ${escapeHtml(optText)}</span>
            ${badgeHtml}
          </div>
        `;
      });

      const unansweredBadge = !isAnswered
        ? ' <span style="color: var(--error); font-size: 0.85rem; font-weight: normal;">(Javob berilmagan)</span>'
        : '';

      reviewItem.innerHTML = `
        <div class="review-question">${idx + 1}. ${escapeHtml(q.text)}${unansweredBadge}</div>
        <div class="review-options-list">
          ${optionsHtml}
        </div>
      `;

      reviewContainer.appendChild(reviewItem);
    });
  }

  const studentSharingActions = document.getElementById('student-sharing-actions');
  const teacherViewActions = document.getElementById('teacher-view-actions');

  if (isTeacherView) {
    if (studentSharingActions) studentSharingActions.style.display = 'none';
    if (teacherViewActions) teacherViewActions.style.display = 'block';
  } else {
    if (studentSharingActions) studentSharingActions.style.display = 'block';
    if (teacherViewActions) teacherViewActions.style.display = 'none';

    const payload = compressPayload(result, true);
    const baseUrl = getSafeBaseUrl();
    const resultShareInput = document.getElementById('result-share-input');
    if (resultShareInput) {
      resultShareInput.value = `${baseUrl}?result=${payload}`;
    }
  }
}

function downloadResultWord() {
  const resultObj = state.lastResultForCert || state.viewingResult;
  if (!resultObj) {
    showToast("Natija topilmadi!", "error");
    return;
  }

  const optionLetters = ['A', 'B', 'C', 'D'];
  const percent = resultObj.totalQuestions > 0
    ? Math.round((resultObj.correctCount / resultObj.totalQuestions) * 100)
    : 0;
  const baho = percent >= 86 ? "A'lo (5)" : percent >= 71 ? "Yaxshi (4)" : percent >= 56 ? "Qoniqarli (3)" : "Qoniqarsiz (2)";
  const bahoColor = percent >= 86 ? '#16a34a' : percent >= 71 ? '#2563eb' : percent >= 56 ? '#d97706' : '#dc2626';
  const date = new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' });

  let questionsHtml = '';
  if (Array.isArray(resultObj.questions)) {
    resultObj.questions.forEach((q, idx) => {
      const studentAns = resultObj.answers ? resultObj.answers[idx] : undefined;
      const correctAns = q.correctAnswer;
      const isCorrect = studentAns === correctAns;

      let optionsHtml = '';
      (q.options || []).forEach((optText, optIdx) => {
        let style = 'margin-left:18px; margin-bottom:3px; font-size:10.5pt;';
        let prefix = '';
        if (optIdx === correctAns) {
          style += ' color:#16a34a; font-weight:bold;';
          prefix = '✓ ';
        } else if (optIdx === studentAns && !isCorrect) {
          style += ' color:#dc2626;';
          prefix = '✗ ';
        }
        optionsHtml += `<div style="${style}">${prefix}<strong>${optionLetters[optIdx]})</strong> ${escapeHtml(optText)}</div>`;
      });

      const qStyle = isCorrect
        ? 'background:#f0fdf4; border-left:4px solid #16a34a;'
        : 'background:#fff5f5; border-left:4px solid #dc2626;';

      questionsHtml += `
        <div style="margin-bottom:14px; padding:10px 12px; ${qStyle} page-break-inside:avoid;">
          <div style="font-weight:bold; font-size:11pt; margin-bottom:6px;">
            ${idx + 1}. ${escapeHtml(q.text)}
            <span style="float:right; font-size:10pt; font-weight:normal; color:${isCorrect ? '#16a34a' : '#dc2626'};">
              ${isCorrect ? '✓ To\'g\'ri' : (studentAns === undefined ? '— Javob berilmagan' : '✗ Noto\'g\'ri')}
            </span>
          </div>
          ${optionsHtml}
        </div>
      `;
    });
  }

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Natija: ${escapeHtml(resultObj.studentName)}</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size:11pt; color:#1e293b; margin:30px; }
        h1 { font-size:18pt; text-align:center; color:#4338ca; margin-bottom:4px; }
        .subtitle { text-align:center; color:#64748b; font-size:10.5pt; margin-bottom:20px; border-bottom:2px solid #e2e8f0; padding-bottom:10px; }
        .score-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 20px; margin-bottom:20px; text-align:center; }
        .score-big { font-size:32pt; font-weight:bold; color:${bahoColor}; }
        .score-meta { font-size:11pt; color:#475569; margin-top:6px; }
        .section-title { font-size:13pt; font-weight:bold; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin:18px 0 10px 0; }
        .footer { text-align:center; color:#94a3b8; font-size:9.5pt; margin-top:24px; border-top:1px solid #e2e8f0; padding-top:8px; }
      </style>
    </head>
    <body>
      <h1>📋 Test Natijasi</h1>
      <div class="subtitle">
        O'quvchi: <strong>${escapeHtml(resultObj.studentName)}</strong> &nbsp;|&nbsp;
        Test: <strong>${escapeHtml(resultObj.testTitle || '—')}</strong> &nbsp;|&nbsp;
        O'qituvchi: <strong>${escapeHtml(resultObj.author || '—')}</strong>
      </div>

      <div class="score-box">
        <div class="score-big">${percent}%</div>
        <div class="score-meta">
          To'g'ri: <strong style="color:#16a34a">${resultObj.correctCount}</strong> ta &nbsp;|&nbsp;
          Noto'g'ri: <strong style="color:#dc2626">${resultObj.totalQuestions - resultObj.correctCount}</strong> ta &nbsp;|&nbsp;
          Jami: <strong>${resultObj.totalQuestions}</strong> ta savol
        </div>
        <div style="margin-top:8px; font-size:13pt; font-weight:bold; color:${bahoColor};">Baho: ${baho}</div>
        <div style="color:#94a3b8; font-size:10pt; margin-top:4px;">Sana: ${date}</div>
      </div>

      <div class="section-title">📝 Savollar va Javoblar Ko'rib Chiqish</div>
      ${questionsHtml}

      <div class="footer">Smart Test Hub &nbsp;·&nbsp; Avtomatik tuzilgan hisobot &nbsp;·&nbsp; ${date}</div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword;charset=utf-8' });
  const rawName = (resultObj.studentName || 'oquvchi').toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const rawTitle = (resultObj.testTitle || 'test').toLowerCase().replace(/[^a-z0-9]/gi, '_');
  downloadFile(blob, `natija_${rawName}_${rawTitle}.doc`, 'application/msword');
  showToast("Natija Word (.doc) fayl sifatida yuklab olindi!");
}

// ==========================================
// 9. SERTIFIKAT VA QR KOD
// ==========================================
function showCertificate(result) {
  const res = result || state.lastResultForCert;
  if (!res) {
    showToast("Sertifikat uchun natija ma'lumotlari topilmadi!", 'error');
    return;
  }

  const percent = res.totalQuestions > 0
    ? Math.round((res.correctCount / res.totalQuestions) * 100)
    : 0;

  if (percent < 60) {
    showToast(`Sertifikat olish uchun kamida 60% kerak. Sizning natijangiz: ${percent}%`, 'error');
    return;
  }

  const modal = document.getElementById('certificate-modal');
  if (!modal) return;

  const certName = document.getElementById('cert-student-name');
  const certTestName = document.getElementById('cert-test-name');
  const certScore = document.getElementById('cert-score');
  const certPercent = document.getElementById('cert-percent');
  const certAuthor = document.getElementById('cert-author');
  const certDate = document.getElementById('cert-date');

  if (certName) certName.textContent = res.studentName;
  if (certTestName) certTestName.textContent = res.testTitle;
  if (certScore) certScore.textContent = `${res.correctCount}/${res.totalQuestions}`;
  if (certPercent) certPercent.textContent = `${percent}%`;
  if (certAuthor) certAuthor.textContent = res.author || "O'qituvchi";
  if (certDate) certDate.textContent = new Date().toLocaleDateString('uz-UZ', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  modal.classList.add('active');
}

function closeCertModal() {
  const modal = document.getElementById('certificate-modal');
  if (modal) modal.classList.remove('active');
}

let qrInstance = null;

function showQrModal(url, label) {
  state.currentQrUrl = url;
  const modal = document.getElementById('qr-modal');
  const container = document.getElementById('qr-code-container');
  const labelEl = document.getElementById('qr-modal-label');

  if (!modal || !container) return;
  if (labelEl) labelEl.textContent = label || 'Smartfoningiz kamerasi bilan skaner qiling';

  container.innerHTML = '';
  qrInstance = null;

  if (typeof QRCode !== 'undefined') {
    try {
      qrInstance = new QRCode(container, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch (e) {
      console.warn("QR kod yaratishda xatolik:", e);
      container.innerHTML = `<p style="color: var(--error); font-size: 0.85rem; padding: 1rem;">Test/Natija hajmi juda katta bo'lgani sababli QR kodga sig'madi. Iltimos, havolani nusxalang yoki faylni ulashing.</p>`;
    }
  } else {
    container.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; padding: 1rem;">QR kod kutubxonasi yuklanmadi. Internet ulanishingizni tekshiring.</p>`;
  }

  modal.classList.add('active');
}

function closeQrModal() {
  const modal = document.getElementById('qr-modal');
  if (modal) modal.classList.remove('active');
  qrInstance = null;
}

function downloadQrCode() {
  const container = document.getElementById('qr-code-container');
  if (!container) return;
  const canvas = container.querySelector('canvas');
  if (!canvas) {
    showToast('QR kod rasmi mavjud emas!', 'error');
    return;
  }
  const link = document.createElement('a');
  link.download = 'smart_test_qr.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('QR kod rasmi yuklab olindi!');
}

// ==========================================
// 10. URL VA PARAMETRLAR TEKSHIRUVI
// ==========================================
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.has('test')) {
    const rawTest = urlParams.get('test');
    const testData = decompressPayload(rawTest, false);
    if (testData && testData.questions && Array.isArray(testData.questions)) {
      state.activeTest = testData;
      initStudentWelcomeScreen();
      showView('runner-view');
      showToast("Test muvaffaqiyatli yuklandi!");
    } else {
      showToast("Test havolasi yaroqsiz!", "error");
    }
  } else if (urlParams.has('result')) {
    const rawResult = urlParams.get('result');
    const resultData = decompressPayload(rawResult, true);
    if (resultData && resultData.questions && resultData.answers) {
      state.viewingResult = resultData;
      saveToJournal(resultData);
      displayResults(resultData, true);
      showView('result-view');
      showToast("O'quvchi natijasi yuklandi!");
    } else {
      showToast("Natija havolasi yaroqsiz!", "error");
    }
  }
}

// ==========================================
// 11. HODISALAR (EVENT LISTENERS) SOZLASH
// ==========================================
function setupEventListeners() {
  // Navigatsiya tugmalari
  document.querySelectorAll('.btn-nav').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget.getAttribute('data-target');
      if (target === 'dashboard-view') {
        refreshDashboard();
      }
      showView(target);
    });
  });

  // Bosh sahifa logotipi
  const logoHome = document.getElementById('logo-home');
  if (logoHome) {
    logoHome.addEventListener('click', (e) => {
      e.preventDefault();
      showView('home-view');
    });
  }

  // Bosh sahifadagi "O'qituvchi" kartasi
  const cardTeacher = document.getElementById('card-teacher');
  if (cardTeacher) {
    cardTeacher.addEventListener('click', () => {
      showView('creator-view');
    });
  }

  // O'qituvchi: Hujjatdan yuklash (Word / Excel / JSON)
  const btnDocImport = document.getElementById('btn-doc-import');
  const fileDocImport = document.getElementById('file-doc-import');
  if (btnDocImport && fileDocImport) {
    btnDocImport.addEventListener('click', () => {
      fileDocImport.click();
    });
    fileDocImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleDocumentImport(file, false);
      }
      e.target.value = '';
    });
  }

  // O'qituvchi: Excel andoza (shablon) yuklab olish
  const btnExcelTemplate = document.getElementById('btn-excel-template');
  if (btnExcelTemplate) {
    btnExcelTemplate.addEventListener('click', downloadExcelTemplate);
  }

  // O'qituvchi: Savol qo'shish va tahrirni bekor qilish
  const btnAddQuestion = document.getElementById('btn-add-question');
  if (btnAddQuestion) {
    btnAddQuestion.addEventListener('click', addQuestionToTest);
  }

  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', cancelEdit);
  }

  // O'qituvchi: Barcha savollarni tozalash
  const btnClearTest = document.getElementById('btn-clear-test');
  if (btnClearTest) {
    btnClearTest.addEventListener('click', () => {
      if (confirm("Rostdan ham barcha savollarni o'chirib tashlamoqchimisiz?")) {
        state.createdTest.questions = [];
        cancelEdit();
        updateQuestionsListUI();
        const shareSection = document.getElementById('sharing-section');
        if (shareSection) shareSection.style.display = 'none';
        const shareInput = document.getElementById('share-link-input');
        if (shareInput) shareInput.value = '';
        showToast("Test savollari tozalandi");
      }
    });
  }

  // O'qituvchi: Havola yaratish va yuklab olish (Word, Excel, JSON)
  const btnGenerateTest = document.getElementById('btn-generate-test');
  if (btnGenerateTest) {
    btnGenerateTest.addEventListener('click', generateTestLink);
  }

  const btnDownloadWord = document.getElementById('btn-download-word');
  if (btnDownloadWord) {
    btnDownloadWord.addEventListener('click', exportTestToWord);
  }

  const btnDownloadExcel = document.getElementById('btn-download-excel');
  if (btnDownloadExcel) {
    btnDownloadExcel.addEventListener('click', exportTestToExcel);
  }

  const btnDownloadTest = document.getElementById('btn-download-test');
  if (btnDownloadTest) {
    btnDownloadTest.addEventListener('click', downloadTestJson);
  }

  // O'qituvchi: Havola nusxalash va QR
  const btnCopyLink = document.getElementById('btn-copy-link');
  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
      copyToClipboard('share-link-input', "Havola nusxalandi!");
    });
  }

  const btnShowQr = document.getElementById('btn-show-qr');
  if (btnShowQr) {
    btnShowQr.addEventListener('click', () => {
      const shareInput = document.getElementById('share-link-input');
      const url = shareInput ? shareInput.value : '';
      if (!url) {
        showToast("Avval test havolasini yarating!", 'error');
        return;
      }
      showQrModal(url, 'Test havolasi QR kodi');
    });
  }

  // O'qituvchi: Matndan import (Bulk Import)
  const btnBulkImport = document.getElementById('btn-bulk-import');
  if (btnBulkImport) btnBulkImport.addEventListener('click', openBulkModal);

  const closeBulkModal1 = document.getElementById('close-bulk-modal');
  if (closeBulkModal1) closeBulkModal1.addEventListener('click', closeBulkModal);

  const closeBulkModal2 = document.getElementById('close-bulk-modal-btn');
  if (closeBulkModal2) closeBulkModal2.addEventListener('click', closeBulkModal);

  const btnDoBulkImport = document.getElementById('btn-do-bulk-import');
  if (btnDoBulkImport) btnDoBulkImport.addEventListener('click', doBulkImport);

  const bulkModal = document.getElementById('bulk-import-modal');
  if (bulkModal) {
    bulkModal.addEventListener('click', (e) => {
      if (e.target === bulkModal) closeBulkModal();
    });
  }

  // O'quvchi tomoni: Havola yoki kod kiritish
  const btnLoadTestLink = document.getElementById('btn-load-test-link');
  const testLinkInput = document.getElementById('test-link-input');

  const handleTestLinkLoad = () => {
    const inputVal = testLinkInput ? testLinkInput.value.trim() : '';
    if (!inputVal) return showToast("Iltimos, test havolasi yoki kodini kiriting!", "error");

    if (inputVal.includes('result=')) {
      showToast("Bu natija havolasi. Natijani tekshirish bo'limiga kiritishingiz mumkin.", "error");
      return;
    }

    const testData = decompressPayload(inputVal, false);
    if (testData && testData.questions && Array.isArray(testData.questions)) {
      state.activeTest = testData;
      initStudentWelcomeScreen();
      showView('runner-view');
      showToast("Test muvaffaqiyatli yuklandi!");
    } else {
      showToast("Test topilmadi yoki havola yaroqsiz!", "error");
    }
  };

  if (btnLoadTestLink) btnLoadTestLink.addEventListener('click', handleTestLinkLoad);
  if (testLinkInput) {
    testLinkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleTestLinkLoad();
      }
    });
  }

  // O'quvchi tomoni: Fayldan yuklash (JSON, Word, Excel)
  const btnSelectTestFile = document.getElementById('btn-select-test-file');
  const fileTestImport = document.getElementById('file-test-import');
  if (btnSelectTestFile && fileTestImport) {
    btnSelectTestFile.addEventListener('click', (e) => {
      e.stopPropagation();
      fileTestImport.click();
    });
    fileTestImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleDocumentImport(file, true);
      }
      e.target.value = '';
    });
  }

  const studentImportBox = document.getElementById('student-import-box');
  if (studentImportBox && fileTestImport) {
    studentImportBox.addEventListener('click', (e) => {
      if (e.target !== btnSelectTestFile) {
        fileTestImport.click();
      }
    });
  }

  // O'qituvchi tomoni: Natija havolasi kiritish
  const btnViewResultLink = document.getElementById('btn-view-result-link');
  const resultLinkInput = document.getElementById('result-link-input');

  const handleResultLinkLoad = () => {
    const inputVal = resultLinkInput ? resultLinkInput.value.trim() : '';
    if (!inputVal) return showToast("Iltimos, natija havolasini kiriting", "error");

    if (inputVal.includes('test=')) {
      const testData = decompressPayload(inputVal, false);
      if (testData && testData.questions) {
        state.activeTest = testData;
        initStudentWelcomeScreen();
        showView('runner-view');
        showToast("Bu test havolasi ekan, test boshlandi!");
        return;
      }
    }

    const resultData = decompressPayload(inputVal, true);
    if (resultData && resultData.questions && resultData.answers) {
      state.viewingResult = resultData;
      saveToJournal(resultData);
      displayResults(resultData, true);
      showView('result-view');
      showToast("Natija havoladan yuklandi!");
    } else {
      showToast("Natija topilmadi yoki havola noto'g'ri!", "error");
    }
  };

  if (btnViewResultLink) btnViewResultLink.addEventListener('click', handleResultLinkLoad);
  if (resultLinkInput) {
    resultLinkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleResultLinkLoad();
      }
    });
  }

  // O'qituvchi tomoni: Natija faylini yuklash
  const btnSelectResultFile = document.getElementById('btn-select-result-file');
  const fileResultImport = document.getElementById('file-result-import');
  if (btnSelectResultFile && fileResultImport) {
    btnSelectResultFile.addEventListener('click', (e) => {
      e.stopPropagation();
      fileResultImport.click();
    });
    fileResultImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      importJsonFile(file, (resultData) => {
        if (!resultData || !resultData.questions || !resultData.answers) {
          showToast("Natija fayli formati noto'g'ri!", "error");
          return;
        }
        state.viewingResult = resultData;
        saveToJournal(resultData);
        displayResults(resultData, true);
        showView('result-view');
        showToast("Natija fayldan yuklandi!");
      });
      e.target.value = '';
    });
  }

  const resultImportBox = document.getElementById('result-import-box');
  if (resultImportBox && fileResultImport) {
    resultImportBox.addEventListener('click', (e) => {
      if (e.target !== btnSelectResultFile) {
        fileResultImport.click();
      }
    });
  }

  // O'quvchi: Testni boshlash
  const btnStartQuiz = document.getElementById('btn-start-quiz');
  if (btnStartQuiz) {
    btnStartQuiz.addEventListener('click', startQuiz);
  }

  const studentNameInput = document.getElementById('student-name');
  if (studentNameInput) {
    studentNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startQuiz();
      }
    });
  }

  // O'quvchi: Savollar orasida o'tish
  const btnPrevQuestion = document.getElementById('btn-prev-question');
  if (btnPrevQuestion) btnPrevQuestion.addEventListener('click', prevQuestion);

  const btnNextQuestion = document.getElementById('btn-next-question');
  if (btnNextQuestion) btnNextQuestion.addEventListener('click', nextQuestion);

  // O'quvchi: Testni topshirish
  const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
  if (btnSubmitQuiz) {
    btnSubmitQuiz.addEventListener('click', () => {
      const totalQ = state.activeTest ? state.activeTest.questions.length : 0;
      const answeredCount = Object.keys(state.studentAnswers).length;
      const unansweredCount = totalQ - answeredCount;

      let confirmMsg = "Testni topshirishni tasdiqlaysizmi?";
      if (unansweredCount > 0) {
        confirmMsg = `Diqqat: Siz ${unansweredCount} ta savolga javob bermadingiz! Testni baribir topshirishni tasdiqlaysizmi?`;
      }
      if (confirm(confirmMsg)) {
        submitQuiz();
      }
    });
  }

  // Natijalar bo'limi: Havolani nusxalash va Yuklab olish
  const btnCopyResultLink = document.getElementById('btn-copy-result-link');
  if (btnCopyResultLink) {
    btnCopyResultLink.addEventListener('click', () => {
      copyToClipboard('result-share-input', "Natija havolasi nusxalandi!");
    });
  }

  const btnDownloadResult = document.getElementById('btn-download-result');
  if (btnDownloadResult) {
    btnDownloadResult.addEventListener('click', downloadResultWord);
  }

  const btnShowResultQr = document.getElementById('btn-show-result-qr');
  if (btnShowResultQr) {
    btnShowResultQr.addEventListener('click', () => {
      const resultInput = document.getElementById('result-share-input');
      const url = resultInput ? resultInput.value : '';
      if (!url) {
        showToast("Natija havolasi mavjud emas!", 'error');
        return;
      }
      showQrModal(url, 'Natija havolasi QR kodi');
    });
  }

  // Sertifikat tugmalari
  const btnShowCert = document.getElementById('btn-show-cert');
  if (btnShowCert) {
    btnShowCert.addEventListener('click', () => showCertificate(state.lastResultForCert));
  }

  const btnTeacherShowCert = document.getElementById('btn-teacher-show-cert');
  if (btnTeacherShowCert) {
    btnTeacherShowCert.addEventListener('click', () => showCertificate(state.lastResultForCert));
  }

  const closeCertModalBtn = document.getElementById('close-cert-modal');
  if (closeCertModalBtn) closeCertModalBtn.addEventListener('click', closeCertModal);

  const certModalEl = document.getElementById('certificate-modal');
  if (certModalEl) {
    certModalEl.addEventListener('click', (e) => {
      if (e.target === certModalEl) closeCertModal();
    });
  }

  // QR Modal yopish va yuklab olish
  const closeQrModalBtn = document.getElementById('close-qr-modal');
  if (closeQrModalBtn) closeQrModalBtn.addEventListener('click', closeQrModal);

  const qrModalEl = document.getElementById('qr-modal');
  if (qrModalEl) {
    qrModalEl.addEventListener('click', (e) => {
      if (e.target === qrModalEl) closeQrModal();
    });
  }

  const btnDownloadQr = document.getElementById('btn-download-qr');
  if (btnDownloadQr) btnDownloadQr.addEventListener('click', downloadQrCode);

  // Bosh sahifaga qaytish tugmalari
  const btnRestartApp = document.getElementById('btn-restart-app');
  if (btnRestartApp) btnRestartApp.addEventListener('click', resetToHome);

  const btnTeacherExit = document.getElementById('btn-teacher-exit');
  if (btnTeacherExit) btnTeacherExit.addEventListener('click', resetToHome);

  // Dashboard (Jurnal) amallari
  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportJournalCsv);

  const btnClearJournal = document.getElementById('btn-clear-journal');
  if (btnClearJournal) btnClearJournal.addEventListener('click', clearJournal);
}

// ==========================================
// 12. DASTUR ISHGA TUSHISHI
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  refreshDashboard();
  checkUrlParams();
});
