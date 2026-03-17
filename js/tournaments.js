// tournaments.js — Módulo Torneos (localStorage-first, sin romper Supabase actual)

(function () {
  const STORAGE_KEY = "openpadel_tournaments_v1";
  const $ = (id) => document.getElementById(id);

  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const BRANCHES = [
    { key: "men", label: "Hombres" },
    { key: "women", label: "Mujeres" }
  ];

  const ALLOWED_SIZES = [8, 12, 16, 20, 24, 28, 32, 36];
  const GROUP_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const UI = {
    selectedTournamentId: null,
    selectedBranch: "men",
    selectedCategoryId: null
  };

  function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function loadTournaments() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function saveTournaments(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event("op:tournamentsChanged"));
  }

  function getState() {
    return loadTournaments();
  }

  function saveState(rows) {
    saveTournaments(rows);
  }

  function niceDate(raw) {
    const d = new Date(String(raw || "").slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(raw || "").slice(0, 10);
    return d.toLocaleDateString("es-EC", { year: "numeric", month: "long", day: "2-digit" });
  }

  function playerFullName(p) {
    return `${String(p.firstName || "").trim()} ${String(p.lastName || "").trim()}`.trim();
  }

  function pairLabel(pair, category) {
    const p1 = category.players.find(p => p.id === pair.player1Id);
    const p2 = category.players.find(p => p.id === pair.player2Id);
    const n1 = p1 ? playerFullName(p1) : "Jugador 1";
    const n2 = p2 ? playerFullName(p2) : "Jugador 2";
    return `${n1} / ${n2}`;
  }

  function playerRanking(p) {
    return Number(p?.ranking || 0);
  }

  function pairRanking(pair, category) {
    const p1 = category.players.find(p => p.id === pair.player1Id);
    const p2 = category.players.find(p => p.id === pair.player2Id);
    return playerRanking(p1) + playerRanking(p2);
  }

  function categoryFormat(size) {
    switch (Number(size)) {
      case 8:
        return {
          size: 8,
          groups: [4, 4],
          qualifyPerGroup: 2,
          knockoutStart: "semifinal"
        };
      case 12:
        return {
          size: 12,
          groups: [3, 3, 3, 3],
          qualifyPerGroup: 2,
          knockoutStart: "quarterfinal"
        };
      case 16:
        return {
          size: 16,
          groups: [4, 4, 4, 4],
          qualifyPerGroup: 2,
          knockoutStart: "quarterfinal"
        };
      case 20:
        return {
          size: 20,
          groups: [5, 5, 5, 5],
          qualifyPerGroup: 4,
          knockoutStart: "round16"
        };
      case 24:
        return {
          size: 24,
          groups: [3, 3, 3, 3, 3, 3, 3, 3],
          qualifyPerGroup: 2,
          knockoutStart: "round16"
        };
      case 28:
        return {
          size: 28,
          groups: [4, 4, 4, 4, 3, 3, 3, 3],
          qualifyPerGroup: 2,
          knockoutStart: "round16"
        };
      case 32:
        return {
          size: 32,
          groups: [4, 4, 4, 4, 4, 4, 4, 4],
          qualifyPerGroup: 2,
          knockoutStart: "round16"
        };
      case 36:
        return {
          size: 36,
          groups: [4, 4, 4, 4, 4, 4, 4, 4, 4],
          qualifyPerGroup: 1,
          extraBestSecond: 7,
          knockoutStart: "round16"
        };
      default:
        throw new Error("Formato no soportado.");
    }
  }

  function emptyCategory(name, size) {
    return {
      id: uid("cat"),
      name,
      size: Number(size),
      format: categoryFormat(Number(size)),
      players: [],
      pairs: [],
      groups: [],
      knockout: {
        rounds: []
      },
      notes: "",
      createdAt: new Date().toISOString()
    };
  }

  function emptyTournament({ name, startDate, endDate }) {
    return {
      id: uid("tor"),
      name: String(name || "").trim(),
      startDate,
      endDate,
      branches: {
        men: { label: "Hombres", categories: [] },
        women: { label: "Mujeres", categories: [] }
      },
      createdAt: new Date().toISOString()
    };
  }

  function findTournament(rows, tournamentId) {
    return rows.find(t => t.id === tournamentId) || null;
  }

  function findCategory(tournament, branchKey, categoryId) {
    const branch = tournament?.branches?.[branchKey];
    if (!branch) return null;
    return branch.categories.find(c => c.id === categoryId) || null;
  }

  function updateTournament(rows, tournamentId, updater) {
    const next = rows.map(t => {
      if (t.id !== tournamentId) return t;
      const copy = structuredClone(t);
      updater(copy);
      return copy;
    });
    saveState(next);
    return next;
  }

  function structuredClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureSelection(rows) {
    if (!rows.length) {
      UI.selectedTournamentId = null;
      UI.selectedCategoryId = null;
      return;
    }

    if (!UI.selectedTournamentId || !rows.some(t => t.id === UI.selectedTournamentId)) {
      UI.selectedTournamentId = rows[0].id;
    }

    const tournament = findTournament(rows, UI.selectedTournamentId);
    const categories = tournament?.branches?.[UI.selectedBranch]?.categories || [];

    if (!categories.length) {
      UI.selectedCategoryId = null;
      return;
    }

    if (!UI.selectedCategoryId || !categories.some(c => c.id === UI.selectedCategoryId)) {
      UI.selectedCategoryId = categories[0].id;
    }
  }

  function seedPairs(category) {
    return category.pairs
      .map(pair => ({
        ...pair,
        totalRanking: pairRanking(pair, category)
      }))
      .sort((a, b) => {
        if (b.totalRanking !== a.totalRanking) return b.totalRanking - a.totalRanking;
        return pairLabel(a, category).localeCompare(pairLabel(b, category), "es", { sensitivity: "base" });
      });
  }

  function combinations(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        out.push([list[i], list[j]]);
      }
    }
    return out;
  }

  function generateGroupsForCategory(category) {
    const format = categoryFormat(category.size);
    const sortedPairs = seedPairs(category);

    if (sortedPairs.length !== category.size) {
      throw new Error(`La categoría necesita exactamente ${category.size} parejas.`);
    }

    const groups = format.groups.map((capacity, idx) => ({
      id: GROUP_NAMES[idx],
      name: `Grupo ${GROUP_NAMES[idx]}`,
      capacity,
      pairIds: [],
      matches: []
    }));

    const seededCount = groups.length;
    const seeded = sortedPairs.slice(0, seededCount);
    const remaining = shuffle(sortedPairs.slice(seededCount));

    seeded.forEach((pair, idx) => {
      groups[idx].pairIds.push(pair.id);
    });

    groups.forEach((g, idx) => {
      const pairId = g.pairIds[0];
      const pairIndex = sortedPairs.findIndex(p => p.id === pairId);
      if (pairId && pairIndex >= 0) {
        const sourcePair = category.pairs.find(p => p.id === pairId);
        if (sourcePair) sourcePair.seedNumber = idx + 1;
      }
    });

    let cursor = 0;
    while (remaining.length) {
      const group = groups[cursor % groups.length];
      if (group.pairIds.length < group.capacity) {
        group.pairIds.push(remaining.shift().id);
      }
      cursor++;
    }

    groups.forEach(group => {
      const pairs = group.pairIds.map(id => category.pairs.find(p => p.id === id)).filter(Boolean);
      const matchPairs = combinations(pairs);
      group.matches = matchPairs.map(([a, b], idx) => ({
        id: uid("gm"),
        stage: "group",
        roundName: group.name,
        groupId: group.id,
        order: idx + 1,
        pairAId: a.id,
        pairBId: b.id,
        sets: [],
        winnerPairId: null,
        completed: false
      }));
    });

    category.groups = groups;
    category.knockout = { rounds: [] };
  }

  function isValidNormalSet(a, b, tbA, tbB) {
    a = Number(a); b = Number(b);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
    if (a === b) return false;
    const high = Math.max(a, b);
    const low = Math.min(a, b);

    if (high === 6 && low <= 4) return true;
    if (high === 7 && low === 5) return true;
    if (high === 7 && low === 6) {
      const tba = Number(tbA);
      const tbb = Number(tbB);
      if (!Number.isInteger(tba) || !Number.isInteger(tbb)) return false;
      const winnerTb = Math.max(tba, tbb);
      const loserTb = Math.min(tba, tbb);
      if (winnerTb < 7) return false;
      if (winnerTb - loserTb < 2) return false;
      return true;
    }

    return false;
  }

  function isValidSuperTieBreak(a, b) {
    a = Number(a); b = Number(b);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
    if (a === b) return false;
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    return high >= 10 && (high - low) >= 2;
  }

  function stageIsShort(stage) {
    return ["group", "round16", "quarterfinal"].includes(stage);
  }

  function stageLabel(stage) {
    switch (stage) {
      case "group": return "Fase de grupos";
      case "round16": return "Octavos de final";
      case "quarterfinal": return "Cuartos de final";
      case "semifinal": return "Semifinal";
      case "final": return "Final";
      default: return stage;
    }
  }

  function validateAndNormalizeSets(stage, rawSets) {
    const cleaned = rawSets
      .map(s => ({
        type: s.type,
        a: s.a === "" || s.a == null ? null : Number(s.a),
        b: s.b === "" || s.b == null ? null : Number(s.b),
        tbA: s.tbA === "" || s.tbA == null ? null : Number(s.tbA),
        tbB: s.tbB === "" || s.tbB == null ? null : Number(s.tbB)
      }))
      .filter(s => s.a != null && s.b != null);

    if (cleaned.length < 2) {
      throw new Error("Debes ingresar al menos 2 sets.");
    }

    const sets = [];
    let winsA = 0;
    let winsB = 0;

    for (let i = 0; i < cleaned.length; i++) {
      const set = cleaned[i];
      const isThird = i === 2;

      if (isThird && stageIsShort(stage) && winsA === 1 && winsB === 1) {
        if (!isValidSuperTieBreak(set.a, set.b)) {
          throw new Error("El super tie-break debe ser a 10 puntos con diferencia de 2.");
        }
        const winner = set.a > set.b ? "A" : "B";
        if (winner === "A") winsA++;
        else winsB++;
        sets.push({ type: "super", a: set.a, b: set.b, tbA: null, tbB: null });
        continue;
      }

      if (!isValidNormalSet(set.a, set.b, set.tbA, set.tbB)) {
        throw new Error(`Set ${i + 1} inválido.`);
      }

      const winner = set.a > set.b ? "A" : "B";
      if (winner === "A") winsA++;
      else winsB++;
      sets.push({
        type: "normal",
        a: set.a,
        b: set.b,
        tbA: (Math.max(set.a, set.b) === 7 && Math.min(set.a, set.b) === 6) ? set.tbA : null,
        tbB: (Math.max(set.a, set.b) === 7 && Math.min(set.a, set.b) === 6) ? set.tbB : null
      });

      if (winsA === 2 || winsB === 2) break;
    }

    if (winsA !== 2 && winsB !== 2) {
      throw new Error("El partido debe terminar con 2 sets ganados por una pareja.");
    }

    if (!stageIsShort(stage) && cleaned.length >= 3 && winsA === 1 && winsB === 1) {
      const third = cleaned[2];
      if (!isValidNormalSet(third.a, third.b, third.tbA, third.tbB)) {
        throw new Error("En semifinal y final el tercer set debe ser completo.");
      }
    }

    return sets;
  }

  function matchStats(match) {
    const stats = {
      pairA: { wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 },
      pairB: { wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 }
    };

    if (!match.completed || !Array.isArray(match.sets) || !match.sets.length) return stats;

    let winsA = 0;
    let winsB = 0;

    match.sets.forEach(set => {
      if (set.type === "super") {
        if (Number(set.a) > Number(set.b)) {
          winsA++;
          stats.pairA.setsWon++;
          stats.pairB.setsLost++;
        } else {
          winsB++;
          stats.pairB.setsWon++;
          stats.pairA.setsLost++;
        }
        return;
      }

      stats.pairA.gamesWon += Number(set.a || 0);
      stats.pairA.gamesLost += Number(set.b || 0);
      stats.pairB.gamesWon += Number(set.b || 0);
      stats.pairB.gamesLost += Number(set.a || 0);

      if (Number(set.a) > Number(set.b)) {
        winsA++;
        stats.pairA.setsWon++;
        stats.pairB.setsLost++;
      } else {
        winsB++;
        stats.pairB.setsWon++;
        stats.pairA.setsLost++;
      }
    });

    if (winsA > winsB) {
      stats.pairA.wins++;
      stats.pairB.losses++;
    } else {
      stats.pairB.wins++;
      stats.pairA.losses++;
    }

    return stats;
  }

  function computeGroupStandings(category, group) {
    const rows = group.pairIds.map(pairId => ({
      pairId,
      pairName: pairLabel(category.pairs.find(p => p.id === pairId), category),
      pj: 0,
      pg: 0,
      pp: 0,
      sg: 0,
      sp: 0,
      dgs: 0,
      gg: 0,
      gp: 0,
      dg: 0
    }));

    const rowMap = new Map(rows.map(r => [r.pairId, r]));

    group.matches.forEach(match => {
      if (!match.completed) return;
      const stats = matchStats(match);

      const ra = rowMap.get(match.pairAId);
      const rb = rowMap.get(match.pairBId);
      if (!ra || !rb) return;

      ra.pj++;
      rb.pj++;

      ra.pg += stats.pairA.wins;
      ra.pp += stats.pairA.losses;
      rb.pg += stats.pairB.wins;
      rb.pp += stats.pairB.losses;

      ra.sg += stats.pairA.setsWon;
      ra.sp += stats.pairA.setsLost;
      rb.sg += stats.pairB.setsWon;
      rb.sp += stats.pairB.setsLost;

      ra.gg += stats.pairA.gamesWon;
      ra.gp += stats.pairA.gamesLost;
      rb.gg += stats.pairB.gamesWon;
      rb.gp += stats.pairB.gamesLost;
    });

    rows.forEach(r => {
      r.dgs = r.sg - r.sp;
      r.dg = r.gg - r.gp;
    });

    rows.sort((a, b) => {
      if (b.pg !== a.pg) return b.pg - a.pg;
      if (b.dgs !== a.dgs) return b.dgs - a.dgs;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gg !== a.gg) return b.gg - a.gg;
      return a.pairName.localeCompare(b.pairName, "es", { sensitivity: "base" });
    });

    return rows;
  }

  function allGroupMatchesComplete(category) {
    return category.groups.every(group => group.matches.every(m => m.completed));
  }

  function qualifyFromGroups(category) {
    const format = categoryFormat(category.size);
    const standingsByGroup = category.groups.map(group => ({
      groupId: group.id,
      rows: computeGroupStandings(category, group)
    }));

    if (category.size === 36) {
      const winners = standingsByGroup.map(g => ({
        groupId: g.groupId,
        pairId: g.rows[0]?.pairId,
        position: 1,
        metrics: g.rows[0]
      })).filter(x => x.pairId);

      const seconds = standingsByGroup.map(g => ({
        groupId: g.groupId,
        pairId: g.rows[1]?.pairId,
        position: 2,
        metrics: g.rows[1]
      })).filter(x => x.pairId);

      seconds.sort((a, b) => {
        if ((b.metrics.pg || 0) !== (a.metrics.pg || 0)) return (b.metrics.pg || 0) - (a.metrics.pg || 0);
        if ((b.metrics.dgs || 0) !== (a.metrics.dgs || 0)) return (b.metrics.dgs || 0) - (a.metrics.dgs || 0);
        if ((b.metrics.dg || 0) !== (a.metrics.dg || 0)) return (b.metrics.dg || 0) - (a.metrics.dg || 0);
        if ((b.metrics.gg || 0) !== (a.metrics.gg || 0)) return (b.metrics.gg || 0) - (a.metrics.gg || 0);
        return a.groupId.localeCompare(b.groupId);
      });

      return [...winners, ...seconds.slice(0, format.extraBestSecond)];
    }

    const qualifiers = [];
    standingsByGroup.forEach(g => {
      for (let i = 0; i < format.qualifyPerGroup; i++) {
        const row = g.rows[i];
        if (!row) continue;
        qualifiers.push({
          groupId: g.groupId,
          pairId: row.pairId,
          position: i + 1,
          metrics: row
        });
      }
    });

    return qualifiers;
  }

  function knockoutTemplate(category, qualifiers) {
    const groupCount = category.format.groups.length;

    if (category.size === 8) {
      const byGroup = Object.fromEntries(qualifiers.map(q => [`${q.position}${q.groupId}`, q]));
      return [
        { a: byGroup["1A"]?.pairId || null, b: byGroup["2B"]?.pairId || null },
        { a: byGroup["1B"]?.pairId || null, b: byGroup["2A"]?.pairId || null }
      ];
    }

    if (category.size === 12 || category.size === 16) {
      const byGroup = Object.fromEntries(qualifiers.map(q => [`${q.position}${q.groupId}`, q]));
      return [
        { a: byGroup["1A"]?.pairId || null, b: byGroup["2D"]?.pairId || null },
        { a: byGroup["1B"]?.pairId || null, b: byGroup["2C"]?.pairId || null },
        { a: byGroup["1C"]?.pairId || null, b: byGroup["2B"]?.pairId || null },
        { a: byGroup["1D"]?.pairId || null, b: byGroup["2A"]?.pairId || null }
      ];
    }

    if (category.size === 20) {
      const byGroup = Object.fromEntries(qualifiers.map(q => [`${q.position}${q.groupId}`, q]));
      return [
        { a: byGroup["1A"]?.pairId || null, b: byGroup["4D"]?.pairId || null },
        { a: byGroup["2A"]?.pairId || null, b: byGroup["3D"]?.pairId || null },
        { a: byGroup["1B"]?.pairId || null, b: byGroup["4C"]?.pairId || null },
        { a: byGroup["2B"]?.pairId || null, b: byGroup["3C"]?.pairId || null },
        { a: byGroup["1C"]?.pairId || null, b: byGroup["4B"]?.pairId || null },
        { a: byGroup["2C"]?.pairId || null, b: byGroup["3B"]?.pairId || null },
        { a: byGroup["1D"]?.pairId || null, b: byGroup["4A"]?.pairId || null },
        { a: byGroup["2D"]?.pairId || null, b: byGroup["3A"]?.pairId || null }
      ];
    }

    if ([24, 28, 32].includes(category.size) && groupCount === 8) {
      const byGroup = Object.fromEntries(qualifiers.map(q => [`${q.position}${q.groupId}`, q]));
      return [
        { a: byGroup["1A"]?.pairId || null, b: byGroup["2H"]?.pairId || null },
        { a: byGroup["1B"]?.pairId || null, b: byGroup["2G"]?.pairId || null },
        { a: byGroup["1C"]?.pairId || null, b: byGroup["2F"]?.pairId || null },
        { a: byGroup["1D"]?.pairId || null, b: byGroup["2E"]?.pairId || null },
        { a: byGroup["1E"]?.pairId || null, b: byGroup["2D"]?.pairId || null },
        { a: byGroup["1F"]?.pairId || null, b: byGroup["2C"]?.pairId || null },
        { a: byGroup["1G"]?.pairId || null, b: byGroup["2B"]?.pairId || null },
        { a: byGroup["1H"]?.pairId || null, b: byGroup["2A"]?.pairId || null }
      ];
    }

    if (category.size === 36) {
      const sorted = qualifiers.slice().map((q, idx) => ({ ...q, seed: idx + 1 }));
      const bySeed = Object.fromEntries(sorted.map(q => [q.seed, q]));
      return [
        { a: bySeed[1]?.pairId || null, b: bySeed[16]?.pairId || null },
        { a: bySeed[8]?.pairId || null, b: bySeed[9]?.pairId || null },
        { a: bySeed[5]?.pairId || null, b: bySeed[12]?.pairId || null },
        { a: bySeed[4]?.pairId || null, b: bySeed[13]?.pairId || null },
        { a: bySeed[3]?.pairId || null, b: bySeed[14]?.pairId || null },
        { a: bySeed[6]?.pairId || null, b: bySeed[11]?.pairId || null },
        { a: bySeed[7]?.pairId || null, b: bySeed[10]?.pairId || null },
        { a: bySeed[2]?.pairId || null, b: bySeed[15]?.pairId || null }
      ];
    }

    return [];
  }

  function createKnockout(category) {
    if (!allGroupMatchesComplete(category)) {
      throw new Error("Primero debes completar todos los partidos de grupos.");
    }

    const qualifiers = qualifyFromGroups(category);
    const firstRoundMatches = knockoutTemplate(category, qualifiers);

    const rounds = [];
    const start = category.format.knockoutStart;

    if (start === "semifinal") {
      rounds.push({
        stage: "semifinal",
        title: "Semifinal",
        matches: firstRoundMatches.map((m, idx) => ({
          id: uid("ko"),
          stage: "semifinal",
          order: idx + 1,
          pairAId: m.a,
          pairBId: m.b,
          winnerPairId: null,
          completed: false,
          sets: []
        }))
      });

      rounds.push({
        stage: "final",
        title: "Final",
        matches: [{
          id: uid("ko"),
          stage: "final",
          order: 1,
          pairAId: null,
          pairBId: null,
          winnerPairId: null,
          completed: false,
          sets: []
        }]
      });
    }

    if (start === "quarterfinal") {
      rounds.push({
        stage: "quarterfinal",
        title: "Cuartos de final",
        matches: firstRoundMatches.map((m, idx) => ({
          id: uid("ko"),
          stage: "quarterfinal",
          order: idx + 1,
          pairAId: m.a,
          pairBId: m.b,
          winnerPairId: null,
          completed: false,
          sets: []
        }))
      });

      rounds.push({
        stage: "semifinal",
        title: "Semifinal",
        matches: Array.from({ length: 2 }).map((_, idx) => ({
          id: uid("ko"),
          stage: "semifinal",
          order: idx + 1,
          pairAId: null,
          pairBId: null,
          winnerPairId: null,
          completed: false,
          sets: []
        }))
      });

      rounds.push({
        stage: "final",
        title: "Final",
        matches: [{
          id: uid("ko"),
          stage: "final",
          order: 1,
          pairAId: null,
          pairBId: null,
          winnerPairId: null,
          completed: false,
          sets: []
        }]
      });
    }

    if (start === "round16") {
      rounds.push({
        stage: "round16",
        title: "Octavos de final",
        matches: firstRoundMatches.map((m, idx) => ({
          id: uid("ko"),
          stage: "round16",
          order: idx + 1,
          pairAId: m.a,
          pairBId: m.b,
          winnerPairId: null,
          completed: false,
          sets: []
        }))
      });

      rounds.push({
        stage: "quarterfinal",
        title: "Cuartos de final",
        matches: Array.from({ length: 4 }).map((_, idx) => ({
          id: uid("ko"),
          stage: "quarterfinal",
          order: idx + 1,
          pairAId: null,
          pairBId: null,
          winnerPairId: null,
          completed: false,
          sets: []
        }))
      });

      rounds.push({
        stage: "semifinal",
        title: "Semifinal",
        matches: Array.from({ length: 2 }).map((_, idx) => ({
          id: uid("ko"),
          stage: "semifinal",
          order: idx + 1,
          pairAId: null,
          pairBId: null,
          winnerPairId: null,
          completed: false,
          sets: []
        }))
      });

      rounds.push({
        stage: "final",
        title: "Final",
        matches: [{
          id: uid("ko"),
          stage: "final",
          order: 1,
          pairAId: null,
          pairBId: null,
          winnerPairId: null,
          completed: false,
          sets: []
        }]
      });
    }

    category.knockout = { rounds };
    propagateKnockoutWinners(category);
  }

  function propagateKnockoutWinners(category) {
    const rounds = category.knockout?.rounds || [];
    if (!rounds.length) return;

    for (let r = 0; r < rounds.length - 1; r++) {
      const current = rounds[r];
      const next = rounds[r + 1];

      next.matches.forEach((match, idx) => {
        const sourceIndexA = idx * 2;
        const sourceIndexB = idx * 2 + 1;

        const srcA = current.matches[sourceIndexA];
        const srcB = current.matches[sourceIndexB];

        const winnerA = srcA?.completed ? srcA.winnerPairId : null;
        const winnerB = srcB?.completed ? srcB.winnerPairId : null;

        const prevA = match.pairAId;
        const prevB = match.pairBId;

        match.pairAId = winnerA || null;
        match.pairBId = winnerB || null;

        if ((prevA !== match.pairAId || prevB !== match.pairBId) && !match.completed) {
          match.sets = [];
          match.winnerPairId = null;
        }
      });
    }
  }

  function getPairNameById(category, pairId) {
    const pair = category.pairs.find(p => p.id === pairId);
    if (!pair) return "Por definir";
    return pairLabel(pair, category);
  }

  function saveGroupMatch(category, groupId, matchId, rawSets) {
    const group = category.groups.find(g => g.id === groupId);
    if (!group) throw new Error("Grupo no encontrado.");
    const match = group.matches.find(m => m.id === matchId);
    if (!match) throw new Error("Partido no encontrado.");

    const sets = validateAndNormalizeSets(match.stage, rawSets);
    const winsA = sets.filter(s => s.a > s.b).length;
    const winsB = sets.filter(s => s.b > s.a).length;
    match.sets = sets;
    match.winnerPairId = winsA > winsB ? match.pairAId : match.pairBId;
    match.completed = true;
  }

  function saveKnockoutMatch(category, roundIndex, matchId, rawSets) {
    const round = category.knockout.rounds[roundIndex];
    if (!round) throw new Error("Ronda no encontrada.");
    const match = round.matches.find(m => m.id === matchId);
    if (!match) throw new Error("Partido no encontrado.");
    if (!match.pairAId || !match.pairBId) throw new Error("Aún faltan clasificados por definir.");

    const sets = validateAndNormalizeSets(match.stage, rawSets);
    const winsA = sets.filter(s => s.a > s.b).length;
    const winsB = sets.filter(s => s.b > s.a).length;

    match.sets = sets;
    match.winnerPairId = winsA > winsB ? match.pairAId : match.pairBId;
    match.completed = true;
    propagateKnockoutWinners(category);
  }

  function renderPairSelectOptions(category, excludeIds = []) {
    const used = new Set(
      category.pairs.flatMap(p => [p.player1Id, p.player2Id])
    );

    return category.players
      .filter(p => !used.has(p.id) || excludeIds.includes(p.id))
      .sort((a, b) => playerFullName(a).localeCompare(playerFullName(b), "es", { sensitivity: "base" }))
      .map(p => `<option value="${esc(p.id)}">${esc(p.cedula)} • ${esc(playerFullName(p))} • Rk ${esc(p.ranking)}</option>`)
      .join("");
  }

  function groupSummary(format) {
    const groupsText = format.groups.map((n, idx) => `${GROUP_NAMES[idx]} (${n})`).join(", ");
    if (format.size === 36) {
      return `Grupos: ${groupsText} • Clasifican 9 primeros + 7 mejores segundos • ${stageLabel(format.knockoutStart)}`;
    }
    return `Grupos: ${groupsText} • Clasifican ${format.qualifyPerGroup} por grupo • ${stageLabel(format.knockoutStart)}`;
  }

  function renderMatchEditor(targetId, match, stageLabelText) {
    return `
      <details class="soft-panel" style="margin-top:8px;" id="${esc(targetId)}">
        <summary style="cursor:pointer; font-weight:800;">Cargar / editar marcador</summary>
        <div class="stack" style="margin-top:10px;">
          <div class="hint muted">${esc(stageLabelText)}</div>

          <div class="soft-panel">
            <div class="hint muted" style="margin-bottom:8px;"><b>Set 1</b></div>
            <div class="match-set-grid">
              <div><label>Games A</label><input type="number" min="0" max="7" data-set="0" data-field="a" value="${esc(match.sets?.[0]?.a ?? "")}"></div>
              <div><label>Games B</label><input type="number" min="0" max="7" data-set="0" data-field="b" value="${esc(match.sets?.[0]?.b ?? "")}"></div>
              <div><label>TB A</label><input type="number" min="0" data-set="0" data-field="tbA" value="${esc(match.sets?.[0]?.tbA ?? "")}"></div>
              <div><label>TB B</label><input type="number" min="0" data-set="0" data-field="tbB" value="${esc(match.sets?.[0]?.tbB ?? "")}"></div>
              <div></div><div></div>
            </div>
          </div>

          <div class="soft-panel">
            <div class="hint muted" style="margin-bottom:8px;"><b>Set 2</b></div>
            <div class="match-set-grid">
              <div><label>Games A</label><input type="number" min="0" max="7" data-set="1" data-field="a" value="${esc(match.sets?.[1]?.a ?? "")}"></div>
              <div><label>Games B</label><input type="number" min="0" max="7" data-set="1" data-field="b" value="${esc(match.sets?.[1]?.b ?? "")}"></div>
              <div><label>TB A</label><input type="number" min="0" data-set="1" data-field="tbA" value="${esc(match.sets?.[1]?.tbA ?? "")}"></div>
              <div><label>TB B</label><input type="number" min="0" data-set="1" data-field="tbB" value="${esc(match.sets?.[1]?.tbB ?? "")}"></div>
              <div></div><div></div>
            </div>
          </div>

          <div class="soft-panel">
            <div class="hint muted" style="margin-bottom:8px;">
              <b>Set 3</b> — en grupos/octavos/cuartos es <b>super tie-break</b> si van 1-1; en semis/final es <b>set completo</b>.
            </div>
            <div class="match-set-grid">
              <div><label>A</label><input type="number" min="0" data-set="2" data-field="a" value="${esc(match.sets?.[2]?.a ?? "")}"></div>
              <div><label>B</label><input type="number" min="0" data-set="2" data-field="b" value="${esc(match.sets?.[2]?.b ?? "")}"></div>
              <div><label>TB A</label><input type="number" min="0" data-set="2" data-field="tbA" value="${esc(match.sets?.[2]?.tbA ?? "")}"></div>
              <div><label>TB B</label><input type="number" min="0" data-set="2" data-field="tbB" value="${esc(match.sets?.[2]?.tbB ?? "")}"></div>
              <div></div><div></div>
            </div>
          </div>

          <div class="btns">
            <button class="primary" type="button" data-save-match="${esc(match.id)}">Guardar resultado</button>
          </div>
        </div>
      </details>
    `;
  }

  function renderCategoryDetail(tournament, branchKey, category) {
    const seededPairs = seedPairs(category);
    const unpairedPlayers = category.players.filter(
      p => !category.pairs.some(pair => pair.player1Id === p.id || pair.player2Id === p.id)
    );
    const canGenerateGroups = category.pairs.length === category.size;
    const groupReady = category.groups.length > 0;

    return `
      <div class="stack">
        <div class="card">
          <div class="section-title-row">
            <div>
              <h3 style="margin:0;">${esc(category.name)}</h3>
              <div class="hint muted" style="margin-top:6px;">
                ${esc(groupSummary(category.format))}
              </div>
            </div>

            <div class="btns">
              <button class="ghost" id="btnResetCategory" type="button">Resetear grupos / llave</button>
              <button class="primary" id="btnGenerateGroups" type="button" ${canGenerateGroups ? "" : "disabled"}>
                Autoarmar grupos
              </button>
              <button class="primary" id="btnGenerateKnockout" type="button" ${groupReady ? "" : "disabled"}>
                Generar llave final
              </button>
            </div>
          </div>
        </div>

        <div class="grid-4">
          <div class="kpi">
            <div class="v">${esc(category.players.length)}</div>
            <div class="l">Jugadores cargados</div>
          </div>
          <div class="kpi">
            <div class="v">${esc(category.pairs.length)} / ${esc(category.size)}</div>
            <div class="l">Parejas cargadas</div>
          </div>
          <div class="kpi">
            <div class="v">${esc(category.format.groups.length)}</div>
            <div class="l">Grupos</div>
          </div>
          <div class="kpi">
            <div class="v">${esc(category.knockout?.rounds?.length || 0)}</div>
            <div class="l">Rondas de llave</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h3 style="margin:0 0 12px;">Agregar jugador a la categoría</h3>
            <div class="grid-2">
              <div>
                <label>Cédula</label>
                <input id="torCedula" type="text" placeholder="Ej: 0912345678">
              </div>
              <div>
                <label>Asociado</label>
                <select id="torAsociado">
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label>Nombres</label>
                <input id="torFirstName" type="text" placeholder="Nombres">
              </div>
              <div>
                <label>Apellidos</label>
                <input id="torLastName" type="text" placeholder="Apellidos">
              </div>
              <div>
                <label>Ranking individual</label>
                <input id="torRanking" type="number" min="0" step="1" value="0">
              </div>
              <div style="display:flex; align-items:end;">
                <button class="primary" id="btnAddTournamentPlayer" type="button" style="width:100%;">
                  Guardar jugador
                </button>
              </div>
            </div>
            <div id="torPlayerStatus" class="hint muted" style="margin-top:10px;"></div>
          </div>

          <div class="card">
            <h3 style="margin:0 0 12px;">Crear pareja</h3>
            <div class="grid-2">
              <div>
                <label>Jugador 1</label>
                <select id="pairPlayer1">
                  <option value="">Selecciona…</option>
                  ${renderPairSelectOptions(category)}
                </select>
              </div>
              <div>
                <label>Jugador 2</label>
                <select id="pairPlayer2">
                  <option value="">Selecciona…</option>
                  ${renderPairSelectOptions(category)}
                </select>
              </div>
            </div>
            <div class="btns" style="margin-top:12px;">
              <button class="primary" id="btnCreatePair" type="button">Guardar pareja</button>
            </div>
            <div class="hint muted" style="margin-top:10px;">
              Jugadores sin pareja: <b>${esc(unpairedPlayers.length)}</b>
            </div>
            <div id="torPairStatus" class="hint muted" style="margin-top:6px;"></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h3 style="margin:0 0 12px;">Jugadores de la categoría</h3>
            ${category.players.length ? category.players
              .slice()
              .sort((a, b) => playerFullName(a).localeCompare(playerFullName(b), "es", { sensitivity: "base" }))
              .map(p => `
                <div class="list-row">
                  <div>
                    <div><b>${esc(playerFullName(p))}</b></div>
                    <div class="hint muted mono">${esc(p.cedula)} • Ranking ${esc(p.ranking)} • ${p.associated ? "Asociado" : "No asociado"}</div>
                  </div>
                  <div class="btns">
                    <button class="ghost small" type="button" data-del-player="${esc(p.id)}">Borrar</button>
                  </div>
                </div>
              `).join("")
              : `<div class="empty">Aún no hay jugadores en esta categoría.</div>`}
          </div>

          <div class="card">
            <h3 style="margin:0 0 12px;">Parejas</h3>
            ${seededPairs.length ? seededPairs.map((pair, idx) => `
              <div class="list-row">
                <div>
                  <div><b>${esc(pairLabel(pair, category))}</b></div>
                  <div class="hint muted">Ranking pareja: <b>${esc(pair.totalRanking)}</b> ${idx < category.format.groups.length ? `• Siembra #${idx + 1}` : ""}</div>
                </div>
                <div class="btns">
                  <button class="ghost small" type="button" data-del-pair="${esc(pair.id)}">Borrar</button>
                </div>
              </div>
            `).join("") : `<div class="empty">Aún no hay parejas creadas.</div>`}
          </div>
        </div>

        <div class="card">
          <h3 style="margin:0 0 12px;">Grupos</h3>
          ${category.groups.length ? category.groups.map(group => {
            const standings = computeGroupStandings(category, group);

            return `
              <div class="group-box" style="margin-bottom:12px;">
                <div class="section-title-row" style="margin-bottom:10px;">
                  <div>
                    <h4>${esc(group.name)}</h4>
                    <div class="hint muted">Capacidad: ${esc(group.capacity)} parejas</div>
                  </div>
                  <div class="inline-meta">
                    ${group.pairIds.map((pairId, idx) => {
                      const pair = category.pairs.find(p => p.id === pairId);
                      return `<span class="chip">P${idx + 1}: ${esc(pairLabel(pair, category))}</span>`;
                    }).join("")}
                  </div>
                </div>

                <div style="overflow:auto;">
                  <table>
                    <thead>
                      <tr>
                        <th>Pareja</th>
                        <th>PJ</th>
                        <th>PG</th>
                        <th>PP</th>
                        <th>SG</th>
                        <th>SP</th>
                        <th>DGs</th>
                        <th>GG</th>
                        <th>GP</th>
                        <th>DG</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${standings.map(row => `
                        <tr>
                          <td><b>${esc(row.pairName)}</b></td>
                          <td>${esc(row.pj)}</td>
                          <td>${esc(row.pg)}</td>
                          <td>${esc(row.pp)}</td>
                          <td>${esc(row.sg)}</td>
                          <td>${esc(row.sp)}</td>
                          <td>${esc(row.dgs)}</td>
                          <td>${esc(row.gg)}</td>
                          <td>${esc(row.gp)}</td>
                          <td>${esc(row.dg)}</td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>

                <div class="sep"></div>

                <div class="stack">
                  ${group.matches.map(match => `
                    <div class="soft-panel">
                      <div class="section-title-row">
                        <div>
                          <div><b>${esc(getPairNameById(category, match.pairAId))}</b> vs <b>${esc(getPairNameById(category, match.pairBId))}</b></div>
                          <div class="hint muted">
                            ${match.completed
                              ? `Resultado cargado • ganador: ${esc(getPairNameById(category, match.winnerPairId))}`
                              : "Pendiente"}
                          </div>
                        </div>
                      </div>

                      ${renderMatchEditor(`gm_${match.id}`, match, `${group.name} • Partido ${match.order}`)}
                    </div>
                  `).join("")}
                </div>
              </div>
            `;
          }).join("") : `<div class="empty">Aún no se han generado los grupos.</div>`}
        </div>

        <div class="card">
          <h3 style="margin:0 0 12px;">Llave final</h3>
          ${renderKnockout(category)}
        </div>
      </div>
    `;
  }

  function renderKnockout(category) {
    const rounds = category.knockout?.rounds || [];
    if (!rounds.length) {
      return `<div class="empty">Aún no se ha generado la llave final.</div>`;
    }

    return `
      <div class="bracket-wrap">
        ${rounds.map((round, roundIndex) => `
          <div class="bracket-round">
            <div class="chip">${esc(round.title)}</div>

            ${round.matches.map(match => `
              <div class="bracket-card">
                <div><b>${esc(getPairNameById(category, match.pairAId))}</b></div>
                <div style="margin:4px 0 8px;"><b>${esc(getPairNameById(category, match.pairBId))}</b></div>
                <div class="hint muted">
                  ${match.completed ? `Ganador: ${esc(getPairNameById(category, match.winnerPairId))}` : "Pendiente"}
                </div>

                ${match.pairAId && match.pairBId
                  ? renderMatchEditor(`ko_${match.id}`, match, round.title)
                  : `<div class="hint muted" style="margin-top:10px;">Esperando resultados previos.</div>`}
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
    `;
  }

  function render() {
    const mount = $("tournamentsMount");
    if (!mount) return;

    const rows = getState();
    ensureSelection(rows);

    const tournament = findTournament(rows, UI.selectedTournamentId);
    const categories = tournament?.branches?.[UI.selectedBranch]?.categories || [];
    const category = tournament ? findCategory(tournament, UI.selectedBranch, UI.selectedCategoryId) : null;

    mount.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="section-title-row">
            <div>
              <h3 style="margin:0;">Gestión de torneos</h3>
              <div class="hint muted" style="margin-top:6px;">
                Esta primera versión guarda el módulo Torneos en localStorage, sin tocar tus tablas actuales.
              </div>
            </div>

            <div class="chip">Torneos: ${esc(rows.length)}</div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin:0 0 12px;">Crear torneo</h3>
          <div class="grid-4">
            <div>
              <label>Nombre del torneo</label>
              <input id="torName" type="text" placeholder="Ej: Torneo del 13 al 20 de abril 2026">
            </div>
            <div>
              <label>Fecha inicio</label>
              <input id="torStart" type="date">
            </div>
            <div>
              <label>Fecha fin</label>
              <input id="torEnd" type="date">
            </div>
            <div style="display:flex; align-items:end;">
              <button class="primary" id="btnCreateTournament" type="button" style="width:100%;">
                Crear torneo
              </button>
            </div>
          </div>
          <div id="torMainStatus" class="hint muted" style="margin-top:10px;"></div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h3 style="margin:0 0 12px;">Torneos creados</h3>
            ${rows.length ? rows.map(t => `
              <div class="list-row">
                <div>
                  <div><b>${esc(t.name)}</b></div>
                  <div class="hint muted">${esc(niceDate(t.startDate))} → ${esc(niceDate(t.endDate))}</div>
                </div>
                <div class="btns">
                  <button class="ghost small" type="button" data-open-tournament="${esc(t.id)}">Abrir</button>
                  <button class="ghost small" type="button" data-del-tournament="${esc(t.id)}">Borrar</button>
                </div>
              </div>
            `).join("") : `<div class="empty">Aún no hay torneos creados.</div>`}
          </div>

          <div class="card">
            <h3 style="margin:0 0 12px;">Contexto actual</h3>

            ${tournament ? `
              <div class="stack">
                <div>
                  <div><b>${esc(tournament.name)}</b></div>
                  <div class="hint muted">${esc(niceDate(tournament.startDate))} → ${esc(niceDate(tournament.endDate))}</div>
                </div>

                <div>
                  <label>Rama</label>
                  <div class="tab-row">
                    ${BRANCHES.map(b => `
                      <button class="tab-btn ${UI.selectedBranch === b.key ? "active" : ""}" type="button" data-branch="${esc(b.key)}">
                        ${esc(b.label)}
                      </button>
                    `).join("")}
                  </div>
                </div>

                <div class="sep"></div>

                <div>
                  <h4 style="margin:0 0 10px;">Crear categoría en ${esc(tournament.branches[UI.selectedBranch].label)}</h4>
                  <div class="grid-3">
                    <div>
                      <label>Nombre categoría</label>
                      <input id="catName" type="text" placeholder="Ej: Open / 2da / 3ra">
                    </div>
                    <div>
                      <label>Parejas</label>
                      <select id="catSize">
                        ${ALLOWED_SIZES.map(size => `<option value="${size}">${size} parejas</option>`).join("")}
                      </select>
                    </div>
                    <div style="display:flex; align-items:end;">
                      <button class="primary" id="btnCreateCategory" type="button" style="width:100%;">
                        Crear categoría
                      </button>
                    </div>
                  </div>
                  <div id="torCategoryStatus" class="hint muted" style="margin-top:10px;"></div>
                </div>

                <div class="sep"></div>

                <div>
                  <label>Categoría activa</label>
                  <select id="activeCategorySelect">
                    <option value="">Selecciona…</option>
                    ${categories.map(c => `
                      <option value="${esc(c.id)}" ${c.id === UI.selectedCategoryId ? "selected" : ""}>
                        ${esc(c.name)} • ${esc(c.size)} parejas
                      </option>
                    `).join("")}
                  </select>
                </div>

                <div class="stack">
                  ${categories.length ? categories.map(c => `
                    <div class="list-row">
                      <div>
                        <div><b>${esc(c.name)}</b></div>
                        <div class="hint muted">
                          ${esc(c.size)} parejas • ${esc(groupSummary(c.format))}
                        </div>
                      </div>
                      <div class="btns">
                        <button class="ghost small" type="button" data-open-category="${esc(c.id)}">Abrir</button>
                        <button class="ghost small" type="button" data-del-category="${esc(c.id)}">Borrar</button>
                      </div>
                    </div>
                  `).join("") : `<div class="empty">Aún no hay categorías en esta rama.</div>`}
                </div>
              </div>
            ` : `<div class="empty">Primero crea o abre un torneo.</div>`}
          </div>
        </div>

        ${tournament && category ? renderCategoryDetail(tournament, UI.selectedBranch, category) : ""}
      </div>
    `;

    wireMainEvents();
    wireDetailEvents(tournament, category);
  }

  function wireMainEvents() {
    const rows = getState();

    const setMainStatus = (msg, cls = "muted", targetId = "torMainStatus") => {
      const el = $(targetId);
      if (!el) return;
      el.textContent = msg || "";
      el.className = `hint ${cls}`;
    };

    $("btnCreateTournament")?.addEventListener("click", () => {
      try {
        const name = String($("torName")?.value || "").trim();
        const startDate = $("torStart")?.value;
        const endDate = $("torEnd")?.value;

        if (!name) throw new Error("Escribe el nombre del torneo.");
        if (!startDate || !endDate) throw new Error("Debes ingresar fecha inicio y fin.");

        const next = rows.slice();
        const tournament = emptyTournament({ name, startDate, endDate });
        next.unshift(tournament);
        saveState(next);

        UI.selectedTournamentId = tournament.id;
        UI.selectedBranch = "men";
        UI.selectedCategoryId = null;

        render();
      } catch (e) {
        setMainStatus(`❌ ${e?.message || e}`, "error");
      }
    });

    document.querySelectorAll("[data-open-tournament]").forEach(btn => {
      btn.addEventListener("click", () => {
        UI.selectedTournamentId = btn.getAttribute("data-open-tournament");
        UI.selectedCategoryId = null;
        render();
      });
    });

    document.querySelectorAll("[data-del-tournament]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tournamentId = btn.getAttribute("data-del-tournament");
        const currentRows = getState();
        const tor = currentRows.find(t => t.id === tournamentId);
        if (!tor) return;
        if (!confirm(`¿Borrar completamente el torneo "${tor.name}"?`)) return;

        const next = currentRows.filter(t => t.id !== tournamentId);
        saveState(next);

        if (UI.selectedTournamentId === tournamentId) {
          UI.selectedTournamentId = next[0]?.id || null;
          UI.selectedCategoryId = null;
        }

        render();
      });
    });

    document.querySelectorAll("[data-branch]").forEach(btn => {
      btn.addEventListener("click", () => {
        UI.selectedBranch = btn.getAttribute("data-branch");
        UI.selectedCategoryId = null;
        render();
      });
    });

    $("btnCreateCategory")?.addEventListener("click", () => {
      try {
        const tournamentId = UI.selectedTournamentId;
        if (!tournamentId) throw new Error("Primero abre un torneo.");

        const name = String($("catName")?.value || "").trim();
        const size = Number($("catSize")?.value || 0);

        if (!name) throw new Error("Escribe el nombre de la categoría.");
        if (!ALLOWED_SIZES.includes(size)) throw new Error("Cantidad de parejas no soportada.");

        updateTournament(getState(), tournamentId, (tor) => {
          const branch = tor.branches[UI.selectedBranch];
          if (branch.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            throw new Error("Ya existe una categoría con ese nombre en esta rama.");
          }

          const category = emptyCategory(name, size);
          branch.categories.push(category);
          UI.selectedCategoryId = category.id;
        });

        render();
      } catch (e) {
        setMainStatus(`❌ ${e?.message || e}`, "error", "torCategoryStatus");
      }
    });

    $("activeCategorySelect")?.addEventListener("change", (e) => {
      UI.selectedCategoryId = e.target.value || null;
      render();
    });

    document.querySelectorAll("[data-open-category]").forEach(btn => {
      btn.addEventListener("click", () => {
        UI.selectedCategoryId = btn.getAttribute("data-open-category");
        render();
      });
    });

    document.querySelectorAll("[data-del-category]").forEach(btn => {
      btn.addEventListener("click", () => {
        const catId = btn.getAttribute("data-del-category");
        const rowsNow = getState();
        const tournament = findTournament(rowsNow, UI.selectedTournamentId);
        const category = findCategory(tournament, UI.selectedBranch, catId);
        if (!category) return;

        if (!confirm(`¿Borrar la categoría "${category.name}"?`)) return;

        updateTournament(rowsNow, UI.selectedTournamentId, (tor) => {
          tor.branches[UI.selectedBranch].categories =
            tor.branches[UI.selectedBranch].categories.filter(c => c.id !== catId);
        });

        if (UI.selectedCategoryId === catId) UI.selectedCategoryId = null;
        render();
      });
    });
  }

  function wireDetailEvents(tournament, category) {
    if (!tournament || !category) return;

    const setStatus = (id, msg, cls = "muted") => {
      const el = $(id);
      if (!el) return;
      el.textContent = msg || "";
      el.className = `hint ${cls}`;
    };

    $("btnAddTournamentPlayer")?.addEventListener("click", () => {
      try {
        const cedula = String($("torCedula")?.value || "").trim();
        const firstName = String($("torFirstName")?.value || "").trim();
        const lastName = String($("torLastName")?.value || "").trim();
        const ranking = Number($("torRanking")?.value || 0);
        const associated = $("torAsociado")?.value === "true";

        if (!cedula) throw new Error("La cédula es obligatoria.");
        if (!firstName) throw new Error("Los nombres son obligatorios.");
        if (!lastName) throw new Error("Los apellidos son obligatorios.");
        if (!Number.isFinite(ranking) || ranking < 0) throw new Error("Ranking inválido.");

        updateTournament(getState(), tournament.id, (tor) => {
          const cat = findCategory(tor, UI.selectedBranch, category.id);
          if (!cat) throw new Error("Categoría no encontrada.");

          if (cat.players.some(p => p.cedula === cedula)) {
            throw new Error("Ya existe un jugador con esa cédula en esta categoría.");
          }

          if (cat.players.length >= cat.size * 2) {
            throw new Error(`La categoría ya llegó a ${cat.size * 2} jugadores.`);
          }

          cat.players.push({
            id: uid("pl"),
            cedula,
            firstName,
            lastName,
            ranking,
            associated
          });
        });

        render();
      } catch (e) {
        setStatus("torPlayerStatus", `❌ ${e?.message || e}`, "error");
      }
    });

    $("btnCreatePair")?.addEventListener("click", () => {
      try {
        const player1Id = $("pairPlayer1")?.value;
        const player2Id = $("pairPlayer2")?.value;

        if (!player1Id || !player2Id) throw new Error("Debes escoger dos jugadores.");
        if (player1Id === player2Id) throw new Error("No puedes repetir el mismo jugador.");

        updateTournament(getState(), tournament.id, (tor) => {
          const cat = findCategory(tor, UI.selectedBranch, category.id);
          if (!cat) throw new Error("Categoría no encontrada.");

          const p1 = cat.players.find(p => p.id === player1Id);
          const p2 = cat.players.find(p => p.id === player2Id);
          if (!p1 || !p2) throw new Error("Jugadores no encontrados.");

          if (cat.pairs.some(pair =>
            [pair.player1Id, pair.player2Id].includes(player1Id) ||
            [pair.player1Id, pair.player2Id].includes(player2Id)
          )) {
            throw new Error("Uno de los jugadores ya pertenece a otra pareja.");
          }

          if (cat.pairs.length >= cat.size) {
            throw new Error(`La categoría ya llegó a ${cat.size} parejas.`);
          }

          cat.pairs.push({
            id: uid("pair"),
            player1Id,
            player2Id,
            totalRanking: playerRanking(p1) + playerRanking(p2),
            seedNumber: null
          });
        });

        render();
      } catch (e) {
        setStatus("torPairStatus", `❌ ${e?.message || e}`, "error");
      }
    });

    document.querySelectorAll("[data-del-player]").forEach(btn => {
      btn.addEventListener("click", () => {
        const playerId = btn.getAttribute("data-del-player");
        if (!confirm("¿Borrar este jugador de la categoría?")) return;

        try {
          updateTournament(getState(), tournament.id, (tor) => {
            const cat = findCategory(tor, UI.selectedBranch, category.id);
            if (!cat) throw new Error("Categoría no encontrada.");

            if (cat.pairs.some(pair => pair.player1Id === playerId || pair.player2Id === playerId)) {
              throw new Error("No puedes borrar un jugador que ya está en una pareja.");
            }

            cat.players = cat.players.filter(p => p.id !== playerId);
          });
          render();
        } catch (e) {
          alert(e?.message || e);
        }
      });
    });

    document.querySelectorAll("[data-del-pair]").forEach(btn => {
      btn.addEventListener("click", () => {
        const pairId = btn.getAttribute("data-del-pair");
        if (!confirm("¿Borrar esta pareja?")) return;

        updateTournament(getState(), tournament.id, (tor) => {
          const cat = findCategory(tor, UI.selectedBranch, category.id);
          if (!cat) return;
          cat.pairs = cat.pairs.filter(p => p.id !== pairId);
          cat.groups = [];
          cat.knockout = { rounds: [] };
        });

        render();
      });
    });

    $("btnGenerateGroups")?.addEventListener("click", () => {
      try {
        updateTournament(getState(), tournament.id, (tor) => {
          const cat = findCategory(tor, UI.selectedBranch, category.id);
          if (!cat) throw new Error("Categoría no encontrada.");
          generateGroupsForCategory(cat);
        });
        render();
      } catch (e) {
        alert(e?.message || e);
      }
    });

    $("btnResetCategory")?.addEventListener("click", () => {
      if (!confirm("¿Resetear grupos y llave de esta categoría?")) return;

      updateTournament(getState(), tournament.id, (tor) => {
        const cat = findCategory(tor, UI.selectedBranch, category.id);
        if (!cat) return;
        cat.groups = [];
        cat.knockout = { rounds: [] };
        cat.pairs.forEach(p => { p.seedNumber = null; });
      });

      render();
    });

    $("btnGenerateKnockout")?.addEventListener("click", () => {
      try {
        updateTournament(getState(), tournament.id, (tor) => {
          const cat = findCategory(tor, UI.selectedBranch, category.id);
          if (!cat) throw new Error("Categoría no encontrada.");
          createKnockout(cat);
        });
        render();
      } catch (e) {
        alert(e?.message || e);
      }
    });

    document.querySelectorAll("[data-save-match]").forEach(btn => {
      btn.addEventListener("click", () => {
        const matchId = btn.getAttribute("data-save-match");
        const details = btn.closest("details");
        if (!details) return;

        const inputs = details.querySelectorAll("input[data-set]");
        const rawSets = [{}, {}, {}];
        inputs.forEach(inp => {
          const idx = Number(inp.getAttribute("data-set"));
          const field = inp.getAttribute("data-field");
          rawSets[idx][field] = inp.value;
        });

        try {
          updateTournament(getState(), tournament.id, (tor) => {
            const cat = findCategory(tor, UI.selectedBranch, category.id);
            if (!cat) throw new Error("Categoría no encontrada.");

            const group = cat.groups.find(g => g.matches.some(m => m.id === matchId));
            if (group) {
              saveGroupMatch(cat, group.id, matchId, rawSets);
              return;
            }

            const roundIndex = cat.knockout.rounds.findIndex(r => r.matches.some(m => m.id === matchId));
            if (roundIndex >= 0) {
              saveKnockoutMatch(cat, roundIndex, matchId, rawSets);
              return;
            }

            throw new Error("No se encontró el partido.");
          });

          render();
        } catch (e) {
          alert(e?.message || e);
        }
      });
    });
  }

  function init() {
    render();
  }

  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "tournaments") render();
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("op:tournamentsChanged", render);
})();
