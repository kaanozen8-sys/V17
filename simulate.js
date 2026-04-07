'use strict';
const { performance } = require('perf_hooks');

// ═══════════════════════════════════════════════════════════════
//  SULTAN — TAHT OYUNU v17  |  Node.js Simülasyon
//  Kaynak: project_march_v17_rebalanced_weights.txt (HTML oyun)
//  Hard Mode | 1000 run × 3 strateji
// ═══════════════════════════════════════════════════════════════

// ── Sabitler ─────────────────────────────────────────────────
const STATS  = ['hazine', 'ordu', 'halk', 'din'];
const HIDDEN = ['adaletsizlik', 'askeri_vesayet', 'dis_bagimlilik', 'teokratik_etki'];
const TIER_VALS = { w: 13, n: 16, s: 20 };

// Hard Mode pasif decay (her yıl-ilerleyen turda uygulanır)
const PASSIVE = { hazine: 0.8, ordu: 0.4, halk: 0.4, din: 0.4 };

// Başlangıç değerleri (Hard Mode: tüm statlar 45)
const INIT_STATS  = { hazine: 45, ordu: 45, halk: 45, din: 45 };
const INIT_HIDDEN = { adaletsizlik: 5, askeri_vesayet: 5, dis_bagimlilik: 5, teokratik_etki: 5 };

const ENDINGS = {
  // Kayıp — Görünür Stat
  hazine:           '💸 Hazine Tükendi',
  ordu:             '⚔️  Ordu Dağıldı',
  halk:             '🔥 Halk Ayaklandı',
  din:              '☪️  Meşruiyet Yitirildi',
  // Kayıp — Gizli Eksen
  adaletsizlik:     '⚖️  Adaletsizlik Devleti Çürüttü',
  askeri_vesayet:   '🪖 Ocak Tahtın Üstüne Çıktı',
  dis_bagimlilik:   '🔗 Devlet Dışa Bağlandı',
  teokratik_etki:   '📿 Teokratik Etki Tahtı Sardı',
  // Kayıp — Paranoya
  paranoia:         '😱 Evham Tahtı Ele Geçirdi',
  // Kayıp — Zincir Olaylar
  kosova:           '🗡️  Kosova Hatası',
  yedikule:         '👑 Yedikule Sonu',
  sirpence:         '🩸 Şirpençe Sonu',
  // Galibiyet — Görünür Stat
  hazine_win:       '💰 Bereketli Saltanat',
  ordu_win:         '⚔️  Kudretli Hükümdar',
  halk_win:         '🕊️  Adil Sultan',
  din_win:          '🌙 Mübarek Saltanat',
  // Galibiyet — Gizli Eksen (≤2 at year 51)
  adaletsizlik_win: '🌿 Adaletle Anıldınız',
  askeri_vesayet_win:'🏰 Ordu Dizgin Altında Kaldı',
  dis_bagimlilik_win:'🪙 İktisadî İrade Korundu',
  teokratik_etki_win:'☯️  Hüküm ile İnanç Dengede Kaldı',
};

// ── Kart Havuzu Oluşturma ─────────────────────────────────────
// HTML'den: 206 normal kart, 12 boost/debuff çifti (~17 kart/çift)
// Tier dağılımı: w(%28) n(%44) s(%28) — orijinalden tahmin
function buildCardPool(seed) {
  // Deterministik değil ama her çalıştırmada tutarlı havuz
  const pool = [];
  const tierWeights = [
    'w','w','w','w','w',
    'n','n','n','n','n','n','n','n',
    's','s','s','s','s'
  ];

  for (const boost of STATS) {
    for (const debuff of STATS) {
      if (boost === debuff) continue;
      // ~17 kart per çift → 12×17 = 204 ≈ 206
      for (let i = 0; i < 17; i++) {
        const tier = tierWeights[Math.floor(Math.random() * tierWeights.length)];
        const card = { boost, debuff, tier };
        // %30 gizli eksen etkisi (HTML'den: `hidden` property)
        if (Math.random() < 0.30) {
          const hs = HIDDEN[Math.floor(Math.random() * 4)];
          card.hidden = {
            stat: hs,
            l: Math.random() < 0.5 ? -1 : 1,   // sol seçim etkisi
            r: Math.random() < 0.5 ? -1 : 1,   // sağ seçim etkisi
          };
        }
        pool.push(card);
      }
    }
  }
  return pool; // ~204 kart
}

const CARD_POOL = buildCardPool();

// ── Tek Oyun Simülasyonu ──────────────────────────────────────
function runGame(strategy) {
  // State kopyaları
  const stats  = { ...INIT_STATS };
  const hidden = { ...INIT_HIDDEN };
  let yr       = 1;
  let evham    = 0;       // Paranoya (0-10)
  let paranoiaSince = 0;  // son paranoya kartından bu yana geçen normal tur
  let normalTurns   = 0;

  // Zincir olay durumu (Kosova / Yedikule / Şirpençe)
  let chainStep = 0;
  let chainType = null;

  // Kart destesi (karıştır + sonsuz döngü)
  const deck = [...CARD_POOL].sort(() => Math.random() - 0.5);
  let di = 0;
  function draw() {
    if (di >= deck.length) { deck.sort(() => Math.random() - 0.5); di = 0; }
    return deck[di++];
  }

  // ─ Yardımcılar ─
  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  function checkLoss() {
    for (const s of STATS)  if (stats[s]  <= 0)  return s;
    for (const h of HIDDEN) if (hidden[h] >= 10) return h;
    if (evham >= 10) return 'paranoia';
    return null;
  }

  // ─ Strateji: Kart seçimi ─
  function choose(card) {
    const val = TIER_VALS[card.tier];

    // Sol / sağ sonuç tahmini
    const lo = { ...stats };
    const ro = { ...stats };
    lo[card.boost] -= val;  lo[card.debuff] += val;
    ro[card.boost] += val;  ro[card.debuff] -= val;

    const lMin = Math.min(...STATS.map(s => lo[s]));
    const rMin = Math.min(...STATS.map(s => ro[s]));
    const minStat = STATS.reduce((a, b) => stats[a] < stats[b] ? a : b);

    if (strategy === 'beginner') {
      // Rastgele — sadece anında ölümden kaçınır (bariz olanı)
      if (lMin <= 0 && rMin >  0) return 'r';
      if (rMin <= 0 && lMin >  0) return 'l';
      return Math.random() < 0.5 ? 'l' : 'r';
    }

    if (strategy === 'medium') {
      // En düşük statı koru
      if (lo[minStat] > ro[minStat]) return 'l';
      if (ro[minStat] > lo[minStat]) return 'r';
      return Math.random() < 0.5 ? 'l' : 'r';
    }

    // expert: hayatta kalma + ending optimizasyonu
    if (lMin <= 0 && rMin >  0) return 'r';
    if (rMin <= 0 && lMin >  0) return 'l';

    // Maksimum minimum stat tercih et (>2 fark varsa)
    if (lMin > rMin + 2) return 'l';
    if (rMin > lMin + 2) return 'r';

    // Gizli eksen farkındalığı: eksen ≥7 ise azaltan tarafı seç
    if (card.hidden && hidden[card.hidden.stat] >= 7) {
      if (card.hidden.l < 0 && card.hidden.r > 0) return 'l';
      if (card.hidden.r < 0 && card.hidden.l > 0) return 'r';
    }

    return Math.random() < 0.5 ? 'l' : 'r';
  }

  // ── Ana Oyun Döngüsü (maks 700 tur güvenlik limiti) ──────────
  for (let t = 0; t < 700; t++) {

    // ─ Kazanma kontrolü (yr > 50) ─
    if (yr > 50) {
      // Gizli eksen galibiyeti (≤2 ise özel biter)
      for (const h of HIDDEN) {
        if (hidden[h] <= 2) return { win: true, ending: h + '_win', yr };
      }
      // En yüksek görünür stat galibiyeti
      const best = STATS.reduce((a, b) => stats[a] > stats[b] ? a : b);
      return { win: true, ending: best + '_win', yr };
    }

    // ─ PARANOYA KARTI ─
    // HTML: evham≤2→7tur, evham3-4→6tur, evham≥5→4tur aralık
    const pInterval = evham <= 2 ? 7 : evham <= 4 ? 6 : 4;
    if (paranoiaSince >= pInterval) {
      paranoiaSince = 0;
      const gain  = evham >= 5 ? 2 : 1;
      const swing = evham >= 5 ? 6 : evham >= 3 ? 4 : 2;
      const affStat = STATS[Math.floor(Math.random() * 4)];

      let side;
      // Expert: paranoya artışını minimize et → sol tercih (%70)
      if      (strategy === 'expert')   side = Math.random() < 0.70 ? 'l' : 'r';
      else if (strategy === 'medium')   side = Math.random() < 0.55 ? 'l' : 'r';
      else                              side = Math.random() < 0.50 ? 'l' : 'r';

      if (side === 'r') {
        evham = Math.min(10, evham + gain);
        stats[affStat] = clamp(stats[affStat] + swing);
      } else {
        // Sol: daha az evham ama stat kaybı
        evham = Math.min(10, evham + Math.max(0, gain - 1));
        stats[affStat] = clamp(stats[affStat] - swing);
      }

      const loss = checkLoss();
      if (loss) return { win: false, ending: loss, yr };
      continue; // Paranoya kartı yıl ilerletmez
    }

    // ─ ZİNCİR OLAY (devam) ─
    if (chainStep > 0) {
      let accepts;
      if      (strategy === 'expert') accepts = false;           // Expert daima reddeder
      else if (strategy === 'medium') accepts = Math.random() < 0.30;
      else                            accepts = Math.random() < 0.45;

      if (chainStep === 3) {
        if (accepts) return { win: false, ending: chainType, yr };
        chainStep = 0; chainType = null;
      } else {
        if (accepts) chainStep++;
        else { chainStep = 0; chainType = null; }
      }
      continue; // Zincir adımları yıl ilerletmez
    }

    // ─ ZİNCİR OLAY BAŞLANGICI ─
    // HTML: 3 zincir, 8+ normal tur sonrası tetiklenir
    // Olasılık: ~%1.2/tur → 50 turda ~%45 en az bir teklif
    if (chainStep === 0 && normalTurns >= 8 && Math.random() < 0.012) {
      chainStep = 1;
      chainType = ['kosova', 'yedikule', 'sirpence'][Math.floor(Math.random() * 3)];
      continue;
    }

    // ─ NORMAL KART ─
    paranoiaSince++;
    normalTurns++;
    const card = draw();
    const side = choose(card);
    const val  = TIER_VALS[card.tier];

    // Stat güncelleme (simetrik sistem)
    if (side === 'l') {
      stats[card.boost]  = clamp(stats[card.boost]  - val);
      stats[card.debuff] = clamp(stats[card.debuff] + val);
    } else {
      stats[card.boost]  = clamp(stats[card.boost]  + val);
      stats[card.debuff] = clamp(stats[card.debuff] - val);
    }

    // Gizli eksen güncelleme
    if (card.hidden) {
      const d = side === 'l' ? card.hidden.l : card.hidden.r;
      hidden[card.hidden.stat] = Math.max(0, Math.min(10, hidden[card.hidden.stat] + d));
    }

    // Yıl ilerle + pasif decay
    yr++;
    for (const s of STATS) stats[s] = Math.max(0, stats[s] - PASSIVE[s]);

    const loss = checkLoss();
    if (loss) return { win: false, ending: loss, yr };
  }

  return { win: false, ending: 'timeout', yr };
}

// ── Simülasyon Koşucu ────────────────────────────────────────
function simulate(strategy, runs) {
  const results = {};
  let wins = 0, totalYr = 0;
  for (let i = 0; i < runs; i++) {
    const r = runGame(strategy);
    results[r.ending] = (results[r.ending] || 0) + 1;
    if (r.win) wins++;
    totalYr += r.yr;
  }
  return {
    results,
    wins,
    winRate: (wins / runs * 100).toFixed(1),
    avgYr:   (totalYr / runs).toFixed(1),
  };
}

// ── Çıktı ────────────────────────────────────────────────────
const RUNS = 1000;
const STRATEGIES = [
  { key: 'beginner', label: 'BAŞLANGIÇ  — rastgele, bariz ölümden kaçınır' },
  { key: 'medium',   label: 'ORTA       — en düşük statı korur'             },
  { key: 'expert',   label: 'UZMAN      — hayatta kalma + ending opt.'      },
];

const W = 62;
const line  = '═'.repeat(W);
const dline = '─'.repeat(W);

console.log('');
console.log(line);
console.log('  SULTAN — TAHT OYUNU v17  |  Node.js Simülasyon');
console.log(`  ${RUNS} run × 3 strateji  |  Hard Mode  |  RNG: Math.random()`);
console.log(line);

for (const { key, label } of STRATEGIES) {
  const t0 = performance.now();
  const { results, wins, winRate, avgYr } = simulate(key, RUNS);
  const ms = (performance.now() - t0).toFixed(0);

  console.log('');
  console.log(dline);
  console.log(`  ▶  ${label}`);
  console.log(dline);
  console.log(`  Winrate: %${String(winRate).padStart(5)}   |   Ort. Yıl: ${String(avgYr).padStart(5)}   |   ${ms}ms`);
  console.log('');
  console.log('  Ending                              Adet    %     Bar');
  console.log('  ' + '─'.repeat(56));

  const sorted = Object.entries(results).sort((a, b) => b[1] - a[1]);
  for (const [end, count] of sorted) {
    const pct   = (count / RUNS * 100).toFixed(1);
    const label = (ENDINGS[end] || end).padEnd(36);
    const bar   = '▓'.repeat(Math.min(18, Math.round(count / 28)));
    const cStr  = String(count).padStart(4);
    const pStr  = String(pct).padStart(5);
    console.log(`  ${label}  ${cStr}  ${pStr}%  ${bar}`);
  }
}

console.log('');
console.log(line);
console.log('  SİMÜLASYON TAMAMLANDI');
console.log(line);
console.log('');
