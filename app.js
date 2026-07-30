// ==========================================
// STATE MANAGEMENT
// ==========================================
const state = {
  currentView: 'home-view',
  createdTest: {
    title: 'Yangi Test',
    duration: 20,
    author: 'O\'qituvchi',
    questions: []
  },
  activeTest: null,
  studentName: '',
  currentQuestionIndex: 0,
  studentAnswers: {}, // key: question index, value: selected option index
  timerInterval: null,
  timeLeft: 0, // in seconds
  viewingResult: null // result object if viewing student results
};

// ==========================================
// HELPER FUNCTIONS (Encoding/Decoding)
// ==========================================
function encodeBase64(obj) {
  try {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
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
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const str = new TextDecoder().decode(bytes);
    return JSON.parse(str);
  } catch (e) {
    console.error("Decoding error:", e);
    showToast("Havolani o'qishda xatolik yuz berdi. Havola noto'g'ri yoki buzilgan bo'lishi mumkin.", "error");
    return null;
  }
}

// ==========================================
// VIEW CONTROLLER
// ==========================================
function showView(viewId) {
  state.currentView = viewId;
  
  // Hide all views
  document.querySelectorAll('.view-section').forEach(view => {
    view.classList.remove('active');
  });
  
  // Show target view
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Update navigation styling
  document.querySelectorAll('.btn-nav').forEach(btn => {
    if (btn.getAttribute('data-target') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Handle specific navigation visibilities
  const navRunner = document.getElementById('nav-runner');
  const navResult = document.getElementById('nav-result');

  if (viewId === 'runner-view') {
    navRunner.style.display = 'block';
  } else if (state.activeTest === null) {
    navRunner.style.display = 'none';
  }

  if (viewId === 'result-view') {
    navResult.style.display = 'block';
  } else if (state.viewingResult === null && Object.keys(state.studentAnswers).length === 0) {
    navResult.style.display = 'none';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Toast Notifications
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  
  toastText.textContent = message;
  
  if (type === 'error') {
    toast.style.borderColor = 'var(--error)';
    toast.style.background = '#311218';
  } else {
    toast.style.borderColor = 'var(--primary)';
    toast.style.background = '#1e1b4b';
  }
  
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// ==========================================
// INITIALIZATION & URL HANDLING
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkUrlParams();
});

function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (urlParams.has('test')) {
    const testData = decodeBase64(urlParams.get('test'));
    if (testData) {
      state.activeTest = testData;
      initStudentWelcomeScreen();
      showView('runner-view');
      showToast("Test muvaffaqiyatli yuklandi!");
    }
  } else if (urlParams.has('result')) {
    const resultData = decodeBase64(urlParams.get('result'));
    if (resultData) {
      state.viewingResult = resultData;
      displayResults(resultData, true); // true = teacher view mode
      showView('result-view');
      showToast("O'quvchi natijasi yuklandi!");
    }
  }
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.btn-nav').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target.getAttribute('data-target');
      showView(target);
    });
  });

  document.getElementById('logo-home').addEventListener('click', (e) => {
    e.preventDefault();
    showView('home-view');
  });

  // Home cards
  document.getElementById('card-teacher').addEventListener('click', () => {
    showView('creator-view');
  });

  // Teacher Form - Add Question
  document.getElementById('btn-add-question').addEventListener('click', addQuestionToTest);

  // Teacher Form - Clear Test
  document.getElementById('btn-clear-test').addEventListener('click', () => {
    if (confirm("Rostdan ham barcha savollarni o'chirib tashlamoqchimisiz?")) {
      state.createdTest.questions = [];
      updateQuestionsListUI();
      document.getElementById('sharing-section').style.display = 'none';
      showToast("Test tozalandi");
    }
  });

  // Teacher Form - Generate Test
  document.getElementById('btn-generate-test').addEventListener('click', generateTestLink);

  // Copy buttons
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    copyToClipboard('share-link-input', "Havola nusxalandi!");
  });
  
  document.getElementById('btn-copy-result-link').addEventListener('click', () => {
    copyToClipboard('result-share-input', "Natija havolasi nusxalandi!");
  });

  // Download buttons
  document.getElementById('btn-download-test').addEventListener('click', downloadTestJson);
  document.getElementById('btn-download-result').addEventListener('click', downloadResultJson);

  // File Upload Handlers (Home screen JSON uploads)
  // Student side
  document.getElementById('btn-select-test-file').addEventListener('click', () => {
    document.getElementById('file-test-import').click();
  });
  document.getElementById('file-test-import').addEventListener('change', (e) => {
    importJsonFile(e.target.files[0], (testData) => {
      state.activeTest = testData;
      initStudentWelcomeScreen();
      showView('runner-view');
      showToast("Test fayldan yuklandi!");
    });
  });

  // Teacher side (Results view)
  document.getElementById('btn-select-result-file').addEventListener('click', () => {
    document.getElementById('file-result-import').click();
  });
  document.getElementById('file-result-import').addEventListener('change', (e) => {
    importJsonFile(e.target.files[0], (resultData) => {
      state.viewingResult = resultData;
      displayResults(resultData, true);
      showView('result-view');
      showToast("Natija fayldan yuklandi!");
    });
  });

  // Result search input
  document.getElementById('btn-view-result-link').addEventListener('click', () => {
    const inputVal = document.getElementById('result-link-input').value.trim();
    if (!inputVal) return showToast("Iltimos havolani kiriting", "error");
    
    let base64 = '';
    if (inputVal.includes('result=')) {
      const parts = inputVal.split('result=');
      base64 = parts[1].split('&')[0];
    } else {
      base64 = inputVal;
    }
    
    const resultData = decodeBase64(base64);
    if (resultData) {
      state.viewingResult = resultData;
      displayResults(resultData, true);
      showView('result-view');
      showToast("Natija havoladan o'qildi!");
    }
  });

  // Student Runner navigation
  document.getElementById('btn-start-quiz').addEventListener('click', startQuiz);
  document.getElementById('btn-prev-question').addEventListener('click', prevQuestion);
  document.getElementById('btn-next-question').addEventListener('click', nextQuestion);
  document.getElementById('btn-submit-quiz').addEventListener('click', () => {
    if (confirm("Testni topshirishni tasdiqlaysizmi?")) {
      submitQuiz();
    }
  });

  // Exit result view
  document.getElementById('btn-restart-app').addEventListener('click', resetToHome);
  document.getElementById('btn-teacher-exit').addEventListener('click', resetToHome);
}

function copyToClipboard(inputId, successMessage) {
  const copyText = document.getElementById(inputId);
  copyText.select();
  copyText.setSelectionRange(0, 99999); // For mobile devices
  
  try {
    navigator.clipboard.writeText(copyText.value);
    showToast(successMessage);
  } catch (err) {
    // Fallback
    document.execCommand('copy');
    showToast(successMessage);
  }
}

function resetToHome() {
  clearInterval(state.timerInterval);
  state.activeTest = null;
  state.viewingResult = null;
  state.studentAnswers = {};
  state.currentQuestionIndex = 0;
  
  // Clean URL parameters
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.pushState({}, document.title, cleanUrl);
  
  // Reset fields
  document.getElementById('student-name').value = '';
  
  showView('home-view');
}

// ==========================================
// FILE IMPORT / EXPORT
// ==========================================
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

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], {type: contentType});
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ==========================================
// TEACHER CREATOR WORKFLOW
// ==========================================
function addQuestionToTest() {
  const text = document.getElementById('question-text-input').value.trim();
  const optionA = document.getElementById('option-a').value.trim();
  const optionB = document.getElementById('option-b').value.trim();
  const optionC = document.getElementById('option-c').value.trim();
  const optionD = document.getElementById('option-d').value.trim();
  
  const correctOptionRadio = document.querySelector('input[name="correct-option"]:checked');
  
  if (!text || !optionA || !optionB || !optionC || !optionD) {
    showToast("Iltimos, barcha maydonlarni to'ldiring!", "error");
    return;
  }
  
  const correctIndex = parseInt(correctOptionRadio.value, 10);
  
  const question = {
    text: text,
    options: [optionA, optionB, optionC, optionD],
    correctAnswer: correctIndex
  };
  
  state.createdTest.questions.push(question);
  
  // Clear inputs for next question
  document.getElementById('question-text-input').value = '';
  document.getElementById('option-a').value = '';
  document.getElementById('option-b').value = '';
  document.getElementById('option-c').value = '';
  document.getElementById('option-d').value = '';
  document.querySelector('input[name="correct-option"][value="0"]').checked = true;
  
  updateQuestionsListUI();
  showToast("Savol muvaffaqiyatli qo'shildi!");
}

function updateQuestionsListUI() {
  const container = document.getElementById('questions-list-container');
  const countSpan = document.getElementById('questions-count');
  const qNumSpan = document.getElementById('builder-q-number');
  
  const qCount = state.createdTest.questions.length;
  countSpan.textContent = qCount;
  qNumSpan.textContent = `Savol #${qCount + 1}`;
  
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
      <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${idx})">O'chirish</button>
    `;
    container.appendChild(div);
  });
}

// Global deletion function accessible from inline onclick
window.deleteQuestion = function(index) {
  state.createdTest.questions.splice(index, 1);
  updateQuestionsListUI();
  showToast("Savol o'chirildi");
};

function generateTestLink() {
  const title = document.getElementById('test-title').value.trim() || 'Yangi Test';
  const duration = parseInt(document.getElementById('test-duration').value, 10) || 0;
  const author = document.getElementById('test-author').value.trim() || 'O\'qituvchi';
  
  if (state.createdTest.questions.length === 0) {
    showToast("Iltimos, avval savollarni qo'shing!", "error");
    return;
  }
  
  state.createdTest.title = title;
  state.createdTest.duration = duration;
  state.createdTest.author = author;
  
  const payload = encodeBase64(state.createdTest);
  
  // Build direct URL
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?test=${payload}`;
  
  document.getElementById('share-link-input').value = shareUrl;
  document.getElementById('sharing-section').style.display = 'block';
  
  // Scroll to sharing section
  document.getElementById('sharing-section').scrollIntoView({ behavior: 'smooth' });
  showToast("Test havolasi yaratildi!");
}

function downloadTestJson() {
  const jsonContent = JSON.stringify(state.createdTest, null, 2);
  const rawTitle = state.createdTest.title.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  downloadFile(jsonContent, `test_${rawTitle}.json`, 'application/json');
}

// ==========================================
// STUDENT QUIZ RUNNER WORKFLOW
// ==========================================
function initStudentWelcomeScreen() {
  const test = state.activeTest;
  document.getElementById('welcome-test-title').textContent = test.title;
  document.getElementById('welcome-author').textContent = test.author;
  document.getElementById('welcome-q-count').textContent = test.questions.length;
  document.getElementById('welcome-duration').textContent = test.duration > 0 ? test.duration : 'Cheksiz';
  
  // Show welcome screen, hide test container
  document.getElementById('student-welcome-card').style.display = 'block';
  document.getElementById('active-quiz-container').style.display = 'none';
}

function startQuiz() {
  const nameInput = document.getElementById('student-name').value.trim();
  if (!nameInput) {
    showToast("Iltimos, ism familiyangizni kiriting!", "error");
    return;
  }
  
  state.studentName = nameInput;
  state.currentQuestionIndex = 0;
  state.studentAnswers = {};
  
  // Hide welcome, show active quiz
  document.getElementById('student-welcome-card').style.display = 'none';
  document.getElementById('active-quiz-container').style.display = 'block';
  
  // Set meta info
  document.getElementById('runner-test-title').textContent = state.activeTest.title;
  
  // Timer initialization
  const durationMinutes = state.activeTest.duration;
  if (durationMinutes > 0) {
    state.timeLeft = durationMinutes * 60;
    document.getElementById('quiz-timer').style.display = 'flex';
    updateTimerDisplay();
    
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.timeLeft--;
      updateTimerDisplay();
      
      if (state.timeLeft <= 30) {
        document.getElementById('quiz-timer').classList.add('warning');
      }
      
      if (state.timeLeft <= 0) {
        clearInterval(state.timerInterval);
        showToast("Vaqt tugadi! Test avtomatik ravishda topshirilmoqda.", "error");
        submitQuiz();
      }
    }, 1000);
  } else {
    document.getElementById('quiz-timer').style.display = 'none';
  }
  
  renderQuestion();
}

function updateTimerDisplay() {
  const minutes = Math.floor(state.timeLeft / 60);
  const seconds = state.timeLeft % 60;
  document.getElementById('timer-display').textContent = 
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function renderQuestion() {
  const question = state.activeTest.questions[state.currentQuestionIndex];
  const qCount = state.activeTest.questions.length;
  
  // Question text
  document.getElementById('current-question-text').textContent = `${state.currentQuestionIndex + 1}. ${question.text}`;
  
  // Progress Bar
  const progressPercent = ((state.currentQuestionIndex) / qCount) * 100;
  document.getElementById('quiz-progress-bar').style.width = `${progressPercent}%`;
  
  // Index display
  document.getElementById('question-index-display').textContent = `Savol ${state.currentQuestionIndex + 1} / ${qCount}`;
  
  // Dynamic Option buttons
  const optionsContainer = document.getElementById('current-options-list');
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
  
  // Navigation Buttons
  const btnPrev = document.getElementById('btn-prev-question');
  const btnNext = document.getElementById('btn-next-question');
  const btnSubmit = document.getElementById('btn-submit-quiz');
  
  btnPrev.disabled = state.currentQuestionIndex === 0;
  
  if (state.currentQuestionIndex === qCount - 1) {
    btnNext.style.display = 'none';
    btnSubmit.style.display = 'inline-flex';
  } else {
    btnNext.style.display = 'inline-flex';
    btnSubmit.style.display = 'none';
  }
}

function selectOption(optionIndex) {
  state.studentAnswers[state.currentQuestionIndex] = optionIndex;
  
  // Re-render to show selection styling
  const buttons = document.querySelectorAll('.option-button');
  buttons.forEach((btn, idx) => {
    if (idx === optionIndex) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

function nextQuestion() {
  if (state.currentQuestionIndex < state.activeTest.questions.length - 1) {
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

// ==========================================
// RESULTS COMPUTATION & DISPLAY
// ==========================================
function submitQuiz() {
  clearInterval(state.timerInterval);
  
  const test = state.activeTest;
  let correctCount = 0;
  
  test.questions.forEach((q, idx) => {
    if (state.studentAnswers[idx] === q.correctAnswer) {
      correctCount++;
    }
  });
  
  const result = {
    studentName: state.studentName,
    testTitle: test.title,
    author: test.author,
    correctCount: correctCount,
    totalQuestions: test.questions.length,
    answers: state.studentAnswers,
    questions: test.questions // embed questions structure for easy loading
  };
  
  displayResults(result, false); // false = student view mode
  showView('result-view');
}

function displayResults(result, isTeacherView = false) {
  // Update header descriptions
  document.getElementById('result-page-title').textContent = isTeacherView ? "Natijani Tekshirish" : "Sizning Natijangiz";
  document.getElementById('result-student-name').textContent = result.studentName;
  document.getElementById('result-subtitle').innerHTML = `
    O'quvchi: <strong>${escapeHtml(result.studentName)}</strong> <br/>
    Test: <strong>${escapeHtml(result.testTitle)}</strong> (O'qituvchi: ${escapeHtml(result.author)})
  `;
  
  // Calculate percentage
  const percent = result.totalQuestions > 0 ? Math.round((result.correctCount / result.totalQuestions) * 100) : 0;
  
  // Numbers
  document.getElementById('score-percentage-text').textContent = `${percent}%`;
  document.getElementById('score-fraction-text').textContent = `${result.correctCount}/${result.totalQuestions}`;
  document.getElementById('result-correct-count').textContent = result.correctCount;
  document.getElementById('result-incorrect-count').textContent = result.totalQuestions - result.correctCount;
  
  // Animate circle ring
  // Circumference is 440 (2 * pi * r where r=70 => ~439.8)
  const ring = document.getElementById('score-ring');
  const dashoffset = 440 - (440 * percent) / 100;
  // Delay slightly to trigger transition animations
  setTimeout(() => {
    ring.style.strokeDashoffset = dashoffset;
  }, 100);
  
  // Render detailed review
  const reviewContainer = document.getElementById('review-list-container');
  reviewContainer.innerHTML = '';
  
  const optionLetters = ['A', 'B', 'C', 'D'];
  
  result.questions.forEach((q, idx) => {
    const studentAns = result.answers[idx];
    const correctAns = q.correctAnswer;
    const isCorrect = studentAns === correctAns;
    
    const reviewItem = document.createElement('div');
    reviewItem.className = `review-item ${isCorrect ? 'correct' : 'incorrect'}`;
    
    let optionsHtml = '';
    q.options.forEach((optText, optIdx) => {
      let statusClass = '';
      let badgeHtml = '';
      
      if (optIdx === correctAns) {
        statusClass = 'correct';
        badgeHtml = `<span class="review-badge correct">To'g'ri javob</span>`;
      } else if (optIdx === studentAns) {
        statusClass = 'selected';
        badgeHtml = `<span class="review-badge selected-incorrect">Sizning javobingiz</span>`;
      }
      
      optionsHtml += `
        <div class="review-option ${statusClass}">
          <span><strong>${optionLetters[optIdx]}.</strong> ${escapeHtml(optText)}</span>
          ${badgeHtml}
        </div>
      `;
    });
    
    reviewItem.innerHTML = `
      <div class="review-question">${idx + 1}. ${escapeHtml(q.text)}</div>
      <div class="review-options-list">
        ${optionsHtml}
      </div>
    `;
    
    reviewContainer.appendChild(reviewItem);
  });
  
  // Show / Hide appropriate buttons
  const studentSharingActions = document.getElementById('student-sharing-actions');
  const teacherViewActions = document.getElementById('teacher-view-actions');
  
  if (isTeacherView) {
    studentSharingActions.style.display = 'none';
    teacherViewActions.style.display = 'block';
  } else {
    studentSharingActions.style.display = 'block';
    teacherViewActions.style.display = 'none';
    
    // Generate Result link
    const payload = encodeBase64(result);
    const baseUrl = window.location.origin + window.location.pathname;
    document.getElementById('result-share-input').value = `${baseUrl}?result=${payload}`;
  }
}

function downloadResultJson() {
  let resultObj = state.viewingResult;
  
  if (!resultObj) {
    // Generate from current test submission
    const test = state.activeTest;
    let correctCount = 0;
    test.questions.forEach((q, idx) => {
      if (state.studentAnswers[idx] === q.correctAnswer) {
        correctCount++;
      }
    });
    resultObj = {
      studentName: state.studentName,
      testTitle: test.title,
      author: test.author,
      correctCount: correctCount,
      totalQuestions: test.questions.length,
      answers: state.studentAnswers,
      questions: test.questions
    };
  }
  
  const jsonContent = JSON.stringify(resultObj, null, 2);
  const rawName = resultObj.studentName.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const rawTitle = resultObj.testTitle.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  downloadFile(jsonContent, `natija_${rawName}_${rawTitle}.json`, 'application/json');
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
