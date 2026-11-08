# PokéRaid & Max Optimizer ⚔️🌀

Aplicación web interactiva para **Pokémon GO** que gestiona tu **Caja de Pokémon** personal y la de tus **Amigos Fijos** (`localStorage`), calculando matemáticamente el **Equipo Ideal**, tu **Contribución de Daño (DPS y TDO)** y el **Número Mínimo de Jugadores Adicionales** necesarios en Incursiones (Nivel 5, Mega, Primigenias, Oscuras, Élite) y Combates Max (**Dinamax** y **Gigamax**).

## ✨ Características Principales

- **Base de Datos Meta Actualizada (`data/pokemon_db.js`):**
  - Incluye a **Eternatus** (*Cañón Dinamax* y *Rayo Infinito*, más su forma jefe *Eternamax*), **Duraludon Gigamax** (*Gigaesquirla*), iniciales de Galar Gigamax (**Rillaboom**, **Cinderace**, **Inteleon**), iniciales de Kanto Gigamax (**Charizard**, **Blastoise**, **Venusaur**), **Gengar**, **Toxtricity**, **Machamp**, **Lapras**, **Kingler**, **Corviknight** y **Urshifu (Brusco/Fluido) Gigamax**.
  - Incluye a **Zacian (Espada Suprema)**, **Zamazenta (Escudo Supremo)**, **Mega Rayquaza**, **Groudon y Kyogre Primigenios**, **Necrozma Melena Crepuscular / Alas del Alba**, **Kyurem Negro / Blanco**, **Mewtwo Oscuro**, **Excadrill Dinamax**, **Blissey Dinamax** y los principales counters del meta.

- **Módulo 1: Mi Caja y Amigos Fijos (`js/box.js`):**
  - **Cálculo Automático de Nivel por PC**: Introduce directamente los **Puntos de Combate (PC)** y los IVs de tu Pokémon; la web calcula su nivel exacto (de 1.0 a 51.0 en pasos de 0.5) y estadísticas reales.
  - **Plantillas Rápidas 1-Tap**: Botones instantáneos para configurar en 1 toque (`⭐ 100% Nv. 50`, `⚔️ Raid Nv. 40`, `🌱 Atrapado Nv. 20`).
  - **Equipos de Amigos Fijos**: Registra a tus amigos habituales y guarda sus Pokémon reales para simular incursiones juntos.
  - **Backup JSON y Ordenación**: Ordena por PC, IV%, Nivel o Pokédex, y exporta/importa copias de seguridad en `.json`.

- **Módulo 2 y 3: Motor Matemático PvE y Simulación Co-op (`js/engine.js` & `js/app.js`):**
  - **4 Modalidades PvE con Reglas y Capacidades Oficiales**:
    - **⚔️ Raids (Nv. 1, 3, 5, Oscuras, Élite)**: **6 Pokémon/jugador** (máx. 1 Mega/Primigenio por equipo, permite re-lobby) · **Sala máx. 20 jugadores**.
    - **🧬 Mega Raids (Mega y Mega Legendaria / Primigenia)**: **6 Pokémon/jugador** (máx. 1 Mega/Primigenio por equipo, permite re-lobby) · **Sala máx. 20 jugadores**.
    - **⚡ Combates Dinamax (Nv. 1 a Nv. 5)**: **3 Pokémon Max/jugador** (sin Megas, sin re-lobby, sin Party Power) · **Sala máx. 4 jugadores** (1 patrulla).
    - **🌀 Combates Gigamax (Nv. 6)**: **3 Pokémon Max/jugador** (sin Megas, sin re-lobby, sin Party Power) · **Sala máx. 40 jugadores** (hasta 10 patrullas de 4).
  - Fórmula oficial de daño de Pokémon GO con `CPM`, `STAB (1.2x)`, debilidades elementales (`1.6x` y `2.56x`), Amistad, Clima, Mega activa y **Juego en Equipo (Party Power de 2, 3 o 4 jugadores)**.
  - **Compañeros Random por Nivel**: Añade jugadores desconocidos que entren a la sala categorizándolos en **Nivel Alto (Nv. 40-50)**, **Nivel Medio (Nv. 30-39)** o **Nivel Bajo (Nv. 20-29)** para sumar su daño estimado al grupo.
  - **Simulación Co-op Real**: Combina tu equipo + equipos de amigos fijos + compañeros random en tiempo real.
  - **Desglose Ultra-Claro de Compañeros Necesarios**:
    - *🔥 Hardcore*: Compañeros con meta Nv. 40-50 y Party Power (~35% daño c/u).
    - *⚡ Estándar*: Compañeros de nivel medio Nv. 30-35 (~20% daño c/u).
    - *🛡️ Casual*: Compañeros con recomendados del juego (~10% daño c/u).
  - Distinción automática entre **Incursiones (Top 6 Atacantes)** y **Combates Max (Patrulla de 3: 2 Tanques/Cargadores de 0.5s + 1 Rematador Max)**.

## 📱 Optimización Móvil

- Barra de navegación inferior fija para uso cómodo con una sola mano.
- Prevención de zoom automático en iOS/Android y controles táctiles de 44px de altura mínima.

## 🚀 Uso

Abre directamente el archivo `index.html` en cualquier navegador moderno o actívalo como GitHub Pages desde la pestaña *Settings > Pages* de tu repositorio.
