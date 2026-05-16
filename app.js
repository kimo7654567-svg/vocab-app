const GAS_URL = 'https://script.google.com/macros/s/AKfycbyBbT8h-8Yaa97rkiTYbwkUX_iQYLuC_USye5yG-94eVXoulTQu8BthI581FgPy2LXH/exec';
const LS_KEY  = 'vocabapp_students';

const App = (() => {
  // ── STATE ──────────────────────────────────────────────
  let currentStudent   = null;
  let currentWords     = [];
  let storyData        = null;
  let selectedWords    = [];
  let bonusWords       = [];
  let currentTier      = 0;
  let currentStep      = 0;
  let selectedTheme    = null;
  let practiceWordData = {};
  let evalDiffRating   = null;
  let huntIndex        = 0;
  let huntQuestions    = [];
  let translateCache   = {};
  let readMode         = 'full';
  let sentences        = [];
  let speakTimer       = null;
  let wordFilter       = 'all';
  // Quiz state
  let phonicsQuestions = [];
  let phonicsIdx       = 0;
  let quizCorrect      = 0;
  let quizWrong        = 0;
  let clozeQuestions   = [];
  let clozeIdx         = 0;

  const synth      = window.speechSynthesis;
  const TIER_KEYS  = ['tier1','tier2','tier3'];
  const TIER_NAMES = ['第 1 層：基礎句型','第 2 層：句型滾動','第 3 層：語氣變化'];
  const STEP_NAMES = ['步驟 1：指著聽','步驟 2：單字獵人','步驟 3：自己念'];
  const LEVEL_MAP  = {beginner:'🌱 初學',intermediate:'🌿 進階',advanced:'🌳 流利'};
  const POS_MAP    = {noun:'名詞',verb:'動詞',adjective:'形容詞',adverb:'副詞',other:'其他'};
  const DIFF_MAP   = {easy:'簡單 🌱',medium:'中等 🌿',hard:'困難 🌳'};

  // ── UTILS ──────────────────────────────────────────────
  function goTo(id) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
  }
  function showLoading(msg) { document.getElementById('loadingMsg').textContent=msg||'載入中...'; document.getElementById('loadingOverlay').classList.add('show'); }
  function hideLoading()    { document.getElementById('loadingOverlay').classList.remove('show'); }
  function showToast(msg)   { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }
  function speak(text,rate) { synth.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='en-US'; u.rate=rate||0.85; synth.speak(u); return u; }
  async function gasGet(p)  { const r=await fetch(GAS_URL+'?'+new URLSearchParams(p)); return r.json(); }
  async function gasPost(d) { const r=await fetch(GAS_URL,{method:'POST',body:JSON.stringify(d)}); return r.json(); }
  function splitSentences(t){ return t.match(/[^.!?]+[.!?]+/g)||[t]; }

  // ── LOCAL STORAGE ──────────────────────────────────────
  function lsGet()          { try{return JSON.parse(localStorage.getItem(LS_KEY))||null;}catch(e){return null;} }
  function lsSave(arr)      { try{localStorage.setItem(LS_KEY,JSON.stringify(arr));}catch(e){} }
  function lsUpdate(s)      { const a=lsGet()||[]; const i=a.findIndex(x=>x.studentId===s.studentId); if(i>=0)a[i]=s;else a.push(s); lsSave(a); }

  // ── STUDENTS ──────────────────────────────────────────
  function loadStudents() { const c=lsGet(); if(c&&c.length){renderStudentList(c);return;} fetchStudentsGAS(); }
  async function fetchStudentsGAS() {
    showLoading('載入學生資料...');
    try { const d=await gasGet({action:'getStudents'}); hideLoading(); lsSave(d); renderStudentList(d); }
    catch(e) { hideLoading(); document.getElementById('studentListInner').innerHTML='<div style="color:var(--danger);font-size:14px">載入失敗</div>'; }
  }
  function renderStudentList(data) {
    const el=document.getElementById('studentListInner');
    if(!data||!data.length){el.innerHTML='<div class="muted-text" style="padding:1rem 0">還沒有學生，請新增一個！</div>';return;}
    el.innerHTML=data.map(s=>
      '<div class="student-item" onclick=\'App.selectStudent('+JSON.stringify(JSON.stringify(s))+')\'>'+
        '<div class="avatar">'+s.name.charAt(0)+'</div>'+
        '<div style="flex:1"><div class="student-name">'+s.name+'</div><div class="muted-text">'+(LEVEL_MAP[s.difficulty]||s.difficulty)+'</div></div>'+
        '<span style="color:var(--text-muted);font-size:20px">›</span>'+
      '</div>'
    ).join('');
  }
  function showAddStudentForm()  { document.getElementById('addStudentForm').style.display='block'; }
  function hideAddStudentForm()  { document.getElementById('addStudentForm').style.display='none'; }
  let selectedLevel='beginner';
  function selectLevel(btn) {
    document.querySelectorAll('#addStudentLevelGrid .difficulty-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected'); selectedLevel=btn.dataset.level;
  }
  async function addStudent() {
    const name=document.getElementById('newStudentName').value.trim();
    if(!name){showToast('請輸入學生姓名');return;}
    showLoading('建立學生中...');
    try {
      const res=await gasPost({action:'addStudent',name,difficulty:selectedLevel});
      const ns={studentId:res.studentId,name,difficulty:selectedLevel,masteredWords:'',strugglingWords:''};
      const arr=lsGet()||[]; arr.push(ns); lsSave(arr);
      hideLoading(); hideAddStudentForm(); document.getElementById('newStudentName').value='';
      showToast('學生建立成功！'); renderStudentList(arr);
    } catch(e){hideLoading();showToast('建立失敗，請重試');}
  }
  async function selectStudent(jsonStr) {
    currentStudent=JSON.parse(jsonStr); showLoading('載入單字庫...');
    try { currentWords=await gasGet({action:'getWords',studentId:currentStudent.studentId}); hideLoading(); updateHomeScreen(); goTo('screenHome'); }
    catch(e){hideLoading();showToast('載入失敗');}
  }

  // ── HOME ───────────────────────────────────────────────
  function updateHomeScreen() {
    const s=currentStudent;
    document.getElementById('homeStudentName').textContent=s.name;
    document.getElementById('homeAvatar').textContent=s.name.charAt(0);
    document.getElementById('homeNameDisplay').textContent=s.name;
    document.getElementById('homeLevelDisplay').textContent=LEVEL_MAP[s.difficulty]||s.difficulty;
    const mastered  =s.masteredWords  ?s.masteredWords.split(',').filter(Boolean):[];
    const struggling=s.strugglingWords?s.strugglingWords.split(',').filter(Boolean):[];
    const graduated =currentWords.filter(w=>(w.status||'active')==='graduated');
    document.getElementById('statMastered').textContent  =mastered.length;
    document.getElementById('statStruggling').textContent=struggling.length;
    document.getElementById('statTotal').textContent     =currentWords.length;
    document.getElementById('statGraduated').textContent =graduated.length;
  }

  // ── WORDS ─────────────────────────────────────────────
  let wordFilterVal='all';
  function setWordFilter(f) {
    wordFilterVal=f;
    ['all','active','graduated'].forEach(x=>{
      const b=document.getElementById('filter'+x.charAt(0).toUpperCase()+x.slice(1));
      if(b) b.className='btn btn-sm'+(f===x?' btn-primary':'');
    });
    renderWordList();
  }
  function renderWordList() {
    const el=document.getElementById('wordListInner');
    const mastered  =currentStudent.masteredWords  ?currentStudent.masteredWords.split(',').filter(Boolean):[];
    const struggling=currentStudent.strugglingWords?currentStudent.strugglingWords.split(',').filter(Boolean):[];
    let words=currentWords;
    if(wordFilterVal==='active')    words=currentWords.filter(w=>(w.status||'active')==='active');
    if(wordFilterVal==='graduated') words=currentWords.filter(w=>w.status==='graduated');
    document.getElementById('wordCount').textContent='('+words.length+')';
    if(!words.length){el.innerHTML='<div class="muted-text">沒有符合的單字</div>';return;}
    el.innerHTML=words.map(w=>{
      const isGrad=w.status==='graduated';
      const isMast=mastered.includes(w.english);
      const isStru=struggling.includes(w.english);
      const badge=isGrad?'<span class="word-badge badge-graduated">⭐ 已畢業</span>':
                  isMast?'<span class="word-badge badge-mastered">✓ 掌握</span>':
                  isStru?'<span class="word-badge badge-struggling">練習中</span>':
                         '<span class="word-badge badge-active">學習中</span>';
      const streak=w.correctStreak?'<span style="font-size:11px;color:var(--text-muted)">連續'+w.correctStreak+'次✓</span>':'';
      const reactivate=isGrad?'<button class="btn btn-sm" onclick="App.reactivateWord(\''+w.wordId+'\')" style="width:auto;margin:0;font-size:11px">重新啟用</button>':'';
      return '<div class="word-list-item">'+
        '<div onclick="App.speak(\''+w.english+'\')" style="cursor:pointer">🔊</div>'+
        '<div class="word-list-en">'+w.english+'</div>'+
        '<div class="word-list-zh">'+w.chinese+'<br><span style="font-size:11px">'+(POS_MAP[w.partOfSpeech]||'')+'</span></div>'+
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">'+badge+streak+reactivate+'</div>'+
      '</div>';
    }).join('');
  }
  async function reactivateWord(wordId) {
    showLoading('重新啟用中...');
    try {
      await gasPost({action:'reactivateWord',wordId});
      currentWords=await gasGet({action:'getWords',studentId:currentStudent.studentId});
      hideLoading(); showToast('✓ 已重新啟用'); renderWordList(); updateHomeScreen();
    } catch(e){hideLoading();showToast('操作失敗');}
  }

  async function translateWord() {
    const word=document.getElementById('wordInput').value.trim().toLowerCase();
    if(!word){showToast('請輸入英文單字');return;}
    if(translateCache[word]){showTranslateResult(word,translateCache[word]);return;}
    showLoading('翻譯中...');
    try { const r=await gasPost({action:'translateWord',word}); hideLoading(); translateCache[word]=r; showTranslateResult(word,r); }
    catch(e){hideLoading();showToast('翻譯失敗，請重試');}
  }
  let currentTranslateWord='';
  function showTranslateResult(word,result) {
    currentTranslateWord=word;
    document.getElementById('translateChinese').textContent=result.chinese||'—';
    document.getElementById('translateDifficulty').textContent=[(POS_MAP[result.partOfSpeech]||''),(DIFF_MAP[result.difficulty]||'')].filter(Boolean).join('　');
    document.getElementById('translatePreview').classList.add('show');
  }
  function speakWord() { speak(currentTranslateWord); }
  async function addWordConfirm() {
    if(!currentTranslateWord) return;
    if(currentWords.find(w=>w.english===currentTranslateWord)){showToast('這個單字已經在單字庫了！');return;}
    const c=translateCache[currentTranslateWord];
    showLoading('新增中...');
    try {
      await gasPost({action:'addWord',studentId:currentStudent.studentId,english:currentTranslateWord,chinese:c.chinese,difficulty:c.difficulty,partOfSpeech:c.partOfSpeech});
      currentWords=await gasGet({action:'getWords',studentId:currentStudent.studentId});
      hideLoading(); document.getElementById('wordInput').value=''; document.getElementById('translatePreview').classList.remove('show');
      currentTranslateWord=''; showToast('✓ 已加入單字庫'); renderWordList(); updateHomeScreen();
    } catch(e){hideLoading();showToast('新增失敗，請重試');}
  }

  // ── THEME / STORY ──────────────────────────────────────
  function startPracticeFlow() {
    const active=currentWords.filter(w=>(w.status||'active')==='active');
    if(active.length<5){showToast('需要至少5個練習中的單字！');goTo('screenWords');renderWordList();return;}
    selectedTheme=null;
    document.querySelectorAll('.theme-btn').forEach(b=>b.classList.remove('selected'));
    const btn=document.getElementById('startStoryBtn'); btn.disabled=true; btn.style.opacity='0.45';
    goTo('screenTheme');
  }
  function selectTheme(btn,theme) {
    document.querySelectorAll('.theme-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected'); selectedTheme=theme;
    const sb=document.getElementById('startStoryBtn'); sb.disabled=false; sb.style.opacity='1';
  }
  async function generateStory() {
    showLoading('AI 正在生成故事...');
    try {
      const r=await gasPost({action:'generateStory',studentId:currentStudent.studentId,theme:selectedTheme,difficulty:currentStudent.difficulty});
      hideLoading(); if(r.error){showToast('錯誤：'+r.error);return;}
      storyData=r.story; selectedWords=r.selectedWords; bonusWords=r.bonusWords||[];
      initPractice(); goTo('screenPractice');
    } catch(e){hideLoading();showToast('生成失敗，請重試');}
  }

  // ── PRACTICE ───────────────────────────────────────────
  function initPractice() {
    currentTier=0; currentStep=0; practiceWordData={};
    selectedWords.forEach(w=>{practiceWordData[w.english]={huntErrors:0,phonicsUsed:false,wordId:w.wordId};});
    renderTierStep();
  }
  function renderTierStep() {
    const tier=storyData[TIER_KEYS[currentTier]];
    document.getElementById('tierBadge').textContent    =TIER_NAMES[currentTier];
    document.getElementById('practiceTitle').textContent='第 '+(currentTier+1)+'/3 層';
    document.getElementById('stepLabel').textContent    =STEP_NAMES[currentStep];
    const done=currentTier*3+currentStep;
    document.getElementById('practiceProgress').style.width=(done/9*100)+'%';
    [0,1,2].forEach(i=>{const d=document.getElementById('dot'+i);d.className='step-dot'+(i<currentStep?' done':i===currentStep?' active':'');});
    document.getElementById('huntBox').style.display='none';
    document.getElementById('phonicsBox').style.display='none';
    synth.cancel(); if(speakTimer){clearTimeout(speakTimer);speakTimer=null;}
    if(currentStep===0) renderStep1(tier);
    else if(currentStep===1) renderStep2(tier);
    else renderStep3(tier);
  }

  // STEP 1
  function renderStep1(tier) {
    sentences=splitSentences(tier.text); readMode='full';
    renderSentences(tier.text,'listen'); renderWordCards(); renderTranslation(tier.chineseText);
    document.getElementById('actionArea').innerHTML=
      '<div class="read-mode-toggle">'+
        '<button class="btn btn-sm btn-primary" id="btnFull" onclick="App.setReadMode(\'full\')">整篇朗讀</button>'+
        '<button class="btn btn-sm" id="btnSent" onclick="App.setReadMode(\'sentence\')">逐句朗讀</button>'+
      '</div>'+
      '<button class="btn btn-primary" id="playBtn" onclick="App.playStory()">🔊 開始朗讀</button>'+
      '<button class="btn btn-success" id="nextStepBtn" onclick="App.nextStep()" style="display:none">下一步 →</button>';
  }
  function setReadMode(m) {
    readMode=m; synth.cancel(); if(speakTimer){clearTimeout(speakTimer);speakTimer=null;} clearHL();
    document.getElementById('btnFull').className='btn btn-sm'+(m==='full'?' btn-primary':'');
    document.getElementById('btnSent').className='btn btn-sm'+(m==='sentence'?' btn-primary':'');
    const pb=document.getElementById('playBtn'); if(pb){pb.textContent='🔊 開始朗讀';pb.onclick=()=>App.playStory();}
  }
  function renderSentences(text,mode) {
    document.getElementById('storyDisplay').innerHTML=splitSentences(text).map((s,i)=>
      '<span class="story-sentence" id="ss'+i+'" data-idx="'+i+'" data-mode="'+mode+'" onclick="App.onSentenceClick(this)">'+s+'</span>'
    ).join(' ');
  }
  function clearHL() { document.querySelectorAll('.story-sentence').forEach(s=>s.classList.remove('highlight')); }
  function hlSentence(i) { clearHL(); const el=document.getElementById('ss'+i); if(el)el.classList.add('highlight'); }
  function onSentenceClick(el) {
    const idx=parseInt(el.dataset.idx); const mode=el.dataset.mode;
    if(mode==='listen'||mode==='phonics'){
      synth.cancel(); if(speakTimer){clearTimeout(speakTimer);speakTimer=null;}
      hlSentence(idx); const u=speak(sentences[idx],0.8); u.onend=()=>clearHL();
    }
  }
  function playStory() {
    synth.cancel(); if(speakTimer){clearTimeout(speakTimer);speakTimer=null;} clearHL();
    readMode==='full'?playFull(0):playSent(0);
  }
  function playFull(i) {
    if(i>=sentences.length){clearHL();showNSBtn();return;}
    hlSentence(i); const u=speak(sentences[i],0.8); u.onend=()=>{speakTimer=setTimeout(()=>playFull(i+1),350);};
  }
  function playSent(i) {
    if(i>=sentences.length){clearHL();showNSBtn();return;}
    hlSentence(i); const u=speak(sentences[i],0.8);
    u.onend=()=>{
      clearHL();
      const pb=document.getElementById('playBtn');
      if(pb){pb.textContent=i<sentences.length-1?'▶ 下一句':'✓ 聽完了';pb.onclick=()=>{i<sentences.length-1?playSent(i+1):showNSBtn();};}
    };
  }
  function showNSBtn() {
    const pb=document.getElementById('playBtn'); if(pb){pb.textContent='🔊 再聽一次';pb.onclick=()=>playStory();}
    const nb=document.getElementById('nextStepBtn'); if(nb)nb.style.display='block';
  }
  function renderWordCards() {
    const old=document.getElementById('wordCardsArea'); if(old)old.remove();
    const div=document.createElement('div'); div.id='wordCardsArea'; div.className='word-cards-area';
    div.innerHTML=selectedWords.map(w=>
      '<div class="word-card" onclick="App.speak(\''+w.english+'\')">'+
        '<div class="word-card-en">'+w.english+'</div>'+
        '<div class="word-card-zh">'+w.chinese+'・'+(POS_MAP[w.partOfSpeech]||'—')+'</div>'+
        '<div class="word-card-icon">🔊</div>'+
      '</div>'
    ).join('');
    document.getElementById('storyCard').parentNode.insertBefore(div,document.getElementById('storyCard'));
  }
  function renderTranslation(ct) {
    let el=document.getElementById('translationArea');
    if(!el){el=document.createElement('div');el.id='translationArea';el.className='translation-area';document.getElementById('storyCard').after(el);}
    el.innerHTML='<button class="translation-toggle" onclick="App.toggleTranslation()">查看中文翻譯 ▾</button>'+
      '<div class="translation-text" id="translationText" style="display:none">'+(ct||'（翻譯載入中）')+'</div>';
  }
  function toggleTranslation() {
    const txt=document.getElementById('translationText'); const btn=document.querySelector('.translation-toggle'); if(!txt)return;
    const open=txt.style.display==='none'; txt.style.display=open?'block':'none'; btn.textContent=open?'收起翻譯 ▴':'查看中文翻譯 ▾';
  }
  function cleanupExtras() { ['wordCardsArea','translationArea'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();}); }

  // STEP 2 – Word Hunt (no color hints, audio only)
  function renderStep2(tier) {
    huntIndex=0; huntQuestions=tier.hunts; cleanupExtras();
    // Render plain text (no clickable words for hints)
    document.getElementById('storyDisplay').innerHTML=
      '<span style="font-size:22px;line-height:1.9">'+tier.text+'</span>';
    // Make words clickable for answering
    const parts=tier.text.split(/(\s+)/);
    document.getElementById('storyDisplay').innerHTML=parts.map((p,i)=>{
      if(!/\S/.test(p)) return p;
      const clean=p.replace(/[^a-zA-Z']/g,'').toLowerCase();
      return '<span class="story-word" data-word="'+clean+'" onclick="App.onWordClick(this)">'+p+'</span>';
    }).join('');
    document.getElementById('actionArea').innerHTML='';
    showNextHunt();
  }
  function showNextHunt() {
    if(huntIndex>=huntQuestions.length){
      document.getElementById('huntBox').style.display='none';
      document.getElementById('actionArea').innerHTML='<button class="btn btn-success" onclick="App.nextStep()">下一步 →</button>';
      return;
    }
    const q=huntQuestions[huntIndex];
    const hb=document.getElementById('huntBox'); hb.style.display='block';
    hb.innerHTML='🎯 '+q.question+'<br>'+
      '<button class="btn btn-sm" style="width:auto;margin-top:8px" onclick="App.replayHunt()">🔊 再聽一次</button>';
    // Play audio of the answer word
    setTimeout(()=>speak(q.answer,0.7),300);
    // Clear previous highlights
    document.querySelectorAll('.story-word').forEach(s=>s.classList.remove('hunt-correct','hunt-wrong'));
  }
  function replayHunt() { if(huntQuestions[huntIndex]) speak(huntQuestions[huntIndex].answer,0.7); }
  function onWordClick(el) {
    const word=el.dataset.word;
    const q=huntQuestions[huntIndex]; if(!q) return;
    if(word===q.answer.toLowerCase()){
      el.classList.add('hunt-correct'); speak(word); showToast('✓ 答對了！');
      huntIndex++; setTimeout(showNextHunt,900);
    } else {
      if(practiceWordData[word]) practiceWordData[word].huntErrors++;
      el.classList.add('hunt-wrong'); setTimeout(()=>el.classList.remove('hunt-wrong'),600);
    }
  }

  // STEP 3
  function renderStep3(tier) {
    sentences=splitSentences(tier.text); renderSentences(tier.text,'phonics');
    renderWordCards(); renderTranslation(tier.chineseText);
    document.getElementById('phonicsBox').style.display='none';
    document.getElementById('actionArea').innerHTML=
      '<div style="color:var(--text-muted);font-size:14px;margin-bottom:10px;text-align:center">'+
        '🎤 用手指著每個字，大聲念出來！<br>'+
        '<span style="font-size:12px">點句子聽發音・點不會的字聽拆音</span>'+
      '</div>'+
      '<button class="btn btn-success" onclick="App.nextStep()">我讀完了 ✓</button>';
    // Make words clickable for phonics
    const parts=storyData[TIER_KEYS[currentTier]].text.split(/(\s+)/);
    document.getElementById('storyDisplay').innerHTML=splitSentences(tier.text).map((s,i)=>
      '<span class="story-sentence" id="ss'+i+'" data-idx="'+i+'" data-mode="phonics" onclick="App.onSentenceClick(this)">'+s+'</span>'
    ).join(' ');
  }
  function triggerPhonics(word) {
    if(!word) return;
    if(practiceWordData[word]) practiceWordData[word].phonicsUsed=true;
    const box=document.getElementById('phonicsBox'); box.style.display='block';
    const c=word.replace(/[^a-z]/g,'');
    box.textContent=(c.length<=3?'/'+c+'/ → '+word:'/'+c.slice(0,Math.ceil(c.length/2))+'/ ··· /'+c.slice(Math.ceil(c.length/2))+'/ → '+word);
    speak(word,0.6);
  }
  function nextStep() {
    cleanupExtras(); currentStep++;
    if(currentStep>2){currentStep=0;currentTier++;if(currentTier>2){showEval();return;}}
    renderTierStep();
  }
  function confirmExitPractice() { if(confirm('確定要離開練習嗎？進度將不會儲存。')){cleanupExtras();goTo('screenHome');} }

  // ── EVAL ───────────────────────────────────────────────
  function showEval() {
    evalDiffRating=null;
    document.querySelectorAll('#screenEval .difficulty-btn').forEach(b=>b.classList.remove('selected'));
    document.getElementById('evalWordBtns').innerHTML=Object.keys(practiceWordData).map(w=>
      '<button class="eval-word-btn" data-word="'+w+'" onclick="this.classList.toggle(\'selected\')">'+w+'</button>'
    ).join('');
    const ba=document.getElementById('bonusWordsArea');
    if(ba){
      if(bonusWords.length){
        ba.style.display='block';
        document.getElementById('bonusWordList').innerHTML=bonusWords.map((w,i)=>
          '<div class="bonus-word-row"><label class="bonus-check">'+
            '<input type="checkbox" id="bonus'+i+'">'+
            '<span class="bonus-en">'+w.english+'</span>'+
            '<span class="bonus-zh">'+w.chinese+'・'+(POS_MAP[w.partOfSpeech]||'—')+'</span>'+
            '<button class="btn btn-sm" onclick="App.speak(\''+w.english+'\')" style="width:auto;margin:0">🔊</button>'+
          '</label></div>'
        ).join('');
      } else ba.style.display='none';
    }
    goTo('screenEval');
  }
  function selectEvalDifficulty(btn) {
    document.querySelectorAll('#screenEval .difficulty-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected'); evalDiffRating=btn.dataset.rating;
  }
  function clearEvalWords() { document.querySelectorAll('.eval-word-btn').forEach(b=>b.classList.remove('selected')); }
  async function submitEval() {
    if(!evalDiffRating){showToast('請選擇今天的難度感受');return;}
    const selfUnsure=Array.from(document.querySelectorAll('.eval-word-btn.selected')).map(b=>b.dataset.word);
    const newM=[],newS=[];
    Object.entries(practiceWordData).forEach(([word,d])=>{
      const bad=d.huntErrors>1||d.phonicsUsed||selfUnsure.includes(word);
      (bad?newS:newM).push(word);
    });
    const exM=currentStudent.masteredWords  ?currentStudent.masteredWords.split(',').filter(Boolean):[];
    const exS=currentStudent.strugglingWords?currentStudent.strugglingWords.split(',').filter(Boolean):[];
    const fM=[...new Set([...exM,...newM])].filter(w=>!newS.includes(w));
    const fS=[...new Set([...exS,...newS])].filter(w=>!newM.includes(w));
    const cb=bonusWords.filter((w,i)=>{const e=document.getElementById('bonus'+i);return e&&e.checked;});
    showLoading('儲存練習結果...');
    try {
      await gasPost({action:'updateStudent',studentId:currentStudent.studentId,masteredWords:fM.join(','),strugglingWords:fS.join(',')});
      await gasPost({action:'saveSession',studentId:currentStudent.studentId,theme:selectedTheme,words:Object.keys(practiceWordData).join(','),difficulty:currentStudent.difficulty,difficultyRating:evalDiffRating,masteredResult:newM.join(','),strugglingResult:newS.join(',')});
      for(const w of cb) await gasPost({action:'addWord',studentId:currentStudent.studentId,english:w.english,chinese:w.chinese,difficulty:w.difficulty,partOfSpeech:w.partOfSpeech});
      currentStudent.masteredWords=fM.join(','); currentStudent.strugglingWords=fS.join(','); lsUpdate(currentStudent);
      if(cb.length) currentWords=await gasGet({action:'getWords',studentId:currentStudent.studentId});
      hideLoading();
      let msg='完成了 '+Object.keys(practiceWordData).length+' 個單字的練習！';
      if(cb.length) msg+=' 並新增了 '+cb.length+' 個新單字！';
      document.getElementById('doneMsg').textContent=msg;
      document.getElementById('doneStats').innerHTML=
        '<div class="stat-box success"><div class="stat-num">'+newM.length+'</div><div class="stat-label">本次掌握</div></div>'+
        '<div class="stat-box warning"><div class="stat-num">'+newS.length+'</div><div class="stat-label">繼續加油</div></div>';
      goTo('screenDone');
    } catch(e){hideLoading();showToast('儲存失敗，請重試');}
  }

  // ── PHONICS QUIZ ───────────────────────────────────────
  async function startPhonicsQuiz() {
    const active=currentWords.filter(w=>(w.status||'active')==='active'&&w.english.length>=4);
    if(active.length<1){showToast('需要至少1個4字母以上的單字才能測驗！');return;}
    showLoading('AI 正在出題...');
    try {
      const r=await gasPost({action:'generatePhonicsQuiz',studentId:currentStudent.studentId,difficulty:currentStudent.difficulty});
      hideLoading(); if(r.error){showToast('錯誤：'+r.error);return;}
      phonicsQuestions=r.questions; phonicsIdx=0; quizCorrect=0; quizWrong=0;
      goTo('screenPhonics'); renderPhonicsQuestion();
    } catch(e){hideLoading();showToast('出題失敗，請重試');}
  }
  function renderPhonicsQuestion() {
    if(phonicsIdx>=phonicsQuestions.length){showQuizDone('phonics');return;}
    const q=phonicsQuestions[phonicsIdx];
    const total=phonicsQuestions.length;
    document.getElementById('phonicsProgress').textContent=(phonicsIdx+1)+'/'+total;
    document.getElementById('phonicsProgressBar').style.width=(phonicsIdx/total*100)+'%';
    document.getElementById('phonicsDisplay').textContent=q.display;
    document.getElementById('phoneticsChinese').textContent=q.chinese+'・'+(POS_MAP[q.partOfSpeech]||'');
    document.getElementById('phonicsFeedback').textContent='';
    document.getElementById('phonicsAction').innerHTML='';
    // Shuffle options
    const opts=[q.answer,...q.distractors].sort(()=>Math.random()-0.5);
    document.getElementById('phonicsChips').innerHTML=opts.map(o=>
      '<button class="phonics-chip" data-val="'+o+'" onclick="App.selectPhonicsChip(this,\''+q.answer+'\',\''+q.word+'\',\''+q.wordId+'\')">'+o+'</button>'
    ).join('');
    // Auto-play
    setTimeout(()=>speak(q.word,0.7),400);
  }
  function replayPhonics() { const q=phonicsQuestions[phonicsIdx]; if(q) speak(q.word,0.7); }
  async function selectPhonicsChip(el,answer,word,wordId) {
    document.querySelectorAll('.phonics-chip').forEach(c=>c.style.pointerEvents='none');
    const correct=el.dataset.val===answer;
    el.classList.add(correct?'correct':'wrong');
    if(correct){
      quizCorrect++;
      document.getElementById('phonicsFeedback').innerHTML='<span style="color:var(--success)">✓ 正確！是 '+word+' ！</span>';
      speak(word,0.8);
    } else {
      quizWrong++;
      document.getElementById('phonicsFeedback').innerHTML='<span style="color:var(--danger)">✗ 答案是「'+answer+'」</span>';
      document.querySelectorAll('.phonics-chip').forEach(c=>{if(c.dataset.val===answer)c.classList.add('correct');});
    }
    // Update word streak in GAS
    if(wordId) gasPost({action:'updateWordResult',wordId,correct}).catch(()=>{});
    document.getElementById('phonicsAction').innerHTML=
      '<button class="btn btn-primary" onclick="App.nextPhonics()">'+(phonicsIdx<phonicsQuestions.length-1?'下一題 →':'查看結果')+'</button>';
  }
  function nextPhonics() { phonicsIdx++; renderPhonicsQuestion(); }

  // ── CLOZE QUIZ ─────────────────────────────────────────
  async function startClozeQuiz() {
    const active=currentWords.filter(w=>(w.status||'active')==='active');
    if(active.length<4){showToast('需要至少4個練習中的單字才能測驗！');return;}
    showLoading('AI 正在出題...');
    try {
      const r=await gasPost({action:'generateClozeQuiz',studentId:currentStudent.studentId});
      hideLoading(); if(r.error){showToast('錯誤：'+r.error);return;}
      clozeQuestions=r.questions; clozeIdx=0; quizCorrect=0; quizWrong=0;
      goTo('screenCloze'); renderClozeQuestion();
    } catch(e){hideLoading();showToast('出題失敗，請重試');}
  }
  function renderClozeQuestion() {
    if(clozeIdx>=clozeQuestions.length){showQuizDone('cloze');return;}
    const q=clozeQuestions[clozeIdx];
    const total=clozeQuestions.length;
    document.getElementById('clozeProgress').textContent=(clozeIdx+1)+'/'+total;
    document.getElementById('clozeProgressBar').style.width=(clozeIdx/total*100)+'%';
    // Replace blank word with underline
    const display=q.sentence.replace('___','<span class="cloze-blank">＿＿＿</span>');
    document.getElementById('clozeSentence').innerHTML=display;
    document.getElementById('clozeFeedback').textContent='';
    document.getElementById('clozeAction').innerHTML='';
    const opts=q.options.sort(()=>Math.random()-0.5);
    document.getElementById('clozeOptions').innerHTML=opts.map(o=>
      '<button class="cloze-option" data-val="'+o+'" onclick="App.selectClozeOption(this,\''+q.answer+'\',\''+q.wordId+'\')">'+o+'</button>'
    ).join('');
    // Read sentence aloud
    setTimeout(()=>speak(q.sentence.replace('___','blank'),0.8),400);
  }
  async function selectClozeOption(el,answer,wordId) {
    document.querySelectorAll('.cloze-option').forEach(c=>c.style.pointerEvents='none');
    const correct=el.dataset.val===answer;
    el.classList.add(correct?'correct':'wrong');
    if(correct){
      quizCorrect++;
      document.getElementById('clozeFeedback').innerHTML='<span style="color:var(--success)">✓ 正確！</span>';
      // Show completed sentence
      const q=clozeQuestions[clozeIdx];
      document.getElementById('clozeSentence').innerHTML=q.sentence.replace('___','<span style="color:var(--success);font-weight:500">'+answer+'</span>');
      speak(q.sentence.replace('___',answer),0.8);
    } else {
      quizWrong++;
      document.getElementById('clozeFeedback').innerHTML='<span style="color:var(--danger)">✗ 正確答案是「'+answer+'」</span>';
      document.querySelectorAll('.cloze-option').forEach(c=>{if(c.dataset.val===answer)c.classList.add('correct');});
    }
    if(wordId) gasPost({action:'updateWordResult',wordId,correct}).catch(()=>{});
    document.getElementById('clozeAction').innerHTML=
      '<button class="btn btn-primary" onclick="App.nextCloze()">'+(clozeIdx<clozeQuestions.length-1?'下一題 →':'查看結果')+'</button>';
  }
  function nextCloze() { clozeIdx++; renderClozeQuestion(); }

  // ── QUIZ DONE ──────────────────────────────────────────
  function showQuizDone(type) {
    const total=quizCorrect+quizWrong;
    const pct=total?Math.round(quizCorrect/total*100):0;
    const emoji=pct>=80?'🏆':pct>=60?'😊':'💪';
    const title=pct>=80?'太厲害了！':pct>=60?'做得不錯！':'繼續加油！';
    document.getElementById('quizDoneEmoji').textContent=emoji;
    document.getElementById('quizDoneTitle').textContent=title;
    document.getElementById('quizDoneMsg').textContent=(type==='phonics'?'拼音測驗':'克漏字測驗')+' 完成！正確率 '+pct+'%';
    document.getElementById('quizDoneStats').innerHTML=
      '<div class="stat-box success"><div class="stat-num">'+quizCorrect+'</div><div class="stat-label">答對</div></div>'+
      '<div class="stat-box danger" style="background:var(--danger-light)"><div class="stat-num" style="color:var(--danger)">'+quizWrong+'</div><div class="stat-label" style="color:var(--danger)">答錯</div></div>';
    goTo('screenQuizDone');
  }

  function confirmExitQuiz() { if(confirm('確定要離開測驗嗎？')){goTo('screenQuizMenu');} }

  // ── INIT ───────────────────────────────────────────────
  window.addEventListener('load', loadStudents);

  return {
    goTo,showAddStudentForm,hideAddStudentForm,selectLevel,addStudent,
    selectStudent,updateHomeScreen,setWordFilter,renderWordList,reactivateWord,
    translateWord,speakWord,addWordConfirm,startPracticeFlow,selectTheme,generateStory,
    playStory,setReadMode,onSentenceClick,onWordClick,replayHunt,nextStep,
    confirmExitPractice,showEval,selectEvalDifficulty,clearEvalWords,submitEval,
    speak,toggleTranslation,startPhonicsQuiz,replayPhonics,selectPhonicsChip,nextPhonics,
    startClozeQuiz,selectClozeOption,nextCloze,confirmExitQuiz
  };
})();
