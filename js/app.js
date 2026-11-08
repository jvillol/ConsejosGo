/**
 * PokéRaid & Max Optimizer - Controlador Principal de Interfaz (js/app.js)
 * Con:
 *  - Guardado Rápido en Caja (Botones 1-Tap: 100% Nv. 50, Raid Nv. 40, Recién Atrapado Nv. 20)
 *  - Gestión completa de Amigos Fijos (selector de dueño 'me' o amigo al guardar)
 *  - Selección de Amigos Fijos en el Optimizador para simular incursión en grupo real
 *  - Desglose visual ultra-claro de compañeros necesarios
 */

(function (global) {
  "use strict";

  const state = {
    selectedBattleModeId: "dmax_t5",
    selectedBossId: "palkia_dmax",
    selectedBossFast: "",
    selectedBossCharged: "",
    partyPowerEnabled: true,
    partySize: 2,
    friendship: "best",
    megaBonus: "none",
    weatherBoost: false,
    randomAlliesHigh: 0,
    randomAlliesMid: 0,
    randomAlliesLow: 0,
    boxFilterQuery: "",
    boxFilterTag: "all",
    boxSort: "pc_desc",
    boxSelectedOwner: "me",
    activeCombatFriendIds: [],
    dexFilterQuery: "",
    dexFilterTag: "all",
    editingUid: null
  };

  function normalizeSearchText(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function renderTypeBadge(typeKey, extraClasses = "") {
    const db = global.POKE_DB;
    const tm = db.typeMeta[typeKey] || db.typeMeta.normal;
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${tm.bg} ${tm.text} ${tm.border} ${extraClasses}">${tm.name}</span>`;
  }

  function showNotification(message, type = "info") {
    let toast = document.getElementById("app-toast-notification");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast-notification";
      toast.className =
        "fixed bottom-20 sm:bottom-6 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl border text-xs sm:text-sm font-bold transition-all duration-300 pointer-events-none";
      document.body.appendChild(toast);
    }
    const colorClasses =
      type === "error"
        ? "bg-rose-950/95 border-rose-500/70 text-rose-200"
        : type === "warning"
        ? "bg-amber-950/95 border-amber-500/70 text-amber-200"
        : "bg-slate-900/95 border-cyan-400/70 text-cyan-200";
    toast.className = `fixed bottom-20 sm:bottom-6 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl border text-xs sm:text-sm font-bold transition-all duration-300 ${colorClasses}`;
    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = "0";
    }, 3200);
  }

  function getActiveBattleMode() {
    const db = global.POKE_DB;
    return db.battleModes[state.selectedBattleModeId] || db.battleModes.raid_t5;
  }

  function clampAlliesToLobbyLimit(battleMode = getActiveBattleMode()) {
    const maxCompanions = Math.max(0, (battleMode.maxLobbyPlayers || 20) - 1);

    // 1. Recortar amigos fijos si exceden el límite de sala (ej. Dinamax máx 3 acompañantes)
    if (state.activeCombatFriendIds.length > maxCompanions) {
      state.activeCombatFriendIds = state.activeCombatFriendIds.slice(0, maxCompanions);
    }

    // 2. Recortar compañeros random si la suma (Amigos + Randoms) supera maxCompanions
    let remainingSlots = Math.max(0, maxCompanions - state.activeCombatFriendIds.length);

    state.randomAlliesHigh = Math.max(0, Math.min(state.randomAlliesHigh || 0, remainingSlots));
    remainingSlots -= state.randomAlliesHigh;

    state.randomAlliesMid = Math.max(0, Math.min(state.randomAlliesMid || 0, remainingSlots));
    remainingSlots -= state.randomAlliesMid;

    state.randomAlliesLow = Math.max(0, Math.min(state.randomAlliesLow || 0, remainingSlots));

    syncLobbyOccupancyUI(battleMode);
  }

  function syncLobbyOccupancyUI(battleMode = getActiveBattleMode()) {
    const elHigh = document.getElementById("label-random-allies-high");
    const elMid = document.getElementById("label-random-allies-mid");
    const elLow = document.getElementById("label-random-allies-low");
    if (elHigh) elHigh.textContent = state.randomAlliesHigh;
    if (elMid) elMid.textContent = state.randomAlliesMid;
    if (elLow) elLow.textContent = state.randomAlliesLow;

    const totalRandom = state.randomAlliesHigh + state.randomAlliesMid + state.randomAlliesLow;
    const summaryWrap = document.getElementById("random-allies-summary");
    const countTotal = document.getElementById("random-allies-count-total");
    if (summaryWrap && countTotal) {
      summaryWrap.classList.toggle("hidden", totalRandom <= 0);
      countTotal.textContent = totalRandom;
    }

    const totalPlayersInLobby = 1 + state.activeCombatFriendIds.length + totalRandom;
    const maxLobby = battleMode.maxLobbyPlayers || 20;
    const occBadge = document.getElementById("lobby-occupancy-badge");
    if (occBadge) {
      occBadge.textContent = `Sala: ${totalPlayersInLobby} / ${maxLobby} Jug.`;
      occBadge.className =
        totalPlayersInLobby >= maxLobby
          ? "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/25 text-amber-300 border border-amber-500/50 shrink-0"
          : "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0";
    }
  }

  // ==========================================================================
  // NAVEGACIÓN POR PESTAÑAS
  // ==========================================================================
  function initTabs() {
    const tabButtons = document.querySelectorAll(".nav-tab-btn");
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
      const isMobileNav = Boolean(b.closest("#mobile-bottom-nav"));

      if (isMobileNav) {
        b.classList.toggle("bg-slate-900", isTarget);
        b.classList.toggle("text-pink-400", isTarget);
        b.classList.toggle("font-bold", isTarget);
        b.classList.toggle("text-slate-400", !isTarget);
        b.classList.toggle("font-semibold", !isTarget);
      } else {
        b.classList.toggle("border-pink-500", isTarget);
        b.classList.toggle("bg-slate-900/90", isTarget);
        b.classList.toggle("text-white", isTarget);
        b.classList.toggle("border-transparent", !isTarget);
        b.classList.toggle("text-slate-400", !isTarget);
      }
    });

    tabPanels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== targetId);
    });
  }

  // ==========================================================================
  // GESTIÓN Y SELECTOR DE AMIGOS
  // ==========================================================================
  function populateOwnerSelectors() {
    const friends = global.PokeBoxManager.getFriends();

    // Selector en el formulario de guardar
    const formOwnerSelect = document.getElementById("select-form-owner");
    if (formOwnerSelect) {
      const currentVal = formOwnerSelect.value || "me";
      formOwnerSelect.innerHTML = `
        <option value="me">👤 Yo (Mi Caja Personal)</option>
        ${friends
          .map((f) => `<option value="${f.id}">👥 Amigo: ${f.name}</option>`)
          .join("")}
      `;
      formOwnerSelect.value = currentVal;
    }

    // Selector de filtro de vista en Mi Caja
    const boxOwnerFilter = document.getElementById("select-box-owner-filter");
    if (boxOwnerFilter) {
      boxOwnerFilter.innerHTML = `
        <option value="me" ${state.boxSelectedOwner === "me" ? "selected" : ""}>👤 Mi Caja Personal</option>
        <option value="all" ${state.boxSelectedOwner === "all" ? "selected" : ""}>🌐 Todos (Mía + Amigos)</option>
        ${friends
          .map(
            (f) =>
              `<option value="${f.id}" ${state.boxSelectedOwner === f.id ? "selected" : ""}>👥 Equipo de: ${f.name}</option>`
          )
          .join("")}
      `;
    }

    // Lista de amigos seleccionables para el combate en el Optimizador
    renderCombatFriendsList();
  }

  function renderCombatFriendsList() {
    const container = document.getElementById("combat-friends-container");
    if (!container) return;

    const friends = global.PokeBoxManager.getFriends();
    if (friends.length === 0) {
      container.innerHTML = `
        <div class="p-3 text-xs text-slate-400 text-center bg-slate-950/60 rounded-xl border border-slate-800">
          No tienes amigos fijos guardados. Ve a la pestaña "Mi Caja" para añadir a tus amigos y sus Pokémon.
        </div>
      `;
      return;
    }

    const allBox = global.PokeBoxManager.getAll("all");

    container.innerHTML = friends
      .map((f) => {
        const count = allBox.filter((p) => p.ownerId === f.id).length;
        const isChecked = state.activeCombatFriendIds.includes(f.id);
        return `
          <label class="flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
            isChecked
              ? "bg-indigo-950/50 border-indigo-500/60 text-white"
              : "bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700"
          }">
            <div class="flex items-center gap-2.5 min-w-0">
              <input
                type="checkbox"
                data-combat-friend-id="${f.id}"
                ${isChecked ? "checked" : ""}
                class="w-4 h-4 accent-pink-500 rounded cursor-pointer shrink-0"
              />
              <div class="min-w-0">
                <span class="text-xs sm:text-sm font-bold block truncate text-slate-200">${f.name}</span>
                <span class="text-[10px] font-mono text-cyan-400">${count} Pokémon guardados</span>
              </div>
            </div>
            <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${f.avatarColor || '#06b6d4'}"></span>
          </label>
        `;
      })
      .join("");

    container.querySelectorAll("[data-combat-friend-id]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const fId = cb.getAttribute("data-combat-friend-id");
        const bm = getActiveBattleMode();
        const maxCompanions = Math.max(0, (bm.maxLobbyPlayers || 20) - 1);
        const currentTotalAllies =
          state.activeCombatFriendIds.length +
          state.randomAlliesHigh +
          state.randomAlliesMid +
          state.randomAlliesLow;

        if (cb.checked) {
          if (currentTotalAllies >= maxCompanions) {
            cb.checked = false;
            showNotification(
              `⚠️ Límite de sala alcanzado (${bm.maxLobbyPlayers} jugadores máx. en ${bm.pveGroupLabel || bm.name}).`,
              "warning"
            );
            return;
          }
          if (!state.activeCombatFriendIds.includes(fId)) {
            state.activeCombatFriendIds.push(fId);
          }
        } else {
          state.activeCombatFriendIds = state.activeCombatFriendIds.filter((id) => id !== fId);
        }
        syncLobbyOccupancyUI(bm);
        renderCombatFriendsList();
        runOptimizerCalculation();
      });
    });
  }

  function initFriendModalEvents() {
    const btnNewFriend = document.getElementById("btn-add-friend-trigger");
    const modal = document.getElementById("modal-friend");
    const modalClose = document.getElementById("btn-close-friend-modal");
    const friendForm = document.getElementById("form-add-friend");
    const friendsManageList = document.getElementById("friends-manage-list");

    if (btnNewFriend && modal) {
      btnNewFriend.addEventListener("click", () => {
        renderManageFriendsList();
        modal.classList.remove("hidden");
      });
    }

    if (modalClose && modal) {
      modalClose.addEventListener("click", () => {
        modal.classList.add("hidden");
      });
    }

    if (friendForm) {
      friendForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const nameInput = document.getElementById("input-friend-name");
        const notesInput = document.getElementById("input-friend-notes");

        global.PokeBoxManager.addFriend(nameInput.value, notesInput.value);
        nameInput.value = "";
        notesInput.value = "";

        populateOwnerSelectors();
        renderManageFriendsList();
        renderMyBoxCards();
        runOptimizerCalculation();
      });
    }

    function renderManageFriendsList() {
      if (!friendsManageList) return;
      const friends = global.PokeBoxManager.getFriends();
      if (friends.length === 0) {
        friendsManageList.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">No hay amigos registrados aún.</p>`;
        return;
      }

      friendsManageList.innerHTML = friends
        .map(
          (f) => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <div>
              <strong class="text-xs sm:text-sm text-white">${f.name}</strong>
              <p class="text-[11px] text-slate-400">${f.notes || "Sin notas"}</p>
            </div>
            <button
              type="button"
              data-delete-friend="${f.id}"
              class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-950/60 text-rose-300 hover:bg-rose-900 border border-rose-500/40"
            >
              Borrar
            </button>
          </div>
        `
        )
        .join("");

      friendsManageList.querySelectorAll("[data-delete-friend]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const fId = btn.getAttribute("data-delete-friend");
          global.PokeBoxManager.removeFriend(fId);
          state.activeCombatFriendIds = state.activeCombatFriendIds.filter((id) => id !== fId);
          populateOwnerSelectors();
          renderManageFriendsList();
          renderMyBoxCards();
          runOptimizerCalculation();
        });
      });
    }
  }

  // ==========================================================================
  // MÓDULO 1: FORMULARIO Y GUARDADO RÁPIDO (1-TAP PRESETS)
  // ==========================================================================
  function initBoxForm() {
    const db = global.POKE_DB;
    const speciesSearchInput = document.getElementById("input-species-search");
    const clearSpeciesBtn = document.getElementById("btn-clear-species-search");
    const speciesDropdown = document.getElementById("species-search-dropdown");
    const speciesMatchCount = document.getElementById("species-match-count");
    const speciesSelect = document.getElementById("select-box-species");

    const presetSelect = document.getElementById("select-level-preset");
    const customCpInput = document.getElementById("input-custom-cp");
    const ivAtkInput = document.getElementById("input-iv-atk");
    const ivDefInput = document.getElementById("input-iv-def");
    const ivStaInput = document.getElementById("input-iv-sta");
    const maxClassSelect = document.getElementById("select-box-max-class");
    const form = document.getElementById("pokemon-box-form");
    const cancelEditBtn = document.getElementById("btn-cancel-edit");

    const filterBoxInput = document.getElementById("input-filter-box");
    const clearBoxFilterBtn = document.getElementById("btn-clear-box-filter");
    const boxTagBtns = document.querySelectorAll(".box-tag-btn");
    const boxOwnerFilter = document.getElementById("select-box-owner-filter");
    const clearBoxBtn = document.getElementById("btn-clear-box");
    const loadDemoBtn = document.getElementById("btn-load-demo-box");

    // Poblar presets de nivel
    presetSelect.innerHTML = db.levelPresets
      .map(
        (l) =>
          `<option value="${l.id}" ${l.id === "no_xl" ? "selected" : ""}>${l.label}</option>`
      )
      .join("");

    // Botones rápidos 1-Tap de IVs y Nivel (Gran comodidad)
    document.querySelectorAll("[data-quick-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.getAttribute("data-quick-preset");
        applyQuickPreset(type);
      });
    });

    function applyQuickPreset(type) {
      const species = global.PokeBoxManager.getSpeciesById(speciesSelect.value);
      if (type === "hundo_50") {
        ivAtkInput.value = 15;
        ivDefInput.value = 15;
        ivStaInput.value = 15;
        presetSelect.value = "maxed";
        if (species) {
          customCpInput.value = global.PokeBoxManager.calculateCP(species, 15, 15, 15, 50);
        }
      } else if (type === "raid_40") {
        ivAtkInput.value = 15;
        ivDefInput.value = 14;
        ivStaInput.value = 14;
        presetSelect.value = "no_xl";
        if (species) {
          customCpInput.value = global.PokeBoxManager.calculateCP(species, 15, 14, 14, 40);
        }
      } else if (type === "caught_20") {
        ivAtkInput.value = 12;
        ivDefInput.value = 12;
        ivStaInput.value = 12;
        presetSelect.value = "caught";
        if (species) {
          customCpInput.value = global.PokeBoxManager.calculateCP(species, 12, 12, 12, 20);
        }
      } else if (type === "hundo_only") {
        ivAtkInput.value = 15;
        ivDefInput.value = 15;
        ivStaInput.value = 15;
      }
      updateFormLivePreview();
    }

    const btnFill40 = document.getElementById("btn-fill-cp-40");
    if (btnFill40) {
      btnFill40.addEventListener("click", () => {
        const species = global.PokeBoxManager.getSpeciesById(speciesSelect.value);
        if (!species) return;
        const atk = Number(ivAtkInput.value);
        const def = Number(ivDefInput.value);
        const sta = Number(ivStaInput.value);
        customCpInput.value = global.PokeBoxManager.calculateCP(species, atk, def, sta, 40);
        updateFormLivePreview();
      });
    }

    const btnFill50 = document.getElementById("btn-fill-cp-50");
    if (btnFill50) {
      btnFill50.addEventListener("click", () => {
        const species = global.PokeBoxManager.getSpeciesById(speciesSelect.value);
        if (!species) return;
        const atk = Number(ivAtkInput.value);
        const def = Number(ivDefInput.value);
        const sta = Number(ivStaInput.value);
        customCpInput.value = global.PokeBoxManager.calculateCP(species, atk, def, sta, 50);
        updateFormLivePreview();
      });
    }

    function getFilteredBoxSpecies(filterText = "") {
      const q = normalizeSearchText(filterText);
      return db.pokemon.filter((p) => {
        if (p.bossOnly) return false;
        if (!q) return true;
        const typeNames = p.types.map((t) => db.typeMeta[t].name).join(" ");
        const haystack = normalizeSearchText(
          `${p.name} ${p.dex} #${p.dex} ${typeNames} ${p.roleTag || ""}`
        );
        return haystack.includes(q);
      });
    }

    function populateSpeciesOptions(filterText = "", showDropdown = false) {
      const currentVal = speciesSelect.value;
      const eligible = getFilteredBoxSpecies(filterText);

      if (speciesMatchCount) {
        speciesMatchCount.textContent =
          eligible.length === db.pokemon.filter((p) => !p.bossOnly).length
            ? `todas (${eligible.length})`
            : `${eligible.length} coincidencia(s)`;
      }

      if (eligible.length > 0) {
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

      if (showDropdown && filterText.trim().length > 0) {
        renderSpeciesAutocompleteDropdown(eligible);
      } else {
        speciesDropdown.classList.add("hidden");
      }
    }

    const focusSpeciesSearchBtn = document.getElementById("btn-focus-species-search");
    if (focusSpeciesSearchBtn) {
      focusSpeciesSearchBtn.addEventListener("click", () => {
        speciesSearchInput.focus();
        speciesSearchInput.select();
      });
    }

    function renderSpeciesAutocompleteDropdown(matches) {
      if (!matches || matches.length === 0) {
        speciesDropdown.innerHTML = `
          <div class="p-3 text-xs text-slate-400 text-center bg-slate-950">
            No se encontró ningún Pokémon con ese nombre o tipo.
          </div>
        `;
        speciesDropdown.classList.remove("hidden");
        return;
      }

      speciesDropdown.innerHTML = matches
        .slice(0, 12)
        .map((p) => {
          const typesHtml = p.types.map((t) => renderTypeBadge(t)).join(" ");
          const maxTag =
            p.maxForm === "eternamax" || p.maxForm === "gigantamax"
              ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40">🌀 G-Max</span>`
              : p.maxCapable
              ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">⚡ D-Max</span>`
              : "";
          return `
            <button
              type="button"
              data-pick-species="${p.id}"
              class="w-full px-4 py-3 text-left bg-slate-950 hover:bg-slate-800 active:bg-cyan-950/40 flex items-center justify-between gap-3 transition border-b border-slate-800/80 last:border-b-0 cursor-pointer"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-xs font-bold text-cyan-400">#${p.dex}</span>
                  <span class="text-sm font-bold text-white">${p.name}</span>
                  ${maxTag}
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5 truncate">${p.roleTag || ""}</p>
              </div>
              <div class="flex gap-1 shrink-0">${typesHtml}</div>
            </button>
          `;
        })
        .join("");

      speciesDropdown.classList.remove("hidden");

      speciesDropdown.querySelectorAll("[data-pick-species]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pickedId = btn.getAttribute("data-pick-species");
          speciesSearchInput.value = "";
          clearSpeciesBtn.classList.add("hidden");
          speciesDropdown.classList.add("hidden");
          speciesSelect.value = pickedId;
          onSpeciesChange();
        });
      });
    }

    function onSpeciesChange() {
      const speciesId = speciesSelect.value;
      const species = global.PokeBoxManager.getSpeciesById(speciesId);
      if (!species) return;

      // Actualizar tarjeta visual de Especie Seleccionada
      const cardDex = document.getElementById("species-selected-dex");
      const cardName = document.getElementById("species-selected-name");
      const cardTypes = document.getElementById("species-selected-types");
      const cardImg = document.getElementById("species-selected-img");
      if (cardDex) cardDex.textContent = `#${species.dex}`;
      if (cardName) cardName.textContent = species.name;
      if (cardTypes) {
        cardTypes.innerHTML = species.types.map((t) => renderTypeBadge(t)).join(" ");
      }
      if (cardImg) {
        cardImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${species.dex}.png`;
        cardImg.alt = species.name;
        cardImg.style.display = "block";
      }

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

      shadowCheckbox.disabled = !species.canBeShadow;
      if (!species.canBeShadow) {
        shadowCheckbox.checked = false;
      }

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
      if (maxPanel) maxPanel.classList.toggle("hidden", !isMax);
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
      const statsPreview = document.getElementById("calculated-stats-preview");

      if (customCPVal && customCPVal >= 10) {
        const est = global.PokeBoxManager.estimateLevelFromCP(
          species,
          ivAtk,
          ivDef,
          ivSta,
          customCPVal
        );
        presetSelect.value = est.presetId;
        cpBadge.textContent = `Nivel: Nv. ${est.level}`;
        cpBadge.className = "px-2.5 py-0.5 rounded-full font-mono text-xs font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40";
        if (statsPreview) {
          const realAtk = Math.round((species.baseStats.atk + ivAtk) * est.cpm * 10) / 10;
          const realDef = Math.round((species.baseStats.def + ivDef) * est.cpm * 10) / 10;
          const realHP = Math.max(10, Math.floor((species.baseStats.sta + ivSta) * est.cpm));
          statsPreview.textContent = `Atk: ${realAtk} · Def: ${realDef} · PS: ${realHP}`;
        }
      } else {
        const calcCP = global.PokeBoxManager.calculateCP(
          species,
          ivAtk,
          ivDef,
          ivSta,
          40
        );
        cpBadge.textContent = `Escribe los PC (Nv. 40 sería ~${calcCP})`;
        cpBadge.className = "px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700";
        if (statsPreview) statsPreview.textContent = "";
      }
    }

    speciesSearchInput.addEventListener("input", (e) => {
      const val = e.target.value;
      clearSpeciesBtn.classList.toggle("hidden", !val);
      populateSpeciesOptions(val, true);
    });

    speciesSearchInput.addEventListener("focus", () => {
      if (speciesSearchInput.value.trim().length > 0) {
        populateSpeciesOptions(speciesSearchInput.value, true);
      }
    });

    clearSpeciesBtn.addEventListener("click", () => {
      speciesSearchInput.value = "";
      clearSpeciesBtn.classList.add("hidden");
      populateSpeciesOptions("", false);
      speciesSearchInput.focus();
    });

    speciesSelect.addEventListener("change", onSpeciesChange);
    maxClassSelect.addEventListener("change", updateMaxLevelsVisibility);

    [ivAtkInput, ivDefInput, ivStaInput, presetSelect, customCpInput].forEach((el) => {
      el.addEventListener("input", updateFormLivePreview);
      el.addEventListener("change", updateFormLivePreview);
    });

    cancelEditBtn.addEventListener("click", () => {
      resetBoxForm();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const ownerSelect = document.getElementById("select-form-owner");
      const ownerId = ownerSelect ? ownerSelect.value : "me";

      const species = global.PokeBoxManager.getSpeciesById(speciesSelect.value);
      const atk = Number(ivAtkInput.value);
      const def = Number(ivDefInput.value);
      const sta = Number(ivStaInput.value);
      const cpVal = customCpInput.value
        ? Number(customCpInput.value)
        : (species ? global.PokeBoxManager.calculateCP(species, atk, def, sta, 40) : 3000);

      const payload = {
        ownerId,
        pokemonId: speciesSelect.value,
        nickname: document.getElementById("input-box-nickname").value,
        ivAtk: atk,
        ivDef: def,
        ivSta: sta,
        levelPreset: presetSelect.value,
        cp: cpVal,
        customCP: cpVal,
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
      state.boxFilterQuery = e.target.value;
      clearBoxFilterBtn.classList.toggle("hidden", !state.boxFilterQuery);
      renderMyBoxCards();
    });

    clearBoxFilterBtn.addEventListener("click", () => {
      filterBoxInput.value = "";
      state.boxFilterQuery = "";
      clearBoxFilterBtn.classList.add("hidden");
      renderMyBoxCards();
    });

    boxTagBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.boxFilterTag = btn.getAttribute("data-box-tag");
        boxTagBtns.forEach((b) => {
          const active = b.getAttribute("data-box-tag") === state.boxFilterTag;
          b.className = active
            ? "box-tag-btn px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0"
            : "box-tag-btn px-3 py-1 rounded-full text-xs font-semibold bg-slate-950 text-slate-400 border border-slate-800 hover:text-cyan-300 shrink-0";
        });
        renderMyBoxCards();
      });
    });

    if (boxOwnerFilter) {
      boxOwnerFilter.addEventListener("change", () => {
        state.boxSelectedOwner = boxOwnerFilter.value;
        renderMyBoxCards();
      });
    }

    clearBoxBtn.addEventListener("click", () => {
      global.PokeBoxManager.clearAll(state.boxSelectedOwner);
      renderMyBoxCards();
      runOptimizerCalculation();
    });

    loadDemoBtn.addEventListener("click", () => {
      global.PokeBoxManager.loadDemoBox();
      populateOwnerSelectors();
      renderMyBoxCards();
      runOptimizerCalculation();
    });

    const boxSortSelect = document.getElementById("select-box-sort");
    if (boxSortSelect) {
      boxSortSelect.addEventListener("change", () => {
        state.boxSort = boxSortSelect.value;
        renderMyBoxCards();
      });
    }

    const exportBtn = document.getElementById("btn-export-box");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        exportBackupData();
      });
    }

    const importTriggerBtn = document.getElementById("btn-import-box-trigger");
    const importInput = document.getElementById("input-import-box");
    if (importTriggerBtn && importInput) {
      importTriggerBtn.addEventListener("click", () => {
        importInput.click();
      });
      importInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          importBackupData(file);
          importInput.value = "";
        }
      });
    }

    populateSpeciesOptions("", false);
  }

  function exportBackupData() {
    const box = global.PokeBoxManager.getAll("all");
    const friends = global.PokeBoxManager.getFriends();
    const data = {
      version: 3,
      exportedAt: new Date().toISOString(),
      appName: "PokéRaid & Max Optimizer",
      box,
      friends
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pokeraid_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification("Copia de seguridad descargada correctamente 📥", "success");
  }

  function importBackupData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.box)) {
          showNotification("El archivo JSON no tiene un formato válido de PokéRaid", "error");
          return;
        }

        global.localStorage.setItem(
          global.PokeBoxManager.STORAGE_KEY_BOX,
          JSON.stringify(parsed.box)
        );
        if (Array.isArray(parsed.friends)) {
          global.localStorage.setItem(
            global.PokeBoxManager.STORAGE_KEY_FRIENDS,
            JSON.stringify(parsed.friends)
          );
        }

        populateOwnerSelectors();
        renderMyBoxCards();
        runOptimizerCalculation();
        showNotification(
          `Copia restaurada con éxito: ${parsed.box.length} Pokémon y ${(parsed.friends || []).length} amigos 📤`,
          "success"
        );
      } catch (err) {
        console.error("Error importando backup:", err);
        showNotification("Error al procesar el archivo de copia de seguridad", "error");
      }
    };
    reader.readAsText(file);
  }

  function resetBoxForm() {
    state.editingUid = null;
    document.getElementById("form-pokemon-uid").value = "";
    document.getElementById("box-form-title").textContent = "➕ Añadir Pokémon a la Caja";
    document.getElementById("btn-save-pokemon").textContent = "💾 Guardar Pokémon";
    document.getElementById("btn-cancel-edit").classList.add("hidden");
    document.getElementById("input-species-search").value = "";
    document.getElementById("btn-clear-species-search").classList.add("hidden");
    document.getElementById("species-search-dropdown").classList.add("hidden");
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

    const ownerSelect = document.getElementById("select-form-owner");
    if (ownerSelect) ownerSelect.value = entry.ownerId || "me";

    const speciesSelect = document.getElementById("select-box-species");
    document.getElementById("input-species-search").value = "";
    document.getElementById("btn-clear-species-search").classList.add("hidden");
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

  function renderMyBoxCards() {
    const db = global.POKE_DB;
    const allPokemon = global.PokeBoxManager.getAll(state.boxSelectedOwner);

    const myCount = global.PokeBoxManager.getAll("me").length;
    document.getElementById("header-box-count").textContent = myCount;
    const tabBadge = document.getElementById("tab-box-badge");
    if (tabBadge) tabBadge.textContent = myCount;

    const grid = document.getElementById("my-box-cards-grid");
    const q = normalizeSearchText(state.boxFilterQuery);

    const filtered = allPokemon.filter((item) => {
      if (state.boxFilterTag === "max" && (!item.maxMoveInfo || !item.maxMoveInfo.isMaxCapable)) {
        return false;
      }
      if (state.boxFilterTag === "shadow" && !item.isShadow) {
        return false;
      }
      if (state.boxFilterTag === "hundo" && item.ivPct < 100) {
        return false;
      }

      if (!q) return true;
      const typeNames = item.species.types.map((t) => db.typeMeta[t].name).join(" ");
      const maxMoveName = item.maxMoveInfo ? item.maxMoveInfo.moveName : "";
      const ownerObj = global.PokeBoxManager.getFriendById(item.ownerId || "me");
      const ownerName = ownerObj ? ownerObj.name : "";
      const haystack = normalizeSearchText(
        `${item.nickname} ${item.species.name} #${item.species.dex} ${typeNames} ${item.fastMoveObj.name} ${item.chargedMoveObj.name} ${maxMoveName} ${ownerName}`
      );
      return haystack.includes(q);
    });

    if (allPokemon.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-8 rounded-2xl bg-slate-950/90 border border-dashed border-cyan-500/30 text-center space-y-4 shadow-xl">
          <div class="w-16 h-16 mx-auto rounded-full bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-3xl">
            📦
          </div>
          <div class="space-y-1">
            <h3 class="text-base font-bold text-white">Tu Caja está completamente vacía (0 Pokémon)</h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto">
              La colección parte limpia de cero para que introduzcas tus propios Pokémon sin tener que borrar ejemplos previos. Usa el formulario de la izquierda con las plantillas rápidas de 1 toque, o pulsa "Cargar Demo" si quieres probar con un equipo de ejemplo.
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              type="button"
              id="btn-box-focus-form"
              class="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition"
            >
              ➕ Añadir mi primer Pokémon
            </button>
            <button
              type="button"
              id="btn-box-load-demo-empty"
              class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition"
            >
              ⚡ Cargar Pokémon Demo
            </button>
          </div>
        </div>
      `;
      const focusBtn = document.getElementById("btn-box-focus-form");
      if (focusBtn) {
        focusBtn.addEventListener("click", () => {
          const input = document.getElementById("input-species-search");
          if (input) input.focus();
        });
      }
      const demoBtn = document.getElementById("btn-box-load-demo-empty");
      if (demoBtn) {
        demoBtn.addEventListener("click", () => {
          global.PokeBoxManager.loadDemoBox();
          populateOwnerSelectors();
          renderMyBoxCards();
          runOptimizerCalculation();
          showNotification("Caja demo cargada correctamente", "success");
        });
      }
      return;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-6 sm:p-8 rounded-2xl bg-slate-950/80 border border-dashed border-slate-700 text-center space-y-2">
          <p class="text-sm font-bold text-slate-300">No se encontraron Pokémon con los filtros actuales</p>
          <p class="text-xs text-slate-400">Prueba a limpiar la búsqueda o cambiar el filtro de etiqueta.</p>
        </div>
      `;
      return;
    }

    // Ordenación configurable
    const sortMode = state.boxSort || "pc_desc";
    filtered.sort((a, b) => {
      if (sortMode === "pc_desc") return b.cp - a.cp;
      if (sortMode === "iv_desc") return b.ivPct - a.ivPct;
      if (sortMode === "level_desc") return b.level - a.level;
      if (sortMode === "dex_asc") return a.species.dex - b.species.dex;
      if (sortMode === "name_asc") return a.nickname.localeCompare(b.nickname);
      return b.cp - a.cp;
    });

    grid.innerHTML = filtered
      .map((item) => {
        const typeBadges = item.species.types.map((t) => renderTypeBadge(t)).join(" ");
        const shadowBadge = item.isShadow
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-600/30 text-purple-200 border border-purple-400/50">🟣 Oscuro</span>`
          : "";

        const ownerObj = global.PokeBoxManager.getFriendById(item.ownerId || "me");
        const isFriend = item.ownerId && item.ownerId !== "me";
        const ownerBadge = isFriend
          ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-indigo-950/80 border-indigo-500/50 text-indigo-300">👥 ${ownerObj ? ownerObj.name : "Amigo"}</span>`
          : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-cyan-950/80 border-cyan-500/40 text-cyan-300">👤 Mío</span>`;

        let maxBadge = "";
        if (item.maxMoveInfo && item.maxMoveInfo.isMaxCapable) {
          const labelClass =
            item.maxMoveInfo.maxClass === "eternamax"
              ? "Eternamax"
              : item.maxMoveInfo.maxClass === "gigantamax"
              ? "Gigamax"
              : "Dinamax";
          maxBadge = `
            <div class="mt-2 p-2 rounded-lg bg-pink-950/50 border border-pink-500/40 flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span class="font-bold text-pink-300">🌀 ${labelClass}: ${item.maxMoveInfo.moveName}</span>
              <span class="font-mono text-pink-200">ATQ ${item.maxMoveInfo.atkLevel} · GRD ${item.maxMoveInfo.guardLevel} · ESP ${item.maxMoveInfo.spiritLevel}</span>
            </div>
          `;
        }

        return `
          <article class="p-3.5 sm:p-4 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-cyan-500/50 transition flex flex-col justify-between shadow-lg ${
            item.isShadow ? "glow-shadow-poke" : item.maxMoveInfo.isMaxCapable ? "glow-dynamax" : ""
          }">
            <div>
              <div class="flex items-start justify-between gap-2.5">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 p-0.5 shrink-0 flex items-center justify-center overflow-hidden">
                    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${item.species.dex}.png" alt="${item.species.name}" class="w-full h-full object-contain filter drop-shadow" onerror="this.style.display='none'" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      ${ownerBadge}
                      <span class="font-mono text-[11px] text-slate-400">#${item.species.dex}</span>
                      <span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">PC ${item.cp}</span>
                      <span class="font-mono text-[11px] text-slate-400">${item.levelBadge}</span>
                    </div>
                    <h3 class="text-sm sm:text-base font-extrabold text-white mt-0.5 truncate">${item.nickname}</h3>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1 justify-end shrink-0">
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
                <div class="flex items-center justify-between gap-1">
                  <span class="text-slate-400">Rápido:</span>
                  <span class="font-semibold text-slate-200 text-right">${item.fastMoveObj.name} ${renderTypeBadge(item.fastMoveObj.type)}</span>
                </div>
                <div class="flex items-center justify-between gap-1">
                  <span class="text-slate-400">Cargado:</span>
                  <span class="font-semibold text-slate-200 text-right">${item.chargedMoveObj.name} ${renderTypeBadge(item.chargedMoveObj.type)}</span>
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
                class="min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-cyan-600/30 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 transition"
              >
                ✏️ Editar
              </button>
              <button
                type="button"
                data-action="delete-box"
                data-uid="${item.uid}"
                class="min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-rose-600/30 text-rose-300 border border-slate-700 hover:border-rose-500/50 transition"
              >
                🗑️ Borrar
              </button>
            </div>
          </article>
        `;
      })
      .join("");

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
  // MÓDULO 2 Y 3: OPTIMIZADOR Y CALCULADORA ULTRA-CLARA
  // ==========================================================================
  function initOptimizerControls() {
    const db = global.POKE_DB;
    const modeSelect = document.getElementById("select-battle-mode");
    const bossSearchInput = document.getElementById("input-boss-search");
    const clearBossSearchBtn = document.getElementById("btn-clear-boss-search");
    const bossDropdown = document.getElementById("boss-search-dropdown");
    const bossQuickChips = document.getElementById("boss-quick-chips");
    const bossSelect = document.getElementById("select-boss-pokemon");
    const bossFastSelect = document.getElementById("select-boss-fast");
    const bossChargedSelect = document.getElementById("select-boss-charged");
    const partyToggle = document.getElementById("toggle-party-power");
    const partySizeBtns = document.querySelectorAll(".party-size-btn");
    const friendshipSelect = document.getElementById("select-friendship");
    const megaSelect = document.getElementById("select-mega-bonus");
    const weatherToggle = document.getElementById("toggle-weather-boost");
    const runBtn = document.getElementById("btn-run-optimizer");

    const bossCandidates = db.pokemon.filter((p) => p.isBossCandidate);

    function populateBattleModeOptions() {
      const groups = {};
      Object.values(db.battleModes).forEach((m) => {
        const groupKey = m.pveGroupLabel || "Modalidades PvE";
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(m);
      });

      modeSelect.innerHTML = Object.entries(groups)
        .map(
          ([label, modes]) =>
            `<optgroup label="${label}">${modes
              .map(
                (m) =>
                  `<option value="${m.id}" ${
                    m.id === state.selectedBattleModeId ? "selected" : ""
                  }>${m.name} (${m.teamSize} Poké · Máx ${m.maxLobbyPlayers} Jug. · ${m.bossHP.toLocaleString()} HP)</option>`
              )
              .join("")}</optgroup>`
        )
        .join("");
    }

    populateBattleModeOptions();

    const pveTypeBtns = document.querySelectorAll(".pve-type-btn");
    const defaultModeByPveType = {
      raid: "raid_t5",
      megaraid: "raid_mega",
      dynamax: "dmax_t5",
      gigantamax: "gmax_t6"
    };
    const defaultBossByPveType = {
      raid: "mewtwo",
      megaraid: "rayquaza_mega",
      dynamax: "palkia_dmax",
      gigantamax: "duraludon_gmax"
    };

    function highlightPveTypeButtons(activePveType) {
      pveTypeBtns.forEach((btn) => {
        const bType = btn.getAttribute("data-pve-type");
        const isActive = bType === activePveType;
        if (bType === "raid") {
          btn.className = isActive
            ? "pve-type-btn p-2 rounded-xl border border-cyan-400 bg-cyan-500/20 text-white transition text-left shadow-sm"
            : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-cyan-500/50 transition text-left";
        } else if (bType === "megaraid") {
          btn.className = isActive
            ? "pve-type-btn p-2 rounded-xl border border-purple-400 bg-purple-500/20 text-white transition text-left shadow-sm"
            : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-purple-500/50 transition text-left";
        } else if (bType === "dynamax") {
          btn.className = isActive
            ? "pve-type-btn p-2 rounded-xl border border-pink-500 bg-pink-500/20 text-white transition text-left shadow-sm"
            : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-pink-500/50 transition text-left";
        } else if (bType === "gigantamax") {
          btn.className = isActive
            ? "pve-type-btn p-2 rounded-xl border border-amber-400 bg-amber-500/20 text-white transition text-left shadow-sm"
            : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-amber-500/50 transition text-left";
        }
      });
    }

    pveTypeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const pveType = btn.getAttribute("data-pve-type");
        const targetModeId = defaultModeByPveType[pveType] || "raid_t5";
        state.selectedBattleModeId = targetModeId;
        modeSelect.value = targetModeId;

        // Si el jefe actual no corresponde a la modalidad elegida, sugerir el jefe representativo de esa modalidad
        const currentBoss = db.pokemon.find((p) => p.id === state.selectedBossId);
        const bossModes = (currentBoss && currentBoss.defaultBossModes) || [];
        const targetModeObj = db.battleModes[targetModeId];
        const bossFitsPveType = bossModes.some(
          (mId) => db.battleModes[mId] && db.battleModes[mId].pveType === pveType
        );

        if (!bossFitsPveType && defaultBossByPveType[pveType]) {
          selectBossById(defaultBossByPveType[pveType]);
          state.selectedBattleModeId = targetModeId;
          modeSelect.value = targetModeId;
        }

        clampAlliesToLobbyLimit(targetModeObj);
        renderCombatFriendsList();
        runOptimizerCalculation();
      });
    });

    function populateBossSelectOptions(list = bossCandidates) {
      bossSelect.innerHTML = list
        .map(
          (p) =>
            `<option value="${p.id}" ${
              p.id === state.selectedBossId ? "selected" : ""
            }>#${p.dex} ${p.name} (${p.types.map((t) => db.typeMeta[t].name).join("/")})</option>`
        )
        .join("");
    }

    const featuredBossIds = [
      "palkia_dmax",
      "dialga_dmax",
      "eternatus",
      "duraludon_gmax",
      "machamp_gmax",
      "rayquaza_mega",
      "groudon_primal",
      "mewtwo"
    ];

    const focusBossSearchBtn = document.getElementById("btn-focus-boss-search");
    if (focusBossSearchBtn) {
      focusBossSearchBtn.addEventListener("click", () => {
        bossSearchInput.focus();
        bossSearchInput.select();
      });
    }

    function renderBossQuickChips() {
      if (!bossQuickChips) return;
      bossQuickChips.innerHTML = featuredBossIds
        .map((id) => db.pokemon.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => {
          const isSelected = p.id === state.selectedBossId;
          return `
            <button
              type="button"
              data-quick-boss="${p.id}"
              class="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition shrink-0 border ${
                isSelected
                  ? "bg-cyan-500/25 text-cyan-200 border-cyan-400 shadow-sm"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }"
            >
              ${p.name}
            </button>
          `;
        })
        .join("");

      bossQuickChips.querySelectorAll("[data-quick-boss]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectBossById(btn.getAttribute("data-quick-boss"));
        });
      });
    }

    function selectBossById(bossId) {
      const boss = db.pokemon.find((p) => p.id === bossId);
      if (!boss) return;

      state.selectedBossId = boss.id;
      populateBossSelectOptions(bossCandidates);
      bossSelect.value = boss.id;

      // Actualizar tarjeta visual de Jefe Seleccionado
      const cardDex = document.getElementById("boss-selected-dex");
      const cardName = document.getElementById("boss-selected-name");
      const cardTypes = document.getElementById("boss-selected-types");
      const cardImg = document.getElementById("boss-selected-img");
      if (cardDex) cardDex.textContent = `#${boss.dex}`;
      if (cardName) cardName.textContent = boss.name;
      if (cardTypes) {
        cardTypes.innerHTML = boss.types.map((t) => renderTypeBadge(t)).join(" ");
      }
      if (cardImg) {
        cardImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${boss.dex}.png`;
        cardImg.alt = boss.name;
        cardImg.style.display = "block";
      }

      if (Array.isArray(boss.defaultBossModes) && boss.defaultBossModes.length > 0) {
        if (!boss.defaultBossModes.includes(state.selectedBattleModeId)) {
          state.selectedBattleModeId = boss.defaultBossModes[0];
          modeSelect.value = state.selectedBattleModeId;
          clampAlliesToLobbyLimit(getActiveBattleMode());
          renderCombatFriendsList();
        }
      }

      bossDropdown.classList.add("hidden");
      renderBossQuickChips();
      populateBossMoves();
      runOptimizerCalculation();
    }

    bossSearchInput.addEventListener("input", (e) => {
      const val = e.target.value;
      clearBossSearchBtn.classList.toggle("hidden", !val);
      const q = normalizeSearchText(val);

      if (!q) {
        populateBossSelectOptions(bossCandidates);
        bossDropdown.classList.add("hidden");
        return;
      }

      const matches = bossCandidates.filter((p) => {
        const typeNames = p.types.map((t) => db.typeMeta[t].name).join(" ");
        const haystack = normalizeSearchText(
          `${p.name} ${p.dex} #${p.dex} ${typeNames} ${p.roleTag || ""}`
        );
        return haystack.includes(q);
      });

      if (matches.length > 0) {
        populateBossSelectOptions(matches);
      }

      if (matches.length === 0) {
        bossDropdown.innerHTML = `
          <div class="p-3 text-xs text-slate-400 text-center bg-slate-950">
            No se encontró ningún Jefe con "${val}".
          </div>
        `;
      } else {
        bossDropdown.innerHTML = matches
          .slice(0, 10)
          .map((p) => {
            const typesHtml = p.types.map((t) => renderTypeBadge(t)).join(" ");
            const maxTag =
              p.maxForm === "eternamax" || p.maxForm === "gigantamax"
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40">🌀 G-Max</span>`
                : p.maxCapable
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">⚡ D-Max</span>`
                : p.isMega
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">🔥 Mega</span>`
                : "";
            return `
              <button
                type="button"
                data-pick-boss="${p.id}"
                class="w-full px-4 py-3 text-left bg-slate-950 hover:bg-slate-800 active:bg-cyan-950/40 flex items-center justify-between gap-3 transition border-b border-slate-800/80 last:border-b-0 cursor-pointer"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-mono text-xs font-bold text-cyan-400">#${p.dex}</span>
                    <span class="text-sm font-bold text-white">${p.name}</span>
                    ${maxTag}
                  </div>
                  <p class="text-[11px] text-slate-400 mt-0.5 truncate">${p.roleTag || ""}</p>
                </div>
                <div class="flex gap-1 shrink-0">${typesHtml}</div>
              </button>
            `;
          })
          .join("");
      }

      bossDropdown.classList.remove("hidden");

      bossDropdown.querySelectorAll("[data-pick-boss]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pickedId = btn.getAttribute("data-pick-boss");
          bossSearchInput.value = "";
          clearBossSearchBtn.classList.add("hidden");
          bossDropdown.classList.add("hidden");
          selectBossById(pickedId);
        });
      });
    });

    clearBossSearchBtn.addEventListener("click", () => {
      bossSearchInput.value = "";
      clearBossSearchBtn.classList.add("hidden");
      bossDropdown.classList.add("hidden");
      populateBossSelectOptions(bossCandidates);
      bossSearchInput.focus();
    });

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
      const bm = getActiveBattleMode();
      clampAlliesToLobbyLimit(bm);
      renderCombatFriendsList();
      runOptimizerCalculation();
    });

    bossSelect.addEventListener("change", () => {
      selectBossById(bossSelect.value);
    });

    bossFastSelect.addEventListener("change", () => {
      state.selectedBossFast = bossFastSelect.value;
      runOptimizerCalculation();
    });

    bossChargedSelect.addEventListener("change", () => {
      state.selectedBossCharged = bossChargedSelect.value;
      runOptimizerCalculation();
    });

    const partyPowerBadge = document.getElementById("party-power-status-badge");
    partyToggle.addEventListener("change", () => {
      state.partyPowerEnabled = partyToggle.checked;
      if (partyPowerBadge) {
        partyPowerBadge.textContent = state.partyPowerEnabled ? "x2.0 CARGADOS" : "DESACTIVADO";
        partyPowerBadge.className = state.partyPowerEnabled
          ? "px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-pink-500/25 text-pink-300 border border-pink-500/40"
          : "px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700";
      }
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
            ? "party-size-btn min-h-[40px] py-1.5 px-2 rounded-lg text-xs font-bold border border-indigo-500/50 bg-indigo-600/30 text-white"
            : "party-size-btn min-h-[40px] py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-400";
        });
        runOptimizerCalculation();
      });
    });

    // Botones visuales de Nivel de Amistad
    const friendshipBtns = document.querySelectorAll(".friendship-btn");
    const friendshipLabel = document.getElementById("friendship-multiplier-label");
    const friendshipDescMap = {
      none: "Sin Bonus (1.00x)",
      good: "+3% Daño (Buen Amigo)",
      great: "+5% Daño (Gran Amigo)",
      ultra: "+7% Daño (Ultra Amigo)",
      best: "+10% Daño (Mejor Amigo)"
    };

    friendshipBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-friendship-val");
        state.friendship = val;
        if (friendshipSelect) friendshipSelect.value = val;
        if (friendshipLabel) {
          friendshipLabel.textContent = friendshipDescMap[val] || "+10% Daño";
        }
        friendshipBtns.forEach((b) => {
          const isAct = b.getAttribute("data-friendship-val") === state.friendship;
          const isColSpan = b.getAttribute("data-friendship-val") === "best";
          b.className = isAct
            ? `friendship-btn p-2 rounded-lg text-xs font-bold border border-cyan-400/80 bg-cyan-500/25 text-cyan-200 shadow-sm${
                isColSpan ? " col-span-2 sm:col-span-2" : ""
              }`
            : `friendship-btn p-2 rounded-lg text-xs font-semibold border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200${
                isColSpan ? " col-span-2 sm:col-span-2" : ""
              }`;
        });
        runOptimizerCalculation();
      });
    });

    // Botones visuales de Mega Aliada
    const megaBtns = document.querySelectorAll(".mega-bonus-btn");
    megaBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-mega-val");
        state.megaBonus = val;
        if (megaSelect) megaSelect.value = val;
        megaBtns.forEach((b) => {
          const isAct = b.getAttribute("data-mega-val") === state.megaBonus;
          b.className = isAct
            ? "mega-bonus-btn p-2 rounded-lg text-xs font-bold border border-cyan-400/80 bg-cyan-500/25 text-cyan-200 shadow-sm"
            : "mega-bonus-btn p-2 rounded-lg text-xs font-semibold border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200";
        });
        runOptimizerCalculation();
      });
    });

    weatherToggle.addEventListener("change", () => {
      state.weatherBoost = weatherToggle.checked;
      runOptimizerCalculation();
    });

    // Steppers para Compañeros Aleatorios (Gente Random en la sala)
    const randomStepperBtns = document.querySelectorAll(".random-stepper-btn");
    randomStepperBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        const delta = Number(btn.getAttribute("data-delta")) || 0;
        const bm = getActiveBattleMode();
        const maxCompanions = Math.max(0, (bm.maxLobbyPlayers || 20) - 1);
        const currentTotalAllies =
          state.activeCombatFriendIds.length +
          state.randomAlliesHigh +
          state.randomAlliesMid +
          state.randomAlliesLow;

        if (delta > 0 && currentTotalAllies >= maxCompanions) {
          showNotification(
            `⚠️ Sala llena: ${bm.name} permite máximo ${bm.maxLobbyPlayers} jugadores en total (Tú + ${maxCompanions} aliados).`,
            "warning"
          );
          return;
        }

        if (target === "random-allies-high") {
          state.randomAlliesHigh = Math.max(0, state.randomAlliesHigh + delta);
        } else if (target === "random-allies-mid") {
          state.randomAlliesMid = Math.max(0, state.randomAlliesMid + delta);
        } else if (target === "random-allies-low") {
          state.randomAlliesLow = Math.max(0, state.randomAlliesLow + delta);
        }

        clampAlliesToLobbyLimit(bm);
        runOptimizerCalculation();
      });
    });

    runBtn.addEventListener("click", () => {
      runOptimizerCalculation();
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#input-boss-search") && !e.target.closest("#boss-search-dropdown")) {
        bossDropdown.classList.add("hidden");
      }
      const speciesDropdown = document.getElementById("species-search-dropdown");
      if (
        speciesDropdown &&
        !e.target.closest("#input-species-search") &&
        !e.target.closest("#species-search-dropdown")
      ) {
        speciesDropdown.classList.add("hidden");
      }
    });

    populateBossSelectOptions(bossCandidates);
    renderBossQuickChips();
    selectBossById(state.selectedBossId);
  }

  function runOptimizerCalculation() {
    const allBoxList = global.PokeBoxManager.getAll("all");
    const plan = global.PokeOptimizerEngine.calculateBattlePlan(
      allBoxList,
      state.selectedBossId,
      state.selectedBattleModeId,
      {
        bossFastMove: state.selectedBossFast,
        bossChargedMove: state.selectedBossCharged,
        partyPowerEnabled: state.partyPowerEnabled,
        partySize: state.partySize,
        friendship: state.friendship,
        megaBonus: state.megaBonus,
        weatherBoost: state.weatherBoost,
        randomAllies: {
          high: state.randomAlliesHigh || 0,
          mid: state.randomAlliesMid || 0,
          low: state.randomAlliesLow || 0
        }
      },
      state.activeCombatFriendIds
    );

    renderBossSummary(plan.bossProfile, plan.battleMode);
    renderCalculationResults(plan);
  }

  function renderBossSummary(bossProfile, battleMode) {
    document.getElementById("battle-mode-desc").textContent = battleMode.description;

    // Sincronizar pestañas rápidas de categoría PvE (raid, megaraid, dynamax, gigantamax)
    const activePveType =
      battleMode.pveType || (battleMode.category === "max" ? "dynamax" : "raid");
    document.querySelectorAll(".pve-type-btn").forEach((btn) => {
      const bType = btn.getAttribute("data-pve-type");
      const isActive = bType === activePveType;
      if (bType === "raid") {
        btn.className = isActive
          ? "pve-type-btn p-2 rounded-xl border border-cyan-400 bg-cyan-500/20 text-white transition text-left shadow-sm"
          : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-cyan-500/50 transition text-left";
      } else if (bType === "megaraid") {
        btn.className = isActive
          ? "pve-type-btn p-2 rounded-xl border border-purple-400 bg-purple-500/20 text-white transition text-left shadow-sm"
          : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-purple-500/50 transition text-left";
      } else if (bType === "dynamax") {
        btn.className = isActive
          ? "pve-type-btn p-2 rounded-xl border border-pink-500 bg-pink-500/20 text-white transition text-left shadow-sm"
          : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-pink-500/50 transition text-left";
      } else if (bType === "gigantamax") {
        btn.className = isActive
          ? "pve-type-btn p-2 rounded-xl border border-amber-400 bg-amber-500/20 text-white transition text-left shadow-sm"
          : "pve-type-btn p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:border-amber-500/50 transition text-left";
      }
    });

    const catPill = document.getElementById("battle-category-pill");
    const limitsChip = document.getElementById("pve-limits-chip");

    if (activePveType === "gigantamax") {
      catPill.textContent = "GIGAMAX · 3 POKÉ MAX · 40 JUG.";
      catPill.className =
        "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase bg-amber-500/25 text-amber-300 border border-amber-500/50 shrink-0";
      if (limitsChip) {
        limitsChip.textContent = "3 Poké Max/jug. · Sala Máx 40 (10 Patrullas de 4)";
      }
    } else if (activePveType === "dynamax") {
      catPill.textContent = "DINAMAX · 3 POKÉ MAX · 4 JUG.";
      catPill.className =
        "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase bg-pink-500/25 text-pink-300 border border-pink-500/50 shrink-0";
      if (limitsChip) {
        limitsChip.textContent = "3 Poké Max/jug. · Sala Máx 4 Jug.";
      }
    } else if (activePveType === "megaraid") {
      catPill.textContent = "MEGA RAID · 6 POKÉ · 20 JUG.";
      catPill.className =
        "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase bg-purple-500/25 text-purple-300 border border-purple-500/50 shrink-0";
      if (limitsChip) {
        limitsChip.textContent = "6 Poké/jug. (Máx 1 Mega) · Sala Máx 20 Jug.";
      }
    } else {
      catPill.textContent = "RAID · 6 POKÉ · 20 JUG.";
      catPill.className =
        "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0";
      if (limitsChip) {
        limitsChip.textContent = "6 Poké/jug. (Máx 1 Mega) · Sala Máx 20 Jug.";
      }
    }

    const partyContainer = document.getElementById("party-power-container");
    if (partyContainer) {
      partyContainer.classList.toggle("opacity-45", !battleMode.allowPartyPower);
    }

    const megaContainer = document.getElementById("mega-bonus-container");
    const megaNote = document.getElementById("mega-bonus-mode-note");
    if (megaContainer) {
      const megaAllowed = battleMode.allowMegaBonus !== false;
      megaContainer.classList.toggle("opacity-45", !megaAllowed);
      if (megaNote) {
        megaNote.textContent = megaAllowed
          ? "Activo en Raids/Mega Raids"
          : "No disponible en Dinamax/Gigamax";
        megaNote.className = megaAllowed
          ? "text-[10px] font-mono text-cyan-400"
          : "text-[10px] font-mono text-amber-400";
      }
    }

    syncLobbyOccupancyUI(battleMode);

    document.getElementById("boss-dex-label").textContent = `#${bossProfile.species.dex}`;
    document.getElementById("boss-name-display").textContent = bossProfile.species.name;
    document.getElementById("boss-types-badges").innerHTML = bossProfile.species.types
      .map((t) => renderTypeBadge(t))
      .join(" ");

    document.getElementById("boss-hp-display").textContent = `${bossProfile.hp.toLocaleString()} HP`;
    document.getElementById("boss-time-display").textContent = `${bossProfile.timeLimitSec}s`;
    document.getElementById("boss-teamsize-display").textContent =
      battleMode.category === "max"
        ? `${battleMode.teamSize} Poké Max`
        : `${battleMode.teamSize} Poké Raid`;

    const maxLobbyEl = document.getElementById("boss-maxlobby-display");
    if (maxLobbyEl) {
      maxLobbyEl.textContent =
        activePveType === "gigantamax"
          ? `40 (10x4)`
          : `${battleMode.maxLobbyPlayers} Jug.`;
    }

    const weakContainer = document.getElementById("boss-weaknesses-list");
    weakContainer.innerHTML = bossProfile.weaknesses
      .map(
        (w) =>
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
            w.meta.bg
          } ${w.meta.text} ${w.meta.border}">
            <span>${w.name}</span>
            <strong class="font-mono ${
              w.isDoubleWeakness ? "text-amber-300 underline" : "opacity-90"
            }">x${w.multiplier}</strong>
          </span>`
      )
      .join("");
  }

  function renderCalculationResults(plan) {
    const { personalMetrics, scenarios, team, battleMode, bossProfile, missingMaxWarning, friendsBreakdown, randomMetrics } = plan;

    // Actualizar resumen visual de Gente Random
    const randomDamageLabel = document.getElementById("random-allies-damage-total");
    if (randomDamageLabel && randomMetrics) {
      randomDamageLabel.textContent = `+${randomMetrics.pct}% Daño Estimado`;
    }

    const verdictBadge = document.getElementById("verdict-badge");
    if (personalMetrics.canBeatWithFriends) {
      if (randomMetrics && randomMetrics.totalCount > 0) {
        verdictBadge.textContent = "🎉 ¡VICTORIA CON TU GRUPO + RANDOMS!";
      } else if (friendsBreakdown.length > 0) {
        verdictBadge.textContent = "🎉 ¡VICTORIA CON TU GRUPO DE AMIGOS!";
      } else {
        verdictBadge.textContent = "🏆 ¡SOLABLE EN SOLITARIO!";
      }
      verdictBadge.className =
        "px-3 py-1.5 rounded-xl font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-emerald-500/25 text-emerald-300 border border-emerald-500/50";
    } else if (scenarios.standard.count <= 2) {
      verdictBadge.textContent = `✅ DÚO / TRÍO FACTIBLE (+${scenarios.hardcore.count} a +${scenarios.standard.count})`;
      verdictBadge.className =
        "px-3 py-1.5 rounded-xl font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40";
    } else {
      verdictBadge.textContent = `⚔️ REQUIERE GRUPO (+${scenarios.hardcore.count} Hardcore)`;
      verdictBadge.className =
        "px-3 py-1.5 rounded-xl font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-pink-500/25 text-pink-300 border border-pink-500/50";
    }

    // Porcentaje personal y grupal
    document.getElementById("personal-damage-pct").textContent = `${personalMetrics.combinedGroupPct}%`;
    document.getElementById("personal-damage-raw").textContent = `(${personalMetrics.combinedGroupDamage.toLocaleString()} / ${bossProfile.hp.toLocaleString()} HP)`;
    document.getElementById("personal-damage-bar").style.width = `${Math.min(
      100,
      personalMetrics.combinedGroupPct
    )}%`;

    document.getElementById("metric-team-dps").textContent = `${personalMetrics.teamDPS} /s`;
    document.getElementById("metric-team-tdo").textContent = `${personalMetrics.teamTDO.toLocaleString()} HP`;
    document.getElementById("metric-active-mult").textContent = `x${personalMetrics.activeMultiplier}`;

    document.getElementById("direct-recommendation-text").textContent = plan.directRecommendation;

    // Sección de desglose de participantes (Yo + Amigos Fijos + Gente Random)
    const friendsContributionWrap = document.getElementById("friends-contribution-summary");
    if (friendsContributionWrap) {
      const hasRandoms = randomMetrics && randomMetrics.totalCount > 0;
      if (friendsBreakdown.length > 0 || hasRandoms) {
        friendsContributionWrap.classList.remove("hidden");

        const randomTiersText = [];
        if (randomMetrics.highCount > 0) randomTiersText.push(`${randomMetrics.highCount} Nv. Alto`);
        if (randomMetrics.midCount > 0) randomTiersText.push(`${randomMetrics.midCount} Nv. Medio`);
        if (randomMetrics.lowCount > 0) randomTiersText.push(`${randomMetrics.lowCount} Nv. Bajo`);

        friendsContributionWrap.innerHTML = `
          <div class="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 space-y-2.5">
            <span class="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>👥 Desglose de Jugadores en tu Sala:</span>
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              <div class="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
                <span class="text-slate-400">👤 Tu Equipo Personal:</span>
                <strong class="text-cyan-300 block font-mono text-sm">${personalMetrics.personalDamagePct}% (${personalMetrics.personalDamage.toLocaleString()} HP)</strong>
              </div>
              ${friendsBreakdown
                .map((f) => {
                  const warning = !f.hasPokemon
                    ? '<span class="text-rose-400 block text-[10px]">Sin Pokémon en su caja</span>'
                    : "";
                  return `
                  <div class="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
                    <span class="text-slate-400">👥 ${f.friend.name}:</span>
                    <strong class="text-pink-300 block font-mono text-sm">${f.performance.pct}% (${f.performance.damage.toLocaleString()} HP)</strong>
                    ${warning}
                  </div>
                `;
                })
                .join("")}
              ${hasRandoms ? `
                <div class="p-2 rounded-lg bg-slate-900/80 border border-cyan-500/40 text-xs">
                  <span class="text-slate-400">🎲 Randoms (${randomTiersText.join(", ")}):</span>
                  <strong class="text-emerald-300 block font-mono text-sm">+${randomMetrics.pct}% (${randomMetrics.totalDamage.toLocaleString()} HP)</strong>
                </div>
              ` : ""}
            </div>
          </div>
        `;
      } else {
        friendsContributionWrap.classList.add("hidden");
        friendsContributionWrap.innerHTML = "";
      }
    }

    // Escenarios claros
    document.getElementById("scenario-hardcore-count").textContent =
      scenarios.hardcore.count === 0 ? "0 (¡Ya ganas!)" : `+${scenarios.hardcore.count}`;
    document.getElementById("scenario-hardcore-pct").textContent =
      scenarios.hardcore.count === 0 ? "HP Cubierto" : `Bajan ~${scenarios.hardcore.pctPerPlayer}% c/u`;

    document.getElementById("scenario-standard-count").textContent =
      scenarios.standard.count === 0 ? "0 (¡Ya ganas!)" : `+${scenarios.standard.count}`;
    document.getElementById("scenario-standard-pct").textContent =
      scenarios.standard.count === 0 ? "HP Cubierto" : `Bajan ~${scenarios.standard.pctPerPlayer}% c/u`;

    document.getElementById("scenario-casual-count").textContent =
      scenarios.casual.count === 0 ? "0 (¡Ya ganas!)" : `+${scenarios.casual.count}`;
    document.getElementById("scenario-casual-pct").textContent =
      scenarios.casual.count === 0 ? "HP Cubierto" : `Bajan ~${scenarios.casual.pctPerPlayer}% c/u`;

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

    const teamGrid = document.getElementById("recommended-team-grid");
    if (team.length === 0) {
      teamGrid.innerHTML = `
        <div class="col-span-full p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
          Añade Pokémon a tu Caja Personal para ver tu alineación ideal contra este jefe.
        </div>
      `;
      return;
    }

    teamGrid.innerHTML = team
      .map((item) => {
        const entry = item.boxEntry;
        const effBadge =
          item.bestTypeEff >= 2.5
            ? `<span class="px-2 py-0.5 rounded font-mono text-[10px] font-extrabold bg-amber-500/25 text-amber-300 border border-amber-500/50">Doble x${item.bestTypeEff}</span>`
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
          <div class="p-3.5 sm:p-4 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-pink-500/50 transition flex flex-col justify-between shadow-lg">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2.5">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border truncate ${item.roleBadgeClass}">
                  ${item.roleLabel}
                </span>
                ${effBadge}
              </div>

              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-inner">
                  <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entry.species.dex}.png" alt="${entry.nickname}" class="w-full h-full object-contain filter drop-shadow" onerror="this.style.display='none'" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <h4 class="text-sm sm:text-base font-extrabold text-white truncate">
                      ${entry.nickname}
                      ${entry.isShadow ? '<span class="text-purple-400 text-xs font-semibold">(Oscuro)</span>' : ""}
                    </h4>
                    <span class="font-mono text-xs font-bold text-cyan-300 shrink-0">PC ${entry.cp}</span>
                  </div>
                  <div class="text-[11px] font-mono text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>${entry.levelBadge}</span>
                    <span class="text-slate-600">·</span>
                    <span class="text-amber-300 font-bold">IV ${entry.ivPct}%</span>
                    ${entry.ownerName && entry.ownerName !== "Tú" ? `<span class="text-indigo-300 text-[10px] bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-500/30">👤 ${entry.ownerName}</span>` : ""}
                  </div>
                </div>
              </div>

              <div class="mt-3 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1 text-xs text-slate-300">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 flex items-center gap-1">
                    <span class="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">Rápido</span>
                  </span>
                  <span class="font-semibold text-slate-200">${entry.fastMoveObj.name} <span class="text-slate-500 font-mono text-[10px]">(${entry.fastMoveObj.durationMs / 1000}s)</span></span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 flex items-center gap-1">
                    <span class="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">Cargado</span>
                  </span>
                  <span class="font-semibold text-cyan-200">${entry.chargedMoveObj.name}</span>
                </div>
              </div>

              ${maxDetailRow}
            </div>

            <div class="mt-3 pt-2.5 border-t border-slate-800/90 grid grid-cols-3 text-center font-mono text-xs">
              <div class="p-1 rounded bg-slate-900/50">
                <span class="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">DPS</span>
                <strong class="text-cyan-300 font-bold">${item.dps}/s</strong>
              </div>
              <div class="p-1 rounded bg-slate-900/50">
                <span class="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">TDO</span>
                <strong class="text-pink-400 font-bold">${item.tdo}</strong>
              </div>
              <div class="p-1 rounded bg-slate-900/50">
                <span class="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Aguante</span>
                <strong class="text-emerald-400 font-bold">${item.timeToFaintSec}s</strong>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ==========================================================================
  // CATÁLOGO POKÉDEX META CON ACCIÓN RÁPIDA (VISTA 3)
  // ==========================================================================
  function initPokedexSearch() {
    const searchInput = document.getElementById("input-pokedex-search");
    const clearBtn = document.getElementById("btn-clear-pokedex-search");
    const filterBtns = document.querySelectorAll(".dex-filter-btn");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.dexFilterQuery = e.target.value;
        clearBtn.classList.toggle("hidden", !state.dexFilterQuery);
        renderPokedexCatalog();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.dexFilterQuery = "";
        clearBtn.classList.add("hidden");
        renderPokedexCatalog();
      });
    }

    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.dexFilterTag = btn.getAttribute("data-dex-filter");
        filterBtns.forEach((b) => {
          const active = b.getAttribute("data-dex-filter") === state.dexFilterTag;
          b.className = active
            ? "dex-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40 shrink-0"
            : "dex-filter-btn px-3 py-1 rounded-full text-xs font-semibold bg-slate-950 text-slate-400 border border-slate-800 hover:text-pink-300 shrink-0";
        });
        renderPokedexCatalog();
      });
    });

    renderPokedexCatalog();
  }

  function renderPokedexCatalog() {
    const db = global.POKE_DB;
    const catalogGrid = document.getElementById("pokedex-catalog-grid");
    const badgeTotal = document.getElementById("db-total-species-badge");
    if (!catalogGrid) return;

    const q = normalizeSearchText(state.dexFilterQuery);
    const filtered = db.pokemon.filter((p) => {
      if (
        state.dexFilterTag === "gmax" &&
        p.maxForm !== "gigantamax" &&
        p.maxForm !== "eternamax"
      ) {
        return false;
      }
      if (state.dexFilterTag === "dmax" && p.maxForm !== "dynamax") {
        return false;
      }
      if (state.dexFilterTag === "mega" && !p.isMega) {
        return false;
      }

      if (!q) return true;
      const typeNames = p.types.map((t) => db.typeMeta[t].name).join(" ");
      const gmaxMoveName =
        p.fixedGmaxMove && db.gmaxMoves[p.fixedGmaxMove]
          ? db.gmaxMoves[p.fixedGmaxMove].name
          : "";
      const haystack = normalizeSearchText(
        `${p.name} #${p.dex} ${typeNames} ${p.roleTag || ""} ${p.notes || ""} ${gmaxMoveName}`
      );
      return haystack.includes(q);
    });

    if (badgeTotal) {
      badgeTotal.textContent = `${filtered.length} / ${db.pokemon.length} Especies`;
    }

    if (filtered.length === 0) {
      catalogGrid.innerHTML = `
        <div class="col-span-full p-8 rounded-2xl bg-slate-950/80 border border-dashed border-slate-700 text-center text-xs text-slate-400">
          No hay ningún Pokémon en la Base de Datos que coincida con tu búsqueda.
        </div>
      `;
      return;
    }

    catalogGrid.innerHTML = filtered
      .map((p) => {
        const typeBadges = p.types.map((t) => renderTypeBadge(t)).join(" ");
        const gmaxInfo =
          p.fixedGmaxMove && db.gmaxMoves[p.fixedGmaxMove]
            ? `<div class="mt-2 px-2.5 py-1 rounded-lg bg-pink-500/15 border border-pink-500/40 text-[11px] text-pink-300 font-semibold">🌀 Mov. Max Exclusivo: ${db.gmaxMoves[p.fixedGmaxMove].name}</div>`
            : p.maxCapable
            ? `<div class="mt-2 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[11px] text-indigo-300">⚡ Apto para Combates Dinamax</div>`
            : "";

        const quickAddBtn = !p.bossOnly
          ? `<button
              type="button"
              data-quick-add-box="${p.id}"
              class="mt-3 w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition"
            >
              ➕ Cargar en Formulario de Caja
            </button>`
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
            <div>
              <div class="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-3 text-center font-mono text-xs">
                <div><span class="text-[10px] text-slate-500 block">ATQ</span><strong class="text-rose-400">${p.baseStats.atk}</strong></div>
                <div><span class="text-[10px] text-slate-500 block">DEF</span><strong class="text-cyan-400">${p.baseStats.def}</strong></div>
                <div><span class="text-[10px] text-slate-500 block">PS</span><strong class="text-emerald-400">${p.baseStats.sta}</strong></div>
              </div>
              ${quickAddBtn}
            </div>
          </article>
        `;
      })
      .join("");

    catalogGrid.querySelectorAll("[data-quick-add-box]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const speciesId = btn.getAttribute("data-quick-add-box");
        resetBoxForm();
        const speciesSelect = document.getElementById("select-box-species");
        speciesSelect.value = speciesId;
        speciesSelect.dispatchEvent(new Event("change"));
        switchTab("tab-box");
        document.getElementById("pokemon-box-form").scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    global.POKE_APP_INITIALIZED = true;
    initTabs();
    initBoxForm();
    initFriendModalEvents();
    populateOwnerSelectors();
    initOptimizerControls();
    initPokedexSearch();
    renderMyBoxCards();
    runOptimizerCalculation();
  });
})(typeof window !== "undefined" ? window : globalThis);
