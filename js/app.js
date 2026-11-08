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
    selectedBossId: "eternatus",
    selectedBossFast: "",
    selectedBossCharged: "",
    partyPowerEnabled: true,
    partySize: 2,
    friendship: "best",
    megaBonus: "none",
    weatherBoost: false,
    boxFilterQuery: "",
    boxFilterTag: "all",
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
      cb.addEventListener("change", (e) => {
        const fId = cb.getAttribute("data-combat-friend-id");
        if (cb.checked) {
          if (!state.activeCombatFriendIds.includes(fId)) {
            state.activeCombatFriendIds.push(fId);
          }
        } else {
          state.activeCombatFriendIds = state.activeCombatFriendIds.filter((id) => id !== fId);
        }
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
      if (type === "hundo_50") {
        ivAtkInput.value = 15;
        ivDefInput.value = 15;
        ivStaInput.value = 15;
        presetSelect.value = "maxed"; // Nv 50
        customCpInput.value = "";
      } else if (type === "raid_40") {
        ivAtkInput.value = 15;
        ivDefInput.value = 14;
        ivStaInput.value = 14;
        presetSelect.value = "no_xl"; // Nv 40
        customCpInput.value = "";
      } else if (type === "caught_20") {
        ivAtkInput.value = 12;
        ivDefInput.value = 12;
        ivStaInput.value = 12;
        presetSelect.value = "caught"; // Nv 20-25
        customCpInput.value = "";
      } else if (type === "hundo_only") {
        ivAtkInput.value = 15;
        ivDefInput.value = 15;
        ivStaInput.value = 15;
      }
      updateFormLivePreview();
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

    function renderSpeciesAutocompleteDropdown(matches) {
      if (!matches || matches.length === 0) {
        speciesDropdown.innerHTML = `
          <div class="p-3 text-xs text-slate-400 text-center">
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
              ? `<span class="text-[10px] font-bold text-pink-400">🌀 G-Max</span>`
              : p.maxCapable
              ? `<span class="text-[10px] font-semibold text-indigo-300">⚡ D-Max</span>`
              : "";
          return `
            <button
              type="button"
              data-pick-species="${p.id}"
              class="w-full px-3.5 py-2.5 text-left hover:bg-cyan-500/15 active:bg-cyan-500/25 flex items-center justify-between gap-2 transition"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-[11px] text-slate-400">#${p.dex}</span>
                  <span class="text-xs sm:text-sm font-bold text-white truncate">${p.name}</span>
                  ${maxTag}
                </div>
                <p class="text-[10px] text-slate-400 truncate">${p.roleTag || ""}</p>
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
          const pickedSpecies = global.PokeBoxManager.getSpeciesById(pickedId);
          speciesSearchInput.value = pickedSpecies ? pickedSpecies.name : "";
          clearSpeciesBtn.classList.toggle("hidden", !speciesSearchInput.value);
          populateSpeciesOptions("", false);
          speciesSelect.value = pickedId;
          onSpeciesChange();
          speciesDropdown.classList.add("hidden");
        });
      });
    }

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

      const payload = {
        ownerId,
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

    populateSpeciesOptions("", false);
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

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-6 sm:p-8 rounded-2xl bg-slate-950/80 border border-dashed border-slate-700 text-center space-y-2">
          <p class="text-sm font-bold text-slate-300">No se encontraron Pokémon en esta selección</p>
          <p class="text-xs text-slate-400">Guarda un Pokémon con el formulario o pulsa <strong>"⚡ Demo"</strong> arriba a la derecha.</p>
        </div>
      `;
      return;
    }

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
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    ${ownerBadge}
                    <span class="font-mono text-[11px] text-slate-400">#${item.species.dex}</span>
                    <span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">PC ${item.cp}</span>
                    <span class="font-mono text-[11px] text-slate-400">${item.levelBadge}</span>
                  </div>
                  <h3 class="text-sm sm:text-base font-extrabold text-white mt-1 truncate">${item.nickname}</h3>
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

    modeSelect.innerHTML = Object.values(db.battleModes)
      .map(
        (m) =>
          `<option value="${m.id}" ${
            m.id === state.selectedBattleModeId ? "selected" : ""
          }>${m.name} (${m.bossHP.toLocaleString()} HP)</option>`
      )
      .join("");

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
      "eternatus",
      "duraludon_gmax",
      "eternatus_eternamax",
      "groudon_primal",
      "rayquaza_mega",
      "rillaboom_gmax",
      "gengar_gmax",
      "mewtwo"
    ];

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
              class="px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition shrink-0 border ${
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

      if (Array.isArray(boss.defaultBossModes) && boss.defaultBossModes.length > 0) {
        if (!boss.defaultBossModes.includes(state.selectedBattleModeId)) {
          state.selectedBattleModeId = boss.defaultBossModes[0];
          modeSelect.value = state.selectedBattleModeId;
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
          <div class="p-3 text-xs text-slate-400 text-center">
            No se encontró ningún Jefe con "${val}".
          </div>
        `;
      } else {
        bossDropdown.innerHTML = matches
          .slice(0, 10)
          .map((p) => {
            const typesHtml = p.types.map((t) => renderTypeBadge(t)).join(" ");
            return `
              <button
                type="button"
                data-pick-boss="${p.id}"
                class="w-full px-3.5 py-2.5 text-left hover:bg-cyan-500/15 active:bg-cyan-500/25 flex items-center justify-between gap-2 transition"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono text-[11px] text-slate-400">#${p.dex}</span>
                    <span class="text-xs sm:text-sm font-bold text-white truncate">${p.name}</span>
                  </div>
                  <p class="text-[10px] text-slate-400 truncate">${p.roleTag || ""}</p>
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
          const pickedBoss = db.pokemon.find((p) => p.id === pickedId);
          bossSearchInput.value = pickedBoss ? pickedBoss.name : "";
          clearBossSearchBtn.classList.toggle("hidden", !bossSearchInput.value);
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
            ? "party-size-btn min-h-[40px] py-1.5 px-2 rounded-lg text-xs font-bold border border-indigo-500/50 bg-indigo-600/30 text-white"
            : "party-size-btn min-h-[40px] py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-400";
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
    populateBossMoves();
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
        weatherBoost: state.weatherBoost
      },
      state.activeCombatFriendIds
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
        "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase bg-pink-500/25 text-pink-300 border border-pink-500/50 shrink-0";
    } else {
      catPill.textContent = "INCURSIÓN (6 POKÉMON)";
      catPill.className =
        "px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0";
    }

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
        ? `3 Max (Patrulla ${battleMode.squadSize || 4})`
        : `6 Raid (Máx ${battleMode.maxLobbyPlayers})`;

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
    const { personalMetrics, scenarios, team, battleMode, bossProfile, missingMaxWarning, friendsBreakdown } = plan;

    const verdictBadge = document.getElementById("verdict-badge");
    if (personalMetrics.canBeatWithFriends) {
      if (friendsBreakdown.length > 0) {
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

    // Sección de amigos fijos activos aportando al combate
    const friendsContributionWrap = document.getElementById("friends-contribution-summary");
    if (friendsContributionWrap) {
      if (friendsBreakdown.length > 0) {
        friendsContributionWrap.classList.remove("hidden");
        friendsContributionWrap.innerHTML = `
          <div class="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 space-y-2">
            <span class="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>👥 Aporte de tus Amigos Fijos Seleccionados:</span>
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div class="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
                <span class="text-slate-400">👤 Tu Aporte Personal:</span>
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
          <div class="p-3.5 sm:p-4 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-pink-500/50 transition flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border truncate ${item.roleBadgeClass}">
                  ${item.roleLabel}
                </span>
                ${effBadge}
              </div>

              <div class="flex items-baseline justify-between gap-2">
                <h4 class="text-sm sm:text-base font-extrabold text-white truncate">
                  ${entry.nickname}
                  ${entry.isShadow ? '<span class="text-purple-400 text-xs">(Oscuro)</span>' : ""}
                </h4>
                <span class="font-mono text-xs font-bold text-cyan-300 shrink-0">PC ${entry.cp} · ${entry.levelBadge}</span>
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
