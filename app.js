const GAS_URL = 'https://script.google.com/macros/s/AKfycbyBbT8h-8Yaa97rkiTYbwkUX_iQYLuC_USye5yG-94eVXoulTQu8BthI581FgPy2LXH/exec';

const App = (() => {
  // ── STATE ──────────────────────────────────────────────
  let currentStudent = null;
  let currentWords = [];
  let storyData = null;
  let selectedWords = [];
  let currentTier = 0;
  let currentStep = 0;
  let selectedTheme = null;
  let practiceWordData = {};
  let evalDifficultyRating = null;
  let huntIndex = 0;
  let huntQuestions = [];
  let translateCache = {};
  const synth = window.speechSynthesis;

  const TIER_KEYS = ['tier1','tier2','tier3'];
  const TIER_NAMES = ['第 1 層：基礎句型','第 2 層：句型滾動','第 3 層：語氣變化'];
  const STEP_NAMES = ['步驟 1：指著聽','步驟 2：單字獵人','步驟 3：自己念'];
  const LEVEL_MAP = {beginner:'🌱 初學',intermediate:'🌿 進階',advanced:'🌳 流利'};

  // ── UTILS ──────────────────────────────────────────────
  function goTo(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
  }

  function showLoading(msg='載入中...') {
    document.getElementById('loadingMsg').textContent = msg;
    document.getElementById('loadingOverlay').classList.add('show');
  }

  function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  function speak(text, rate=0.85) {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate;
    synth.speak(u);
  }

  async function gasGet(params) {
    const url = GAS_URL + '?' + new URLSearchParams(params);
    const r = await fetch(url);
    return r.json();
  }

  async function gasPost(data) {
    const r = await fetch(GAS_URL, { method:'POST', body:JSON.stringify(data) });
    return r.json();
  }

  // ── SCREEN: STUDENTS ───────────────────────────────────
  async function loadStudents() {
    try {
      const data = await gasGet({ action:'getStudents' });
      const el = document.getElementById('studentListInner');
      if (!data.length) {
        el.innerHTML = '<div class="muted-text" style="padding:1rem 0">還沒有學生，請新增一個！</div>';
        return;
      }
      el.innerHTML = data.map(s => `
        <div class="student-item" onclick='App.selectStudent(${JSON.stringify(JSON.stringify(s))})'>
          <div class="avatar">${s.name.charAt(0)}</div>
          <div style="flex:1">
            <div class="student-name">${s.name}</div>
            <div class="muted-text">${LEVEL_MAP[s.difficulty]||s.difficulty}</div>
          </div>
          <span style="color:var(--text-muted);font-size:20px">›</span>
        </div>`).join('');
    } catch(e) {
      document.getElementById('studentListInner').innerHTML = '<div style="color:var(--danger);font-size:14px">載入失敗，請確認網路連線</div>';
    }
  }

  function showAddStudentForm() {
    document.getElementById('addStudentForm').style.display = 'block';
  }

  function hideAddStudentForm() {
    document.getElementById('addStudentForm').style.display = 'none';
  }

  let selectedLevel = 'beginner';
  function selectLevel(btn) {
    document.querySelectorAll('#addStudentLevelGrid .difficulty-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedLevel = btn.dataset.level;
  }

  async function addStudent() {
    const name = document.getElementById('newStudentName').value.trim();
    if (!name) { showToast('請輸入學生姓名'); return; }
    showLoading('建立學生中...');
    try {
      await gasPost({ action:'addStudent', name, difficulty:selectedLevel });
      hideLoading();
      hideAddStudentForm();
      document.getElementById('newStudentName').value = '';
      showToast('學生建立成功！');
      loadStudents();
    } catch(e) { hideLoading(); showToast('建立失敗，請重試'); }
  }

  async function selectStudent(jsonStr) {
    currentStudent = JSON.parse(jsonStr);
    showLoading('載入資料...');
    try {
      currentWords = await gasGet({ action:'getWords', studentId:currentStudent.studentId });
      hideLoading();
      updateHomeScreen();
      goTo('screenHome');
    } catch(e) { hideLoading(); showToast('載入失敗'); }
  }

  // ── SCREEN: HOME ───────────────────────────────────────
  function updateHomeScreen() {
    const s = currentStudent;
    document.getElementById('homeStudentName').textContent = s.name;
    document.getElementById('homeAvatar').textContent = s.name.charAt(0);
    document.getElementById('homeNameDisplay').textContent = s.name;
    document.getElementById('homeLevelDisplay').textContent = LEVEL_MAP[s.difficulty]||s.difficulty;
    const mastered = s.masteredWords ? s.masteredWords.split(',').filter(Boolean) : [];
    const struggling = s.strugglingWords ? s.strugglingWords.split(',').filter(Boolean) : [];
    document.getElementById('statMastered').textContent = mastered.length;
    document.getElementById('statStruggling').textContent = struggling.length;
    document.getElementById('statTotal').textContent = currentWords.length;
  }

  // ── SCREEN: WORDS ──────────────────────────────────────
  async function translateWord() {
    const word = document.getElementById('wordInput').value.trim().toLowerCase();
    if (!word) { showToast('請輸入英文單字'); return; }
    if (translateCache[word]) { showTranslateResult(word, translateCache[word]); return; }
    showLoading('翻譯中...');
    try {
      const result = await gasPost({ action:'translateWord', word });
      hideLoading();
      translateCache[word] = result;
      showTranslateResult(word, result);
    } catch(e) { hideLoading(); showToast('翻譯失敗，請重試'); }
  }

  let currentTranslateWord = '';
  function showTranslateResult(word, result) {
    currentTranslateWord = word;
    document.getElementById('translateChinese').textContent = result.chinese;
    const diffMap = {easy:'簡單',medium:'中等',hard:'困難'};
    document.getElementById('translateDifficulty').textContent = '難度：'+(diffMap[result.difficulty]||result.difficulty);
    document.getElementById('translatePreview').classList.add('show');
  }

  function speakWord() { speak(currentTranslateWord); }

  async function addWordConfirm() {
    if (!currentTranslateWord) return;
    if (currentWords.find(w => w.english === currentTranslateWord)) {
      showToast('這個單字已經在單字庫了！'); return;
    }
    const cached = translateCache[currentTranslateWord];
    showLoading('新增中...');
    try {
      await gasPost({
        action:'addWord', studentId:currentStudent.studentId,
        english:currentTranslateWord, chinese:cached.chinese, difficulty:cached.difficulty
      });
      currentWords = await gasGet({ action:'getWords', studentId:currentStudent.studentId });
      hideLoading();
      document.getElementById('wordInput').value = '';
      document.getElementById('translatePreview').classList.remove('show');
      currentTranslateWord = '';
      showToast('✓ 已加入單字庫');
      renderWordList();
      updateHomeScreen();
    } catch(e) { hideLoading(); showToast('新增失敗，請重試'); }
  }

  function renderWordList() {
    const el = document.getElementById('wordListInner');
    document.getElementById('wordCount').textContent = `(${currentWords.length})`;
    if (!currentWords.length) {
      el.innerHTML = '<div class="muted-text">還沒有單字，快來新增吧！</div>'; return;
    }
    const mastered = currentStudent.masteredWords ? currentStudent.masteredWords.split(',').filter(Boolean) : [];
    const struggling = currentStudent.strugglingWords ? currentStudent.strugglingWords.split(',').filter(Boolean) : [];
    el.innerHTML = currentWords.map(w => {
      let cls = mastered.includes(w.english) ? 'mastered' : struggling.includes(w.english) ? 'struggling' : '';
      return `<span class="word-chip ${cls}" onclick="App.speak('${w.english}')">${w.english} ${w.chinese} 🔊</span>`;
    }).join('');
  }

  // ── SCREEN: THEME ──────────────────────────────────────
  function startPracticeFlow() {
    if (currentWords.length < 5) {
      showToast('單字庫至少需要 5 個單字才能練習！');
      goTo('screenWords'); renderWordList(); return;
    }
    selectedTheme = null;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.getElementById('startStoryBtn');
    btn.disabled = true; btn.style.opacity = '0.45';
    goTo('screenTheme');
  }

  function selectTheme(btn, theme) {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTheme = theme;
    const sb = document.getElementById('startStoryBtn');
    sb.disabled = false; sb.style.opacity = '1';
  }

  async function generateStory() {
    showLoading('AI 正在生成故事...');
    try {
      const result = await gasPost({
        action:'generateStory', studentId:currentStudent.studentId,
        theme:selectedTheme, difficulty:currentStudent.difficulty
      });
      hideLoading();
      if (result.error) { showToast('錯誤：'+result.error); return; }
      storyData = result.story;
      selectedWords = result.selectedWords;
      initPractice();
      goTo('screenPractice');
    } catch(e) { hideLoading(); showToast('生成失敗，請重試'); }
  }

  // ── SCREEN: PRACTICE ───────────────────────────────────
  function initPractice() {
    currentTier = 0; currentStep = 0;
    practiceWordData = {};
    selectedWords.forEach(w => {
      practiceWordData[w.english] = { huntErrors:0, phonicsUsed:false };
    });
    renderTierStep();
  }

  function renderTierStep() {
    const tier = storyData[TIER_KEYS[currentTier]];
    document.getElementById('tierBadge').textContent = TIER_NAMES[currentTier];
    document.getElementById('practiceTitle').textContent = `第 ${currentTier+1}/3 層`;
    document.getElementById('stepLabel').textContent = STEP_NAMES[currentStep];
    // progress
    const done = currentTier * 3 + currentStep;
    document.getElementById('practiceProgress').style.width = (done/9*100)+'%';
    [0,1,2].forEach(i => {
      const d = document.getElementById('dot'+i);
      d.className = 'step-dot'+(i<currentStep?' done':i===currentStep?' active':'');
    });
    document.getElementById('huntBox').style.display = 'none';
    document.getElementById('phonicsBox').style.display = 'none';
    if (currentStep===0) renderStep1(tier);
    else if (currentStep===1) renderStep2(tier);
    else renderStep3(tier);
  }

  // Step 1 – Listen & Track
  function renderStep1(tier) {
    renderStoryText(tier.text,'listen');
    document.getElementById('actionArea').innerHTML =
      `<button class="btn btn-primary" onclick="App.playStory()">🔊 播放故事</button>`;
  }

  function renderStoryText(text, mode) {
    const parts = text.split(/(\s+)/);
    const html = parts.map((part,i) => {
      if (!/\S/.test(part)) return part;
      const clean = part.replace(/[^a-zA-Z']/g,'').toLowerCase();
      return `<span class="story-word" id="sw${i}" data-word="${clean}" data-mode="${mode}" onclick="App.onWordClick(this)">${part}</span>`;
    }).join('');
    document.getElementById('storyDisplay').innerHTML = html;
  }

  function playStory() {
    const text = storyData[TIER_KEYS[currentTier]].text;
    const spans = Array.from(document.querySelectorAll('.story-word'));
    spans.forEach(s => s.classList.remove('highlight'));
    speak(text, 0.75);
    const words = text.split(/\s+/);
    const totalMs = (words.length / 80) * 60000;
    let elapsed = 0;
    spans.forEach((span,i) => {
      const delay = (span.textContent.trim().length / text.replace(/\s+/g,'').length) * totalMs;
      setTimeout(() => { spans.forEach(s => s.classList.remove('highlight')); span.classList.add('highlight'); }, elapsed);
      elapsed += delay + 80;
    });
    setTimeout(() => {
      spans.forEach(s => s.classList.remove('highlight'));
      document.getElementById('actionArea').innerHTML =
        `<button class="btn btn-primary" onclick="App.playStory()">🔊 再聽一次</button>
         <button class="btn btn-success" onclick="App.nextStep()">下一步 →</button>`;
    }, elapsed + 400);
  }

  // Step 2 – Word Hunt
  function renderStep2(tier) {
    huntIndex = 0;
    huntQuestions = tier.hunts;
    renderStoryText(tier.text,'hunt');
    document.getElementById('actionArea').innerHTML = '';
    showNextHunt();
  }

  function showNextHunt() {
    if (huntIndex >= huntQuestions.length) {
      document.getElementById('huntBox').style.display = 'none';
      document.getElementById('actionArea').innerHTML =
        `<button class="btn btn-success" onclick="App.nextStep()">下一步 →</button>`;
      return;
    }
    const q = huntQuestions[huntIndex];
    const hb = document.getElementById('huntBox');
    hb.style.display = 'block';
    hb.textContent = '🎯 ' + q.question;
    document.querySelectorAll('.story-word').forEach(s => s.classList.remove('hunt-target','hunt-correct','hunt-wrong'));
    document.querySelectorAll('.story-word').forEach(s => {
      if (s.dataset.word === q.answer.toLowerCase()) s.classList.add('hunt-target');
    });
  }

  function onWordClick(el) {
    const word = el.dataset.word;
    const mode = el.dataset.mode;
    if (mode === 'hunt') {
      const q = huntQuestions[huntIndex];
      if (!q) return;
      if (word === q.answer.toLowerCase()) {
        document.querySelectorAll('.story-word').forEach(s => {
          if (s.dataset.word === word) { s.classList.remove('hunt-target'); s.classList.add('hunt-correct'); }
        });
        speak(word);
        showToast('✓ 答對了！');
        huntIndex++;
        setTimeout(showNextHunt, 900);
      } else {
        if (practiceWordData[word]) practiceWordData[word].huntErrors++;
        el.classList.add('hunt-wrong');
        setTimeout(() => el.classList.remove('hunt-wrong'), 600);
      }
    } else if (mode === 'phonics') {
      triggerPhonics(word);
    }
  }

  // Step 3 – Read + Phonics on demand
  function renderStep3(tier) {
    renderStoryText(tier.text,'phonics');
    document.getElementById('phonicsBox').style.display = 'none';
    document.getElementById('actionArea').innerHTML =
      `<div style="color:var(--text-muted);font-size:14px;margin-bottom:10px;text-align:center">
        🎤 用手指著每個字，大聲念出來！<br>
        <span style="font-size:12px">不會的字點一下，聽聽怎麼唸</span>
       </div>
       <button class="btn btn-success" onclick="App.nextStep()">我讀完了 ✓</button>`;
  }

  function triggerPhonics(word) {
    if (!word) return;
    if (practiceWordData[word]) practiceWordData[word].phonicsUsed = true;
    const box = document.getElementById('phonicsBox');
    box.style.display = 'block';
    box.textContent = buildPhonics(word);
    speak(word, 0.6);
  }

  function buildPhonics(word) {
    const clean = word.replace(/[^a-z]/g,'');
    if (clean.length <= 3) return `/${clean}/ → ${word}`;
    const m = Math.ceil(clean.length/2);
    return `/${clean.slice(0,m)}/ ··· /${clean.slice(m)}/ → ${word}`;
  }

  function nextStep() {
    currentStep++;
    if (currentStep > 2) {
      currentStep = 0; currentTier++;
      if (currentTier > 2) { showEval(); return; }
    }
    renderTierStep();
  }

  function confirmExitPractice() {
    if (confirm('確定要離開練習嗎？進度將不會儲存。')) goTo('screenHome');
  }

  // ── SCREEN: EVAL ───────────────────────────────────────
  function showEval() {
    evalDifficultyRating = null;
    document.querySelectorAll('#screenEval .difficulty-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('evalWordBtns').innerHTML =
      Object.keys(practiceWordData).map(w =>
        `<button class="eval-word-btn" data-word="${w}" onclick="this.classList.toggle('selected')">${w}</button>`
      ).join('');
    goTo('screenEval');
  }

  function selectEvalDifficulty(btn) {
    document.querySelectorAll('#screenEval .difficulty-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    evalDifficultyRating = btn.dataset.rating;
  }

  function clearEvalWords() {
    document.querySelectorAll('.eval-word-btn').forEach(b => b.classList.remove('selected'));
  }

  async function submitEval() {
    if (!evalDifficultyRating) { showToast('請選擇今天的難度感受'); return; }
    const selfUnsure = Array.from(document.querySelectorAll('.eval-word-btn.selected')).map(b => b.dataset.word);
    const newMastered = [], newStruggling = [];
    Object.entries(practiceWordData).forEach(([word, data]) => {
      const bad = data.huntErrors > 1 || data.phonicsUsed || selfUnsure.includes(word);
      (bad ? newStruggling : newMastered).push(word);
    });
    const existMastered = currentStudent.masteredWords ? currentStudent.masteredWords.split(',').filter(Boolean) : [];
    const existStruggling = currentStudent.strugglingWords ? currentStudent.strugglingWords.split(',').filter(Boolean) : [];
    const finalMastered = [...new Set([...existMastered,...newMastered])].filter(w => !newStruggling.includes(w));
    const finalStruggling = [...new Set([...existStruggling,...newStruggling])].filter(w => !newMastered.includes(w));
    showLoading('儲存練習結果...');
    try {
      await gasPost({ action:'updateStudent', studentId:currentStudent.studentId, masteredWords:finalMastered.join(','), strugglingWords:finalStruggling.join(',') });
      await gasPost({ action:'saveSession', studentId:currentStudent.studentId, theme:selectedTheme, words:Object.keys(practiceWordData).join(','), difficulty:currentStudent.difficulty, difficultyRating:evalDifficultyRating, masteredResult:newMastered.join(','), strugglingResult:newStruggling.join(',') });
      currentStudent.masteredWords = finalMastered.join(',');
      currentStudent.strugglingWords = finalStruggling.join(',');
      hideLoading();
      document.getElementById('doneMsg').textContent = `完成了 ${Object.keys(practiceWordData).length} 個單字的練習！`;
      document.getElementById('doneStats').innerHTML = `
        <div class="stat-box success"><div class="stat-num">${newMastered.length}</div><div class="stat-label">本次掌握</div></div>
        <div class="stat-box warning"><div class="stat-num">${newStruggling.length}</div><div class="stat-label">繼續加油</div></div>`;
      goTo('screenDone');
    } catch(e) { hideLoading(); showToast('儲存失敗，請重試'); }
  }

  // ── INIT ───────────────────────────────────────────────
  window.addEventListener('load', loadStudents);

  // ── PUBLIC API ─────────────────────────────────────────
  return {
    goTo, showAddStudentForm, hideAddStudentForm, selectLevel, addStudent,
    selectStudent, updateHomeScreen, translateWord, speakWord, addWordConfirm,
    renderWordList, startPracticeFlow, selectTheme, generateStory,
    playStory, onWordClick, nextStep, confirmExitPractice, showEval,
    selectEvalDifficulty, clearEvalWords, submitEval, speak
  };
})();
