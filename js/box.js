/**
 * PokéRaid & Max Optimizer - Módulo 1: Gestión de "Mi Caja Pokémon" (js/box.js)
 * Maneja:
 *  - Persistencia en localStorage
 *  - Cálculo exacto de Estadísticas Reales (Ataque, Defensa, PS), CPM y PC (Combat Power)
 *  - Estimación inversa de Nivel/CPM cuando el usuario introduce los PC directamente
 *  - Resolución del Movimiento Max (Dinamax según tipo de ataque rápido, Gigamax/Eternamax fijo)
 *  - Operaciones CRUD (Crear, Leer, Actualizar, Eliminar, Cargar Demo, Vaciar)
 */

(function (global) {
  "use strict";

  const STORAGE_KEY = "pokeraid_max_optimizer_box_v2";

  // Mapa rápido de niveles ordenados y sus valores de CPM interpolados (Nivel 15 a 51 en pasos de 0.5)
  const FULL_CPM_LIST = [
    { level: 15, cpm: 0.51739395 },
    { level: 16, cpm: 0.53435433 },
    { level: 17, cpm: 0.55079269 },
    { level: 18, cpm: 0.56675452 },
    { level: 19, cpm: 0.58227891 },
    { level: 20, cpm: 0.59740001 },
    { level: 21, cpm: 0.61215729 },
    { level: 22, cpm: 0.62656713 },
    { level: 22.5, cpm: 0.63364450 },
    { level: 23, cpm: 0.64065295 },
    { level: 24, cpm: 0.65443563 },
    { level: 25, cpm: 0.66793400 },
    { level: 26, cpm: 0.68116492 },
    { level: 27, cpm: 0.69414365 },
    { level: 28, cpm: 0.70688421 },
    { level: 29, cpm: 0.71939909 },
    { level: 30, cpm: 0.73170000 },
    { level: 31, cpm: 0.73776948 },
    { level: 32, cpm: 0.74378943 },
    { level: 32.5, cpm: 0.74678121 },
    { level: 33, cpm: 0.74976104 },
    { level: 34, cpm: 0.75568551 },
    { level: 35, cpm: 0.76156384 },
    { level: 36, cpm: 0.76739717 },
    { level: 37, cpm: 0.77318650 },
    { level: 37.5, cpm: 0.77606496 },
    { level: 38, cpm: 0.77893275 },
    { level: 39, cpm: 0.78463697 },
    { level: 40, cpm: 0.79030001 },
    { level: 41, cpm: 0.79530001 },
    { level: 42, cpm: 0.80030000 },
    { level: 42.5, cpm: 0.80279999 },
    { level: 43, cpm: 0.80530000 },
    { level: 44, cpm: 0.81029999 },
    { level: 45, cpm: 0.81529999 },
    { level: 46, cpm: 0.82029999 },
    { level: 47, cpm: 0.82529999 },
    { level: 47.5, cpm: 0.82779999 },
    { level: 48, cpm: 0.83029999 },
    { level: 49, cpm: 0.83529999 },
    { level: 50, cpm: 0.84029999 },
    { level: 51, cpm: 0.84529999 }
  ];

  /**
   * Obtiene la referencia a la base de datos maestra
   */
  function getDB() {
    if (!global.POKE_DB) {
      throw new Error("POKE_DB no está cargado. Asegúrate de incluir data/pokemon_db.js antes de js/box.js");
    }
    return global.POKE_DB;
  }

  /**
   * Busca una especie en POKE_DB por su ID
   */
  function getSpeciesById(pokemonId) {
    const db = getDB();
    return db.pokemon.find((p) => p.id === pokemonId) || null;
  }

  /**
   * Obtiene el CPM para un nivel concreto
   */
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

  /**
   * Calcula los PC (Combat Power) oficiales de Pokémon GO dados especie, IVs y CPM/Nivel
   */
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

  /**
   * Estima el Nivel y Preset más cercano a partir de los PC introducidos por el usuario
   */
  function estimateLevelFromCP(species, ivAtk, ivDef, ivSta, targetCP) {
    if (!species || !targetCP || Number(targetCP) < 10) {
      return { level: 40, cpm: getCPMForLevel(40), presetId: "no_xl" };
    }

    const desiredCP = Number(targetCP);
    let bestEntry = FULL_CPM_LIST[0];
    let smallestCPDiff = Infinity;

    for (const entry of FULL_CPM_LIST) {
      const cpAtLevel = calculateCP(species, ivAtk, ivDef, ivSta, entry.cpm);
      const diff = Math.abs(cpAtLevel - desiredCP);
      if (diff < smallestCPDiff) {
        smallestCPDiff = diff;
        bestEntry = entry;
      }
    }

    // Asignar el preset más cercano para mantener coherencia visual en el selector
    const db = getDB();
    let bestPreset = db.levelPresets[2]; // default no_xl (Nv. 40)
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
      presetId: bestPreset.id
    };
  }

  /**
   * Resuelve la información del Movimiento Max (Dinamax, Gigamax o Eternamax) de un Pokémon de la caja
   */
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

    // Si es Gigamax o Eternamax y tiene movimiento exclusivo fijo en la BD
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

    // Si es Dinamax (o un Gigamax usado como Dinamax sin mov fijo), el tipo depende del Ataque Rápido
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

  /**
   * Enriquecer un registro crudo de Mi Caja con todas sus estadísticas calculadas y referencias de objetos
   */
  function enrichBoxPokemon(rawEntry) {
    const db = getDB();
    const species = getSpeciesById(rawEntry.pokemonId);
    if (!species) return null;

    const ivAtk = Math.min(15, Math.max(0, Number(rawEntry.ivAtk ?? 15)));
    const ivDef = Math.min(15, Math.max(0, Number(rawEntry.ivDef ?? 15)));
    const ivSta = Math.min(15, Math.max(0, Number(rawEntry.ivSta ?? 15)));
    const ivPct = Math.round(((ivAtk + ivDef + ivSta) / 45) * 1000) / 10;

    // Determinar nivel y CPM
    const presetObj =
      db.levelPresets.find((p) => p.id === rawEntry.levelPreset) || db.levelPresets[2];
    const level = Number(rawEntry.level) || presetObj.level;
    const cpm = getCPMForLevel(level);

    // Estadísticas reales de combate (antes de modificadores de combate como Shadow)
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

    const cp = rawEntry.customCP
      ? Number(rawEntry.customCP)
      : calculateCP(species, ivAtk, ivDef, ivSta, cpm);

    const fastMoveObj =
      db.fastMoves[rawEntry.fastMove] || db.fastMoves[species.fastMoves[0]];
    const chargedMoveObj =
      db.chargedMoves[rawEntry.chargedMove] || db.chargedMoves[species.chargedMoves[0]];

    const maxMoveInfo = resolveMaxMoveInfo(species, rawEntry);

    return {
      ...rawEntry,
      ivAtk,
      ivDef,
      ivSta,
      ivPct,
      level,
      levelPreset: presetObj.id,
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

  /**
   * Lee la lista cruda desde localStorage. Si nunca se ha inicializado, carga la caja Demo inicial.
   */
  function loadRawBox() {
    const db = getDB();
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Primera visita: inicializar con starterDemoBox para que el usuario vea resultados al instante
        const initialBox = JSON.parse(JSON.stringify(db.starterDemoBox || []));
        saveRawBox(initialBox);
        return initialBox;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Error leyendo Mi Caja de localStorage:", err);
      return [];
    }
  }

  /**
   * Guarda la lista cruda en localStorage
   */
  function saveRawBox(list) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.error("Error guardando Mi Caja en localStorage:", err);
    }
  }

  // ==========================================================================
  // API PÚBLICA DE PokeBoxManager
  // ==========================================================================
  const PokeBoxManager = {
    STORAGE_KEY,

    /**
     * Devuelve todos los Pokémon guardados en Mi Caja enriquecidos con stats, PC y movimientos
     */
    getAll() {
      const rawList = loadRawBox();
      return rawList.map(enrichBoxPokemon).filter(Boolean);
    },

    /**
     * Busca un Pokémon concreto en Mi Caja por su UID
     */
    getByUid(uid) {
      return this.getAll().find((item) => item.uid === uid) || null;
    },

    /**
     * Añade un nuevo Pokémon a Mi Caja
     */
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

      // Determinar nivel desde PC personalizado si se proporcionó, o desde el preset elegido
      let level = Number(entryData.level) || 40;
      let levelPreset = entryData.levelPreset || "no_xl";

      if (entryData.customCP && Number(entryData.customCP) >= 10) {
        const estimated = estimateLevelFromCP(
          species,
          entryData.ivAtk ?? 15,
          entryData.ivDef ?? 15,
          entryData.ivSta ?? 15,
          Number(entryData.customCP)
        );
        level = estimated.level;
        levelPreset = estimated.presetId;
      } else {
        const presetObj = db.levelPresets.find((p) => p.id === levelPreset);
        if (presetObj) level = presetObj.level;
      }

      const maxClass = entryData.maxClass || "none";
      const newRecord = {
        uid,
        pokemonId: species.id,
        nickname: (entryData.nickname || "").trim() || species.name,
        ivAtk: Math.min(15, Math.max(0, Number(entryData.ivAtk ?? 15))),
        ivDef: Math.min(15, Math.max(0, Number(entryData.ivDef ?? 15))),
        ivSta: Math.min(15, Math.max(0, Number(entryData.ivSta ?? 15))),
        levelPreset,
        level,
        customCP: entryData.customCP ? Number(entryData.customCP) : null,
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

    /**
     * Actualiza un Pokémon existente en Mi Caja por su UID
     */
    update(uid, updatedData) {
      const db = getDB();
      const rawList = loadRawBox();
      const index = rawList.findIndex((item) => item.uid === uid);
      if (index === -1) return null;

      const species = getSpeciesById(updatedData.pokemonId || rawList[index].pokemonId);
      if (!species) return null;

      let level = Number(updatedData.level) || rawList[index].level || 40;
      let levelPreset = updatedData.levelPreset || rawList[index].levelPreset || "no_xl";

      if (updatedData.customCP && Number(updatedData.customCP) >= 10) {
        const estimated = estimateLevelFromCP(
          species,
          updatedData.ivAtk ?? 15,
          updatedData.ivDef ?? 15,
          updatedData.ivSta ?? 15,
          Number(updatedData.customCP)
        );
        level = estimated.level;
        levelPreset = estimated.presetId;
      } else {
        const presetObj = db.levelPresets.find((p) => p.id === levelPreset);
        if (presetObj) level = presetObj.level;
      }

      const maxClass = updatedData.maxClass || "none";
      const updatedRecord = {
        ...rawList[index],
        uid,
        pokemonId: species.id,
        nickname: (updatedData.nickname || "").trim() || species.name,
        ivAtk: Math.min(15, Math.max(0, Number(updatedData.ivAtk ?? 15))),
        ivDef: Math.min(15, Math.max(0, Number(updatedData.ivDef ?? 15))),
        ivSta: Math.min(15, Math.max(0, Number(updatedData.ivSta ?? 15))),
        levelPreset,
        level,
        customCP: updatedData.customCP ? Number(updatedData.customCP) : null,
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

    /**
     * Elimina un Pokémon de Mi Caja por su UID
     */
    remove(uid) {
      const rawList = loadRawBox();
      const filtered = rawList.filter((item) => item.uid !== uid);
      saveRawBox(filtered);
      return filtered.length;
    },

    /**
     * Vacía por completo Mi Caja Pokémon
     */
    clearAll() {
      saveRawBox([]);
      return [];
    },

    /**
     * Restaura o fusiona la Caja Demo Meta (Eternatus, Duraludon Gigamax, Excadrill D-Max, Groudon Primigenio, etc.)
     */
    loadDemoBox() {
      const db = getDB();
      const demoClone = JSON.parse(JSON.stringify(db.starterDemoBox || []));
      saveRawBox(demoClone);
      return this.getAll();
    },

    // Utilidades matemáticas expuestas para previsualización en tiempo real en el formulario
    calculateCP,
    estimateLevelFromCP,
    getCPMForLevel,
    getSpeciesById,
    enrichBoxPokemon
  };

  global.PokeBoxManager = PokeBoxManager;
})(typeof window !== "undefined" ? window : globalThis);
