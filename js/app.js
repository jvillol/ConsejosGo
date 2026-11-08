/**
 * PokéRaid & Max Optimizer - Controlador Principal de Interfaz (js/app.js)
 * Conecta POKE_DB, PokeBoxManager (localStorage) y PokeOptimizerEngine con el DOM.
 */

(function (global) {
  "use strict";

  const state = {
    selectedBattleModeId: "dmax_t5",
    selectedBossId: "eternatus",
    selectedBossFast: "",
    selectedBossCharged: "",
    partyPowerEnabled: true,
    partySize: 2,
    friendship: "best",
    megaBonus: "none",
    weatherBoost: false,
    boxFilterQuery: "",
    editingUid: null
  };

  /**
   * Genera el HTML de una etiqueta de tipo Pokémon GO
   */
  function renderTypeBadge(typeKey, extraClasses = "") {
    const db = global.POKE_DB;
    const tm = db.typeMeta[typeKey] || db.typeMeta.normal;
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${tm.bg} ${tm.text} ${tm.border} ${extraClasses}">${tm.name}</span>`;
  }

  /**
   * Inicializa la navegación por pestañas
   */
  function initTabs() {
    const tabButtons = document.querySelectorAll(".nav-tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-tab-target");
        switchTab(targetId);
      });
    });
  }

  function switchTab(targetId) {
    const tabButtons = document.querySelectorAll(".nav-tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabButtons.forEach((b) => {
      const isTarget = b.getAttribute("data-tab-target") === targetId;
      b.classList.toggle("border-pink-500", isTarget);
      b.classList.toggle("bg-slate-900/90", isTarget);
      b.classList.toggle("text-white", isTarget);
      b.classList.toggle("border-transparent", !isTarget);
      b.classList.toggle("text-slate-400", !isTarget);
    });

    tabPanels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== targetId);
    });
  }

  // ==========================================================================
  // MÓDULO 1: INTERFAZ DE "MI CAJA POKÉMON"
  // ==========================================================================
  function initBoxForm() {
    const db = global.POKE_DB;
    const speciesSearchInput = document.getElementById("input-species-search");
    const speciesSelect = document.getElementById("select-box-species");
    const presetSelect = document.getElementById("select-level-preset");
    const customCpInput = document.getElementById("input-custom-cp");
    const ivAtkInput = document.getElementById("input-iv-atk");
    const ivDefInput = document.getElementById("input-iv-def");
    const ivStaInput = document.getElementById("input-iv-sta");
    const hundoBtn = document.getElementById("btn-iv-hundo");
    const maxClassSelect = document.getElementById("select-box-max-class");
    const form = document.getElementById("pokemon-box-form");
    const cancelEditBtn = document.getElementById("btn-cancel-edit");
    const filterBoxInput = document.getElementById("input-filter-box");
    const clearBoxBtn = document.getElementById("btn-clear-box");
    const loadDemoBtn = document.getElementById("btn-load-demo-box");

    // Poblar presets de nivel
    presetSelect.innerHTML = db.levelPresets
      .map(
        (l) =>
          `<option value="${l.id}" ${l.id === "no_xl" ? "selected" : ""}>${l.label}</option>`
      )
      .join("");

    // Poblar selector de especies (excluyendo formas exclusivas de Jefe como Eternamax Boss)
    function populateSpeciesOptions(filterText = "") {
      const q = filterText.trim().toLowerCase();
      const currentVal = speciesSelect.value;
      const eligible = db.pokemon.filter((p) => {
        if (p.bossOnly) return false;
        if (!q) return true;
        const typeNames = p.types.map((t) => db.typeMeta[t].name.toLowerCase()).join(" ");
        return (
          p.name.toLowerCase().includes(q) ||
          String(p.dex).includes(q) ||
          typeNames.includes(q)
        );
      });

      speciesSelect.innerHTML = eligible
        .map(
          (p) =>
            `<option value="${p.id}">#${p.dex} ${p.name} (${p.types
              .map((t) => db.typeMeta[t].name)
              .join("/")})</option>`
        )
        .join("");

      if (currentVal && eligible.some((p) => p.id === currentVal)) {
        speciesSelect.value = currentVal;
      }
      onSpeciesChange();
    }

    // Actualizar ataques disponibles, estado Oscuro y clase Max cuando cambia la especie
    function onSpeciesChange() {
      const speciesId = speciesSelect.value;
      const species = global.PokeBoxManager.getSpeciesById(speciesId);
      if (!species) return;

      const fastSelect = document.getElementById("select-box-fast");
      const chargedSelect = document.getElementById("select-box-charged");
      const shadowCheckbox = document.getElementById("toggle-box-shadow");

      fastSelect.innerHTML = species.fastMoves
        .map((mId) => {
          const m = db.fastMoves[mId];
          return m
            ? `<option value="${m.id}">${m.name} (${db.typeMeta[m.type].name} · ${m.durationMs / 1000}s)</option>`
            : "";
        })
        .join("");

      chargedSelect.innerHTML = species.chargedMoves
        .map((mId) => {
          const m = db.chargedMoves[mId];
          return m
            ? `<option value="${m.id}">${m.name} (${db.typeMeta[m.type].name} · ${m.power} pwr)</option>`
            : "";
        })
        .join("");

      // Habilitar/deshabilitar checkbox de Oscuro según si la especie puede ser Oscura
      shadowCheckbox.disabled = !species.canBeShadow;
      if (!species.canBeShadow) {
        shadowCheckbox.checked = false;
      }

      // Si no estamos editando un registro existente, preseleccionar su factor Max natural
      if (!state.editingUid) {
        if (species.maxCapable && species.maxForm) {
          maxClassSelect.value = species.maxForm;
        } else {
          maxClassSelect.value = "none";
        }
      }

      updateMaxLevelsVisibility();
      updateFormLivePreview();
    }

    function updateMaxLevelsVisibility() {
      const maxPanel = document.getElementById("max-moves-levels-panel");
      const isMax = maxClassSelect.value !== "none";
      maxPanel.classList.toggle("hidden", !isMax);
    }

    function updateFormLivePreview() {
      const species = global.PokeBoxManager.getSpeciesById(speciesSelect.value);
      if (!species) return;

      const ivAtk = Number(ivAtkInput.value);
      const ivDef = Number(ivDefInput.value);
      const ivSta = Number(ivStaInput.value);

      document.getElementById("label-iv-atk").textContent = ivAtk;
      document.getElementById("label-iv-def").textContent = ivDef;
      document.getElementById("label-iv-sta").textContent = ivSta;

      const ivPct = Math.round(((ivAtk + ivDef + ivSta) / 45) * 100);
      document.getElementById("iv-percentage-badge").textContent = `${ivPct}% IV`;

      const customCPVal = Number(customCpInput.value);
      const cpBadge = document.getElementById("preview-cp-badge");

      if (customCPVal && customCPVal >= 10) {
        const est = global.PokeBoxManager.estimateLevelFromCP(
          species,
          ivAtk,
          ivDef,
          ivSta,
          customCPVal
        );
        presetSelect.value = est.presetId;
        cpBadge.textContent = `PC ${customCPVal} (~Nv. ${est.level})`;
      } else {
        const presetObj =
          db.levelPresets.find((p) => p.id === presetSelect.value) ||
          db.levelPresets[2];
        const calcCP = global.PokeBoxManager.calculateCP(
          species,
          ivAtk,
          ivDef,
          ivSta,
          presetObj.cpm
        );
        cpBadge.textContent = `PC ~${calcCP} (${presetObj.badge})`;
      }
    }

    // Eventos del formulario
    speciesSearchInput.addEventListener("input", (e) => {
      populateSpeciesOptions(e.target.value);
    });

    speciesSelect.addEventListener("change", onSpeciesChange);
    maxClassSelect.addEventListener("change", updateMaxLevelsVisibility);

    [ivAtkInput, ivDefInput, ivStaInput, presetSelect, customCpInput].forEach((el) => {
      el.addEventListener("input", updateFormLivePreview);
      el.addEventListener("change", updateFormLivePreview);
    });

    hundoBtn.addEventListener("click", () => {
      ivAtkInput.value = 15;
      ivDefInput.value = 15;
      ivStaInput.value = 15;
      updateFormLivePreview();
    });

    cancelEditBtn.addEventListener("click", () => {
      resetBoxForm();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const payload = {
        pokemonId: speciesSelect.value,
        nickname: document.getElementById("input-box-nickname").value,
        ivAtk: Number(ivAtkInput.value),
        ivDef: Number(ivDefInput.value),
        ivSta: Number(ivStaInput.value),
        levelPreset: presetSelect.value,
        customCP: customCpInput.value ? Number(customCpInput.value) : null,
        fastMove: document.getElementById("select-box-fast").value,
        chargedMove: document.getElementById("select-box-charged").value,
        isShadow: document.getElementById("toggle-box-shadow").checked,
        maxClass: maxClassSelect.value,
        maxAttackLevel: Number(document.getElementById("select-max-atk-lv").value),
        maxGuardLevel: Number(document.getElementById("select-max-guard-lv").value),
        maxSpiritLevel: Number(document.getElementById("select-max-spirit-lv").value)
      };

      if (state.editingUid) {
        global.PokeBoxManager.update(state.editingUid, payload);
      } else {
        global.PokeBoxManager.add(payload);
      }

      resetBoxForm();
      renderMyBoxCards();
      runOptimizerCalculation();
    });

    filterBoxInput.addEventListener("input", (e) => {
      state.boxFilterQuery = e.target.value.trim().toLowerCase();
      renderMyBoxCards();
    });

    clearBoxBtn.addEventListener("click", () => {
      global.PokeBoxManager.clearAll();
      renderMyBoxCards();
      runOptimizerCalculation();
    });

    loadDemoBtn.addEventListener("click", () => {
      global.PokeBoxManager.loadDemoBox();
      renderMyBoxCards();
      runOptimizerCalculation();
    });

    populateSpeciesOptions("");
  }

  function resetBoxForm() {
    state.editingUid = null;
    document.getElementById("form-pokemon-uid").value = "";
    document.getElementById("box-form-title").textContent = "➕ Añadir Pokémon a Mi Caja";
    document.getElementById("btn-save-pokemon").textContent = "💾 Guardar en Mi Caja Pokémon";
    document.getElementById("btn-cancel-edit").classList.add("hidden");
    document.getElementById("input-box-nickname").value = "";
    document.getElementById("input-custom-cp").value = "";
    document.getElementById("input-iv-atk").value = 15;
    document.getElementById("input-iv-def").value = 15;
    document.getElementById("input-iv-sta").value = 15;
    document.getElementById("select-box-species").dispatchEvent(new Event("change"));
  }

  function loadPokemonIntoEditForm(uid) {
    const entry = global.PokeBoxManager.getByUid(uid);
    if (!entry) return;

    state.editingUid = entry.uid;
    document.getElementById("form-pokemon-uid").value = entry.uid;
    document.getElementById("box-form-title").textContent = `✏️ Editando: ${entry.nickname}`;
    document.getElementById("btn-save-pokemon").textContent = "✅ Actualizar Pokémon";
    document.getElementById("btn-cancel-edit").classList.remove("hidden");

    const speciesSelect = document.getElementById("select-box-species");
    document.getElementById("input-species-search").value = "";
    speciesSelect.value = entry.pokemonId;
    speciesSelect.dispatchEvent(new Event("change"));

    document.getElementById("input-box-nickname").value = entry.nickname;
    document.getElementById("input-iv-atk").value = entry.ivAtk;
    document.getElementById("input-iv-def").value = entry.ivDef;
    document.getElementById("input-iv-sta").value = entry.ivSta;
    document.getElementById("select-level-preset").value = entry.levelPreset;
    document.getElementById("input-custom-cp").value = entry.customCP || "";
    document.getElementById("select-box-fast").value = entry.fastMoveObj.id;
    document.getElementById("select-box-charged").value = entry.chargedMoveObj.id;
    document.getElementById("toggle-box-shadow").checked = Boolean(entry.isShadow);

    const maxClassSelect = document.getElementById("select-box-max-class");
    maxClassSelect.value = entry.maxClass || "none";
    maxClassSelect.dispatchEvent(new Event("change"));

    if (entry.maxClass && entry.maxClass !== "none") {
      document.getElementById("select-max-atk-lv").value = entry.maxAttackLevel || 3;
      document.getElementById("select-max-guard-lv").value = entry.maxGuardLevel || 0;
      document.getElementById("select-max-spirit-lv").value = entry.maxSpiritLevel || 0;
    }

    document.getElementById("input-iv-atk").dispatchEvent(new Event("input"));
    switchTab("tab-box");
    document.getElementById("pokemon-box-form").scrollIntoView({ behavior: "smooth" });
  }

  /**
   * Renderiza las tarjetas de Mi Caja Pokémon y actualiza los contadores del header
   */
  function renderMyBoxCards() {
    const db = global.POKE_DB;
    const allPokemon = global.PokeBoxManager.getAll();

    // Actualizar contadores
    document.getElementById("header-box-count").textContent = allPokemon.length;
    document.getElementById("tab-box-badge").textContent = allPokemon.length;

    const grid = document.getElementById("my-box-cards-grid");
    const q = state.boxFilterQuery;
    const filtered = allPokemon.filter((item) => {
      if (!q) return true;
      return (
        item.nickname.toLowerCase().includes(q) ||
        item.species.name.toLowerCase().includes(q) ||
        item.fastMoveObj.name.toLowerCase().includes(q) ||
        item.chargedMoveObj.name.toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-8 rounded-2xl bg-slate-950/80 border border-dashed border-slate-700 text-center space-y-2">
          <p class="text-sm font-bold text-slate-300">No hay Pokémon en tu vista actual</p>
          <p class="text-xs text-slate-400">Usa el formulario de la izquierda para añadir tus Pokémon o pulsa <strong>"⚡ Cargar Caja Demo"</strong> en la barra superior.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map((item) => {
        const typeBadges = item.species.types.map((t) => renderTypeBadge(t)).join(" ");
        const shadowBadge = item.isShadow
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-600/30 text-purple-200 border border-purple-400/50">🟣 Oscuro +20%</span>`
          : "";

        let maxBadge = "";
        if (item.maxMoveInfo && item.maxMoveInfo.isMaxCapable) {
          const labelClass =
            item.maxMoveInfo.maxClass === "eternamax"
              ? "Eternamax"
              : item.maxMoveInfo.maxClass === "gigantamax"
              ? "Gigamax"
              : "Dinamax";
          maxBadge = `
            <div class="mt-2 p-2 rounded-lg bg-pink-950/50 border border-pink-500/40 flex items-center justify-between text-[11px]">
              <span class="font-bold text-pink-300">🌀 ${labelClass}: ${item.maxMoveInfo.moveName}</span>
              <span class="font-mono text-pink-200">ATQ ${item.maxMoveInfo.atkLevel} · GRD ${item.maxMoveInfo.guardLevel} · ESP ${item.maxMoveInfo.spiritLevel}</span>
            </div>
          `;
        }

        return `
          <article class="p-4 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-cyan-500/50 transition flex flex-col justify-between shadow-lg ${
            item.isShadow ? "glow-shadow-poke" : item.maxMoveInfo.isMaxCapable ? "glow-dynamax" : ""
          }">
            <div>
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono text-[11px] text-slate-400">#${item.species.dex}</span>
                    <span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">PC ${item.cp}</span>
                    <span class="font-mono text-[11px] text-slate-400">${item.levelBadge}</span>
                  </div>
                  <h3 class="text-sm sm:text-base font-extrabold text-white mt-1">${item.nickname}</h3>
                </div>
                <div class="flex flex-wrap gap-1 justify-end">
                  ${typeBadges}
                  ${shadowBadge}
                </div>
              </div>

              <!-- Barra de IVs -->
              <div class="mt-2.5 flex items-center justify-between text-xs bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                <span class="text-slate-400">IVs: <strong class="font-mono text-white">${item.ivAtk}/${item.ivDef}/${item.ivSta}</strong></span>
                <span class="font-mono font-bold ${
                  item.ivPct === 100 ? "text-amber-300" : "text-cyan-300"
                }">${item.ivPct}%</span>
              </div>

              <!-- Movimientos -->
              <div class="mt-2.5 space-y-1 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Rápido:</span>
                  <span class="font-semibold text-slate-200">${item.fastMoveObj.name} ${renderTypeBadge(item.fastMoveObj.type)}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Cargado:</span>
                  <span class="font-semibold text-slate-200">${item.chargedMoveObj.name} ${renderTypeBadge(item.chargedMoveObj.type)}</span>
                </div>
              </div>

              ${maxBadge}
            </div>

            <!-- Botones Editar y Borrar -->
            <div class="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-end gap-2">
              <button
                type="button"
                data-action="edit-box"
                data-uid="${item.uid}"
                class="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-cyan-600/30 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 transition"
              >
                ✏️ Editar
              </button>
              <button
                type="button"
                data-action="delete-box"
                data-uid="${item.uid}"
                class="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-rose-600/30 text-rose-300 border border-slate-700 hover:border-rose-500/50 transition"
              >
                🗑️ Borrar
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    // Eventos delegados de Editar y Borrar
    grid.querySelectorAll("[data-action='edit-box']").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadPokemonIntoEditForm(btn.getAttribute("data-uid"));
      });
    });

    grid.querySelectorAll("[data-action='delete-box']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid = btn.getAttribute("data-uid");
        global.PokeBoxManager.remove(uid);
        renderMyBoxCards();
        runOptimizerCalculation();
      });
    });
  }

  // ==========================================================================
  // MÓDULO 2 Y 3: SELECTOR DE JEFE, CONDICIONES Y MOTOR DE RECOMENDACIÓN
  // ==========================================================================
  function initOptimizerControls() {
    const db = global.POKE_DB;
    const modeSelect = document.getElementById("select-battle-mode");
    const bossSelect = document.getElementById("select-boss-pokemon");
    const bossFastSelect = document.getElementById("select-boss-fast");
    const bossChargedSelect = document.getElementById("select-boss-charged");
    const partyToggle = document.getElementById("toggle-party-power");
    const partySizeBtns = document.querySelectorAll(".party-size-btn");
    const friendshipSelect = document.getElementById("select-friendship");
    const megaSelect = document.getElementById("select-mega-bonus");
    const weatherToggle = document.getElementById("toggle-weather-boost");
    const runBtn = document.getElementById("btn-run-optimizer");

    // Poblar modos de combate
    modeSelect.innerHTML = Object.values(db.battleModes)
      .map(
        (m) =>
          `<option value="${m.id}" ${
            m.id === state.selectedBattleModeId ? "selected" : ""
          }>${m.name} (${m.bossHP.toLocaleString()} HP)</option>`
      )
      .join("");

    // Poblar jefes disponibles
    const bossCandidates = db.pokemon.filter((p) => p.isBossCandidate);
    bossSelect.innerHTML = bossCandidates
      .map(
        (p) =>
          `<option value="${p.id}" ${
            p.id === state.selectedBossId ? "selected" : ""
          }>#${p.dex} ${p.name} (${p.types.map((t) => db.typeMeta[t].name).join("/")})</option>`
      )
      .join("");

    function populateBossMoves() {
      const boss = db.pokemon.find((p) => p.id === state.selectedBossId) || bossCandidates[0];
      bossFastSelect.innerHTML = boss.fastMoves
        .map((mId) => {
          const m = db.fastMoves[mId];
          return m ? `<option value="${m.id}">${m.name} (${db.typeMeta[m.type].name})</option>` : "";
        })
        .join("");

      bossChargedSelect.innerHTML = boss.chargedMoves
        .map((mId) => {
          const m = db.chargedMoves[mId];
          return m ? `<option value="${m.id}">${m.name} (${db.typeMeta[m.type].name})</option>` : "";
        })
        .join("");

      state.selectedBossFast = bossFastSelect.value;
      state.selectedBossCharged = bossChargedSelect.value;
    }

    modeSelect.addEventListener("change", () => {
      state.selectedBattleModeId = modeSelect.value;
      runOptimizerCalculation();
    });

    bossSelect.addEventListener("change", () => {
      state.selectedBossId = bossSelect.value;
      const boss = db.pokemon.find((p) => p.id === state.selectedBossId);
      // Si el jefe tiene un modo por defecto (ej. Duraludon Gigamax -> Gigamax Nv. 6), sugerirlo automáticamente
      if (boss && Array.isArray(boss.defaultBossModes) && boss.defaultBossModes.length > 0) {
        if (!boss.defaultBossModes.includes(state.selectedBattleModeId)) {
          state.selectedBattleModeId = boss.defaultBossModes[0];
          modeSelect.value = state.selectedBattleModeId;
        }
      }
      populateBossMoves();
      runOptimizerCalculation();
    });

    bossFastSelect.addEventListener("change", () => {
      state.selectedBossFast = bossFastSelect.value;
      runOptimizerCalculation();
    });

    bossChargedSelect.addEventListener("change", () => {
      state.selectedBossCharged = bossChargedSelect.value;
      runOptimizerCalculation();
    });

    partyToggle.addEventListener("change", () => {
      state.partyPowerEnabled = partyToggle.checked;
      document
        .getElementById("party-size-selector-wrap")
        .classList.toggle("opacity-40", !state.partyPowerEnabled);
      runOptimizerCalculation();
    });

    partySizeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.partySize = Number(btn.getAttribute("data-party-size"));
        partySizeBtns.forEach((b) => {
          const active = Number(b.getAttribute("data-party-size")) === state.partySize;
          b.className = active
            ? "party-size-btn py-1.5 px-2 rounded-lg text-xs font-bold border border-indigo-500/50 bg-indigo-600/30 text-white"
            : "party-size-btn py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-400";
        });
        runOptimizerCalculation();
      });
    });

    friendshipSelect.addEventListener("change", () => {
      state.friendship = friendshipSelect.value;
      runOptimizerCalculation();
    });

    megaSelect.addEventListener("change", () => {
      state.megaBonus = megaSelect.value;
      runOptimizerCalculation();
    });

    weatherToggle.addEventListener("change", () => {
      state.weatherBoost = weatherToggle.checked;
      runOptimizerCalculation();
    });

    runBtn.addEventListener("click", () => {
      runOptimizerCalculation();
    });

    populateBossMoves();
  }

  /**
   * Ejecuta el motor matemático y actualiza toda la vista de resultados (Módulo 2 y Módulo 3)
   */
  function runOptimizerCalculation() {
    const boxList = global.PokeBoxManager.getAll();
    const plan = global.PokeOptimizerEngine.calculateBattlePlan(
      boxList,
      state.selectedBossId,
      state.selectedBattleModeId,
      {
        bossFastMove: state.selectedBossFast,
        bossChargedMove: state.selectedBossCharged,
        partyPowerEnabled: state.partyPowerEnabled,
        partySize: state.partySize,
        friendship: state.friendship,
        megaBonus: state.megaBonus,
        weatherBoost: state.weatherBoost
      }
    );

    renderBossSummary(plan.bossProfile, plan.battleMode);
    renderCalculationResults(plan);
  }

  function renderBossSummary(bossProfile, battleMode) {
    document.getElementById("battle-mode-desc").textContent = battleMode.description;
    const catPill = document.getElementById("battle-category-pill");
    if (battleMode.category === "max") {
      catPill.textContent = "COMBATE MAX (3 POKÉMON)";
      catPill.className =
        "px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-pink-500/25 text-pink-300 border border-pink-500/50";
    } else {
      catPill.textContent = "INCURSIÓN (6 POKÉMON)";
      catPill.className =
        "px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40";
    }

    // Mostrar/deshabilitar contenedor de Party Power si es Combate Max
    const partyContainer = document.getElementById("party-power-container");
    partyContainer.classList.toggle("opacity-50", !battleMode.allowPartyPower);

    document.getElementById("boss-dex-label").textContent = `#${bossProfile.species.dex}`;
    document.getElementById("boss-name-display").textContent = bossProfile.species.name;
    document.getElementById("boss-types-badges").innerHTML = bossProfile.species.types
      .map((t) => renderTypeBadge(t))
      .join(" ");

    document.getElementById("boss-hp-display").textContent = `${bossProfile.hp.toLocaleString()} HP`;
    document.getElementById("boss-time-display").textContent = `${bossProfile.timeLimitSec}s`;
    document.getElementById("boss-teamsize-display").textContent =
      battleMode.category === "max"
        ? `3 Max (Patrulla de ${battleMode.squadSize || 4})`
        : `6 Pokémon (Máx ${battleMode.maxLobbyPlayers})`;

    const weakContainer = document.getElementById("boss-weaknesses-list");
    weakContainer.innerHTML = bossProfile.weaknesses
      .map(
        (w) =>
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
            w.meta.bg
          } ${w.meta.text} ${w.meta.border}">
            <span>${w.name}</span>
            <strong class="font-mono ${
              w.isDoubleWeakness ? "text-amber-300 underline" : " opacity-90"
            }">x${w.multiplier}</strong>
          </span>`
      )
      .join("");
  }

  function renderCalculationResults(plan) {
    const { personalMetrics, scenarios, team, battleMode, bossProfile, missingMaxWarning } = plan;

    // 1. Badge de veredicto
    const verdictBadge = document.getElementById("verdict-badge");
    if (personalMetrics.canSolo) {
      verdictBadge.textContent = "🏆 ¡SOLABLE EN SOLITARIO!";
      verdictBadge.className =
        "px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider bg-emerald-500/25 text-emerald-300 border border-emerald-500/50";
    } else if (scenarios.standard.count <= 2) {
      verdictBadge.textContent = `✅ DÚO / TRÍO ASEQUIBLE (+${scenarios.hardcore.count} a +${scenarios.standard.count})`;
      verdictBadge.className =
        "px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40";
    } else {
      verdictBadge.textContent = `⚔️ REQUIERE PATRULLA / GRUPO (+${scenarios.hardcore.count} Hardcore)`;
      verdictBadge.className =
        "px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider bg-pink-500/25 text-pink-300 border border-pink-500/50";
    }

    // 2. Barra y porcentaje de contribución de daño
    document.getElementById("personal-damage-pct").textContent = `${personalMetrics.personalDamagePct}%`;
    document.getElementById("personal-damage-raw").textContent = `(${personalMetrics.personalDamage.toLocaleString()} / ${bossProfile.hp.toLocaleString()} HP)`;
    document.getElementById("personal-damage-bar").style.width = `${Math.min(
      100,
      personalMetrics.personalDamagePct
    )}%`;

    document.getElementById("metric-team-dps").textContent = `${personalMetrics.teamDPS} /s`;
    document.getElementById("metric-team-tdo").textContent = `${personalMetrics.teamTDO.toLocaleString()} HP`;
    document.getElementById("metric-active-mult").textContent = `x${personalMetrics.activeMultiplier}`;

    // 3. Frase directa de recomendación
    document.getElementById("direct-recommendation-text").textContent = plan.directRecommendation;

    // 4. Tres escenarios (Hardcore, Estándar, Casual)
    document.getElementById("scenario-hardcore-count").textContent =
      scenarios.hardcore.count === 0 ? "0 (Solo)" : `+${scenarios.hardcore.count} jug.`;
    document.getElementById("scenario-standard-count").textContent =
      scenarios.standard.count === 0 ? "0 (Solo)" : `+${scenarios.standard.count} jug.`;
    document.getElementById("scenario-casual-count").textContent =
      scenarios.casual.count === 0 ? "0 (Solo)" : `+${scenarios.casual.count}+ jug.`;

    // 5. Título y Banner del Equipo Ideal Recomendado
    const teamTitle = document.getElementById("recommended-team-title");
    const teamSubtitle = document.getElementById("recommended-team-subtitle");
    const maxBanner = document.getElementById("max-strategy-banner");

    if (battleMode.category === "max") {
      teamTitle.textContent = "Tu Patrulla Ideal de Combate Max (3 Pokémon)";
      teamSubtitle.textContent = missingMaxWarning
        ? "⚠️ No tienes Pokémon marcados como Dinamax/Gigamax en tu caja; mostrando los mejores de tu colección general."
        : "2 Tanques/Generadores de Medidor Max (Fase Normal) + 1 Atacante Explosivo para la Fase Max.";
      maxBanner.classList.remove("hidden");
    } else {
      teamTitle.textContent = "Tu Equipo Ideal para Incursión (Top 6 Counters)";
      teamSubtitle.textContent =
        "Ordenados automáticamente por su rendimiento real de DPS, eficacia de tipos, Party Power y TDO.";
      maxBanner.classList.add("hidden");
    }

    // 6. Renderizar tarjetas del Equipo Ideal
    const teamGrid = document.getElementById("recommended-team-grid");
    if (team.length === 0) {
      teamGrid.innerHTML = `
        <div class="col-span-full p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
          Añade Pokémon a "Mi Caja Pokémon" para ver tu alineación ideal contra este jefe.
        </div>
      `;
      return;
    }

    teamGrid.innerHTML = team
      .map((item) => {
        const entry = item.boxEntry;
        const effBadge =
          item.bestTypeEff >= 2.5
            ? `<span class="px-2 py-0.5 rounded font-mono text-[10px] font-extrabold bg-amber-500/25 text-amber-300 border border-amber-500/50">Doble Eficacia x${item.bestTypeEff}</span>`
            : item.bestTypeEff > 1.0
            ? `<span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Eficaz x${item.bestTypeEff}</span>`
            : `<span class="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-slate-300">Neutro x${item.bestTypeEff}</span>`;

        const maxDetailRow =
          battleMode.category === "max" && item.isMaxEligible
            ? `<div class="mt-2 pt-2 border-t border-pink-500/20 flex items-center justify-between text-[11px] text-pink-300">
                <span>🌀 <strong>${item.maxInfo.moveName}</strong> (Nv. ${item.maxInfo.atkLevel})</span>
                <span class="font-mono font-bold">${item.totalMaxBurstDamage.toLocaleString()} dmg / Fase Max</span>
               </div>`
            : "";

        return `
          <div class="p-4 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-pink-500/50 transition flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${item.roleBadgeClass}">
                  ${item.roleLabel}
                </span>
                ${effBadge}
              </div>

              <div class="flex items-baseline justify-between">
                <h4 class="text-sm sm:text-base font-extrabold text-white">
                  ${entry.nickname}
                  ${entry.isShadow ? '<span class="text-purple-400 text-xs">(Oscuro)</span>' : ""}
                </h4>
                <span class="font-mono text-xs font-bold text-cyan-300">PC ${entry.cp} · ${entry.levelBadge}</span>
              </div>

              <div class="mt-2 space-y-1 text-xs text-slate-300">
                <div class="flex justify-between">
                  <span class="text-slate-400">Rápido:</span>
                  <span class="font-semibold">${entry.fastMoveObj.name} (${entry.fastMoveObj.durationMs / 1000}s)</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Cargado:</span>
                  <span class="font-semibold">${entry.chargedMoveObj.name}</span>
                </div>
              </div>

              ${maxDetailRow}
            </div>

            <div class="mt-3 pt-2.5 border-t border-slate-800/90 grid grid-cols-3 text-center font-mono text-xs">
              <div>
                <span class="block text-[10px] text-slate-500">DPS</span>
                <strong class="text-cyan-300">${item.dps}/s</strong>
              </div>
              <div>
                <span class="block text-[10px] text-slate-500">TDO</span>
                <strong class="text-pink-400">${item.tdo}</strong>
              </div>
              <div>
                <span class="block text-[10px] text-slate-500">AGUANTE</span>
                <strong class="text-emerald-400">${item.timeToFaintSec}s</strong>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ==========================================================================
  // CATÁLOGO POKÉDEX META (VISTA 3)
  // ==========================================================================
  function renderPokedexCatalog() {
    const db = global.POKE_DB;
    const catalogGrid = document.getElementById("pokedex-catalog-grid");
    const badgeTotal = document.getElementById("db-total-species-badge");
    if (badgeTotal) badgeTotal.textContent = `${db.pokemon.length} Especies Cargadas`;
    if (!catalogGrid) return;

    catalogGrid.innerHTML = db.pokemon
      .map((p) => {
        const typeBadges = p.types.map((t) => renderTypeBadge(t)).join(" ");
        const gmaxInfo =
          p.fixedGmaxMove && db.gmaxMoves[p.fixedGmaxMove]
            ? `<div class="mt-2 px-2.5 py-1 rounded-lg bg-pink-500/15 border border-pink-500/40 text-[11px] text-pink-300 font-semibold">🌀 Mov. Max Exclusivo: ${db.gmaxMoves[p.fixedGmaxMove].name}</div>`
            : p.maxCapable
            ? `<div class="mt-2 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[11px] text-indigo-300">⚡ Apto para Combates Dinamax</div>`
            : "";

        return `
          <article class="p-4 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-cyan-500/50 transition flex flex-col justify-between">
            <div>
              <div class="flex items-start justify-between gap-2">
                <div>
                  <span class="text-[11px] font-mono text-slate-400">#${p.dex}</span>
                  <h3 class="text-sm font-extrabold text-white">${p.name}</h3>
                </div>
                <div class="flex gap-1">${typeBadges}</div>
              </div>
              <p class="mt-1.5 text-[11px] font-semibold text-cyan-300">${p.roleTag || ""}</p>
              <p class="mt-1 text-xs text-slate-400 leading-relaxed">${p.notes || ""}</p>
              ${gmaxInfo}
            </div>
            <div class="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-3 text-center font-mono text-xs">
              <div><span class="text-[10px] text-slate-500 block">ATQ</span><strong class="text-rose-400">${p.baseStats.atk}</strong></div>
              <div><span class="text-[10px] text-slate-500 block">DEF</span><strong class="text-cyan-400">${p.baseStats.def}</strong></div>
              <div><span class="text-[10px] text-slate-500 block">PS</span><strong class="text-emerald-400">${p.baseStats.sta}</strong></div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  // Inicialización al cargar el DOM
  document.addEventListener("DOMContentLoaded", () => {
    global.POKE_APP_INITIALIZED = true;
    initTabs();
    initBoxForm();
    initOptimizerControls();
    renderMyBoxCards();
    renderPokedexCatalog();
    runOptimizerCalculation();
  });
})(typeof window !== "undefined" ? window : globalThis);
