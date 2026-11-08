# PokéRaid & Max Optimizer ⚔️🌀

Aplicación web interactiva para **Pokémon GO** que gestiona tu **Caja de Pokémon** personal (`localStorage`) y calcula matemáticamente el **Equipo Ideal**, tu **Contribución de Daño (DPS y TDO)** y el **Número Mínimo de Jugadores Adicionales** necesarios en Incursiones (Nivel 5, Mega, Primigenias, Oscuras, Élite) y Combates Max (**Dinamax** y **Gigamax**).

## ✨ Características Principales

- **Base de Datos Meta Actualizada (`data/pokemon_db.js`):**
  - Incluye a **Eternatus** (*Cañón Dinamax* y *Rayo Infinito*, más su forma jefe *Eternamax*), **Duraludon Gigamax** (*Gigaesquirla*), iniciales de Galar Gigamax (**Rillaboom**, **Cinderace**, **Inteleon**), iniciales de Kanto Gigamax (**Charizard**, **Blastoise**, **Venusaur**), **Gengar**, **Toxtricity**, **Machamp** y **Lapras Gigamax**.
  - Incluye a **Zacian (Espada Suprema)**, **Zamazenta (Escudo Supremo)**, **Mega Rayquaza**, **Groudon y Kyogre Primigenios**, **Necrozma Melena Crepuscular / Alas del Alba**, **Kyurem Negro / Blanco**, **Mewtwo Oscuro**, **Excadrill Dinamax**, **Blissey Dinamax** y los principales counters del meta.
- **Módulo 1: Mi Caja Pokémon (`js/box.js`):**
  - Persistencia local automática en `localStorage`.
  - Selector de IVs (`0-15`), nivel por presets rápidos (`Recién atrapado`, `Subido sin XL`, `Maxeado Nv. 50`) o **estimación automática de nivel introduciendo los PC**.
  - Soporte para Pokémon **Oscuros (Shadow)** (`+20%` Ataque) y **Dinamax / Gigamax / Eternamax** con niveles de **Ataque Max (Nv. 1-3)**, **Guardia Max** y **Espíritu Max**.
- **Módulo 2 y 3: Motor Matemático PvE y Calculadora de Jugadores (`js/engine.js` & `js/app.js`):**
  - Fórmula oficial de daño de Pokémon GO con `CPM`, `STAB (1.2x)`, eficacia de tipos (`1.6x`, `2.56x`, `0.625x`, `0.390625x`), Amistad, Clima, Mega activa y **Juego en Equipo (Party Power de 2, 3 o 4 jugadores)**.
  - Diferenciación automática entre **Incursiones (Top 6 Atacantes)** y **Combates Max (Patrulla de 3 Pokémon: 2 Tanques/Cargadores de medidor de 0.5s + 1 Rematador de Fase Max)**.
  - Desglose de compañeros necesarios en **3 escenarios**: **Hardcore (Nv. 40-50 Meta)**, **Estándar (Nv. 30-35)** y **Casual (Nv. 20-25 Auto)**.

## 🚀 Uso

Abre directamente el archivo `index.html` en cualquier navegador moderno o sírvelo mediante cualquier servidor estático (por ejemplo, GitHub Pages o Live Server).
