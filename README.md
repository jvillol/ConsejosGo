# PokéRaid & Max Optimizer ⚔️🌀

Aplicación web interactiva para **Pokémon GO** que gestiona tu **Caja de Pokémon** personal y la de tus **Amigos Fijos** (`localStorage`), calculando matemáticamente el **Equipo Ideal**, tu **Contribución de Daño (DPS y TDO)** y el **Número Mínimo de Jugadores Adicionales** necesarios en Incursiones (Nivel 5, Mega, Primigenias, Oscuras, Élite) y Combates Max (**Dinamax** y **Gigamax**).

## ✨ Características Principales

- **Base de Datos Meta Actualizada (`data/pokemon_db.js`):**
  - Incluye a **Eternatus** (*Cañón Dinamax* y *Rayo Infinito*, más su forma jefe *Eternamax*), **Duraludon Gigamax** (*Gigaesquirla*), iniciales de Galar Gigamax (**Rillaboom**, **Cinderace**, **Inteleon**), iniciales de Kanto Gigamax (**Charizard**, **Blastoise**, **Venusaur**), **Gengar**, **Toxtricity**, **Machamp**, **Lapras**, **Kingler**, **Corviknight** y **Urshifu (Brusco/Fluido) Gigamax**.
  - Incluye a **Zacian (Espada Suprema)**, **Zamazenta (Escudo Supremo)**, **Mega Rayquaza**, **Groudon y Kyogre Primigenios**, **Necrozma Melena Crepuscular / Alas del Alba**, **Kyurem Negro / Blanco**, **Mewtwo Oscuro**, **Excadrill Dinamax**, **Blissey Dinamax** y los principales counters del meta.

- **Módulo 1: Mi Caja y Amigos Fijos (`js/box.js`):**
  - **Plantillas Rápidas 1-Tap**: Botones instantáneos para configurar en 1 toque (`⭐ 100% Nv. 50`, `⚔️ Raid Nv. 40`, `🌱 Atrapado Nv. 20`).
  - **Equipos de Amigos Fijos**: Registra a tus amigos reales y guarda sus Pokémon con sus IVs y ataques para simular incursiones en grupo.
  - Búsqueda con lupa y autocompletado en todos los apartados (insensible a tildes y mayúsculas).
  - Persistencia automática en `localStorage`.

- **Módulo 2 y 3: Motor Matemático PvE y Simulación Co-op (`js/engine.js` & `js/app.js`):**
  - Fórmula oficial de daño de Pokémon GO con `CPM`, `STAB (1.2x)`, debilidades elementales (`1.6x` y `2.56x`), Amistad, Clima, Mega activa y **Juego en Equipo (Party Power de 2, 3 o 4 jugadores)**.
  - **Simulación Co-op Real**: Selecciona los amigos que van contigo al combate para sumar su daño real al tuyo.
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
