'use strict';
const fs   = require('fs');
const vm   = require('vm');

// ══════════════════════════════════════════════════════════════
// ADIM 1 — OYUN DOSYASINI OKU, VERİYİ ÇIKAR
// ══════════════════════════════════════════════════════════════
const lines = fs.readFileSync(
  '/home/user/V17/project_march_v17_rebalanced_weights.txt',
  'utf8'
).split('\n');

function extractLines(from, to) {
  return lines.slice(from - 1, to).join('\n');
}

// DOM yoktur — sadece saf veri hesaplaması yapacak kod bloklarını çalıştırıyoruz
// __exp nesnesi: const bildirimleri sandbox'a geçmediği için eksport köprüsü kullanıyoruz
const __exp = {};
const sandbox = {
  Math, console, String, parseInt, parseFloat, JSON, Array, Object, RegExp,
  isNaN, isFinite, __exp,
};
vm.createContext(sandbox);

// Oyun verilerini + export adımını tek seferde çalıştır
const dataCode = [
  extractLines(1618, 1854),   // CARDS (JS nesnesi formatı)
  extractLines(2013, 2013),   // TIER_VALS
  extractLines(2021, 2970),   // PARANOIA_CARD_SOURCE + parse fonksiyonları + PARANOIA_DECKS
  extractLines(3458, 3485),   // DIFFICULTY_CONFIG + currentDifficulty
  extractLines(4970, 5002),   // TRAIT_CARDS
  extractLines(5170, 5170),   // PROJECT_MARCH_V8_CARDS (JSON)
  // const bildirimleri sandbox'a sızmaz — __exp ile dışarı aktar
  `__exp.CARDS                 = CARDS;`,
  `__exp.PROJECT_MARCH_V8_CARDS = PROJECT_MARCH_V8_CARDS;`,
  `__exp.TIER_VALS              = TIER_VALS;`,
  `__exp.DIFFICULTY_CONFIG      = DIFFICULTY_CONFIG;`,
  `__exp.PARANOIA_DECKS         = PARANOIA_DECKS;`,
  `__exp.TRAIT_CARDS            = TRAIT_CARDS;`,
].join('\n\n');

vm.runInContext(dataCode, sandbox);

const {
  CARDS,
  PROJECT_MARCH_V8_CARDS,
  TIER_VALS,
  DIFFICULTY_CONFIG,
  PARANOIA_DECKS,
  TRAIT_CARDS,
} = __exp;

// ══════════════════════════════════════════════════════════════
// ADIM 2 — ANA DESTE OLUŞTUR
// ══════════════════════════════════════════════════════════════

// Her iki kartın momentum alanı zaten gömülü: momentum:{l:'AS',r:'MA'}
// Sadece geçerli boost+debuff olan normal kartları al
const FULL_DECK = [...CARDS, ...PROJECT_MARCH_V8_CARDS].filter(
  c => c.boost && c.debuff && c.tier && TIER_VALS[c.tier]
);

console.log(`[BİLGİ] Ana deste: ${CARDS.length} CARDS + ${PROJECT_MARCH_V8_CARDS.length} V8 CARDS = ${FULL_DECK.length} kart`);
console.log(`[BİLGİ] Paranoya desteleri: hafif=${PARANOIA_DECKS.light.length}, orta=${PARANOIA_DECKS.mid.length}, ağır=${PARANOIA_DECKS.heavy.length}`);

// ══════════════════════════════════════════════════════════════
// ADIM 3 — YARDIMCI FONKSİYONLAR
// ══════════════════════════════════════════════════════════════

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function minStatKey(stats) {
  return Object.entries(stats).reduce((a, b) => a[1] < b[1] ? a : b)[0];
}

// Paranoya cooldown (kodun aynısı)
function paranoiaCooldown(evham) {
  if (evham <= 2) return 7;
  if (evham <= 4) return 6;
  return 4;
}

// Ağırlıklı pool seçimi (kodun aynısı)
function weightedParanoiaPools(evham) {
  if (evham <= 2) return ['light'];
  if (evham <= 4) return ['light', 'light', 'mid'];
  return ['light', 'mid', 'heavy', 'heavy'];
}

// Paranoya destelerini sıfırla (run başına)
function initParanoiaDecks() {
  return {
    light: { cards: shuffle(PARANOIA_DECKS.light), idx: 0 },
    mid:   { cards: shuffle(PARANOIA_DECKS.mid),   idx: 0 },
    heavy: { cards: shuffle(PARANOIA_DECKS.heavy), idx: 0 },
  };
}

function drawParanoiaCard(pDecks, evham) {
  const pools  = weightedParanoiaPools(evham);
  const choice = pools[Math.floor(Math.random() * pools.length)];
  const deck   = pDecks[choice];
  if (!deck || !deck.cards.length) return null;
  if (deck.idx >= deck.cards.length) {
    deck.cards = shuffle(deck.cards);
    deck.idx   = 0;
  }
  return deck.cards[deck.idx++];
}

// Padişah karnesi belirleme (gate + skor formülleri, kodun aynısı)
function determinePadishah(ax, stats, hiddenStats, evham) {
  const profiles = [
    {
      key: 'Fatih',
      gate: true,
      score: 2*ax.MO + 1.5*ax.AS + 1.5*ax.PA + 0.75*ax.MA,
    },
    {
      key: 'Kanuni',
      gate: hiddenStats.adaletsizlik <= 2,
      score: 2*ax.HS + 2*ax.MO + 1.25*ax.DM + 0.5*ax.MA,
    },
    {
      key: 'Yavuz',
      gate: stats.ordu >= 35,
      score: 2*ax.AS + 2*ax.DM + 1*ax.MO,
    },
    {
      key: 'Mahmud II',
      gate: hiddenStats.askeri_vesayet <= 3,
      score: 2*ax.PA + 2*ax.MO + 1.5*ax.MA + 1*ax.AS,
    },
    {
      key: 'Bayezid II',
      gate: stats.din >= 50,
      score: 1.6*ax.HS + 1.6*ax.MA + 1*ax.DM + 0.5*ax.MO,
    },
    {
      key: 'Abdulhamid II',
      gate: evham >= 3,
      score: 2*ax.MO + 2*ax.MA + 1*ax.DM + 0.5*ax.HS,
    },
  ];

  const eligible = profiles.filter(p => p.gate);
  if (!eligible.length) return 'Kendi Yolunu Çizen Sultan';
  eligible.sort((a, b) => b.score - a.score);
  return eligible[0].key;
}

// ══════════════════════════════════════════════════════════════
// ADIM 4 — OYUNCU STRATEJİLERİ
// ══════════════════════════════════════════════════════════════

// ── BEGİNNER: Tamamen rastgele (%50/%50) ─────────────────────
function decideBeginner() {
  return Math.random() < 0.5 ? 'l' : 'r';
}

// ── MEDIUM: En zayıf statı koruyan seçim ─────────────────────
function decideMedium(card, stats, traitReductions, isParanoia) {
  if (isParanoia) {
    // Paranoya: en zayıf stata en az zarar veren tarafı seç
    const mk = minStatKey(stats);
    const lDelta = (card.lEffects || []).filter(e => e.s === mk).reduce((s, e) => s + e.d, 0);
    const rDelta = (card.rEffects || []).filter(e => e.s === mk).reduce((s, e) => s + e.d, 0);
    if (lDelta > rDelta) return 'l';
    if (rDelta > lDelta) return 'r';
    return Math.random() < 0.5 ? 'l' : 'r';
  }

  // Normal kart: hangi seçim minimum statı en çok iyileştirir/korur?
  const mk = minStatKey(stats);
  const v  = TIER_VALS[card.tier];

  // Sağ: boost +v, debuff -v
  const rGain = card.boost === mk ? v : 0;
  const rLoss = card.debuff === mk ? Math.round(v * (1 - (traitReductions[card.debuff] || 0))) : 0;
  const rNet  = rGain - rLoss;

  // Sol: boost -v, debuff +v
  const lGain = card.debuff === mk ? v : 0;
  const lLoss = card.boost  === mk ? Math.round(v * (1 - (traitReductions[card.boost]  || 0))) : 0;
  const lNet  = lGain - lLoss;

  if (rNet > lNet) return 'r';
  if (lNet > rNet) return 'l';
  return Math.random() < 0.5 ? 'l' : 'r';
}

// ── HİKAYE ODAKLI: Gerçek kullanıcıyı temsil eder ───────────
// Normal kartlarda %50/%50 (temayı okuyarak seçer)
// Paranoya kartlarında %70 riskli/onayla tarafı (sağ) → evham biriktirir
function decideStoryDriven(card, isParanoia) {
  if (isParanoia) {
    // Gerçek kullanıcılar "Onayla" / riskli seçeneğe meyillidir
    return Math.random() < 0.70 ? 'r' : 'l';
  }
  return Math.random() < 0.5 ? 'l' : 'r'; // Normal kartlarda rastgele
}

// ── EXPERT: Minimum statı maksimize eden minimax ──────────────
function decideExpert(card, stats, traitReductions, isParanoia) {
  const PASSIVE = DIFFICULTY_CONFIG.hard.passive;

  if (isParanoia) {
    // Paranoya: tüm statlar üzerindeki toplam etkiyi değerlendir
    function simParanoia(side) {
      const s = { ...stats };
      const effects = side === 'l' ? card.lEffects : card.rEffects;
      for (const e of (effects || [])) s[e.s] = clamp(s[e.s] + e.d, 0, 100);
      return Math.min(...Object.values(s));
    }
    const ml = simParanoia('l'), mr = simParanoia('r');
    if (mr > ml) return 'r';
    if (ml > mr) return 'l';
    return Math.random() < 0.5 ? 'l' : 'r';
  }

  // Normal kart: seçimden sonra pasif bozulmayı da hesaba kat
  function simNormal(side) {
    const s = { ...stats };
    const v = TIER_VALS[card.tier];
    if (side === 'r') {
      s[card.boost]  = clamp(s[card.boost]  + v, 0, 100);
      s[card.debuff] = clamp(s[card.debuff] - Math.round(v * (1 - (traitReductions[card.debuff] || 0))), 0, 100);
    } else {
      s[card.boost]  = clamp(s[card.boost]  - Math.round(v * (1 - (traitReductions[card.boost]  || 0))), 0, 100);
      s[card.debuff] = clamp(s[card.debuff] + v, 0, 100);
    }
    // Pasif bozulma
    for (const k of Object.keys(s)) s[k] = Math.max(0, s[k] - PASSIVE[k]);
    return Math.min(...Object.values(s));
  }

  const ml = simNormal('l'), mr = simNormal('r');
  if (mr > ml) return 'r';
  if (ml > mr) return 'l';
  return Math.random() < 0.5 ? 'l' : 'r';
}

// ══════════════════════════════════════════════════════════════
// ADIM 5 — TEK OYUN SİMÜLASYONU
// ══════════════════════════════════════════════════════════════

function runGame(strategyName) {
  const dcfg = DIFFICULTY_CONFIG.hard;
  const PASSIVE = dcfg.passive;

  // Başlangıç durumu
  let stats = { ...dcfg.initialStats };       // 45/45/45/45
  let traitReductions = { hazine: 0, ordu: 0, halk: 0, din: 0 };
  let hiddenStats = {
    adaletsizlik:    5,
    askeri_vesayet:  5,
    dis_bagimlilik:  5,
    teokratik_etki:  5,
  };
  let axisScores   = { AS: 0, HS: 0, MA: 0, DM: 0, MO: 0, PA: 0 };
  let yr           = 1;
  let evham        = 0;
  let paranoiaTurnsSinceLast = 0;
  let paranoiaPending        = false;

  // ── BAŞLANGIÇ: Trait kartları (rastgele seçim) ──────────────
  for (const tc of TRAIT_CARDS) {
    const side   = Math.random() < 0.5 ? 'l' : 'r';
    const effect = side === 'l' ? tc.lEffect : tc.rEffect;
    stats[effect.stat]               = clamp(stats[effect.stat] + effect.bonus, 0, 100);
    traitReductions[effect.reduction] = 0.1;
  }

  // ── ANA KART DESTESİ ────────────────────────────────────────
  let deck    = shuffle(FULL_DECK);
  let deckIdx = 0;

  function drawCard() {
    if (deckIdx >= deck.length) { deck = shuffle(FULL_DECK); deckIdx = 0; }
    return deck[deckIdx++];
  }

  const pDecks = initParanoiaDecks();
  const MAX_TURNS = 300; // güvenlik sınırı

  for (let t = 0; t < MAX_TURNS; t++) {
    // Paranoya kartı var mı?
    let card       = null;
    let isParanoia = false;

    if (paranoiaPending) {
      const pc = drawParanoiaCard(pDecks, evham);
      if (pc) {
        card        = pc;
        isParanoia  = true;
        paranoiaPending        = false;
        paranoiaTurnsSinceLast = 0;
      }
    }

    if (!card) card = drawCard();

    // ── STRATEJİYE GÖRE SEÇİM ──
    let side;
    if (strategyName === 'beginner') {
      side = decideBeginner();
    } else if (strategyName === 'medium') {
      side = decideMedium(card, stats, traitReductions, isParanoia);
    } else if (strategyName === 'story') {
      side = decideStoryDriven(card, isParanoia);
    } else {
      side = decideExpert(card, stats, traitReductions, isParanoia);
    }

    // ── EFEKTLERİ UYGULA ────────────────────────────────────
    if (isParanoia) {
      // Paranoya: lEffects/rEffects formatı
      const effects    = side === 'l' ? card.lEffects : card.rEffects;
      const evhamDelta = side === 'l' ? (card.lEvham || 0) : (card.rEvham || 0);
      for (const e of (effects || [])) stats[e.s] = clamp(stats[e.s] + e.d, 0, 100);
      evham = clamp(evham + evhamDelta, 0, 10);
      // Paranoya kartı: yıl ilerlemez, pasif bozulma olmaz
    } else {
      // Normal kart: boost/debuff + pasif bozulma + yıl
      const v = TIER_VALS[card.tier];
      if (side === 'r') {
        stats[card.boost]  = clamp(stats[card.boost]  + v, 0, 100);
        stats[card.debuff] = clamp(
          stats[card.debuff] - Math.round(v * (1 - (traitReductions[card.debuff] || 0))),
          0, 100
        );
      } else {
        stats[card.boost]  = clamp(
          stats[card.boost]  - Math.round(v * (1 - (traitReductions[card.boost]  || 0))),
          0, 100
        );
        stats[card.debuff] = clamp(stats[card.debuff] + v, 0, 100);
      }

      // Momentum axis birikimi
      const mom = card.momentum;
      if (mom && mom[side] && mom[side] in axisScores) axisScores[mom[side]]++;

      // Pasif bozulma (hard: 0.8 / 0.4 / 0.4 / 0.4)
      for (const k of Object.keys(PASSIVE)) {
        stats[k] = Math.max(0, stats[k] - PASSIVE[k]);
      }

      // Paranoya sayacı
      paranoiaTurnsSinceLast++;
      if (!paranoiaPending && paranoiaTurnsSinceLast >= paranoiaCooldown(evham)) {
        paranoiaPending = true;
      }

      yr++;
    }

    // ── BİTİŞ KONTROL ───────────────────────────────────────
    if (Object.values(stats).some(v => v <= 0)) {
      const lostStat = Object.entries(stats).find(([, v]) => v <= 0)[0];
      return { outcome: 'loss', reason: lostStat, yr };
    }
    if (yr > 50) {
      const padishah = determinePadishah(axisScores, stats, hiddenStats, evham);
      return {
        outcome:      'win',
        padishah,
        yr,
        axisScores:   { ...axisScores },
        finalStats:   { ...stats },
        evham,
        evhamReached3: evham >= 3,
      };
    }
  }

  return { outcome: 'timeout', yr };
}

// ══════════════════════════════════════════════════════════════
// ADIM 6 — MONTE CARLO: 1000 × 3 OYUNCU PROFİLİ
// ══════════════════════════════════════════════════════════════

const N = 1000;
const PROFILES = ['beginner', 'story', 'medium', 'expert'];
const allResults = {};

console.log('\n[BAŞLIYOR] 3000 oyun simüle ediliyor (1000 × 3 profil)...\n');

for (const profile of PROFILES) {
  const label = { beginner: 'YENİ BAŞLAYAN', story: 'HİKAYE ODAKLI', medium: 'ORTA SEVİYE', expert: 'UZMAN' }[profile];
  process.stdout.write(`  ${label}: simüle ediliyor...`);
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(runGame(profile));
  allResults[profile] = runs;
  process.stdout.write(` TAMAM ✓\n`);
}

// ══════════════════════════════════════════════════════════════
// ADIM 7 — ANALİZ VE RAPOR
// ══════════════════════════════════════════════════════════════

function analyze(runs) {
  const total  = runs.length;
  const wins   = runs.filter(r => r.outcome === 'win');
  const losses = runs.filter(r => r.outcome === 'loss');

  const lossBy = {};
  for (const r of losses) lossBy[r.reason] = (lossBy[r.reason] || 0) + 1;

  const padishahs = {};
  for (const r of wins)  padishahs[r.padishah] = (padishahs[r.padishah] || 0) + 1;

  const avgYr    = runs.reduce((s, r) => s + r.yr, 0) / total;
  const avgEvham = wins.length
    ? wins.reduce((s, r) => s + (r.evham || 0), 0) / wins.length
    : 0;

  // Abdülhamid II için evham >= 3'e ulaşan galip oyunlar
  const evham3wins = wins.filter(r => r.evhamReached3).length;

  // Tüm oyunlarda evham dağılımı (kaybedenlerde de evham kaydedilmedi, burada sadece gazipler)
  const evhamDist = {};
  for (const r of wins) {
    const v = r.evham || 0;
    evhamDist[v] = (evhamDist[v] || 0) + 1;
  }

  return { total, wins: wins.length, losses: losses.length, lossBy, padishahs, avgYr, avgEvham, evham3wins, evhamDist };
}

function pct(n, total) {
  return `${n} (%${((n / total) * 100).toFixed(1)})`;
}

const LOSS_LABELS = {
  hazine: '💸 Hazine Tükendi',
  ordu:   '⚔️  Ordu Dağıldı',
  halk:   '🔥 Halk Ayaklandı',
  din:    '☪️  Meşruiyet Yitirildi',
};

const PADISHAH_ORDER = [
  'Fatih', 'Kanuni', 'Yavuz', 'Mahmud II', 'Bayezid II',
  'Abdulhamid II', 'Kendi Yolunu Çizen Sultan',
];

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         SULTAN — TAHT OYUNU v17  |  MONTE CARLO ANALİZİ     ║');
console.log('║         ZOR mod  |  1000 oyun × 3 profil  |  Gerçek RNG     ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

for (const profile of PROFILES) {
  const a = analyze(allResults[profile]);
  const label = { beginner: 'YENİ BAŞLAYAN', story: 'HİKAYE ODAKLI (Gerçek Kullanıcı)', medium: 'ORTA SEVİYE', expert: 'UZMAN' }[profile];

  console.log(`\n┌────────────────────────────────────────────────────────────`);
  console.log(`│  ${label} (${a.total} oyun)`);
  console.log(`│  Ortalama saltanat süresi : ${a.avgYr.toFixed(1)} yıl`);
  console.log(`│`);

  console.log(`│  ✅ GALİBİYET : ${pct(a.wins, a.total)}`);
  if (a.wins > 0) {
    console.log(`│     Kazananlarda ort. evham  : ${a.avgEvham.toFixed(2)}`);
    console.log(`│     Evham ≥ 3 olan galip oyun: ${pct(a.evham3wins, a.total)} (Abdülhamid II kapısı açık)`);
    // Evham dağılımı özeti
    const evhamEntries = Object.entries(a.evhamDist).sort((a,b) => +a[0] - +b[0]);
    const evhamSummary = evhamEntries.map(([v, n]) => `${v}:(${n})`).join(' ');
    console.log(`│     Evham dağılımı [galipler]: ${evhamSummary}`);
    for (const k of PADISHAH_ORDER) {
      if (a.padishahs[k]) {
        console.log(`│       → ${k.padEnd(28)} ${pct(a.padishahs[k], a.total)}`);
      }
    }
  }

  console.log(`│`);
  console.log(`│  ❌ KAYBEDİŞ  : ${pct(a.losses, a.total)}`);
  for (const [key, label2] of Object.entries(LOSS_LABELS)) {
    if (a.lossBy[key]) {
      console.log(`│       → ${label2.padEnd(28)} ${pct(a.lossBy[key], a.total)}`);
    }
  }

  console.log(`└────────────────────────────────────────────────────────────`);
}

console.log('\n[BİTTİ] Simülasyon tamamlandı.\n');
