const GAS_URL = 'https://script.google.com/macros/s/AKfycbyBbT8h-8Yaa97rkiTYbwkUX_iQYLuC_USye5yG-94eVXoulTQu8BthI581FgPy2LXH/exec';
const LS_KEY = 'vocabapp_students';

const App = (() => {
  // ── STATE ──────────────────────────────────────────────
  let currentStudent = null;
  let currentWords   = [];
  let storyData      = null;
  let selectedWords  = [];
  let bonusWords     = [];
  let currentTier    = 0;
  let currentStep    = 0;
  let selectedTheme  = null;
  let practiceWordData = {};
  let evalDifficultyRating = null;
  let huntIndex      = 0;
  let huntQuestions  = [];
  let translateCache = {};
  let readMode       = 'full';
  let sentences      = [];
  let speakTimer     = null;
  const synth        = window.speechSynthesis;

  const TIER_KEYS  = ['tier1','tier2','tier3'];
  const TIER_NAMES = ['第 1 層：基礎句型','第 2 層：句型滾動','第 3 層：語氣變化'];
  const STEP_NAMES = ['步驟 1：指著聽','步驟 2：單字獵人','步驟 3：自己念'];
  const LEVEL_MAP  = {beginner:'🌱 初學',intermediate:'🌿 進階',advanced:'🌳 流利'};
  const POS_MAP    = {noun:'名詞',verb:'動詞',adjective:'形容詞',adverb:'副詞',other:'其他'};
  const DIFF_MAP   = {easy:'簡單 🌱',medium:'中等 🌿',hard:'困難 🌳'};

  // ── UTILS ──────────────────────────────────────────────
  function goTo(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
  }
  function showLoading(msg) {
    document.getElementById('loadingMsg').textContent = msg||'載入中...';
    document.getElementById('loadingOverlay').classList.add('show');
  }
  function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }
  function speak(text, rate) {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = rate||0.85;
    synth.speak(u);
    return u;
  }
  async function gasGet(params) {
    const r = await fetch(GAS_URL + '?' + new URLSearchParams(params));
    return r.json();
  }
  async function gasPost(data) {
    const r = await fetch(GAS_URL, { method:'POST', body:JSON.stringify(data) });
    return r.json();
  }
  function splitSentences(text) {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  // ── LOCAL STORAGE ──────────────────────────────────────
  function lsGetStudents() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch(e) { return null; }
  }
  function lsSaveStudents(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch(e) {}
  }
  function lsUpdateStudent(updated) {
    const arr = lsGetStudents() || [];
    const idx = arr.findIndex(s => s.studentId === updated.studentId);
    if (idx >= 0) arr[idx] = updated; else arr.push(updated);
    lsSaveStudents(arr);
  }

  // ── SCREEN: STUDENTS ───────────────────────────────────
  function loadStudents() {
    const cached = lsGetStudents();
    if (cached && cached.length) { renderStudentList(cached); return; }
    fetchStudentsFromGAS();
  }

  async function fetchStudentsFromGAS() {
    showLoading('載入學生資料...');
    try {
      const data = await gasGet({ action:'getStudents' });
      hideLoading();
      lsSaveStudents(data);
      renderStudentList(data);
    } catch(e) {
      hideLoading();
      document.getElementById('studentListInner').innerHTML =
        '<div style="color:var(--danger);font-size:14px">載入失敗，請確認網路連線</div>';
    }
  }

  function renderStudentList(data) {
    const el = document.getElementById('studentListInner');
    if (!data || !data.length) {
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
  }

  function showAddStudentForm() { document.getElementById('addStudentForm').style.display='block'; }
  function hideAddStudentForm() { document.getElementById('addStudentForm').style.display='none'; }

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
      const res = await gasPost({ action:'addStudent', name, difficulty:selectedLevel });
      const newStudent = { studentId:res.studentId, name, difficulty:selectedLevel, masteredWords:'', strugglingWords:'' };
      const arr = lsGetStudents() || [];
      arr.push(newStudent);
      lsSaveStudents(arr);
      hideLoading();
      hideAddStudentForm();
      document.getElementById('newStudentName').value = '';
      showToast('學生建立成功！');
      renderStudentList(arr);
    } catch(e) { hideLoading(); showToast('建立失敗，請重試'); }
  }

  async function selectStudent(jsonStr) {
    currentStudent = JSON.parse(jsonStr);
    showLoading('載入單字庫...');
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
    document.getElementById('homeAvatar').textContent      = s.name.charAt(0);
    document.getElementById('homeNameDisplay').textContent = s.name;
    document.getElementById('homeLevelDisplay').textContent= LEVEL_MAP[s.difficulty]||s.difficulty;
    const mastered   = s.masteredWords   ? s.masteredWords.split(',').filter(Boolean)   : [];
    const struggling = s.strugglingWords ? s.strugglingWords.split(',').filter(Boolean) : [];
    document.getElementById('statMastered').textContent   = mastered.length;
    document.getElementById('statStruggling').textContent = struggling.length;
    document.getElementById('statTotal').textContent      = currentWords.length;
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
    document.getElementById('translateChinese').textContent = result.chinese || '—';
    const pos  = POS_MAP[result.partOfSpeech] || '';
    const diff = DIFF_MAP[result.difficulty]  || '';
    document.getElementById('translateDifficulty').textContent = [pos,diff].filter(Boolean).join('　');
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
      await gasPost({ action:'addWord', studentId:currentStudent.studentId,
        english:currentTranslateWord, chinese:cached.chinese,
        difficulty:cached.difficulty, partOfSpeech:cached.partOfSpeech });
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
    document.getElementById('wordCount').textContent = '('+currentWords.length+')';
    if (!currentWords.length) {
      el.innerHTML = '<div class="muted-text">還沒有單字，快來新增吧！</div>'; return;
    }
    const mastered   = currentStudent.masteredWords   ? currentStudent.masteredWords.split(',').filter(Boolean)   : [];
    const struggling = currentStudent.strugglingWords ? currentStudent.strugglingWords.split(',').filter(Boolean) : [];
    el.innerHTML = currentWords.map(w => {
      const cls = mastered.includes(w.english)?'mastered':struggling.includes(w.english)?'struggling':'';
      return '<span class="word-chip '+cls+'" onclick="App.speak(\''+w.english+'\')">'+w.english+' '+w.chinese+' 🔊</span>';
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
      storyData     = result.story;
      selectedWords = result.selectedWords;
      bonusWords    = result.bonusWords || [];
      initPractice();
      goTo('screenPractice');
    } catch(e) { hideLoading(); showToast('生成失敗，請重試'); }
  }

  // ── PRACTICE ───────────────────────────────────────────
  function initPractice() {
    currentTier = 0; currentStep = 0;
    practiceWordData = {};
    selectedWords.forEach(w => { practiceWordData[w.english] = { huntErrors:0, phonicsUsed:false }; });
    renderTierStep();
  }

  function renderTierStep() {
    const tier = storyData[TIER_KEYS[currentTier]];
    document.getElementById('tierBadge').textContent     = TIER_NAMES[currentTier];
    document.getElementById('practiceTitle').textContent = '第 '+(currentTier+1)+'/3 層';
    document.getElementById('stepLabel').textContent     = STEP_NAMES[currentStep];
    const done = currentTier*3+currentStep;
    document.getElementById('practiceProgress').style.width = (done/9*100)+'%';
    [0,1,2].forEach(i=>{
      const d=document.getElementById('dot'+i);
      d.className='step-dot'+(i<currentStep?' done':i===currentStep?' active':'');
    });
    document.getElementById('huntBox').style.display    = 'none';
    document.getElementById('phonicsBox').style.display = 'none';
    synth.cancel();
    if (speakTimer) { clearTimeout(speakTimer); speakTimer=null; }
    if (currentStep===0) renderStep1(tier);
    else if (currentStep===1) renderStep2(tier);
    else renderStep3(tier);
  }

  // STEP 1
  function renderStep1(tier) {
    sentences = splitSentences(tier.text);
    readMode  = 'full';
    renderSentences(tier.text, 'listen');
    renderWordCards();
    renderTranslation(tier.chineseText);
    document.getElementById('actionArea').innerHTML =
      '<div class="read-mode-toggle">'+
        '<button class="btn btn-sm btn-primary" id="btnFull" onclick="App.setReadMode(\'full\')">整篇朗讀</button>'+
        '<button class="btn btn-sm" id="btnSent" onclick="App.setReadMode(\'sentence\')">逐句朗讀</button>'+
      '</div>'+
      '<button class="btn btn-primary" id="playBtn" onclick="App.playStory()">🔊 開始朗讀</button>'+
      '<button class="btn btn-success" id="nextStepBtn" onclick="App.nextStep()" style="display:none">下一步 →</button>';
  }

  function setReadMode(mode) {
    readMode = mode;
    synth.cancel();
    if (speakTimer) { clearTimeout(speakTimer); speakTimer=null; }
    clearSentenceHighlight();
    document.getElementById('btnFull').className='btn btn-sm'+(mode==='full'?' btn-primary':'');
    document.getElementById('btnSent').className='btn btn-sm'+(mode==='sentence'?' btn-primary':'');
    const playBtn=document.getElementById('playBtn');
    if(playBtn){playBtn.textContent='🔊 開始朗讀';playBtn.onclick=()=>App.playStory();}
  }

  function renderSentences(text, mode) {
    const segs = splitSentences(text);
    document.getElementById('storyDisplay').innerHTML = segs.map((s,i)=>
      '<span class="story-sentence" id="ss'+i+'" data-idx="'+i+'" data-mode="'+mode+'" onclick="App.onSentenceClick(this)">'+s+'</span>'
    ).join(' ');
  }

  function highlightSentence(idx) {
    clearSentenceHighlight();
    const el=document.getElementById('ss'+idx);
    if(el) el.classList.add('highlight');
  }
  function clearSentenceHighlight() {
    document.querySelectorAll('.story-sentence').forEach(s=>s.classList.remove('highlight'));
  }

  function onSentenceClick(el) {
    const idx=parseInt(el.dataset.idx);
    const mode=el.dataset.mode;
    if(mode==='listen'||mode==='phonics'){
      synth.cancel();
      if(speakTimer){clearTimeout(speakTimer);speakTimer=null;}
      highlightSentence(idx);
      const u=speak(sentences[idx],0.8);
      u.onend=()=>clearSentenceHighlight();
    }
  }

  function playStory() {
    synth.cancel();
    if(speakTimer){clearTimeout(speakTimer);speakTimer=null;}
    clearSentenceHighlight();
    if(readMode==='full') playFull(0);
    else playSentenceMode(0);
  }

  function playFull(idx) {
    if(idx>=sentences.length){clearSentenceHighlight();showNextStepBtn();return;}
    highlightSentence(idx);
    const u=speak(sentences[idx],0.8);
    u.onend=()=>{ speakTimer=setTimeout(()=>playFull(idx+1),350); };
  }

  function playSentenceMode(idx) {
    if(idx>=sentences.length){clearSentenceHighlight();showNextStepBtn();return;}
    highlightSentence(idx);
    const u=speak(sentences[idx],0.8);
    u.onend=()=>{
      clearSentenceHighlight();
      const playBtn=document.getElementById('playBtn');
      if(playBtn){
        playBtn.textContent=idx<sentences.length-1?'▶ 下一句':'✓ 聽完了';
        playBtn.onclick=()=>{ idx<sentences.length-1?playSentenceMode(idx+1):showNextStepBtn(); };
      }
    };
  }

  function showNextStepBtn() {
    const pb=document.getElementById('playBtn');
    if(pb){pb.textContent='🔊 再聽一次';pb.onclick=()=>playStory();}
    const nb=document.getElementById('nextStepBtn');
    if(nb) nb.style.display='block';
  }

  function renderWordCards() {
    const old=document.getElementById('wordCardsArea');
    if(old) old.remove();
    const div=document.createElement('div');
    div.id='wordCardsArea';
    div.className='word-cards-area';
    div.innerHTML=selectedWords.map(w=>
      '<div class="word-card" onclick="App.speak(\''+w.english+'\')">'+
        '<div class="word-card-en">'+w.english+'</div>'+
        '<div class="word-card-zh">'+w.chinese+'・'+(POS_MAP[w.partOfSpeech]||'—')+'</div>'+
        '<div class="word-card-icon">🔊</div>'+
      '</div>'
    ).join('');
    document.getElementById('storyCard').parentNode.insertBefore(div,document.getElementById('storyCard'));
  }

  function renderTranslation(chineseText) {
    let el=document.getElementById('translationArea');
    if(!el){
      el=document.createElement('div');
      el.id='translationArea';
      el.className='translation-area';
      document.getElementById('storyCard').after(el);
    }
    el.innerHTML=
      '<button class="translation-toggle" onclick="App.toggleTranslation()">查看中文翻譯 ▾</button>'+
      '<div class="translation-text" id="translationText" style="display:none">'+(chineseText||'（翻譯載入中）')+'</div>';
  }

  function toggleTranslation() {
    const txt=document.getElementById('translationText');
    const btn=document.querySelector('.translation-toggle');
    if(!txt) return;
    const open=txt.style.display==='none';
    txt.style.display=open?'block':'none';
    btn.textContent=open?'收起翻譯 ▴':'查看中文翻譯 ▾';
  }

  function cleanupStoryExtras() {
    const wc=document.getElementById('wordCardsArea');
    const ta=document.getElementById('translationArea');
    if(wc) wc.remove();
    if(ta) ta.remove();
  }

  // STEP 2
  function renderStep2(tier) {
    huntIndex=0; huntQuestions=tier.hunts;
    cleanupStoryExtras();
    renderWordsAsClickable(tier.text,'hunt');
    document.getElementById('actionArea').innerHTML='';
    showNextHunt();
  }

  function renderWordsAsClickable(text,mode) {
    const parts=text.split(/(\s+)/);
    document.getElementById('storyDisplay').innerHTML=parts.map((part,i)=>{
      if(!/\S/.test(part)) return part;
      const clean=part.replace(/[^a-zA-Z']/g,'').toLowerCase();
      return '<span class="story-word" id="sw'+i+'" data-word="'+clean+'" data-mode="'+mode+'" onclick="App.onWordClick(this)">'+part+'</span>';
    }).join('');
  }

  function showNextHunt() {
    if(huntIndex>=huntQuestions.length){
      document.getElementById('huntBox').style.display='none';
      document.getElementById('actionArea').innerHTML='<button class="btn btn-success" onclick="App.nextStep()">下一步 →</button>';
      return;
    }
    const q=huntQuestions[huntIndex];
    const hb=document.getElementById('huntBox');
    hb.style.display='block'; hb.textContent='🎯 '+q.question;
    document.querySelectorAll('.story-word').forEach(s=>s.classList.remove('hunt-target','hunt-correct','hunt-wrong'));
    document.querySelectorAll('.story-word').forEach(s=>{
      if(s.dataset.word===q.answer.toLowerCase()) s.classList.add('hunt-target');
    });
  }

  function onWordClick(el) {
    const word=el.dataset.word; const mode=el.dataset.mode;
    if(mode==='hunt'){
      const q=huntQuestions[huntIndex]; if(!q) return;
      if(word===q.answer.toLowerCase()){
        document.querySelectorAll('.story-word').forEach(s=>{
          if(s.dataset.word===word){s.classList.remove('hunt-target');s.classList.add('hunt-correct');}
        });
        speak(word); showToast('✓ 答對了！');
        huntIndex++; setTimeout(showNextHunt,900);
      } else {
        if(practiceWordData[word]) practiceWordData[word].huntErrors++;
        el.classList.add('hunt-wrong'); setTimeout(()=>el.classList.remove('hunt-wrong'),600);
      }
    } else if(mode==='phonics') { triggerPhonics(word); }
  }

  // STEP 3
  function renderStep3(tier) {
    sentences=splitSentences(tier.text);
    renderSentences(tier.text,'phonics');
    renderWordCards();
    renderTranslation(tier.chineseText);
    document.getElementById('phonicsBox').style.display='none';
    document.getElementById('actionArea').innerHTML=
      '<div style="color:var(--text-muted);font-size:14px;margin-bottom:10px;text-align:center">'+
        '🎤 用手指著每個字，大聲念出來！<br>'+
        '<span style="font-size:12px">點擊句子聽發音，點擊不會的字聽拆音</span>'+
      '</div>'+
      '<button class="btn btn-success" onclick="App.nextStep()">我讀完了 ✓</button>';
  }

  function triggerPhonics(word) {
    if(!word) return;
    if(practiceWordData[word]) practiceWordData[word].phonicsUsed=true;
    const box=document.getElementById('phonicsBox');
    box.style.display='block'; box.textContent=buildPhonics(word);
    speak(word,0.6);
  }

  function buildPhonics(word) {
    const c=word.replace(/[^a-z]/g,'');
    if(c.length<=3) return '/'+c+'/ → '+word;
    const m=Math.ceil(c.length/2);
    return '/'+c.slice(0,m)+'/ ··· /'+c.slice(m)+'/ → '+word;
  }

  function nextStep() {
    cleanupStoryExtras();
    currentStep++;
    if(currentStep>2){currentStep=0;currentTier++;if(currentTier>2){showEval();return;}}
    renderTierStep();
  }

  function confirmExitPractice() {
    if(confirm('確定要離開練習嗎？進度將不會儲存。')){cleanupStoryExtras();goTo('screenHome');}
  }

  // ── EVAL ───────────────────────────────────────────────
  function showEval() {
    evalDifficultyRating=null;
    document.querySelectorAll('#screenEval .difficulty-btn').forEach(b=>b.classList.remove('selected'));
    document.getElementById('evalWordBtns').innerHTML=Object.keys(practiceWordData).map(w=>
      '<button class="eval-word-btn" data-word="'+w+'" onclick="this.classList.toggle(\'selected\')">'+w+'</button>'
    ).join('');
    const bonusEl=document.getElementById('bonusWordsArea');
    if(bonusEl){
      if(bonusWords.length){
        bonusEl.style.display='block';
        document.getElementById('bonusWordList').innerHTML=bonusWords.map((w,i)=>
          '<div class="bonus-word-row">'+
            '<label class="bonus-check">'+
              '<input type="checkbox" id="bonus'+i+'" data-idx="'+i+'">'+
              '<span class="bonus-en">'+w.english+'</span>'+
              '<span class="bonus-zh">'+w.chinese+'・'+(POS_MAP[w.partOfSpeech]||'—')+'</span>'+
              '<button class="btn btn-sm" onclick="App.speak(\''+w.english+'\')" style="width:auto;margin:0">🔊</button>'+
            '</label>'+
          '</div>'
        ).join('');
      } else { bonusEl.style.display='none'; }
    }
    goTo('screenEval');
  }

  function selectEvalDifficulty(btn) {
    document.querySelectorAll('#screenEval .difficulty-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected'); evalDifficultyRating=btn.dataset.rating;
  }
  function clearEvalWords() { document.querySelectorAll('.eval-word-btn').forEach(b=>b.classList.remove('selected')); }

  async function submitEval() {
    if(!evalDifficultyRating){showToast('請選擇今天的難度感受');return;}
    const selfUnsure=Array.from(document.querySelectorAll('.eval-word-btn.selected')).map(b=>b.dataset.word);
    const newMastered=[],newStruggling=[];
    Object.entries(practiceWordData).forEach(([word,data])=>{
      const bad=data.huntErrors>1||data.phonicsUsed||selfUnsure.includes(word);
      (bad?newStruggling:newMastered).push(word);
    });
    const existMastered  =currentStudent.masteredWords  ?currentStudent.masteredWords.split(',').filter(Boolean):[];
    const existStruggling=currentStudent.strugglingWords?currentStudent.strugglingWords.split(',').filter(Boolean):[];
    const finalMastered  =[...new Set([...existMastered,...newMastered])].filter(w=>!newStruggling.includes(w));
    const finalStruggling=[...new Set([...existStruggling,...newStruggling])].filter(w=>!newMastered.includes(w));
    const checkedBonus=bonusWords.filter((w,i)=>{const cb=document.getElementById('bonus'+i);return cb&&cb.checked;});
    showLoading('儲存練習結果...');
    try {
      await gasPost({action:'updateStudent',studentId:currentStudent.studentId,masteredWords:finalMastered.join(','),strugglingWords:finalStruggling.join(',')});
      await gasPost({action:'saveSession',studentId:currentStudent.studentId,theme:selectedTheme,words:Object.keys(practiceWordData).join(','),difficulty:currentStudent.difficulty,difficultyRating:evalDifficultyRating,masteredResult:newMastered.join(','),strugglingResult:newStruggling.join(',')});
      for(const w of checkedBonus){
        await gasPost({action:'addWord',studentId:currentStudent.studentId,english:w.english,chinese:w.chinese,difficulty:w.difficulty,partOfSpeech:w.partOfSpeech});
      }
      currentStudent.masteredWords  =finalMastered.join(',');
      currentStudent.strugglingWords=finalStruggling.join(',');
      lsUpdateStudent(currentStudent);
      if(checkedBonus.length) currentWords=await gasGet({action:'getWords',studentId:currentStudent.studentId});
      hideLoading();
      let msg='完成了 '+Object.keys(practiceWordData).length+' 個單字的練習！';
      if(checkedBonus.length) msg+=' 並新增了 '+checkedBonus.length+' 個新單字！';
      document.getElementById('doneMsg').textContent=msg;
      document.getElementById('doneStats').innerHTML=
        '<div class="stat-box success"><div class="stat-num">'+newMastered.length+'</div><div class="stat-label">本次掌握</div></div>'+
        '<div class="stat-box warning"><div class="stat-num">'+newStruggling.length+'</div><div class="stat-label">繼續加油</div></div>';
      goTo('screenDone');
    } catch(e){hideLoading();showToast('儲存失敗，請重試');}
  }

  // ── INIT ───────────────────────────────────────────────
  window.addEventListener('load', loadStudents);

  return {
    goTo,showAddStudentForm,hideAddStudentForm,selectLevel,addStudent,
    selectStudent,updateHomeScreen,translateWord,speakWord,addWordConfirm,
    renderWordList,startPracticeFlow,selectTheme,generateStory,
    playStory,setReadMode,onSentenceClick,onWordClick,nextStep,
    confirmExitPractice,showEval,selectEvalDifficulty,clearEvalWords,
    submitEval,speak,toggleTranslation
  };
})();
