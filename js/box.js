/**
 * PokéRaid & Max Optimizer - Módulo 1 y Amigos: Gestión de Colección y Amigos (js/box.js)
 * Maneja:
 *  - Persistencia en localStorage tanto de Mi Caja como de Amigos Fijos
 *  - Cálculo exacto de Estadísticas Reales, CPM y PC
 *  - Soporte de Propietario (owner: 'me' | friendId)
 *  - Plantillas Rápidas (Presets 1-Tap: Raid Ready Nv. 40, Hundo Nv. 50, Raid Nv. 30, etc.)
 *  - Gestión CRUD completa de Amigos Fijos y sus equipos
 */

(function (global) {
  "use strict";

  const STORAGE_KEY_BOX = "pokeraid_max_optimizer_box_v3";
  const LEGACY_BOX_KEYS = [
    "pokeraid_max_optimizer_box_v2",
    "pokeraid_max_optimizer_box_v1",
    "pokeraid_box"
  ];
  const STORAGE_KEY_FRIENDS = "pokeraid_max_optimizer_friends_v2";
  const LEGACY_FRIENDS_KEYS = [
    "pokeraid_max_optimizer_friends_v1",
    "pokeraid_friends"
  ];
  const STORAGE_KEY_APP_STATE = "pokeraid_max_optimizer_ui_state_v1";
  const STORAGE_KEY_LAST_SAVED = "pokeraid_max_optimizer_last_saved_at";

  const IDB_NAME = "PokeRaidMaxOptimizerCacheDB";
  const IDB_STORE = "kv_cache";

  function openCacheIDB() {
    return new Promise((resolve) => {
      if (!global.indexedDB) {
        resolve(null);
        return;
      }
      try {
        const req = global.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function writeToIDBMirror(key, value) {
    openCacheIDB().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
      } catch (_) {}
    });
  }

  function readFromIDBMirror(key) {
    return openCacheIDB().then((db) => {
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, "readonly");
          const req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    });
  }

  // Solicitar almacenamiento persistente al navegador para evitar borrado automático de caché
  if (global.navigator && global.navigator.storage && global.navigator.storage.persist) {
    try {
      global.navigator.storage.persist().catch(() => {});
    } catch (_) {}
  }

  // Tabla base oficial de CPM para niveles enteros 1 a 40
  const BASE_CPMS = {
    1: 0.094,
    2: 0.16639787,
    3: 0.21573247,
    4: 0.25572005,
    5: 0.29024988,
    6: 0.3210876,
    7: 0.34921268,
    8: 0.37523559,
    9: 0.39956728,
    10: 0.4225,
    11: 0.44310755,
    12: 0.46279839,
    13: 0.48168495,
    14: 0.49985844,
    15: 0.51739395,
    16: 0.53435433,
    17: 0.55079269,
    18: 0.56675452,
    19: 0.58227891,
    20: 0.59740001,
    21: 0.61215729,
    22: 0.62656713,
    23: 0.64065295,
    24: 0.65443563,
    25: 0.66793400,
    26: 0.68116492,
    27: 0.69414365,
    28: 0.70688421,
    29: 0.71939909,
    30: 0.73170000,
    31: 0.73776948,
    32: 0.74378943,
    33: 0.74976104,
    34: 0.75568551,
    35: 0.76156384,
    36: 0.76739717,
    37: 0.77318650,
    38: 0.77893275,
    39: 0.78463697,
    40: 0.79030001
  };

  // Generar lista completa de CPM para todos los medios niveles (1.0 a 51.0)
  const FULL_CPM_LIST = [];
  for (let lvl = 1; lvl <= 40; lvl++) {
    FULL_CPM_LIST.push({ level: lvl, cpm: BASE_CPMS[lvl] });
    if (lvl < 40) {
      const halfCpm = Math.sqrt((Math.pow(BASE_CPMS[lvl], 2) + Math.pow(BASE_CPMS[lvl + 1], 2)) / 2);
      FULL_CPM_LIST.push({ level: lvl + 0.5, cpm: halfCpm });
    }
  }
  for (let lvl = 40.5; lvl <= 51; lvl += 0.5) {
    const xlCpm = 0.79030001 + (lvl - 40) * 0.005;
    FULL_CPM_LIST.push({ level: lvl, cpm: Math.round(xlCpm * 100000000) / 100000000 });
  }

  function getDB() {
    if (!global.POKE_DB) {
      throw new Error("POKE_DB no está cargado.");
    }
    return global.POKE_DB;
  }

  function getSpeciesById(pokemonId) {
    const db = getDB();
    return db.pokemon.find((p) => p.id === pokemonId) || null;
  }

  function getCPMForLevel(level) {
    const numLevel = Number(level) || 40;
    let closest = FULL_CPM_LIST[0];
    let minDiff = Math.abs(numLevel - closest.level);

    for (const item of FULL_CPM_LIST) {
      const diff = Math.abs(numLevel - item.level);
      if (diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }
    return closest.cpm;
  }

  function calculateCP(species, ivAtk, ivDef, ivSta, levelOrCpm) {
    if (!species) return 10;
    const cpm = levelOrCpm <= 1.0 ? levelOrCpm : getCPMForLevel(levelOrCpm);
    const totalAtk = species.baseStats.atk + Number(ivAtk);
    const totalDef = species.baseStats.def + Number(ivDef);
    const totalSta = species.baseStats.sta + Number(ivSta);

    const rawCP = Math.floor(
      (totalAtk * Math.sqrt(totalDef) * Math.sqrt(totalSta) * Math.pow(cpm, 2)) / 10
    );
    return Math.max(10, rawCP);
  }

  function estimateLevelFromCP(species, ivAtk, ivDef, ivSta, targetCP) {
    if (!species) {
      return { level: 40, cpm: getCPMForLevel(40), badge: "Nv. 40", cp: 3000, presetId: "no_xl" };
    }

    const desiredCP = Number(targetCP) || 0;
    if (desiredCP < 10) {
      const cp40 = calculateCP(species, ivAtk, ivDef, ivSta, 40);
      return { level: 40, cpm: getCPMForLevel(40), badge: "Nv. 40", cp: cp40, presetId: "no_xl" };
    }

    let bestEntry = FULL_CPM_LIST[0];
    let smallestCPDiff = Infinity;
    let closestCP = 10;

    for (const entry of FULL_CPM_LIST) {
      const cpAtLevel = calculateCP(species, ivAtk, ivDef, ivSta, entry.cpm);
      const diff = Math.abs(cpAtLevel - desiredCP);
      if (diff < smallestCPDiff) {
        smallestCPDiff = diff;
        bestEntry = entry;
        closestCP = cpAtLevel;
      }
    }

    const db = getDB();
    let bestPreset = db.levelPresets[2];
    let minLevelDiff = Infinity;
    for (const preset of db.levelPresets) {
      const d = Math.abs(preset.level - bestEntry.level);
      if (d < minLevelDiff) {
        minLevelDiff = d;
        bestPreset = preset;
      }
    }

    return {
      level: bestEntry.level,
      cpm: bestEntry.cpm,
      badge: `Nv. ${bestEntry.level}`,
      cp: closestCP,
      exactMatch: smallestCPDiff === 0,
      diff: smallestCPDiff,
      presetId: bestPreset.id
    };
  }

  function resolveMaxMoveInfo(species, rawEntry) {
    const db = getDB();
    const maxClass = rawEntry.maxClass || (species && species.maxForm) || "none";
    const atkLevel = Number(rawEntry.maxAttackLevel) || 0;
    const guardLevel = Number(rawEntry.maxGuardLevel) || 0;
    const spiritLevel = Number(rawEntry.maxSpiritLevel) || 0;

    if (maxClass === "none" || atkLevel <= 0) {
      return {
        isMaxCapable: false,
        maxClass: "none",
        moveName: "No disponible",
        moveType: null,
        potency: 0,
        atkLevel: 0,
        guardLevel: 0,
        spiritLevel: 0
      };
    }

    if ((maxClass === "gigantamax" || maxClass === "eternamax") && species && species.fixedGmaxMove) {
      const gmaxMove = db.gmaxMoves[species.fixedGmaxMove];
      const potencyTable =
        maxClass === "eternamax"
          ? db.combatModifiers.maxMovePotency.eternamax
          : db.combatModifiers.maxMovePotency.gigantamax;

      return {
        isMaxCapable: true,
        maxClass,
        moveName: gmaxMove ? gmaxMove.name : "Movimiento Gigamax",
        moveType: gmaxMove ? gmaxMove.type : species.types[0],
        potency: potencyTable[atkLevel] || 350,
        atkLevel,
        guardLevel,
        spiritLevel,
        description: gmaxMove ? gmaxMove.description : ""
      };
    }

    const fastMoveObj = db.fastMoves[rawEntry.fastMove] || db.fastMoves[species.fastMoves[0]];
    const maxMoveType = fastMoveObj ? fastMoveObj.type : species.types[0];
    const typeMeta = db.typeMeta[maxMoveType] || db.typeMeta.normal;
    const potencyTable =
      maxClass === "eternamax"
        ? db.combatModifiers.maxMovePotency.eternamax
        : maxClass === "gigantamax"
        ? db.combatModifiers.maxMovePotency.gigantamax
        : db.combatModifiers.maxMovePotency.dynamax;

    return {
      isMaxCapable: true,
      maxClass,
      moveName: typeMeta.maxMoveName || "Maxiataque",
      moveType: maxMoveType,
      potency: potencyTable[atkLevel] || 250,
      atkLevel,
      guardLevel,
      spiritLevel,
      description: `Movimiento Dinamax de tipo ${typeMeta.name} generado por ${fastMoveObj ? fastMoveObj.name : "su ataque rápido"}.`
    };
  }

  function enrichBoxPokemon(rawEntry) {
    const db = getDB();
    const species = getSpeciesById(rawEntry.pokemonId);
    if (!species) return null;

    const ivAtk = Math.min(15, Math.max(0, Number(rawEntry.ivAtk ?? 15)));
    const ivDef = Math.min(15, Math.max(0, Number(rawEntry.ivDef ?? 15)));
    const ivSta = Math.min(15, Math.max(0, Number(rawEntry.ivSta ?? 15)));
    const ivPct = Math.round(((ivAtk + ivDef + ivSta) / 45) * 1000) / 10;

    let level, cpm, presetId, cp;
    const targetCP = rawEntry.cp ? Number(rawEntry.cp) : (rawEntry.customCP ? Number(rawEntry.customCP) : null);

    if (targetCP && targetCP >= 10) {
      const est = estimateLevelFromCP(species, ivAtk, ivDef, ivSta, targetCP);
      level = est.level;
      cpm = est.cpm;
      presetId = est.presetId;
      cp = targetCP;
    } else {
      const presetObj =
        db.levelPresets.find((p) => p.id === rawEntry.levelPreset) || db.levelPresets[2];
      level = Number(rawEntry.level) || presetObj.level;
      cpm = getCPMForLevel(level);
      presetId = presetObj.id;
      cp = calculateCP(species, ivAtk, ivDef, ivSta, cpm);
    }

    const baseAtkWithIV = species.baseStats.atk + ivAtk;
    const baseDefWithIV = species.baseStats.def + ivDef;
    const baseStaWithIV = species.baseStats.sta + ivSta;

    const realAtk = baseAtkWithIV * cpm;
    const realDef = baseDefWithIV * cpm;
    const realHP = Math.max(10, Math.floor(baseStaWithIV * cpm));

    const isShadow = Boolean(rawEntry.isShadow && species.canBeShadow);
    const effectiveAtk = isShadow
      ? realAtk * db.combatModifiers.shadowAttackBonus
      : realAtk;
    const effectiveDef = isShadow
      ? realDef * db.combatModifiers.shadowDefenseMultiplier
      : realDef;

    const fastMoveObj =
      db.fastMoves[rawEntry.fastMove] || db.fastMoves[species.fastMoves[0]];
    const chargedMoveObj =
      db.chargedMoves[rawEntry.chargedMove] || db.chargedMoves[species.chargedMoves[0]];

    const maxMoveInfo = resolveMaxMoveInfo(species, rawEntry);
    const ownerId = rawEntry.ownerId || "me";

    return {
      ...rawEntry,
      ownerId,
      ivAtk,
      ivDef,
      ivSta,
      ivPct,
      level,
      levelPreset: presetId,
      levelBadge: `Nv. ${level}`,
      cpm,
      cp,
      isShadow,
      species,
      stats: {
        atk: realAtk,
        def: realDef,
        hp: realHP,
        effectiveAtk,
        effectiveDef
      },
      fastMoveObj,
      chargedMoveObj,
      maxMoveInfo
    };
  }

  function touchLastSavedTimestamp() {
    try {
      const iso = new Date().toISOString();
      global.localStorage.setItem(STORAGE_KEY_LAST_SAVED, iso);
      writeToIDBMirror(STORAGE_KEY_LAST_SAVED, iso);
    } catch (_) {}
  }

  function loadRawBox() {
    try {
      let raw = global.localStorage.getItem(STORAGE_KEY_BOX);
      if (!raw) {
        // Intentar migrar automáticamente de versiones anteriores (v2 / v1) para no perder nunca datos previos
        for (const legacyKey of LEGACY_BOX_KEYS) {
          const legacyRaw = global.localStorage.getItem(legacyKey);
          if (legacyRaw) {
            try {
              const legacyParsed = JSON.parse(legacyRaw);
              if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
                saveRawBox(legacyParsed);
                return legacyParsed;
              }
            } catch (_) {}
          }
        }
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Error leyendo Mi Caja de localStorage:", err);
      return [];
    }
  }

  function saveRawBox(list) {
    try {
      const safeList = Array.isArray(list) ? list : [];
      global.localStorage.setItem(STORAGE_KEY_BOX, JSON.stringify(safeList));
      writeToIDBMirror(STORAGE_KEY_BOX, safeList);
      touchLastSavedTimestamp();
    } catch (err) {
      console.error("Error guardando Mi Caja en localStorage:", err);
    }
  }

  // ============================================================================
  // GESTIÓN DE AMIGOS FIJOS (Persistencia y Equipos)
  // ============================================================================
  const DEFAULT_DEMO_FRIENDS = [
    {
      id: "friend_carlos",
      name: "Carlos (Meta Top)",
      avatarColor: "#06b6d4",
      notes: "Tiene a Groudon Primigenio y Mewtwo Nv. 50"
    },
    {
      id: "friend_laura",
      name: "Laura (D-Max & Raids)",
      avatarColor: "#ec4899",
      notes: "Especialista Dinamax y Gigamax"
    }
  ];

  function loadRawFriends() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY_FRIENDS);
      if (!raw) {
        for (const legacyKey of LEGACY_FRIENDS_KEYS) {
          const legacyRaw = global.localStorage.getItem(legacyKey);
          if (legacyRaw) {
            try {
              const legacyParsed = JSON.parse(legacyRaw);
              if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
                saveRawFriends(legacyParsed);
                return legacyParsed;
              }
            } catch (_) {}
          }
        }
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Error leyendo Amigos de localStorage:", err);
      return [];
    }
  }

  function saveRawFriends(list) {
    try {
      const safeList = Array.isArray(list) ? list : [];
      global.localStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(safeList));
      writeToIDBMirror(STORAGE_KEY_FRIENDS, safeList);
      touchLastSavedTimestamp();
    } catch (err) {
      console.error("Error guardando Amigos en localStorage:", err);
    }
  }

  // ==========================================================================
  // API PÚBLICA DE PokeBoxManager
  // ==========================================================================
  const PokeBoxManager = {
    STORAGE_KEY_BOX,
    STORAGE_KEY_FRIENDS,

    /**
     * Devuelve Pokémon enriquecidos. Si targetOwner es 'me', sólo los propios.
     * Si es un ID de amigo, los del amigo. Si es 'all', todos.
     */
    getAll(targetOwner = "all") {
      const rawList = loadRawBox();
      const enriched = rawList.map(enrichBoxPokemon).filter(Boolean);
      if (targetOwner === "all") return enriched;
      return enriched.filter((item) => (item.ownerId || "me") === targetOwner);
    },

    getByUid(uid) {
      const rawList = loadRawBox();
      const raw = rawList.find((item) => item.uid === uid);
      return raw ? enrichBoxPokemon(raw) : null;
    },

    add(entryData) {
      const db = getDB();
      const species = getSpeciesById(entryData.pokemonId);
      if (!species) {
        throw new Error(`Especie no encontrada: ${entryData.pokemonId}`);
      }

      const rawList = loadRawBox();
      const uid =
        entryData.uid ||
        `pkmn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      let level = Number(entryData.level) || 40;
      let levelPreset = entryData.levelPreset || "no_xl";
      const targetCP = entryData.cp ? Number(entryData.cp) : (entryData.customCP ? Number(entryData.customCP) : null);

      if (targetCP && targetCP >= 10) {
        const estimated = estimateLevelFromCP(
          species,
          entryData.ivAtk ?? 15,
          entryData.ivDef ?? 15,
          entryData.ivSta ?? 15,
          targetCP
        );
        level = estimated.level;
        levelPreset = estimated.presetId;
      } else {
        const presetObj = db.levelPresets.find((p) => p.id === levelPreset);
        if (presetObj) level = presetObj.level;
      }

      const maxClass = entryData.maxClass || "none";
      const ownerId = entryData.ownerId || "me";

      const newRecord = {
        uid,
        ownerId,
        pokemonId: species.id,
        nickname: (entryData.nickname || "").trim() || species.name,
        ivAtk: Math.min(15, Math.max(0, Number(entryData.ivAtk ?? 15))),
        ivDef: Math.min(15, Math.max(0, Number(entryData.ivDef ?? 15))),
        ivSta: Math.min(15, Math.max(0, Number(entryData.ivSta ?? 15))),
        levelPreset,
        level,
        cp: targetCP || null,
        customCP: targetCP || null,
        fastMove: entryData.fastMove || species.fastMoves[0],
        chargedMove: entryData.chargedMove || species.chargedMoves[0],
        isShadow: Boolean(entryData.isShadow && species.canBeShadow),
        maxClass,
        maxAttackLevel: maxClass !== "none" ? Number(entryData.maxAttackLevel || 3) : 0,
        maxGuardLevel: maxClass !== "none" ? Number(entryData.maxGuardLevel || 0) : 0,
        maxSpiritLevel: maxClass !== "none" ? Number(entryData.maxSpiritLevel || 0) : 0
      };

      rawList.unshift(newRecord);
      saveRawBox(rawList);
      return enrichBoxPokemon(newRecord);
    },

    update(uid, updatedData) {
      const db = getDB();
      const rawList = loadRawBox();
      const index = rawList.findIndex((item) => item.uid === uid);
      if (index === -1) return null;

      const species = getSpeciesById(updatedData.pokemonId || rawList[index].pokemonId);
      if (!species) return null;

      let level = Number(updatedData.level) || rawList[index].level || 40;
      let levelPreset = updatedData.levelPreset || rawList[index].levelPreset || "no_xl";
      const targetCP = updatedData.cp ? Number(updatedData.cp) : (updatedData.customCP ? Number(updatedData.customCP) : null);

      if (targetCP && targetCP >= 10) {
        const estimated = estimateLevelFromCP(
          species,
          updatedData.ivAtk ?? 15,
          updatedData.ivDef ?? 15,
          updatedData.ivSta ?? 15,
          targetCP
        );
        level = estimated.level;
        levelPreset = estimated.presetId;
      } else {
        const presetObj = db.levelPresets.find((p) => p.id === levelPreset);
        if (presetObj) level = presetObj.level;
      }

      const maxClass = updatedData.maxClass || "none";
      const ownerId = updatedData.ownerId || rawList[index].ownerId || "me";

      const updatedRecord = {
        ...rawList[index],
        uid,
        ownerId,
        pokemonId: species.id,
        nickname: (updatedData.nickname || "").trim() || species.name,
        ivAtk: Math.min(15, Math.max(0, Number(updatedData.ivAtk ?? 15))),
        ivDef: Math.min(15, Math.max(0, Number(updatedData.ivDef ?? 15))),
        ivSta: Math.min(15, Math.max(0, Number(updatedData.ivSta ?? 15))),
        levelPreset,
        level,
        cp: targetCP || null,
        customCP: targetCP || null,
        fastMove: updatedData.fastMove || species.fastMoves[0],
        chargedMove: updatedData.chargedMove || species.chargedMoves[0],
        isShadow: Boolean(updatedData.isShadow && species.canBeShadow),
        maxClass,
        maxAttackLevel: maxClass !== "none" ? Number(updatedData.maxAttackLevel || 3) : 0,
        maxGuardLevel: maxClass !== "none" ? Number(updatedData.maxGuardLevel || 0) : 0,
        maxSpiritLevel: maxClass !== "none" ? Number(updatedData.maxSpiritLevel || 0) : 0
      };

      rawList[index] = updatedRecord;
      saveRawBox(rawList);
      return enrichBoxPokemon(updatedRecord);
    },

    remove(uid) {
      const rawList = loadRawBox();
      const filtered = rawList.filter((item) => item.uid !== uid);
      saveRawBox(filtered);
      return filtered.length;
    },

    clearAll(targetOwner = "me") {
      if (targetOwner === "all") {
        saveRawBox([]);
        return [];
      }
      const rawList = loadRawBox();
      const filtered = rawList.filter((item) => (item.ownerId || "me") !== targetOwner);
      saveRawBox(filtered);
      return this.getAll();
    },

    loadDemoBox() {
      const db = getDB();
      // Si la lista de amigos está vacía, restauramos los 2 amigos demo para la demostración
      let friends = this.getFriends();
      if (friends.length === 0) {
        saveRawFriends(DEFAULT_DEMO_FRIENDS);
        friends = DEFAULT_DEMO_FRIENDS;
      }

      const demoClone = (db.starterDemoBox || []).map((p) => ({
        ...p,
        ownerId: "me"
      }));

      // Añadimos también algunos Pokémon a amigos demo para que se aprecie la potencia del sistema
      if (friends.length > 0) {
        demoClone.push(
          {
            uid: "demo_friend_carlos_groudon",
            ownerId: friends[0].id,
            pokemonId: "groudon_primal",
            nickname: "Groudon Primigenio de Carlos",
            ivAtk: 15,
            ivDef: 15,
            ivSta: 14,
            levelPreset: "maxed",
            level: 50,
            fastMove: "disparo_lodo",
            chargedMove: "filo_del_abismo",
            isShadow: false,
            maxClass: "none",
            maxAttackLevel: 0,
            maxGuardLevel: 0,
            maxSpiritLevel: 0
          },
          {
            uid: "demo_friend_carlos_mewtwo",
            ownerId: friends[0].id,
            pokemonId: "mewtwo",
            nickname: "Mewtwo 100% de Carlos",
            ivAtk: 15,
            ivDef: 15,
            ivSta: 15,
            levelPreset: "maxed",
            level: 50,
            fastMove: "psicocorte",
            chargedMove: "onda_mental",
            isShadow: true,
            maxClass: "none",
            maxAttackLevel: 0,
            maxGuardLevel: 0,
            maxSpiritLevel: 0
          }
        );
        if (friends.length > 1) {
          demoClone.push({
            uid: "demo_friend_laura_duraludon",
            ownerId: friends[1].id,
            pokemonId: "duraludon_gmax",
            nickname: "Duraludon G-Max de Laura",
            ivAtk: 15,
            ivDef: 15,
            ivSta: 15,
            levelPreset: "maxed",
            level: 50,
            fastMove: "cola_dragon",
            chargedMove: "garra_dragon",
            isShadow: false,
            maxClass: "gigantamax",
            maxAttackLevel: 3,
            maxGuardLevel: 3,
            maxSpiritLevel: 2
          });
        }
      }

      // Fusionar los Pokémon demo con los que el usuario ya tenga guardados para no borrar nunca su colección previa
      const existingBox = loadRawBox();
      const existingUids = new Set(existingBox.map((p) => p.uid));
      const mergedBox = [...existingBox];
      for (const item of demoClone) {
        if (!existingUids.has(item.uid)) {
          mergedBox.push(item);
        }
      }

      saveRawBox(mergedBox);
      return this.getAll();
    },

    /**
     * Sincroniza y recupera automáticamente desde IndexedDB si localStorage se vació accidentalmente,
     * o respalda localStorage en IndexedDB si ya tiene datos.
     */
    async syncPersistentCache() {
      const currentBox = loadRawBox();
      const currentFriends = loadRawFriends();
      let restored = false;

      if (currentBox.length === 0) {
        const idbBox = await readFromIDBMirror(STORAGE_KEY_BOX);
        if (Array.isArray(idbBox) && idbBox.length > 0) {
          global.localStorage.setItem(STORAGE_KEY_BOX, JSON.stringify(idbBox));
          restored = true;
        }
      } else {
        writeToIDBMirror(STORAGE_KEY_BOX, currentBox);
      }

      if (currentFriends.length === 0) {
        const idbFriends = await readFromIDBMirror(STORAGE_KEY_FRIENDS);
        if (Array.isArray(idbFriends) && idbFriends.length > 0) {
          global.localStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(idbFriends));
          restored = true;
        }
      } else {
        writeToIDBMirror(STORAGE_KEY_FRIENDS, currentFriends);
      }

      return restored;
    },

    getLastSavedTimestamp() {
      try {
        return global.localStorage.getItem(STORAGE_KEY_LAST_SAVED) || null;
      } catch (_) {
        return null;
      }
    },

    saveAppState(stateSnapshot) {
      try {
        global.localStorage.setItem(STORAGE_KEY_APP_STATE, JSON.stringify(stateSnapshot));
        writeToIDBMirror(STORAGE_KEY_APP_STATE, stateSnapshot);
      } catch (_) {}
    },

    loadAppState() {
      try {
        const raw = global.localStorage.getItem(STORAGE_KEY_APP_STATE);
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    },

    // ========================================================================
    // MÉTODOS DE AMIGOS
    // ========================================================================
    getFriends() {
      return loadRawFriends();
    },

    getFriendById(friendId) {
      if (friendId === "me") {
        return { id: "me", name: "Mi Caja Personal", avatarColor: "#06b6d4" };
      }
      return loadRawFriends().find((f) => f.id === friendId) || null;
    },

    addFriend(name, notes = "") {
      const friends = loadRawFriends();
      const id = `friend_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const colors = ["#06b6d4", "#ec4899", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];
      const avatarColor = colors[friends.length % colors.length];

      const newFriend = {
        id,
        name: (name || "").trim() || `Amigo ${friends.length + 1}`,
        notes: (notes || "").trim(),
        avatarColor
      };
      friends.push(newFriend);
      saveRawFriends(friends);
      return newFriend;
    },

    removeFriend(friendId) {
      const friends = loadRawFriends().filter((f) => f.id !== friendId);
      saveRawFriends(friends);
      // Eliminar también los Pokémon asociados a este amigo
      const rawList = loadRawBox().filter((p) => p.ownerId !== friendId);
      saveRawBox(rawList);
      return friends;
    },

    calculateCP,
    estimateLevelFromCP,
    getCPMForLevel,
    getSpeciesById,
    enrichBoxPokemon
  };

  global.PokeBoxManager = PokeBoxManager;
})(typeof window !== "undefined" ? window : globalThis);
