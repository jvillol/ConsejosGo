/**
 * PokéRaid & Max Optimizer - Módulo 3: Motor Matemático de Simulación y Recomendación (js/engine.js)
 *
 * Mejoras:
 *  - Soporte de Amigos Fijos: simula el daño real de cada amigo según los Pokémon que tenga guardados en su caja.
 *  - Claridad Absoluta de Escenarios: muestra no solo un número abstracto sino exactamente por qué y qué aporta cada jugador.
 *  - Desglose de Vida Restante, porcentaje que cubre el usuario, el amigo fijo y compañeros desconocidos.
 */

(function (global) {
  "use strict";

  function getDB() {
    if (!global.POKE_DB) {
      throw new Error("POKE_DB no está cargado.");
    }
    return global.POKE_DB;
  }

  function getTypeEffectiveness(moveType, defenderTypes) {
    const db = getDB();
    if (!moveType || !Array.isArray(defenderTypes)) return 1.0;

    const chartForMove = db.typeChart[moveType] || {};
    let multiplier = 1.0;

    for (const defType of defenderTypes) {
      const m = chartForMove[defType] !== undefined ? chartForMove[defType] : 1.0;
      multiplier *= m;
    }

    return Math.round(multiplier * 10000) / 10000;
  }

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

    results.sort((a, b) => b.multiplier - a.multiplier);
    return results;
  }

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

  function computeSingleHitDamage(power, attackerEffectiveAtk, defenderEffectiveDef, totalMultiplier) {
    if (power <= 0 || attackerEffectiveAtk <= 0 || defenderEffectiveDef <= 0) return 1;
    return Math.floor(0.5 * power * (attackerEffectiveAtk / defenderEffectiveDef) * totalMultiplier) + 1;
  }

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
    const weatherMult = conditions.weatherBoost && isSuperEffective ? db.combatModifiers.weatherBoost : 1.0;

    return {
      friendshipMult,
      megaMult,
      weatherMult,
      combinedExternal: friendshipMult * megaMult * weatherMult
    };
  }

  function evaluateRaidPokemon(boxEntry, bossProfile, conditions) {
    const db = getDB();
    const fast = boxEntry.fastMoveObj;
    const charged = boxEntry.chargedMoveObj;
    const attackerTypes = boxEntry.species.types;
    const bossTypes = bossProfile.species.types;

    const fastSTAB = attackerTypes.includes(fast.type) ? db.combatModifiers.stab : 1.0;
    const chargedSTAB = attackerTypes.includes(charged.type) ? db.combatModifiers.stab : 1.0;

    const fastTypeEff = getTypeEffectiveness(fast.type, bossTypes);
    const chargedTypeEff = getTypeEffectiveness(charged.type, bossTypes);

    const fastExt = getExternalMultipliers(conditions, fast.type, fastTypeEff >= 1.0);
    const chargedExt = getExternalMultipliers(conditions, charged.type, chargedTypeEff >= 1.0);

    const fastTotalMult = fastSTAB * fastTypeEff * fastExt.combinedExternal;
    const chargedTotalMult = chargedSTAB * chargedTypeEff * chargedExt.combinedExternal;

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
      partyChargedMultiplier = 1.0 + ratioChargedBoosted;
    }

    const chargedDmgEffective = Math.round(chargedDmgNormal * partyChargedMultiplier);

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

    const bossIncomingDPS =
      (bossFastDmg * 3 + bossChargedDmg * 0.65) /
      ((bossProfile.fastMove.durationMs * 3 + bossProfile.chargedMove.durationMs + 4500) / 1000);

    const timeToFaintSec = Math.min(
      bossProfile.timeLimitSec,
      Math.max(8, boxEntry.stats.hp / Math.max(1, bossIncomingDPS))
    );

    const passiveEnergyPerSec = (bossIncomingDPS * 0.5) * 0.7;

    const fastDurationSec = fast.durationMs / 1000;
    const chargedDurationSec = charged.durationMs / 1000;
    const fastEPS = fast.energyGain / fastDurationSec + passiveEnergyPerSec;
    const timeToChargeSec = charged.energyCost / Math.max(1, fastEPS);
    const fastHitsInCycle = Math.max(1, Math.ceil(timeToChargeSec / fastDurationSec));

    const cycleTimeSec = fastHitsInCycle * fastDurationSec + chargedDurationSec;
    const cycleDamage = fastHitsInCycle * fastDmg + chargedDmgEffective;

    const dps = Math.round((cycleDamage / cycleTimeSec) * 10) / 10;
    const tdo = Math.round(dps * timeToFaintSec);

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

    const maxMoveType = maxInfo.moveType || boxEntry.fastMoveObj.type;
    const maxSTAB = attackerTypes.includes(maxMoveType) ? db.combatModifiers.stab : 1.0;
    const maxTypeEff = getTypeEffectiveness(maxMoveType, bossTypes);
    const ext = getExternalMultipliers(conditions, maxMoveType, maxTypeEff >= 1.0);

    const eternamaxBonus = maxInfo.maxClass === "eternamax" ? 1.15 : 1.0;

    const singleMaxHitDamage = isMaxEligible
      ? computeSingleHitDamage(
          maxInfo.potency,
          boxEntry.stats.effectiveAtk,
          bossProfile.def,
          maxSTAB * maxTypeEff * ext.combinedExternal * eternamaxBonus
        )
      : 0;

    const totalMaxBurstDamage = singleMaxHitDamage * 3;

    const fastDurationSec = boxEntry.fastMoveObj.durationMs / 1000;
    const meterChargeSpeedBonus = fastDurationSec <= 0.5 ? 1.45 : fastDurationSec <= 1.0 ? 1.15 : 0.85;

    const guardShieldHP =
      (db.combatModifiers.maxGuardShieldPerLevel[maxInfo.guardLevel] || 0) * 2;
    const spiritHealFraction =
      db.combatModifiers.maxSpiritHealPerLevel[maxInfo.spiritLevel] || 0;
    const effectiveTankHP =
      boxEntry.stats.hp * (1 + spiritHealFraction * 2) + guardShieldHP;

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

    const meterChargePhaseSec = fastDurationSec <= 0.5 ? 14 : fastDurationSec <= 1.0 ? 19 : 25;
    const maxPhaseDurationSec = 15;
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

  function selectOptimalTeam(evaluatedList, battleMode) {
    if (!evaluatedList || evaluatedList.length === 0) {
      return {
        team: [],
        missingMaxWarning: false
      };
    }

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

    const sortedByMaxBurst = [...poolToUse].sort(
      (a, b) => b.maxAttackerScore - a.maxAttackerScore
    );
    const maxFinisher = sortedByMaxBurst[0];

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
        roleLabel: "Slot 1 · Tanque & Cargador (0.5s)",
        roleBadgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      });
    }

    if (tank2) {
      finalTeam.push({
        ...tank2,
        slotNumber: finalTeam.length + 1,
        roleLabel:
          tank2.maxInfo.spiritLevel > 0 || tank2.maxInfo.guardLevel > 0
            ? "Slot 2 · Tanque Soporte"
            : "Slot 2 · Tanque Secundario",
        roleBadgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
      });
    }

    finalTeam.push({
      ...maxFinisher,
      slotNumber: finalTeam.length + 1,
      roleLabel: `Slot ${finalTeam.length + 1} · Rematador (${maxFinisher.maxInfo.moveName})`,
      roleBadgeClass: "bg-pink-500/25 text-pink-300 border-pink-500/50"
    });

    return {
      team: finalTeam.slice(0, 3),
      missingMaxWarning
    };
  }

  /**
   * Calcula el rendimiento neto de un equipo (DPS promedio, TDO y Daño aportado)
   */
  function computeTeamDamage(team, battleMode, bossProfile) {
    if (!team || team.length === 0) return { dps: 0, tdo: 0, damage: 0, pct: 0 };

    let weightedDPS = 0;
    let totalTeamTDO = 0;
    let totalSurvivalSec = 0;

    if (battleMode.category === "max") {
      const finisher = team[team.length - 1];
      const avgTankDPS = team.reduce((acc, item) => acc + item.dps, 0) / team.length;
      weightedDPS = Math.round((finisher.effectiveMaxDPS * 0.65 + avgTankDPS * 0.35) * 10) / 10;
      totalTeamTDO = team.reduce((acc, item) => acc + item.tdo, 0);
      totalSurvivalSec = Math.min(
        bossProfile.timeLimitSec,
        team.reduce((acc, item) => acc + item.timeToFaintSec, 0) * 1.25
      );
    } else {
      weightedDPS =
        Math.round((team.reduce((acc, item) => acc + item.dps, 0) / team.length) * 10) / 10;
      const singlePassTDO = team.reduce((acc, item) => acc + item.tdo, 0);
      const singlePassTime = team.reduce((acc, item) => acc + item.timeToFaintSec, 0);

      if (singlePassTime < bossProfile.timeLimitSec - 15) {
        const effectiveActiveTime = Math.max(0, bossProfile.timeLimitSec - 14);
        totalSurvivalSec = effectiveActiveTime;
        totalTeamTDO = Math.round(weightedDPS * effectiveActiveTime);
      } else {
        totalSurvivalSec = bossProfile.timeLimitSec;
        totalTeamTDO = singlePassTDO;
      }
    }

    const rawDamage = Math.min(
      totalTeamTDO,
      Math.round(weightedDPS * Math.min(bossProfile.timeLimitSec, totalSurvivalSec))
    );
    const pct = Math.round((rawDamage / bossProfile.hp) * 1000) / 10;

    return {
      dps: weightedDPS,
      tdo: totalTeamTDO,
      damage: rawDamage,
      pct
    };
  }

  /**
   * Calcula la batalla considerando:
   *  - Tu propio equipo personal (ownerId: 'me')
   *  - Los amigos fijos marcados como participantes activos
   *  - Cuántos compañeros adicionales desconocidos se necesitan
   */
  function calculateBattlePlan(allBoxList, bossId, battleModeId, conditions, activeFriendIds = []) {
    const db = getDB();
    const battleMode = db.battleModes[battleModeId] || db.battleModes.raid_t5;
    const bossSpecies = db.pokemon.find((p) => p.id === bossId) || db.pokemon[0];

    const bossProfile = getBossCombatProfile(
      bossSpecies,
      battleMode,
      conditions.bossFastMove,
      conditions.bossChargedMove
    );

    // Separar Pokémon míos y de amigos
    const myBox = allBoxList.filter((p) => (p.ownerId || "me") === "me");

    // 1. Evaluar mi equipo personal
    const evaluatedMyList = myBox.map((entry) =>
      battleMode.category === "max"
        ? evaluateMaxPokemon(entry, bossProfile, conditions)
        : evaluateRaidPokemon(entry, bossProfile, conditions)
    );
    const { team: myTeam, missingMaxWarning } = selectOptimalTeam(evaluatedMyList, battleMode);
    const myPerformance = computeTeamDamage(myTeam, battleMode, bossProfile);

    // 2. Evaluar amigos fijos activos que van al combate conmigo
    const friendsBreakdown = [];
    let totalFriendsDamage = 0;

    for (const friendId of activeFriendIds) {
      const friendObj = global.PokeBoxManager.getFriendById(friendId);
      if (!friendObj) continue;

      const friendBox = allBoxList.filter((p) => p.ownerId === friendId);
      const evaluatedFriendList = friendBox.map((entry) =>
        battleMode.category === "max"
          ? evaluateMaxPokemon(entry, bossProfile, conditions)
          : evaluateRaidPokemon(entry, bossProfile, conditions)
      );

      const { team: friendTeam } = selectOptimalTeam(evaluatedFriendList, battleMode);
      const perf = computeTeamDamage(friendTeam, battleMode, bossProfile);
      totalFriendsDamage += perf.damage;

      friendsBreakdown.push({
        friend: friendObj,
        team: friendTeam,
        performance: perf,
        hasPokemon: friendBox.length > 0
      });
    }

    // Daño combinado entre Yo y mis Amigos Fijos
    const combinedGroupDamage = myPerformance.damage + totalFriendsDamage;
    const combinedGroupPct = Math.round((combinedGroupDamage / bossProfile.hp) * 1000) / 10;
    const remainingBossHP = Math.max(0, bossProfile.hp - combinedGroupDamage);
    const canBeatWithFriends = combinedGroupDamage >= bossProfile.hp;

    // 3. Estimación del Daño por compañero desconocido en 3 Escenarios
    const bestWeaknessMult =
      bossProfile.weaknesses.length > 0 ? bossProfile.weaknesses[0].multiplier : 1.6;
    const ext = getExternalMultipliers(conditions, null, true);
    const partyFactor =
      battleMode.allowPartyPower && conditions.partyPowerEnabled ? 1.32 : 1.0;

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

    const hardcoreNeeded = canBeatWithFriends
      ? 0
      : Math.ceil(remainingBossHP / allyDamageHardcore);
    const standardNeeded = canBeatWithFriends
      ? 0
      : Math.ceil(remainingBossHP / allyDamageStandard);
    const casualNeeded = canBeatWithFriends
      ? 0
      : Math.ceil(remainingBossHP / allyDamageCasual);

    const samplePartyMult =
      myTeam[0] && myTeam[0].partyChargedMultiplier ? myTeam[0].partyChargedMultiplier : 1.0;
    const activeMultiplier =
      Math.round(ext.combinedExternal * samplePartyMult * 100) / 100;

    // Frase directa y clara
    let directRecommendation = "";
    const activeFriendsCount = friendsBreakdown.length;
    const totalCurrentPlayers = 1 + activeFriendsCount;

    if (myTeam.length === 0) {
      directRecommendation =
        "Tu Caja Pokémon personal está vacía. Añade tus Pokémon o pulsa 'Cargar Caja Demo'.";
    } else if (canBeatWithFriends) {
      if (activeFriendsCount === 0) {
        directRecommendation = `🏆 ¡Victoria en Solitario viable! Bajas tú solo el ${myPerformance.pct}% de la vida de ${bossSpecies.name} sin necesidad de más compañeros.`;
      } else {
        const friendNames = friendsBreakdown.map((f) => f.friend.name).join(", ");
        directRecommendation = `🎉 ¡Victoria Asegurada en Grupo! Entre tú (${myPerformance.pct}%) y tu(s) amigo(s) ${friendNames} (${Math.round((totalFriendsDamage / bossProfile.hp) * 100)}%) cubrís el ${combinedGroupPct}% del jefe. ¡No necesitáis más jugadores!`;
      }
    } else {
      const friendsText =
        activeFriendsCount > 0
          ? ` (contando con ${friendsBreakdown.map((f) => f.friend.name).join(" y ")})`
          : "";
      if (battleMode.id === "dmax_t5" || battleMode.id === "dmax_t3") {
        const maxCapacity = 4;
        const availableSlots = Math.max(0, maxCapacity - totalCurrentPlayers);
        const warning =
          standardNeeded > availableSlots
            ? ` ⚠️ El lobby Dinamax solo admite 4 jugadores en total (te quedan ${availableSlots} huecos libres). Necesitas obligatoriamente compañeros de nivel Hardcore para no fallar el combate.`
            : ` (Lobby Dinamax: ${totalCurrentPlayers}/4 jugadores ocupados).`;
        directRecommendation = `Con tu equipo${friendsText} aportáis el ${combinedGroupPct}% de daño a ${bossSpecies.name}. Para vencer necesitas añadir mínimo +${hardcoreNeeded} jugador(es) Hardcore, o +${standardNeeded} Estándar.${warning}`;
      } else if (battleMode.id === "gmax_t6") {
        const totalSquads = Math.ceil((totalCurrentPlayers + standardNeeded) / 4);
        directRecommendation = `Gigamax Nv. 6 (${bossProfile.hp.toLocaleString()} HP): Tu grupo${friendsText} aporta el ${combinedGroupPct}%. Necesitáis sumar al lobby al menos +${hardcoreNeeded} jugadores Hardcore, o +${standardNeeded} Estándar (~${totalSquads} patrullas completas), o +${casualNeeded}+ Casuales.`;
      } else {
        directRecommendation = `Con tu equipo${friendsText} tenéis el ${combinedGroupPct}% de ${bossSpecies.name}. Necesitáis sumar como mínimo +${hardcoreNeeded} jugador(es) Hardcore, o +${standardNeeded} Estándar, o +${casualNeeded}+ Casuales.`;
      }
    }

    return {
      bossProfile,
      battleMode,
      conditions,
      team: myTeam,
      missingMaxWarning,
      friendsBreakdown,
      personalMetrics: {
        teamDPS: myPerformance.dps,
        teamTDO: myPerformance.tdo,
        personalDamage: myPerformance.damage,
        personalDamagePct: myPerformance.pct,
        combinedGroupDamage,
        combinedGroupPct,
        activeMultiplier,
        canSolo: myPerformance.damage >= bossProfile.hp,
        canBeatWithFriends
      },
      scenarios: {
        hardcore: {
          count: hardcoreNeeded,
          allyDamage: allyDamageHardcore,
          pctPerPlayer: Math.round((allyDamageHardcore / bossProfile.hp) * 1000) / 10,
          exceedsMaxLobby: totalCurrentPlayers + hardcoreNeeded > battleMode.maxLobbyPlayers
        },
        standard: {
          count: standardNeeded,
          allyDamage: allyDamageStandard,
          pctPerPlayer: Math.round((allyDamageStandard / bossProfile.hp) * 1000) / 10,
          exceedsMaxLobby: totalCurrentPlayers + standardNeeded > battleMode.maxLobbyPlayers
        },
        casual: {
          count: casualNeeded,
          allyDamage: allyDamageCasual,
          pctPerPlayer: Math.round((allyDamageCasual / bossProfile.hp) * 1000) / 10,
          exceedsMaxLobby: totalCurrentPlayers + casualNeeded > battleMode.maxLobbyPlayers
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
    computeTeamDamage,
    calculateBattlePlan
  };
})(typeof window !== "undefined" ? window : globalThis);
