/**
 * PokéRaid & Max Optimizer - Módulo 3: Motor Matemático de Simulación y Recomendación (js/engine.js)
 *
 * Implementa las fórmulas oficiales de Pokémon GO PvE:
 *  - Daño = Floor(0.5 * Power * (Atk / Def) * STAB * Eficacia * Shadow * Amistad * Clima * Mega * PartyPower) + 1
 *  - Frecuencia de Party Power (Juego en Equipo) según tamaño de Party (2, 3 o 4 jugadores)
 *  - Mecánicas de Combates Dinamax (Nv. 1-5, patrulla máx 4) y Gigamax (Nv. 6, patrullas de 4 hasta 40 jugadores)
 *  - Separación de roles en Combates Max:
 *      * Slots 1 y 2: Tanques / Generadores de Medidor Max (prioriza ataques rápidos de 0.5s, resistencias, Defensa*PS, Guardia Max y Espíritu Max)
 *      * Slot 3: Atacante de Fase Max (maximiza el daño de los 3 impactos de Ataque Max Nv. 1-3: Dinamax, Gigamax o Cañón Dinamax)
 *  - Calculadora de Jugadores Necesarios en 3 escenarios: Hardcore (Nv. 40-50 Meta), Estándar (Nv. 30-35) y Casual (Nv. 20-25 Auto)
 */

(function (global) {
  "use strict";

  function getDB() {
    if (!global.POKE_DB) {
      throw new Error("POKE_DB no está cargado.");
    }
    return global.POKE_DB;
  }

  /**
   * Calcula el multiplicador de eficacia de tipos de un movimiento de tipo `moveType`
   * contra un defensor con array de tipos `defenderTypes` (ej. ["veneno", "dragon"])
   */
  function getTypeEffectiveness(moveType, defenderTypes) {
    const db = getDB();
    if (!moveType || !Array.isArray(defenderTypes)) return 1.0;

    const chartForMove = db.typeChart[moveType] || {};
    let multiplier = 1.0;

    for (const defType of defenderTypes) {
      const m = chartForMove[defType] !== undefined ? chartForMove[defType] : 1.0;
      multiplier *= m;
    }

    // Redondeo limpio a 4 decimales
    return Math.round(multiplier * 10000) / 10000;
  }

  /**
   * Calcula todas las debilidades y resistencias de un Jefe dado su array de tipos
   */
  function analyzeBossWeaknesses(bossTypes) {
    const db = getDB();
    const results = [];

    for (const atkType of db.types) {
      const mult = getTypeEffectiveness(atkType, bossTypes);
      if (mult > 1.0) {
        results.push({
          type: atkType,
          name: db.typeMeta[atkType].name,
          multiplier: mult,
          isDoubleWeakness: mult >= 2.5,
          meta: db.typeMeta[atkType]
        });
      }
    }

    // Ordenar primero las dobles debilidades (2.56x) y luego las simples (1.6x)
    results.sort((a, b) => b.multiplier - a.multiplier);
    return results;
  }

  /**
   * Obtiene las estadísticas reales de combate del Jefe según el Modo de Combate seleccionado
   */
  function getBossCombatProfile(bossPokemon, battleMode, selectedFastId, selectedChargedId) {
    const db = getDB();
    const cpm = battleMode.bossCPM || 0.7903;
    const enrageDefMult = battleMode.enrageDefenseBoost || 1.0;

    const bossAtk = (bossPokemon.baseStats.atk + 15) * cpm;
    const bossDef = (bossPokemon.baseStats.def + 15) * cpm * enrageDefMult;
    const bossHP = battleMode.bossHP || 15000;

    const fastMove =
      db.fastMoves[selectedFastId] ||
      db.fastMoves[bossPokemon.fastMoves[0]] ||
      Object.values(db.fastMoves)[0];

    const chargedMove =
      db.chargedMoves[selectedChargedId] ||
      db.chargedMoves[bossPokemon.chargedMoves[0]] ||
      Object.values(db.chargedMoves)[0];

    return {
      species: bossPokemon,
      battleMode,
      atk: bossAtk,
      def: bossDef,
      hp: bossHP,
      timeLimitSec: battleMode.timeLimitSec || 300,
      fastMove,
      chargedMove,
      weaknesses: analyzeBossWeaknesses(bossPokemon.types)
    };
  }

  /**
   * Fórmula oficial de daño de Pokémon GO
   */
  function computeSingleHitDamage(power, attackerEffectiveAtk, defenderEffectiveDef, totalMultiplier) {
    if (power <= 0 || attackerEffectiveAtk <= 0 || defenderEffectiveDef <= 0) return 1;
    return Math.floor(0.5 * power * (attackerEffectiveAtk / defenderEffectiveDef) * totalMultiplier) + 1;
  }

  /**
   * Calcula el multiplicador global externo (Amistad * Clima * Mega)
   */
  function getExternalMultipliers(conditions, moveType, isSuperEffective) {
    const db = getDB();
    const friendshipObj =
      db.combatModifiers.friendship[conditions.friendship] ||
      db.combatModifiers.friendship.none;
    const megaObj =
      db.combatModifiers.megaBonus[conditions.megaBonus] ||
      db.combatModifiers.megaBonus.none;

    const friendshipMult = friendshipObj.multiplier;
    const megaMult = megaObj.multiplier;
    // Si el usuario activa "Clima a favor", bonifica los ataques eficaces/principales con x1.20
    const weatherMult = conditions.weatherBoost && isSuperEffective ? db.combatModifiers.weatherBoost : 1.0;

    return {
      friendshipMult,
      megaMult,
      weatherMult,
      combinedExternal: friendshipMult * megaMult * weatherMult
    };
  }

  /**
   * Evalúa el rendimiento de un Pokémon de Mi Caja en una INCURSIÓN ESTÁNDAR (Raid)
   */
  function evaluateRaidPokemon(boxEntry, bossProfile, conditions) {
    const db = getDB();
    const fast = boxEntry.fastMoveObj;
    const charged = boxEntry.chargedMoveObj;
    const attackerTypes = boxEntry.species.types;
    const bossTypes = bossProfile.species.types;

    // STAB (1.2x)
    const fastSTAB = attackerTypes.includes(fast.type) ? db.combatModifiers.stab : 1.0;
    const chargedSTAB = attackerTypes.includes(charged.type) ? db.combatModifiers.stab : 1.0;

    // Eficacia de tipos contra el jefe
    const fastTypeEff = getTypeEffectiveness(fast.type, bossTypes);
    const chargedTypeEff = getTypeEffectiveness(charged.type, bossTypes);

    // Modificadores externos (Amistad, Clima, Mega)
    const fastExt = getExternalMultipliers(conditions, fast.type, fastTypeEff >= 1.0);
    const chargedExt = getExternalMultipliers(conditions, charged.type, chargedTypeEff >= 1.0);

    const fastTotalMult = fastSTAB * fastTypeEff * fastExt.combinedExternal;
    const chargedTotalMult = chargedSTAB * chargedTypeEff * chargedExt.combinedExternal;

    // Daño por golpe rápido y cargado normal
    const fastDmg = computeSingleHitDamage(
      fast.power,
      boxEntry.stats.effectiveAtk,
      bossProfile.def,
      fastTotalMult
    );

    const chargedDmgNormal = computeSingleHitDamage(
      charged.power,
      boxEntry.stats.effectiveAtk,
      bossProfile.def,
      chargedTotalMult
    );

    // Cálculo de Juego en Equipo (Party Power):
    // En Party de 2, 3 o 4 jugadores, cada N ataques rápidos el siguiente ataque cargado duplica su daño (x2.0)
    let partyChargedMultiplier = 1.0;
    if (
      bossProfile.battleMode.allowPartyPower &&
      conditions.partyPowerEnabled &&
      conditions.partySize >= 2
    ) {
      const partyInfo =
        db.combatModifiers.partyPower[conditions.partySize] ||
        db.combatModifiers.partyPower[2];

      const fastHitsPerCharged = Math.ceil(charged.energyCost / Math.max(1, fast.energyGain));
      const ratioChargedBoosted = Math.min(
        1.0,
        fastHitsPerCharged / partyInfo.chargeFrequencyFastHits
      );
      // Promedio ponderado entre golpes cargados normales (1.0x) y golpes cargados duplicados por Party Power (2.0x)
      partyChargedMultiplier = 1.0 + ratioChargedBoosted;
    }

    const chargedDmgEffective = Math.round(chargedDmgNormal * partyChargedMultiplier);

    // Simulación del daño recibido del Jefe para estimar supervivencia (Time to Faint) y energía ganada por daño
    const bossFastSTAB = bossTypes.includes(bossProfile.fastMove.type) ? 1.2 : 1.0;
    const bossChargedSTAB = bossTypes.includes(bossProfile.chargedMove.type) ? 1.2 : 1.0;
    const bossFastEff = getTypeEffectiveness(bossProfile.fastMove.type, attackerTypes);
    const bossChargedEff = getTypeEffectiveness(bossProfile.chargedMove.type, attackerTypes);

    const bossFastDmg = computeSingleHitDamage(
      bossProfile.fastMove.power,
      bossProfile.atk,
      boxEntry.stats.effectiveDef,
      bossFastSTAB * bossFastEff
    );
    const bossChargedDmg = computeSingleHitDamage(
      bossProfile.chargedMove.power,
      bossProfile.atk,
      boxEntry.stats.effectiveDef,
      bossChargedSTAB * bossChargedEff
    );

    // Un jefe de incursión ataca cada ~2.0s adicionales de IA; combinamos su DPS entrante promedio
    const bossIncomingDPS =
      (bossFastDmg * 3 + bossChargedDmg * 0.65) /
      ((bossProfile.fastMove.durationMs * 3 + bossProfile.chargedMove.durationMs + 4500) / 1000);

    const timeToFaintSec = Math.min(
      bossProfile.timeLimitSec,
      Math.max(8, boxEntry.stats.hp / Math.max(1, bossIncomingDPS))
    );

    // Energía pasiva ganada por recibir daño del jefe (0.5 de energía por cada 1 PS perdido)
    const passiveEnergyPerSec = (bossIncomingDPS * 0.5) * 0.7;

    // Ciclo de DPS del Pokémon
    const fastDurationSec = fast.durationMs / 1000;
    const chargedDurationSec = charged.durationMs / 1000;
    const fastEPS = fast.energyGain / fastDurationSec + passiveEnergyPerSec;
    const timeToChargeSec = charged.energyCost / Math.max(1, fastEPS);
    const fastHitsInCycle = Math.max(1, Math.ceil(timeToChargeSec / fastDurationSec));

    const cycleTimeSec = fastHitsInCycle * fastDurationSec + chargedDurationSec;
    const cycleDamage = fastHitsInCycle * fastDmg + chargedDmgEffective;

    const dps = Math.round((cycleDamage / cycleTimeSec) * 10) / 10;
    const tdo = Math.round(dps * timeToFaintSec);

    // Puntuación equilibrada para ordenar el equipo (prioriza DPS alto con peso de TDO para no elegir glass cannons extremos de 3s)
    const raidScore = Math.pow(dps, 1.35) * Math.pow(tdo, 0.28);

    return {
      boxEntry,
      modeCategory: "raid",
      dps,
      tdo,
      timeToFaintSec: Math.round(timeToFaintSec * 10) / 10,
      fastDmg,
      chargedDmg: chargedDmgEffective,
      fastTypeEff,
      chargedTypeEff,
      bestTypeEff: Math.max(fastTypeEff, chargedTypeEff),
      partyChargedMultiplier: Math.round(partyChargedMultiplier * 100) / 100,
       bossResistanceMult: Math.round(((bossFastEff + bossChargedEff) / 2) * 100) / 100,
      score: raidScore,
      roleLabel: "Atacante DPS Incursión",
      roleBadgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
    };
  }

  /**
   * Evalúa el rendimiento de un Pokémon de Mi Caja en un COMBATE DINAMAX / GIGAMAX
   * Diferenciando entre:
   *  - Rol Tanque / Generador de Medidor Max (Fase Normal)
   *  - Rol Atacante de Fase Max (3 impactos de Ataque Max / Gigamax / Cañón Dinamax)
   */
  function evaluateMaxPokemon(boxEntry, bossProfile, conditions) {
    const db = getDB();
    const baseRaidEval = evaluateRaidPokemon(boxEntry, bossProfile, {
      ...conditions,
      partyPowerEnabled: false
    });

    const maxInfo = boxEntry.maxMoveInfo;
    const isMaxEligible = Boolean(maxInfo && maxInfo.isMaxCapable);

    const bossTypes = bossProfile.species.types;
    const attackerTypes = boxEntry.species.types;

    // 1. Evaluar Daño de la Fase Max (3 ataques Max consecutivos)
    const maxMoveType = maxInfo.moveType || boxEntry.fastMoveObj.type;
    const maxSTAB = attackerTypes.includes(maxMoveType) ? db.combatModifiers.stab : 1.0;
    const maxTypeEff = getTypeEffectiveness(maxMoveType, bossTypes);
    const ext = getExternalMultipliers(conditions, maxMoveType, maxTypeEff >= 1.0);

    // Bonificación extra si es Eternatus con Cañón Dinamax enfrentando a un Jefe Max
    const eternamaxBonus = maxInfo.maxClass === "eternamax" ? 1.15 : 1.0;

    const singleMaxHitDamage = isMaxEligible
      ? computeSingleHitDamage(
          maxInfo.potency,
          boxEntry.stats.effectiveAtk,
          bossProfile.def,
          maxSTAB * maxTypeEff * ext.combinedExternal * eternamaxBonus
        )
      : 0;

    // En cada Fase Dinamax/Gigamax se lanzan 3 movimientos Max
    const totalMaxBurstDamage = singleMaxHitDamage * 3;

    // 2. Evaluar Capacidad de Carga del Medidor Max y Supervivencia (Tank / Meter Charger Score)
    // En Combates Max, los ataques rápidos de 0.5s (500ms) son reyes absolutos porque generan energía Max cada 0.5s
    const fastDurationSec = boxEntry.fastMoveObj.durationMs / 1000;
    const meterChargeSpeedBonus = fastDurationSec <= 0.5 ? 1.45 : fastDurationSec <= 1.0 ? 1.15 : 0.85;

    // Escudo de Guardia Max y Curación de Espíritu Max
    const guardShieldHP =
      (db.combatModifiers.maxGuardShieldPerLevel[maxInfo.guardLevel] || 0) * 2;
    const spiritHealFraction =
      db.combatModifiers.maxSpiritHealPerLevel[maxInfo.spiritLevel] || 0;
    const effectiveTankHP =
      boxEntry.stats.hp * (1 + spiritHealFraction * 2) + guardShieldHP;

    // Cuánto resiste los ataques del jefe
    const bossFastEff = getTypeEffectiveness(bossProfile.fastMove.type, attackerTypes);
    const bossChargedEff = getTypeEffectiveness(bossProfile.chargedMove.type, attackerTypes);
    const avgIncomingEff = (bossFastEff + bossChargedEff) / 2;
    const resistanceFactor = 1 / Math.max(0.39, avgIncomingEff);

    const tankScore = isMaxEligible
      ? (effectiveTankHP * boxEntry.stats.effectiveDef * resistanceFactor * meterChargeSpeedBonus) / 100
      : 0;

    const maxAttackerScore = isMaxEligible
      ? totalMaxBurstDamage * (1 + baseRaidEval.dps / 100)
      : 0;

    // Tiempo estimado para cargar el medidor Max (100 energía Max) en una patrulla activa
    const meterChargePhaseSec = fastDurationSec <= 0.5 ? 14 : fastDurationSec <= 1.0 ? 19 : 25;
    const maxPhaseDurationSec = 15; // Los 3 ataques Max toman ~15 segundos de reloj efectivo
    const fullMaxCycleSec = meterChargePhaseSec + maxPhaseDurationSec;

    const cycleDamageWithMax =
      baseRaidEval.dps * meterChargePhaseSec + totalMaxBurstDamage;
    const effectiveMaxDPS = isMaxEligible
      ? Math.round((cycleDamageWithMax / fullMaxCycleSec) * 10) / 10
      : baseRaidEval.dps;

    const effectiveMaxTDO = isMaxEligible
      ? Math.round(
          effectiveMaxDPS *
            Math.min(
              bossProfile.timeLimitSec,
              baseRaidEval.timeToFaintSec * (1 + spiritHealFraction + guardShieldHP / Math.max(100, boxEntry.stats.hp))
            )
        )
      : baseRaidEval.tdo;

    return {
      ...baseRaidEval,
      modeCategory: "max",
      isMaxEligible,
      maxInfo,
      maxTypeEff,
      bestTypeEff: Math.max(baseRaidEval.bestTypeEff, maxTypeEff),
      singleMaxHitDamage,
      totalMaxBurstDamage,
      effectiveMaxDPS,
      effectiveMaxTDO,
      dps: effectiveMaxDPS,
      tdo: effectiveMaxTDO,
      tankScore: Math.round(tankScore),
      maxAttackerScore: Math.round(maxAttackerScore),
      fastDurationSec,
      score: isMaxEligible ? maxAttackerScore + tankScore * 0.35 : baseRaidEval.score * 0.1
    };
  }

  /**
   * Construye el Equipo Ideal (6 Pokémon para Incursiones, o 3 Pokémon diferenciados por rol para Combates Max)
   */
  function selectOptimalTeam(evaluatedList, battleMode) {
    if (!evaluatedList || evaluatedList.length === 0) {
      return {
        team: [],
        missingMaxWarning: false
      };
    }

    // MODO INCURSIÓN (6 mejores atacantes ordenados por score)
    if (battleMode.category === "raid") {
      const sorted = [...evaluatedList].sort((a, b) => b.score - a.score);
      const top6 = sorted.slice(0, battleMode.teamSize || 6).map((item, idx) => ({
        ...item,
        slotNumber: idx + 1,
        roleLabel: idx === 0 ? "Líder DPS #1" : `Atacante #${idx + 1}`,
        roleBadgeClass:
          idx === 0
            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
            : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
      }));

      return {
        team: top6,
        missingMaxWarning: false
      };
    }

    // MODO COMBATE DINAMAX / GIGAMAX (3 Pokémon: 2 Tanques/Cargadores de Medidor + 1 Atacante Fase Max)
    const maxCapablePool = evaluatedList.filter((item) => item.isMaxEligible);
    const poolToUse = maxCapablePool.length > 0 ? maxCapablePool : evaluatedList;
    const missingMaxWarning = maxCapablePool.length === 0;

    if (poolToUse.length === 1) {
      return {
        team: [
          {
            ...poolToUse[0],
            slotNumber: 1,
            roleLabel: "Todoterreno Max (Tanque + DPS)",
            roleBadgeClass: "bg-pink-500/20 text-pink-300 border-pink-500/40"
          }
        ],
        missingMaxWarning
      };
    }

    // 1. Elegir el mejor Atacante de Fase Max para el Slot 3 (Rematador Max)
    const sortedByMaxBurst = [...poolToUse].sort(
      (a, b) => b.maxAttackerScore - a.maxAttackerScore
    );
    const maxFinisher = sortedByMaxBurst[0];

    // 2. Del resto de la caja, elegir los 2 mejores Tanques / Generadores de Medidor para los Slots 1 y 2
    const remainingForTanks = poolToUse.filter(
      (item) => item.boxEntry.uid !== maxFinisher.boxEntry.uid
    );
    remainingForTanks.sort((a, b) => b.tankScore - a.tankScore);

    const tank1 = remainingForTanks[0] || maxFinisher;
    const tank2 = remainingForTanks[1] || null;

    const finalTeam = [];

    if (tank1 && tank1.boxEntry.uid !== maxFinisher.boxEntry.uid) {
      finalTeam.push({
        ...tank1,
        slotNumber: 1,
        roleLabel: "Slot 1 · Tanque & Cargador Medidor (0.5s)",
        roleBadgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      });
    }

    if (tank2) {
      finalTeam.push({
        ...tank2,
        slotNumber: finalTeam.length + 1,
        roleLabel:
          tank2.maxInfo.spiritLevel > 0 || tank2.maxInfo.guardLevel > 0
            ? "Slot 2 · Tanque Soporte (Guardia / Espíritu Max)"
            : "Slot 2 · Tanque Secundario Cargador",
        roleBadgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
      });
    }

    finalTeam.push({
      ...maxFinisher,
      slotNumber: finalTeam.length + 1,
      roleLabel: `Slot ${finalTeam.length + 1} · Rematador Fase Max (${maxFinisher.maxInfo.moveName})`,
      roleBadgeClass: "bg-pink-500/25 text-pink-300 border-pink-500/50"
    });

    return {
      team: finalTeam.slice(0, 3),
      missingMaxWarning
    };
  }

  /**
   * Calcula la contribución total del jugador y cuántos entrenadores adicionales necesita
   * en los 3 escenarios: Hardcore, Estándar y Casual.
   */
  function calculateBattlePlan(boxList, bossId, battleModeId, conditions) {
    const db = getDB();
    const battleMode = db.battleModes[battleModeId] || db.battleModes.raid_t5;
    const bossSpecies =
      db.pokemon.find((p) => p.id === bossId) || db.pokemon[0];

    const bossProfile = getBossCombatProfile(
      bossSpecies,
      battleMode,
      conditions.bossFastMove,
      conditions.bossChargedMove
    );

    // Evaluar todos los Pokémon de Mi Caja
    const evaluatedList = (boxList || []).map((entry) =>
      battleMode.category === "max"
        ? evaluateMaxPokemon(entry, bossProfile, conditions)
        : evaluateRaidPokemon(entry, bossProfile, conditions)
    );

    const { team, missingMaxWarning } = selectOptimalTeam(evaluatedList, battleMode);

    // Si la caja está vacía
    if (team.length === 0) {
      return {
        bossProfile,
        battleMode,
        conditions,
        team: [],
        missingMaxWarning: false,
        personalMetrics: {
          teamDPS: 0,
          teamTDO: 0,
          personalDamage: 0,
          personalDamagePct: 0,
          activeMultiplier: 1.0,
          canSolo: false
        },
        scenarios: {
          hardcore: { count: 3, label: "+3 jugadores" },
          standard: { count: 5, label: "+5 jugadores" },
          casual: { count: 9, label: "+9 jugadores" }
        },
        directRecommendation:
          "Tu Caja Pokémon está vacía. Añade tus Pokémon en la pestaña 'Mi Caja Pokémon' o pulsa 'Cargar Caja Demo' arriba a la derecha."
      };
    }

    // Calcular el DPS y TDO combinado del Equipo Ideal del usuario
    let weightedDPS = 0;
    let totalTeamTDO = 0;
    let totalSurvivalSec = 0;

    if (battleMode.category === "max") {
      // En Combate Max, los tanques cargan el medidor y el Rematador (último slot) ejecuta la Fase Max
      const finisher = team[team.length - 1];
      const avgTankDPS =
        team.reduce((acc, item) => acc + item.dps, 0) / team.length;
      weightedDPS = Math.round((finisher.effectiveMaxDPS * 0.65 + avgTankDPS * 0.35) * 10) / 10;
      totalTeamTDO = team.reduce((acc, item) => acc + item.tdo, 0);
      totalSurvivalSec = Math.min(
        bossProfile.timeLimitSec,
        team.reduce((acc, item) => acc + item.timeToFaintSec, 0) * 1.25
      );
    } else {
      // En Incursión normal, ponderamos más los primeros Pokémon del equipo y permitimos 1 relobby si el tiempo da
      weightedDPS =
        Math.round(
          (team.reduce((acc, item) => acc + item.dps, 0) / team.length) * 10
        ) / 10;
      const singlePassTDO = team.reduce((acc, item) => acc + item.tdo, 0);
      const singlePassTime = team.reduce((acc, item) => acc + item.timeToFaintSec, 0);

      // En incursiones puedes curar/relobby en ~12 segundos si tu equipo cae antes de los 300s
      if (singlePassTime < bossProfile.timeLimitSec - 15) {
        const effectiveActiveTime = Math.max(0, bossProfile.timeLimitSec - 14);
        totalSurvivalSec = effectiveActiveTime;
        totalTeamTDO = Math.round(weightedDPS * effectiveActiveTime);
      } else {
        totalSurvivalSec = bossProfile.timeLimitSec;
        totalTeamTDO = singlePassTDO;
      }
    }

    // Daño real que el usuario puede infligir antes de que acabe el tiempo o caiga su equipo
    const rawPersonalDamage = Math.min(
      totalTeamTDO,
      Math.round(weightedDPS * Math.min(bossProfile.timeLimitSec, totalSurvivalSec))
    );

    const personalDamagePct =
      Math.round((rawPersonalDamage / bossProfile.hp) * 1000) / 10;
    const remainingBossHP = Math.max(0, bossProfile.hp - rawPersonalDamage);
    const canSolo = rawPersonalDamage >= bossProfile.hp;

    // Estimación del Daño que aporta CADA compañero adicional según su perfil (Hardcore, Estándar, Casual)
    // Calculamos una referencia realista contra la Defensa específica de este Jefe y el Tiempo del combate
    const bestWeaknessMult =
      bossProfile.weaknesses.length > 0 ? bossProfile.weaknesses[0].multiplier : 1.6;
    const ext = getExternalMultipliers(conditions, null, true);
    const partyFactor =
      battleMode.allowPartyPower && conditions.partyPowerEnabled ? 1.32 : 1.0;

    // Daño de referencia por segundo de un jugador Hardcore (Nv. 45-50 Meta, STAB + Eficacia + Party/Max Nv. 3)
    const refHardcoreAtk = (295 + 15) * 0.825 * 1.08;
    const refStandardAtk = (245 + 13) * 0.755;
    const refCasualAtk = (195 + 10) * 0.635;

    const baseHitHardcore = computeSingleHitDamage(
      115,
      refHardcoreAtk,
      bossProfile.def,
      1.2 * bestWeaknessMult * ext.combinedExternal * partyFactor
    );
    const baseHitStandard = computeSingleHitDamage(
      90,
      refStandardAtk,
      bossProfile.def,
      1.2 * Math.min(1.6, bestWeaknessMult) * ext.friendshipMult
    );
    const baseHitCasual = computeSingleHitDamage(
      65,
      refCasualAtk,
      bossProfile.def,
      1.0 * (bestWeaknessMult > 1.6 ? 1.6 : 1.0)
    );

    // En Combates Max Nv. 5/6 el daño de cada compañero depende de las fases Max y la supervivencia sin relobby
    const effectiveTimeWindow =
      battleMode.category === "max"
        ? bossProfile.timeLimitSec * 0.68
        : bossProfile.timeLimitSec * 0.85;

    const allyDamageHardcore = Math.max(
      1200,
      Math.round((baseHitHardcore / 2.2) * effectiveTimeWindow)
    );
    const allyDamageStandard = Math.max(
      750,
      Math.round((baseHitStandard / 2.5) * (effectiveTimeWindow * 0.82))
    );
    const allyDamageCasual = Math.max(
      380,
      Math.round((baseHitCasual / 2.9) * (effectiveTimeWindow * 0.62))
    );

    const hardcoreNeeded = canSolo
      ? 0
      : Math.ceil(remainingBossHP / allyDamageHardcore);
    const standardNeeded = canSolo
      ? 0
      : Math.ceil(remainingBossHP / allyDamageStandard);
    const casualNeeded = canSolo
      ? 0
      : Math.ceil(remainingBossHP / allyDamageCasual);

    // Multiplicador global activo para mostrar en la métrica
    const samplePartyMult =
      team[0] && team[0].partyChargedMultiplier ? team[0].partyChargedMultiplier : 1.0;
    const activeMultiplier =
      Math.round(ext.combinedExternal * samplePartyMult * 100) / 100;

    // Construir frase directa y personalizada (Requisito clave del Módulo 3)
    const partyPhrase =
      battleMode.allowPartyPower && conditions.partyPowerEnabled
        ? `activando Juego en Equipo (Party de ${conditions.partySize})`
        : battleMode.category === "max"
        ? "en modalidad de Patrulla Max"
        : "sin Juego en Equipo activo";

    let directRecommendation = "";
    if (canSolo) {
      directRecommendation = `¡Victoria en Solitario viable! Con tu equipo actual (${personalDamagePct}% del HP total del jefe) y ${partyPhrase}, puedes derrotar a ${bossSpecies.name} tú solo sin necesitar jugadores adicionales.`;
    } else if (battleMode.id === "dmax_t5" || battleMode.id === "dmax_t3" || battleMode.id === "dmax_t1") {
      const limitNote =
        standardNeeded > 3
          ? ` ⚠️ Atención: este Combate Dinamax solo permite máximo 4 jugadores por patrulla (tú + 3 compañeros), por lo que necesitarás compañeros Hardcore.`
          : "";
      directRecommendation = `Con tu equipo actual (bajas el ${personalDamagePct}% de la vida de ${bossSpecies.name}) ${partyPhrase}, necesitas mínimo +${hardcoreNeeded} jugador(es) más bien preparados (Hardcore), o +${standardNeeded} con preparación media, o +${casualNeeded} poco preparados.${limitNote}`;
    } else if (battleMode.id === "gmax_t6") {
      const totalSquadsStd = Math.ceil((1 + standardNeeded) / 4);
      directRecommendation = `Contra ${bossSpecies.name} (${bossProfile.hp.toLocaleString()} HP en Gigamax Nv. 6), tú aportas el ${personalDamagePct}% del daño total. Necesitas mínimo +${hardcoreNeeded} jugadores más muy preparados (Hardcore), o +${standardNeeded} de nivel medio (~${totalSquadsStd} patrullas de 4 entrenadores), o +${casualNeeded}+ jugadores casuales.`;
    } else {
      directRecommendation = `Con tu equipo actual (aportas el ${personalDamagePct}% del daño a ${bossSpecies.name}) y ${partyPhrase}, necesitas mínimo +${hardcoreNeeded} jugador(es) más bien preparados, o +${standardNeeded} con preparación media, o +${casualNeeded}+ poco preparados.`;
    }

    return {
      bossProfile,
      battleMode,
      conditions,
      team,
      missingMaxWarning,
      personalMetrics: {
        teamDPS: weightedDPS,
        teamTDO: totalTeamTDO,
        personalDamage: rawPersonalDamage,
        personalDamagePct,
        activeMultiplier,
        canSolo
      },
      scenarios: {
        hardcore: {
          count: hardcoreNeeded,
          allyDamage: allyDamageHardcore,
          exceedsMaxLobby: hardcoreNeeded + 1 > battleMode.maxLobbyPlayers
        },
        standard: {
          count: standardNeeded,
          allyDamage: allyDamageStandard,
          exceedsMaxLobby: standardNeeded + 1 > battleMode.maxLobbyPlayers
        },
        casual: {
          count: casualNeeded,
          allyDamage: allyDamageCasual,
          exceedsMaxLobby: casualNeeded + 1 > battleMode.maxLobbyPlayers
        }
      },
      directRecommendation
    };
  }

  global.PokeOptimizerEngine = {
    getTypeEffectiveness,
    analyzeBossWeaknesses,
    getBossCombatProfile,
    evaluateRaidPokemon,
    evaluateMaxPokemon,
    selectOptimalTeam,
    calculateBattlePlan
  };
})(typeof window !== "undefined" ? window : globalThis);
