/* ═══════════════════════════════════════════════════════
   DIVE CALORIE CALCULATOR — Berechnungslogik
   
   Formel-Grundlage:
   1. Mifflin-St-Jeor BMR (kcal/Tag)
   2. MET = 7.0 für Sporttauchen (Social Diving / Compendium of Physical Activities)
   3. Tiefenkorrektur: Atemarbeit steigt mit Umgebungsdruck (bar = tiefe/10 + 1)
   4. Nitrox EAN33: ~3-5% geringerer Verbrauch durch reduzierten N₂-Stress
   5. Flaschengröße: Atemvolumencheck (plausibilisiert die Tauchgangsdauer)
═══════════════════════════════════════════════════════ */

/* ── Theme Toggle ────────────────────────────────── */
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root   = document.documentElement;
  let theme    = root.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  root.setAttribute('data-theme', theme);
  updateToggleIcon(theme);

  toggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    updateToggleIcon(theme);
  });

  function updateToggleIcon(t) {
    toggle.setAttribute('aria-label', t === 'dark' ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln');
    toggle.innerHTML = t === 'dark'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
})();

/* ── State ───────────────────────────────────────── */
let gender    = 'male';
let gasType   = 'air';
let tankVol   = 10;
let waterTemp   = 25;
let currentLevel = 1;

// Strömungs-Beschreibungen & Faktoren
const CURRENT_DATA = {
  1: { label: 'Keine',  desc: 'Ruhiges Wasser – minimaler Widerstand beim Finnen.',                            factor: 1.00 },
  2: { label: 'Schwach',desc: 'Leichte Drift spürbar – gelegentliches Gegenhalten.',                          factor: 1.15 },
  3: { label: 'Mittel', desc: 'Kontinuierliches aktives Finnen gegen die Strömung erforderlich.',              factor: 1.35 },
  4: { label: 'Stark',  desc: 'Deutlicher Kraftaufwand – vergleichbar mit zügigem Kraulschwimmen.',           factor: 1.60 },
  5: { label: 'Extrem', desc: 'Maximale Anstrengung – Strömung verlangt Volleinsatz der Beinmuskulatur.',     factor: 2.00 },
};

/* ── Gender Toggle ───────────────────────────────── */
document.getElementById('btn-male').addEventListener('click', () => setGender('male'));
document.getElementById('btn-female').addEventListener('click', () => setGender('female'));

function setGender(val) {
  gender = val;
  document.getElementById('gender').value = val;
  document.getElementById('btn-male').classList.toggle('active', val === 'male');
  document.getElementById('btn-female').classList.toggle('active', val === 'female');
  document.getElementById('btn-male').setAttribute('aria-pressed', val === 'male');
  document.getElementById('btn-female').setAttribute('aria-pressed', val === 'female');
}

/* ── Gas Toggle ──────────────────────────────────── */
document.getElementById('btn-air').addEventListener('click', () => setGas('air'));
document.getElementById('btn-nitrox').addEventListener('click', () => setGas('nitrox'));

function setGas(val) {
  gasType = val;
  document.getElementById('gas').value = val;
  document.getElementById('btn-air').classList.toggle('active', val === 'air');
  document.getElementById('btn-nitrox').classList.toggle('active', val === 'nitrox');
  document.getElementById('btn-air').setAttribute('aria-pressed', val === 'air');
  document.getElementById('btn-nitrox').setAttribute('aria-pressed', val === 'nitrox');
  checkNitroxDepthWarning();
}

/* ── Current Selector ──────────────────────────── */
document.querySelectorAll('.current-btn').forEach(btn => {
  btn.addEventListener('click', () => setCurrentLevel(parseInt(btn.dataset.current)));
});

function setCurrentLevel(level) {
  currentLevel = level;
  const data = CURRENT_DATA[level];
  document.querySelectorAll('.current-btn').forEach(b => {
    const active = parseInt(b.dataset.current) === level;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active);
  });
  // Update description
  const descEl = document.getElementById('currentDesc');
  descEl.textContent = data.desc;
  // Tint description border for high currents
  const colors = { 1: '', 2: '', 3: 'var(--color-accent)', 4: 'var(--color-warning)', 5: 'var(--color-error, #d163a7)' };
  descEl.style.borderLeftColor = colors[level] || 'var(--color-primary)';
}

/* ── Temperature Selector ───────────────────────── */
document.querySelectorAll('.temp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = parseInt(btn.dataset.temp);
    setWaterTemp(t);
    document.getElementById('waterTemp').value = t;
  });
});

document.getElementById('waterTemp').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  if (!isNaN(v) && v >= 0 && v <= 40) setWaterTemp(v, true);
});

function setWaterTemp(temp, fromInput = false) {
  waterTemp = temp;
  // Update preset buttons
  document.querySelectorAll('.temp-btn').forEach(b => {
    const t = parseInt(b.dataset.temp);
    const ranges = { 5: [0,10], 15: [11,20], 25: [21,28], 30: [29,40] };
    const [lo, hi] = ranges[t] || [t, t];
    b.classList.toggle('active', temp >= lo && temp <= hi);
  });
  // If no range matches exactly, keep the closest active
  const anyActive = [...document.querySelectorAll('.temp-btn')].some(b => b.classList.contains('active'));
  if (!anyActive) {
    // find closest
    let closest = null, minDist = Infinity;
    document.querySelectorAll('.temp-btn').forEach(b => {
      const d = Math.abs(parseInt(b.dataset.temp) - temp);
      if (d < minDist) { minDist = d; closest = b; }
    });
    if (closest) closest.classList.add('active');
  }
  if (!fromInput) document.getElementById('waterTemp').value = temp;
  // Move indicator on gradient bar
  const pct = Math.min(Math.max(temp / 40, 0), 1) * 100;
  document.getElementById('tempBar').style.setProperty('--indicator', pct + '%');
  // Use CSS custom property via inline style on ::after via a wrapper trick
  const bar = document.getElementById('tempBar');
  bar.style.setProperty('--ind-left', pct + '%');
  // Directly set a data attribute and use it in a dynamic style tag
  updateTempBarIndicator(pct);
}

function updateTempBarIndicator(pct) {
  let styleEl = document.getElementById('temp-indicator-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'temp-indicator-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `#tempBar::after { left: ${pct.toFixed(1)}%; }`;
}

// Init indicator
updateTempBarIndicator(62.5);

/* ── Tank Selector ───────────────────────────────── */
document.querySelectorAll('.tank-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const vol = parseInt(btn.dataset.volume);
    setTank(vol);
    document.getElementById('tankVolume').value = vol;
  });
});

document.getElementById('tankVolume').addEventListener('input', (e) => {
  const v = parseInt(e.target.value);
  if (v > 0) setTank(v, true);
});

function setTank(vol, fromInput = false) {
  tankVol = vol;
  document.querySelectorAll('.tank-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.volume) === vol);
  });
  if (!fromInput) document.getElementById('tankVolume').value = vol;
  drawDepthProfile();
}

/* ── Nitrox Depth Warning ─────────────────────────── */
document.getElementById('depth').addEventListener('input', () => {
  checkNitroxDepthWarning();
  drawDepthProfile();
});
document.getElementById('duration').addEventListener('input', () => {
  drawDepthProfile();
});

function checkNitroxDepthWarning() {
  const depth = parseFloat(document.getElementById('depth').value);
  const hint  = document.getElementById('depth-hint');
  const input = document.getElementById('depth');
  if (gasType === 'nitrox' && depth > 33) {
    hint.textContent = '⚠ EAN 33: Max. Tiefe 33 m (PO₂-Grenze 1,4 bar)';
    input.classList.add('error');
  } else {
    hint.textContent = '';
    input.classList.remove('error');
  }
}

/* ── Depth Profile Canvas ────────────────────────── */
function drawDepthProfile() {
  const canvas   = document.getElementById('depthCanvas');
  const ctx      = canvas.getContext('2d');
  const W        = canvas.offsetWidth || 600;
  const H        = 80;
  canvas.width   = W * window.devicePixelRatio;
  canvas.height  = H * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const depth    = parseFloat(document.getElementById('depth').value) || 0;
  const duration = parseFloat(document.getElementById('duration').value) || 0;

  const isDark   = document.documentElement.getAttribute('data-theme') !== 'light';
  const bgColor  = isDark ? '#0f1e30' : '#f0f7ff';
  const surfaceColor = isDark ? '#1e3352' : '#c4daf5';
  const waterColor   = isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(8, 145, 178, 0.12)';
  const lineColor    = isDark ? '#2dd4bf' : '#0891b2';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  if (depth <= 0 || duration <= 0) {
    ctx.fillStyle = isDark ? '#1e3352' : '#c4daf5';
    ctx.font = `${12}px DM Sans, sans-serif`;
    ctx.fillStyle = isDark ? '#3a5470' : '#7aa3cc';
    ctx.textAlign = 'center';
    ctx.fillText('Tiefe & Dauer eingeben', W / 2, H / 2 + 4);
    return;
  }

  // Tiefenprofil: Abtauchen (20% der Zeit), Maximale Tiefe (60%), Auftauchen (20%)
  const pad     = 20;
  const plotW   = W - pad * 2;
  const plotH   = H - 16;
  const maxDepthPx = plotH - 10;
  const scaleY  = d => 8 + (d / depth) * maxDepthPx;

  // Profil-Punkte (Zeit → Tiefe)
  const profile = [
    { t: 0,     d: 0 },
    { t: 0.15,  d: depth },
    { t: 0.80,  d: depth },
    { t: 1.0,   d: 0 },
  ];

  const xOf = t => pad + t * plotW;
  const yOf = d => scaleY(d);

  // Wasser-Fill
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(0));
  profile.forEach(p => ctx.lineTo(xOf(p.t), yOf(p.d)));
  ctx.lineTo(xOf(1.0), H);
  ctx.lineTo(xOf(0), H);
  ctx.closePath();
  ctx.fillStyle = waterColor;
  ctx.fill();

  // Profil-Linie
  ctx.beginPath();
  ctx.moveTo(xOf(profile[0].t), yOf(profile[0].d));
  for (let i = 1; i < profile.length; i++) {
    ctx.lineTo(xOf(profile[i].t), yOf(profile[i].d));
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Tiefenlabel
  ctx.fillStyle  = lineColor;
  ctx.font       = `bold ${11}px DM Sans, sans-serif`;
  ctx.textAlign  = 'left';
  ctx.fillText(`${depth} m`, xOf(0.16), yOf(depth) - 4);

  // Dauerlabel
  ctx.fillStyle  = isDark ? '#6e8cae' : '#3d6490';
  ctx.font       = `${10}px DM Sans, sans-serif`;
  ctx.textAlign  = 'right';
  ctx.fillText(`${duration} min`, W - 4, 14);

  // Oberflächenlinie
  ctx.beginPath();
  ctx.moveTo(pad, yOf(0));
  ctx.lineTo(W - pad, yOf(0));
  ctx.strokeStyle = surfaceColor;
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

window.addEventListener('resize', drawDepthProfile);
document.querySelector('[data-theme-toggle]').addEventListener('click', () => setTimeout(drawDepthProfile, 50));
drawDepthProfile();

/* ═══════════════════════════════════════════════════════
   KERNBERECHNUNG
═══════════════════════════════════════════════════════ */

/**
 * Mifflin-St-Jeor BMR (kcal/Tag)
 */
function calcBMR(weightKg, heightCm, ageYears, sex) {
  if (sex === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  } else {
    return 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
  }
}

/**
 * Kalorienverbrauch pro Minute bei Ruhe (BMR/1440)
 */
function bmrPerMinute(bmr) {
  return bmr / 1440;
}

/**
 * Strömungs-Faktor auf den MET-Basisverbrauch
 * Quelle: Vergleich mit Schwimmwiderstandsstudien (Toussaint et al.)
 * Level 1 = 1.0× (kein Mehrverbrauch)
 * Level 5 = 2.0× (verdopplung durch maximalen Strömungswiderstand)
 */
function currentFactor(level) {
  return CURRENT_DATA[level]?.factor ?? 1.0;
}

/**
 * Thermoregulations-Mehrverbrauch durch Wasser-Wärmeleitung
 *
 * Wasser leitet Wärme ~25× schneller als Luft.
 * ΔT = 37°C (Körperkern) - Wassertemperatur
 * Basierend auf Newton'schem Abkühlungsgesetz und Tauchstudien:
 * - Bei 20°C: +15 kcal/h (nur Neopren-Schutz)
 * - Bei 10°C: +80–120 kcal/h zusätzlich
 * - Bei 5°C:  +150–200 kcal/h zusätzlich
 *
 * Vereinfachte lineare Formel (konservativ, Neopren angenommen):
 * extraKcalPerHour = max(0, (37 - waterTemp) * 2.5)
 * Skalierung: tatsächliche Tauchdauer / 60
 */
function thermoExtraKcal(waterTempC, durationMin) {
  const deltaT = Math.max(0, 37 - waterTempC);
  // 2.5 kcal/h pro Grad ΔT (mit Neopren-Dämpfung)
  const extraPerHour = deltaT * 2.5;
  return extraPerHour * (durationMin / 60);
}

/**
 * Tiefenkorrektur-Faktor für Atemarbeit
 * Bei 10 m → 2 bar → 1,25×
 * Bei 20 m → 3 bar → 1,50×
 * Bei 40 m → 5 bar → 2,10×
 * Formel: 1 + (Tiefe/10) * 0.08  (konservativ, basiert auf Atemwiderstandsstudien)
 */
function depthFactor(depthM) {
  const bar = depthM / 10 + 1;
  return 1 + (bar - 1) * 0.10;
}

/**
 * Nitrox-Faktor: EAN33 hat weniger N₂ → geringerer physiologischer Stress
 * Ca. 3-5% weniger Verbrauch (anekdotisch + Stickstoffsättigungsstudien)
 */
function nitroxFactor(gasType) {
  return gasType === 'nitrox' ? 0.96 : 1.0;
}

/**
 * Hauptberechnung: Gesamtkalorienverbrauch
 */
function calcDiveCalories({ weight, height, age, sex, gas, depthM, durationMin, waterTempC, currentLvl }) {
  const bmr         = calcBMR(weight, height, age, sex);
  const bmrMin      = bmrPerMinute(bmr);

  // MET = 7.0 für aktives Sporttauchen
  const MET         = 7.0;

  // Kalorienverbrauch bei MET 7.0: MET × Gewicht(kg) × Zeit(h)
  const metCalories = MET * weight * (durationMin / 60);

  // Tiefenkorrektur
  const dFactor     = depthFactor(depthM);

  // Nitrox
  const nFactor     = nitroxFactor(gas);

  // Strömung
  const cFactor     = currentFactor(currentLvl);

  // Basis-Kalorienverbrauch (ohne Temperaturfaktor, mit Strömung)
  const base        = metCalories * dFactor * nFactor * cFactor;

  // Temperatur-Mehrverbrauch (additiv, da es ein separater Mechanismus ist)
  const tempExtra   = thermoExtraKcal(waterTempC, durationMin);

  // Gesamtverbrauch
  const total       = base + tempExtra;

  // Aufschlüsselung: Thermoregulation erhöht vor allem den Wärmeverlust-Anteil
  const breathing   = base * 0.30;
  const thermic     = base * 0.50 + tempExtra; // Temp-Extra geht komplett in Wärmeverlust
  const movement    = base * 0.20;

  return {
    total:      Math.round(total),
    perMinute:  total / durationMin,
    breathing:  Math.round(breathing),
    thermic:    Math.round(thermic),
    movement:   Math.round(movement),
    tempExtra:    Math.round(tempExtra),
    currentExtra: Math.round(base - metCalories * dFactor * nFactor), // Mehrverbrauch durch Strömung
    cFactor,
    bmr,
    dFactor,
    nFactor,
  };
}

/**
 * Flaschendauer-Plausibilität
 * Atemverbrauch: ca. 15-25 L/min SAC, bei Tiefe × Druckfaktor
 * tankVol × 200 bar / (SAC × bar) = Tauchdauer
 */
function estimateTankDuration(tankVolumeL, depthM, sacLperMin = 20) {
  const bar          = depthM / 10 + 1;
  const totalGas     = tankVolumeL * 200; // bei 200 bar Füllung
  const gasPerMin    = sacLperMin * bar;
  const durationMin  = totalGas / gasPerMin;
  return Math.round(durationMin);
}

/* ═══════════════════════════════════════════════════════
   VERGLEICHSWERTE
═══════════════════════════════════════════════════════ */
function getComparisons(kcal) {
  const items = [
    { emoji: '🍕', label: `${(kcal / 266).toFixed(1)} Stk. Pizza` },
    { emoji: '🍺', label: `${Math.round(kcal / 43)} Bier (0,33 L)` },
    { emoji: '🍫', label: `${(kcal / 540).toFixed(1)} Tafeln Schokolade` },
    { emoji: '🏃', label: `${Math.round(kcal / 9)} min Joggen` },
    { emoji: '🍎', label: `${Math.round(kcal / 52)} Äpfel` },
  ];
  return items;
}

/* ═══════════════════════════════════════════════════════
   COUNTER ANIMATION
═══════════════════════════════════════════════════════ */
function animateCounter(el, from, to, duration = 1200) {
  const start = performance.now();
  el.classList.add('counting');
  function update(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutExpo
    const ease     = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current  = Math.round(from + (to - from) * ease);
    el.textContent = current.toLocaleString('de-AT');
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.classList.remove('counting');
    }
  }
  requestAnimationFrame(update);
}

/* ═══════════════════════════════════════════════════════
   FORM SUBMIT
═══════════════════════════════════════════════════════ */
document.getElementById('calcForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const age      = parseFloat(document.getElementById('age').value);
  const weight   = parseFloat(document.getElementById('weight').value);
  const height   = parseFloat(document.getElementById('height').value);
  const depth    = parseFloat(document.getElementById('depth').value);
  const duration = parseFloat(document.getElementById('duration').value);
  const tank     = tankVol;

  // Validierung
  let valid = true;
  [
    { id: 'age',      min: 12,  max: 99  },
    { id: 'weight',   min: 30,  max: 200 },
    { id: 'height',   min: 120, max: 220 },
    { id: 'depth',    min: 1,   max: 60  },
    { id: 'duration', min: 1,   max: 300 },
  ].forEach(({ id, min, max }) => {
    const el  = document.getElementById(id);
    const val = parseFloat(el.value);
    if (isNaN(val) || val < min || val > max) {
      el.classList.add('error');
      el.focus();
      valid = false;
    } else {
      el.classList.remove('error');
    }
  });

  if (gasType === 'nitrox' && depth > 33) {
    document.getElementById('depth').classList.add('error');
    valid = false;
  }

  if (!valid) return;

  // Berechnung
  const waterTempVal = parseFloat(document.getElementById('waterTemp').value);
  const waterTempC = (!isNaN(waterTempVal) && waterTempVal >= 0 && waterTempVal <= 40) ? waterTempVal : 25;

  const result = calcDiveCalories({
    weight, height, age,
    sex:         gender,
    gas:         gasType,
    depthM:      depth,
    durationMin: duration,
    waterTempC,
    currentLvl:  currentLevel,
  });

  // Flaschendauer-Check
  const tankMax = estimateTankDuration(tank, depth);

  // ── Ergebnisse rendern ──────────────────────────

  // Profil-Zeile
  const sexLabel     = gender === 'male' ? 'Mann' : 'Frau';
  const gasLabel     = gasType === 'nitrox' ? 'Nitrox EAN 33' : 'Luft';
  const currentLabel = CURRENT_DATA[currentLevel].label;
  document.getElementById('resultProfile').textContent =
    `${sexLabel}, ${age} J., ${weight} kg, ${height} cm · ${depth} m, ${duration} min · ${waterTempC} °C · Strömung ${currentLevel}/5 · ${gasLabel} · ${tank} L-Flasche`;

  // kcal
  animateCounter(document.getElementById('kcalNumber'), 0, result.total);

  // Balken (max Skala 1000)
  const barPct = Math.min((result.total / 1000) * 100, 100);
  setTimeout(() => {
    document.getElementById('kcalBar').style.width = barPct + '%';
  }, 100);

  // Stats
  document.getElementById('statPerMin').textContent    = result.perMinute.toFixed(1) + ' kcal/min';
  document.getElementById('statHeat').textContent      = result.thermic + ' kcal';
  document.getElementById('statBreath').textContent    = result.breathing + ' kcal';
  document.getElementById('statMove').textContent      = result.movement + ' kcal';
  // Temp extra
  const tempStatEl = document.getElementById('statTempExtra');
  tempStatEl.textContent = result.tempExtra > 0
    ? '+' + result.tempExtra + ' kcal durch ' + waterTempC + ' °C Wasser'
    : 'Kein Mehrverbrauch (Tropenwasser)';

  // Strömungs-extra
  const currentStatEl = document.getElementById('statCurrentExtra');
  const cData = CURRENT_DATA[currentLevel];
  if (currentLevel === 1) {
    currentStatEl.textContent = 'Kein Mehrverbrauch (ruhiges Wasser)';
  } else {
    currentStatEl.textContent = `+${result.currentExtra} kcal – Stufe ${currentLevel} (${cData.label})`;
  }

  // Vergleiche
  const compEl = document.getElementById('compItems');
  compEl.innerHTML = getComparisons(result.total)
    .map(c => `<div class="comp-item"><span>${c.emoji}</span><span>${c.label}</span></div>`)
    .join('');

  // Gas-, Temperatur- und Strömungshinweis
  const noteEl = document.getElementById('gasNote');
  let noteText = '';
  if (gasType === 'nitrox') {
    noteText = `Nitrox EAN 33 reduziert den Kalorienverbrauch um ca. 4 % gegenüber Luft.`;
  } else {
    const nitroxEstimate = Math.round(result.total * 0.96);
    noteText = `Mit Nitrox EAN 33 wären es ca. ${nitroxEstimate} kcal – rund ${result.total - nitroxEstimate} kcal weniger.`;
  }
  if (waterTempC <= 10) {
    noteText += ` ❄️ Kaltes Wasser (${waterTempC} °C): erheblicher Wärmemehrverlust – Neopren spart Energie.`;
  } else if (waterTempC <= 20) {
    noteText += ` 🌊 Gemäßigtes Wasser (${waterTempC} °C): merkliche Thermoregulationsarbeit.`;
  } else if (waterTempC >= 29) {
    noteText += ` ☀️ Tropenwasser (${waterTempC} °C): kaum Temperaturstress.`;
  }
  if (currentLevel >= 4) {
    noteText += ` 🌊 Starke Strömung (Stufe ${currentLevel}): Kalorienverbrauch entspricht fast dem eines Langstreckenschwimmers.`;
  } else if (currentLevel === 3) {
    noteText += ` Strömungsfaktor ${result.cFactor}× entspricht aktivem Gegenschwimmen.`;
  }
  noteEl.textContent = noteText;

  // Flaschenwarnhinweis
  if (duration > tankMax) {
    noteEl.textContent += ` ⚠ Hinweis: Bei einer ${tank} L-Flasche und ${depth} m Tiefe reicht das Gas bei durchschnittlichem SAC (20 L/min) etwa ${tankMax} min.`;
  }

  // Panel anzeigen
  const panel = document.getElementById('resultPanel');
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Formular ausblenden (nach oben scrollen nötig)
  document.getElementById('calcBtn').textContent = ''; // bleibt sichtbar
});

/* ── Reset ────────────────────────────────────────── */
document.getElementById('resetBtn').addEventListener('click', () => {
  document.getElementById('resultPanel').hidden = true;
  document.getElementById('kcalBar').style.width = '0%';

  // Temperatur & Strömung zurücksetzen
  setWaterTemp(25);
  document.getElementById('waterTemp').value = 25;
  setCurrentLevel(1);

  // Felder leeren
  ['age', 'weight', 'height', 'depth', 'duration'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('error');
  });

  // Defaults
  setGender('male');
  setGas('air');
  setTank(10);
  document.getElementById('depth-hint').textContent = '';
  drawDepthProfile();

  // Scroll to top of form
  document.getElementById('calcForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ── Initial draw ─────────────────────────────────── */
drawDepthProfile();
