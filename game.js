// game.js — Versión TV 2020 extendida

const PRIZES = [
  1000, 2000, 3000, 5000, 10000,
  20000, 40000, 80000, 160000, 320000,
  640000, 1250000, 2500000, 5000000, 10000000
];

let questions = [];
let currentIndex = 0;
let gameOver = false;
let correctCount = 0;
let wrongCount = 0;

// Estados del comodín
let lifelineUsedEarly = false;
let lifelineUsedMiddle = false;
let lifelineUsedFinal = false;
let lifelineDisabledForRest = false;
let lifelineUsedThisQuestion = false;

// Estados de pregunta
let selectedAnswerIndex = null;
let revealedThisQuestion = false;

// Escalera
let lastActiveLadderItem = null;

// ----- DOM -----
const questionTextEl = document.getElementById("question-text");
const questionNumberEl = document.getElementById("question-number");
const difficultyLabelEl = document.getElementById("difficulty-label");
const prizeLabelEl = document.getElementById("prize-label");
const messageBoxEl = document.getElementById("message-box");

const lifelineBtn = document.getElementById("lifeline-5050");
const revealBtn = document.getElementById("reveal-btn");
const nextBtn = document.getElementById("next-btn");
const restartBtn = document.getElementById("restart-btn");

const ladderListEl = document.getElementById("ladder-list");
const answerButtons = Array.from(document.querySelectorAll(".answer-btn"));

const fileInput = document.getElementById("file-input");
const loadFileBtn = document.getElementById("load-file-btn");
const muteBtn = document.getElementById("mute-btn");

// Pantalla de inicio y overlay de victoria
const startScreen = document.getElementById("start-screen");
const startBtn = document.getElementById("start-btn");

const winOverlay = document.getElementById("win-overlay");
const winMessageEl = document.getElementById("win-message");
const winRestartBtn = document.getElementById("win-restart-btn");

// ----------------------------------------------------
// 🔊 AUDIO

/* ----------------------------------------------------
   ⚡ OPTIMIZACIÓN DE AUDIO — PRELOAD
   Reduce latencia en efectos de sonido
---------------------------------------------------- */
const PRELOAD_AUDIO_PATHS = [
  // Correctas
  "audio/Yes01.ogg","audio/Yes06.ogg","audio/Yes07.ogg","audio/Yes08.ogg","audio/Yes09.ogg",
  "audio/Yes10.mp3","audio/Yes11.ogg","audio/Yes12.ogg","audio/Yes13.ogg","audio/Yes14.ogg","audio/Yes99.ogg",
  // Incorrectas
  "audio/No01.ogg","audio/No06.mp3","audio/No07.mp3","audio/No08.mp3","audio/No09.mp3",
  "audio/No10.mp3","audio/No11.mp3","audio/No12.mp3","audio/No13.mp3","audio/No14.mp3","audio/No15.mp3",
  // Let's Play
  "audio/Q6_Lets_Play.ogg","audio/Q11_Lets_Play.ogg",
  // Background
  "audio/01-facil.ogg","audio/02-medio.mp3","audio/03-dificil.mp3",
  // Intro
  "audio/intro_theme.ogg"
];

const AUDIO_CACHE = {};

function preloadAudio() {
  PRELOAD_AUDIO_PATHS.forEach(path => {
    try {
      const a = new Audio(path);
      a.preload = "auto";
      a.load();
      AUDIO_CACHE[path] = a;
    } catch (e) {}
  });
}

// Ejecutar preload tras primera interacción del usuario
document.addEventListener("click", () => {
  preloadAudio();
}, { once: true });


// ----------------------------------------------------

let audioEnabled = true;

// 🎵 Música de pantalla de inicio
const introTheme = new Audio("audio/intro_theme.mp3");
introTheme.loop = true;
introTheme.volume = 0.6;

// Música de fondo según bloque
const bgTracks = {
  easy: new Audio("audio/01-facil.ogg"),   // 1–5
  medium: new Audio("audio/02-medio.mp3"), // 6–10
  hard: new Audio("audio/03-dificil.mp3")  // 11–15
};

Object.values(bgTracks).forEach(a => {
  a.loop = true;
  a.volume = 0.42;
});

let currentBgTrack = null;

// Para evitar que la música arranque durante Let's Play
let bgMusicLocked = false;

// LET'S PLAY (transiciones)
const letsPlay6 = new Audio("audio/Q6_Lets_Play.ogg");   // 5→6
letsPlay6.volume = 1;

const letsPlay11 = new Audio("audio/Q11_Lets_Play.ogg"); // 10→11
letsPlay11.volume = 1;

// Intento de reproducir el tema de inicio (al cargar la página)
introTheme.play().catch(() => {});

// Crear SFX
function makeSfx(path, volume = 1.0) {
  const a = new Audio(path);
  a.volume = volume;
  return a;
}

/**
 * Reproduce un SFX.
 * - Si fade = true, baja volumen durante ~7 s.
 */
function playSfx(audio, fade = false) {
  if (!audioEnabled || !audio) return;

  try {
    audio.currentTime = 0;
    audio.volume = 1;
    audio.play();

    if (fade) {
      const fadeDuration = 7000;
      const stepMs = 50;
      const steps = fadeDuration / stepMs;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        const newVol = Math.max(0, 1 - step / steps);
        audio.volume = newVol;

        if (newVol <= 0.01 || step >= steps) {
          clearInterval(interval);
          audio.pause();
        }
      }, stepMs);
    }
  } catch (e) {}
}

// ----------------------------------------------------
// 🎵 Música de fondo según número de pregunta
// ----------------------------------------------------

function getBgKeyForQuestion(q) {
  if (q <= 5) return "easy";
  if (q <= 10) return "medium";
  return "hard";
}

function stopAllBgMusic() {
  Object.values(bgTracks).forEach(a => a.pause());
  currentBgTrack = null;
}

function updateBgMusicForCurrentQuestion() {
  if (!audioEnabled || questions.length === 0 || gameOver) {
    stopAllBgMusic();
    return;
  }

  // Si está bloqueada (Let's Play), no arrancamos música
  if (bgMusicLocked) return;

  const qNum = currentIndex + 1;
  const key = getBgKeyForQuestion(qNum);
  const track = bgTracks[key];

  if (!track) return;

  if (currentBgTrack === track && !track.paused) return;

  stopAllBgMusic();
  try {
    track.currentTime = 0;
    track.play();
    currentBgTrack = track;
  } catch (e) {}
}

// Fade-out para el tema de inicio
function stopIntroTheme(fade = true) {
  if (!introTheme) return;
  if (!fade) {
    introTheme.pause();
    introTheme.currentTime = 0;
    introTheme.volume = 0.6;
    return;
  }
  let step = 0;
  const steps = 40;
  const startVol = introTheme.volume;
  const interval = setInterval(() => {
    step++;
    const v = Math.max(0, startVol * (1 - step / steps));
    introTheme.volume = v;
    if (step >= steps) {
      clearInterval(interval);
      introTheme.pause();
      introTheme.currentTime = 0;
      introTheme.volume = startVol;
    }
  }, 50);
}

// ----------------------------------------------------
// 🎬 LET'S PLAY — transición de bloques
// ----------------------------------------------------

function playLetsPlay(sfx) {
  if (!audioEnabled || !sfx) {
    updateBgMusicForCurrentQuestion();
    return;
  }

  try {
    stopAllBgMusic();
    bgMusicLocked = true;
    sfx.currentTime = 0;
    sfx.volume = 1;
    sfx.play();

    // 8 segundos de transición
    setTimeout(() => {
      try { sfx.pause(); } catch (e) {}
      bgMusicLocked = false;
      updateBgMusicForCurrentQuestion();
    }, 8000);
  } catch (e) {
    bgMusicLocked = false;
    updateBgMusicForCurrentQuestion();
  }
}

// ----------------------------------------------------
// ✔ Sonidos CORRECTO según número de pregunta
// ----------------------------------------------------

function getCorrectSfxPath(q) {
  if (q >= 1 && q <= 5) return "audio/Yes01.ogg";
  if (q >= 6 && q <= 9) return `audio/Yes0${q}.ogg`;
  if (q === 10) return "audio/Yes10.mp3";
  if (q >= 11 && q <= 13) return `audio/Yes${q}.ogg`;
  if (q === 14 || q === 15) return "audio/Yes14.ogg";
  return null;
}

// ----------------------------------------------------
// ✖ Sonidos INCORRECTO según número de pregunta
// ----------------------------------------------------

function getWrongSfxPath(q) {
  if (q >= 1 && q <= 5) return "audio/No01.ogg";
  if (q >= 6 && q <= 15) {
    const num = q.toString().padStart(2, "0");
    return `audio/No${num}.mp3`;
  }
  return null;
}

function playQuestionSfx(isCorrect) {
  const qNum = currentIndex + 1;

  if (isCorrect) {
    const path = getCorrectSfxPath(qNum);
    if (!path) return;
    const sfx = makeSfx(path, 1.0);
    playSfx(sfx, true); // fade-out
  } else {
    const path = getWrongSfxPath(qNum);
    if (!path) return;
    const sfx = makeSfx(path, 1.0);
    playSfx(sfx, false); // sin fade
  }
}

// ----------------------------------------------------
// 🏆 Sonido final Yes99 (sin fade)
// ----------------------------------------------------

function playFinalWinSfx() {
  const sfx = makeSfx("audio/Yes99.ogg", 1.0);
  playSfx(sfx, false);
}

// ----------------------------------------------------
// 📌 Utilidades varias
// ----------------------------------------------------

function getDifficultyLabel(q) {
  if (q <= 5) return "Fácil";
  if (q <= 10) return "Media";
  return "Difícil";
}

function getStage(q) {
  if (q <= 5) return "early";
  if (q <= 10) return "middle";
  return "final";
}

function formatPrize(x) {
  return "$" + x.toLocaleString("es-CL");
}

// ----------------------------------------------------
// 📥 CARGAR PREGUNTAS JSON
// ----------------------------------------------------

function applyQuestionsFromData(data, msg) {
  questions = data.questions || [];
  questions.sort((a, b) => a.id - b.id);

  if (questions.length < 15) {
    questionTextEl.textContent = "El set necesita mínimo 15 preguntas.";
    return;
  }

  initLadder();
  startGame();
  messageBoxEl.textContent = msg;
}

function initLadder() {
  ladderListEl.innerHTML = "";
  for (let i = PRIZES.length - 1; i >= 0; i--) {
    const li = document.createElement("li");
    li.dataset.q = i + 1;
    li.innerHTML = `<span>${i + 1}</span><span>${formatPrize(PRIZES[i])}</span>`;
    ladderListEl.appendChild(li);
  }
  lastActiveLadderItem = null;
}

function updateLadderActive() {
  ladderListEl.querySelectorAll("li").forEach(li => {
    li.classList.remove("active");
    li.classList.remove("ladder-advance");
  });

  const currentQ = currentIndex + 1;
  const active = ladderListEl.querySelector(`li[data-q="${currentQ}"]`);
  if (active) {
    active.classList.add("active");

    if (lastActiveLadderItem !== active) {
      active.classList.add("ladder-advance");
      setTimeout(() => {
        active.classList.remove("ladder-advance");
      }, 900);
    }

    lastActiveLadderItem = active;
  }
}

// ----------------------------------------------------
// 🏁 Overlay de final de juego (gane o pierda)
// ----------------------------------------------------
function showEndOverlay(isWin, message, titleText) {
  if (!winOverlay || !winMessageEl) return;

  const titleEl = winOverlay.querySelector("h2");

  if (titleEl) {
    titleEl.textContent = titleText || (isWin ? "¡FELICIDADES!" : "Fin del juego");
  }

  winMessageEl.textContent = message;
  winOverlay.classList.remove("hidden");
}


// ----------------------------------------------------
// 🎮 INICIO DE JUEGO
// ----------------------------------------------------

function startGame() {
  stopIntroTheme(true); // apaga tema de inicio si aún suena

  currentIndex = 0;
  gameOver = false;

  selectedAnswerIndex = null;
  revealedThisQuestion = false;

  lifelineUsedEarly = false;
  lifelineUsedMiddle = false;
  lifelineUsedFinal = false;
  lifelineDisabledForRest = false;
  lifelineUsedThisQuestion = false;

  correctCount = 0;
  wrongCount = 0;

  updateUIForQuestion();
  updateBgMusicForCurrentQuestion();
}

// ----------------------------------------------------
// 🖥 Actualizar la UI por cada pregunta
// ----------------------------------------------------

function updateUIForQuestion() {
  const q = questions[currentIndex];
  const num = currentIndex + 1;

  revealedThisQuestion = false;
  selectedAnswerIndex = null;
  lifelineUsedThisQuestion = false;

  // Glow de la caja de pregunta
  const questionBox = document.getElementById("question-box");
  if (questionBox) {
    questionBox.classList.add("active-glow");
  }

  // Texto de la pregunta
  questionTextEl.textContent = q.question;

  // ✨ Animación Zoom / Fade-Slide
  questionTextEl.classList.remove("question-animate");
  void questionTextEl.offsetWidth;
  questionTextEl.classList.add("question-animate");

  // Datos superiores
  questionNumberEl.textContent = `Pregunta ${num} / 15`;
  difficultyLabelEl.textContent = `Dificultad: ${getDifficultyLabel(num)}`;
  prizeLabelEl.textContent = `Premio actual: ${
    currentIndex === 0 ? "$0" : formatPrize(PRIZES[currentIndex - 1])
  }`;

  // Respuestas
  answerButtons.forEach((btn, i) => {
    btn.textContent = `${String.fromCharCode(65 + i)}. ${q.options[i]}`;
    btn.className = "answer-btn";
    btn.disabled = false;
  });

  updateLifelineButtonState();
  updateLadderActive();
  messageBoxEl.textContent = "";

  revealBtn.disabled = false;

  if (nextBtn) nextBtn.disabled = true;

  updateBgMusicForCurrentQuestion();
}

// ----------------------------------------------------
// 🔚 Terminar juego
// ----------------------------------------------------

function endGame(win) {
  gameOver = true;

  answerButtons.forEach(btn => (btn.disabled = true));
  lifelineBtn.disabled = true;
  revealBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;

  stopAllBgMusic();

  if (win) {
    const finalPrize = formatPrize(PRIZES[14]);
    messageBoxEl.textContent =
      `🎉 ¡Ganaste! Premio: ${finalPrize}`;

    // Sonido final sin fade
    playFinalWinSfx();

    // Overlay de victoria
    showEndOverlay(
      true,
      `¡Has ganado el premio máximo de ${finalPrize}!`,
      "¡FELICIDADES!"
    );
  } else {
    const safe = currentIndex === 0 ? 0 : PRIZES[currentIndex - 1];
    const safeText = formatPrize(safe);
    messageBoxEl.textContent =
      `❌ Fallaste. Te llevas ${safeText}.`;

    // Overlay de derrota (con lo que alcanzó a ganar)
    showEndOverlay(
      false,
      `Te llevas ${safeText}.`,
      "Fin del juego"
    );
  }
}

// ----------------------------------------------------
// 🖱 Seleccionar respuesta
// ----------------------------------------------------

function handleAnswerSelect(i) {
  if (gameOver || revealedThisQuestion) return;
  if (answerButtons[i].disabled) return;

  selectedAnswerIndex = i;

  answerButtons.forEach(b => b.classList.remove("selected"));
  answerButtons[i].classList.add("selected");

  messageBoxEl.textContent =
    `Has seleccionado la opción ${String.fromCharCode(65 + i)}. Pulsa "Revelar respuesta".`;
}

// ----------------------------------------------------
// 👁 Revelar la respuesta
// ----------------------------------------------------

function revealAnswer() {
  if (gameOver || revealedThisQuestion) return;

  if (selectedAnswerIndex === null) {
    messageBoxEl.textContent = "Selecciona una respuesta primero.";
    return;
  }

  revealedThisQuestion = true;
  lifelineBtn.disabled = true;

  const q = questions[currentIndex];
  const correct = q.correctIndex;

  const correctBtn = answerButtons[correct];
  correctBtn.classList.remove("selected");
  correctBtn.classList.add("correct");
  correctBtn.classList.add("flash-correct");

  answerButtons.forEach(btn => (btn.disabled = true));

  const isCorrect = selectedAnswerIndex === correct;
  playQuestionSfx(isCorrect);

  if (!isCorrect) {
    const sel = answerButtons[selectedAnswerIndex];
    sel.classList.add("incorrect");
    messageBoxEl.textContent = "❌ Respuesta incorrecta.";

    setTimeout(() => {
      correctBtn.classList.remove("flash-correct");
      endGame(false);
    }, 1500);

  } else {
    // ✨ CORRECTA
    messageBoxEl.textContent = "✅ ¡Correcto!";

    setTimeout(() => {
      correctBtn.classList.remove("flash-correct");

      // Pregunta 15 = Fin
      if (currentIndex === questions.length - 1) {
        endGame(true);
      } else {
        // Activar botón siguiente
        messageBoxEl.textContent =
          "✅ ¡Correcto! Pulsa \"Siguiente pregunta\" para continuar.";
        if (nextBtn) nextBtn.disabled = false;
      }
    }, 1500);
  }
}

// ----------------------------------------------------
// ⏭ PASAR A LA SIGUIENTE PREGUNTA (solo si acertaste)
// ----------------------------------------------------

function goToNextQuestion() {
  if (gameOver) return;
  if (currentIndex >= questions.length - 1) return;

  const prevQNum = currentIndex + 1;

  currentIndex++;
  updateUIForQuestion();

  const newQNum = currentIndex + 1;

  // 🌟 LET'S PLAY TRANSICIONES CORRECTAS
  // 5 → 6  → Q6 Let's Play
  // 10 → 11 → Q11 Let's Play
  if (prevQNum === 5 && newQNum === 6) {
    playLetsPlay(letsPlay6);
  }
  else if (prevQNum === 10 && newQNum === 11) {
    playLetsPlay(letsPlay11);
  }
  else {
    updateBgMusicForCurrentQuestion();
  }
}

// ----------------------------------------------------
// 🧩 COMODÍN 50/50
// ----------------------------------------------------

function canUseLifeline() {
  if (gameOver || revealedThisQuestion || lifelineDisabledForRest || lifelineUsedThisQuestion)
    return false;

  const stage = getStage(currentIndex + 1);

  if (stage === "early") return !lifelineUsedEarly;
  if (stage === "middle") return !lifelineUsedMiddle;
  if (stage === "final") return !lifelineUsedFinal;

  return false;
}

function updateLifelineButtonState() {
  lifelineBtn.disabled = !canUseLifeline();

  if (lifelineDisabledForRest) {
    lifelineBtn.textContent = "50/50 (no disponible)";
  } else {
    lifelineBtn.textContent = "Comodín 50/50";
  }
}

function useLifeline() {
  if (!canUseLifeline()) return;

  const stage = getStage(currentIndex + 1);
  const q = questions[currentIndex];

  // Reglas por bloque
  if (stage === "early") {
    lifelineUsedEarly = true;
    lifelineDisabledForRest = true; // Si se usa antes de la 6, se bloquea para todo el juego
  }
  else if (stage === "middle") {
    lifelineUsedMiddle = true;
  }
  else {
    lifelineUsedFinal = true;
  }

  lifelineUsedThisQuestion = true;

  // Eliminar dos respuestas incorrectas
  let incorrect = [0, 1, 2, 3].filter(
    i => i !== q.correctIndex && i !== selectedAnswerIndex
  );

  incorrect.sort(() => Math.random() - 0.5);

  incorrect.slice(0, 2).forEach(i => {
    answerButtons[i].disabled = true;
    answerButtons[i].classList.add("disabled-option");
  });

  updateLifelineButtonState();
}

// ----------------------------------------------------
// 🔗 EVENTOS DE LOS BOTONES
// ----------------------------------------------------

answerButtons.forEach((btn, i) =>
  btn.addEventListener("click", () => handleAnswerSelect(i))
);

revealBtn.addEventListener("click", revealAnswer);
lifelineBtn.addEventListener("click", useLifeline);

if (nextBtn) {
  nextBtn.addEventListener("click", goToNextQuestion);
}

restartBtn.addEventListener("click", () => {
  if (winOverlay) {
    winOverlay.classList.add("hidden");
  }
  if (questions.length > 0) {
    startGame();
  } else {
    messageBoxEl.textContent = "Carga un archivo JSON para comenzar.";
  }
});

// Cargar archivo JSON manualmente
loadFileBtn.addEventListener("click", () => {
  const file = fileInput.files[0];

  if (!file) {
    messageBoxEl.textContent = "Selecciona un archivo JSON primero.";
    return;
  }

  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      applyQuestionsFromData(data, `✅ Set cargado desde archivo: ${file.name}`);
    } catch {
      messageBoxEl.textContent = "Error al leer JSON.";
    }
  };

  reader.readAsText(file);
});

// 🔇 BOTÓN MUTE
if (muteBtn) {
  muteBtn.textContent = "🔊";

  muteBtn.addEventListener("click", () => {
    audioEnabled = !audioEnabled;

    if (!audioEnabled) {
      muteBtn.textContent = "🔇";
      stopAllBgMusic();
      bgMusicLocked = false;
      introTheme.pause();
    } else {
      muteBtn.textContent = "🔊";

      if (startScreen && startScreen.style.display !== "none") {
        introTheme.play().catch(() => {});
      } else if (questions.length > 0 && !gameOver) {
        updateBgMusicForCurrentQuestion();
      }
    }
  });
}

// Pantalla de inicio
if (startBtn && startScreen) {
  startBtn.addEventListener("click", () => {
    startScreen.style.display = "none";
    stopIntroTheme(true);
    if (questions.length > 0 && !gameOver) {
      updateBgMusicForCurrentQuestion();
    }
  });
}

// Botón "Jugar de nuevo" en overlay de victoria
if (winRestartBtn) {
  winRestartBtn.addEventListener("click", () => {
    // Oculta overlay
    if (winOverlay) {
      winOverlay.classList.add("hidden");
    }

    // Detiene música de fondo
    stopAllBgMusic();

    // Muestra pantalla de inicio
    if (startScreen) {
      startScreen.style.display = "flex";
    }

    // Reproduce tema de inicio (si el audio está activado)
    if (audioEnabled) {
      introTheme.currentTime = 0;
      introTheme.play().catch(() => {});
    }

    // Opcional: resetea mensaje en el tablero
    messageBoxEl.textContent = "Carga un archivo JSON para comenzar o presiona Comenzar.";
  });
}

// ----------------------------------------------------
// 🏁 MENSAJE INICIAL
// ----------------------------------------------------

questionTextEl.textContent = "Carga un archivo JSON para comenzar.";

