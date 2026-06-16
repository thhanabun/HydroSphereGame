Technical Blueprint & System Architecture: "HydroStrategist"
This document serves as the absolute source of truth for the Codex Agent regarding the gameplay rules, mathematical equations, software architecture, and files layout of "HydroStrategist"—a high-performance, web-based educational strategy simulation of the regional hydrosphere.  

1. Core Gameplay & Educational Loop
The game simulates a regional river basin where the player acts as a water resources manager, balancing multi-purpose water benefits: Hydropower generation, Flood control, Agricultural irrigation, and Ecological sustainability.
(Markov Chain computes precipitation) 
│
▼
[Planning Phase] (Player places engineers, schedules construction, queues commands) 
│
▼
(ECS executes physical ticks: Shallow Water SWE + Soil Infiltration) 
│
▼
[Evaluation Phase] (Ecosystem feedback calculation, satisfaction updates, resource recovery)   


### Strategic Inspirations
*   **Civilization (Grid-Based Terraforming):** The map is a 2D Heightmap composed of hexagonal grid tiles.[11]
*   **Barrage (Civil Engineering & Construction Wheel):** Water flows downhill based on gravity. Players build Bases (retaining dams), Elevations (expanding capacity), Conduits (diverting water), and Powerhouses (turbines). Construction locks machinery (excavators/mixers) on a 6-sector rotating "Construction Wheel" for 5 turns.
*   **Dominant Species (Ecosystem Dominance):** Every tile has biome requirements. Diverting too much water away causes drought, leading to "Extinction" or "Ecosystem Regression" of biomes, impacting the sustainability score.[12, 13]

---

## 2. Mathematical & Physical Models
All mathematical models must be implemented strictly inside the **Logical Layer (pure TypeScript ECS Systems)**, completely decoupled from DOM or Three.js dependencies.[13, 14]

### A. 2D Shallow Water Equations (SWE) via Hydrostatic Pipe Model
To simulate downhill water flow across the heightmap, each grid cell $i,j$ has terrain elevation $b_{i,j}$ and water depth $h_{i,j}$.[15, 7] The total hydraulic head is $H_{i,j} = b_{i,j} + h_{i,j} + \text{DamHeight}_{i,j}$.[7, 16]
Flow flux $f_{d}$ along virtual pipes to neighbor cells in direction $d \in \{L, R, T, B\}$ is driven by hydrostatic pressure differences [17, 7, 18]:

$$f_{d}^{t+\Delta t} = \max\left(0, f_{d}^{t} + \Delta t \cdot \frac{g \cdot A \cdot \Delta H_{d}}{l}\right)$$

Where $g$ is gravity, $A$ is pipe cross-section area, $l$ is pipe length, and $\Delta H_{d} = H_{i,j}^{t} - H_{\text{neighbor},d}^{t}$.[7]
To prevent negative water depths, calculate the scaling factor $K$ [15, 7]:

$$K = \min\left(1, \frac{h_{i,j}^{t} \cdot \Delta x \cdot \Delta y}{\sum_{d} f_{d}^{t+\Delta t} \cdot \Delta t}\right)$$

Scale the flow flux: $f_{d,\text{scaled}}^{t+\Delta t} = f_{d}^{t+\Delta t} \cdot K$ [7]
Update the cell water column [7]:

$$h_{i,j}^{t+\Delta t} = h_{i,j}^{t} + \frac{\Delta t \cdot \left(\sum f_{\text{in}} - \sum f_{d,\text{scaled}}^{t+\Delta t}\right)}{\Delta x \cdot \Delta y}$$

### B. Soil Water Absorption & Infiltration Models
1.  **SCS Curve Number Model (Turn-Based Phase):**
    Maximum potential soil retention $S_{\text{soil}}$ (mm) and surface runoff depth $Q$ (mm) from rainfall $P$ (mm) [19, 20]:

$$S_{\text{soil}} = \frac{25400}{CN} - 254$$

$$Q = \begin{cases} 0 & \text{if } P \leq 0.05 S_{\text{soil}} \\ \frac{(P - 0.05 S_{\text{soil}})^2}{P + 0.95 S_{\text{soil}}} & \text{if } P > 0.05 S_{\text{soil}} \end{cases}$$

    *(Note: The initial abstraction ratio is set to 0.05 for localized monsoon catchment characteristics).[19, 21]*

2.  **Green-Ampt with Surface Detention Box (SDB) Model (Real-Time Physics Ticks):**
    Infiltration capacity $f_p$ (mm/hr) where $F(t)$ is cumulative infiltration and $h(t)$ is ponding water depth [22, 23, 24]:

$$f_p(t) = K_s \left(1 + \frac{\psi \cdot \theta_d + h(t)}{F(t)}\right)$$

    The SDB model calculates the actual infiltration rate $f_i(t)$ when rainfall $R(t)$ stops but ponded water remains on the grid :

$$f_i(t) = \begin{cases} f_p(t) & \text{if } R(t) \geq f_p(t) \\ \frac{f_p(t) \cdot h(t)}{\max(\eta, h(t))} & \text{if } R(t) < f_p(t) \end{cases}$$

### C. Seasonal Weather via 2D Markov Chains
Weather states: $S_w \in \{\text{Sunny (D), Cloudy (C), Light Rain (L), Heavy Rain (H), Storm (S)}\}$. Transitions are driven by seasonal matrices: $\mathbf{M_{\text{Dry}}}$ (high $D \rightarrow D$ probability) and $\mathbf{M_{\text{Monsoon}}}$ (high probability of cascading rain/storms to simulate realistic auto-correlated "sticky" weather patterns).[1, 5]

---

## 3. Composable Technical Stack
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  VIEW LAYER                                 │
│                      (WebGL 2.0 / WebGPURenderer)                       │
│                                  ▲     │                                    │
│       Renders grid terrain,      │     │  Uses Raycasting to detect click;  │
│       water mesh deformation &   │     │  opens HTML/CSS overlay panel. │
│       instanced buildings .  │     ▼                                    │
│                                  │              │
│                      Reads data  │  Displays cards, resources, policies     │
│                      directly.   │  and triggers Command dispatches.   │
└──────────────────────────────────┼──────────────────────────────────────────┘
│
┌──────────────────────────────────┴──────────────────────────────────────────┐
│                                LOGICAL LAYER                                │
│                   (Contiguous Memory Layout)                        │
│                                                                             │
│  - PositionComponent       : [ Vector2(x, y),... ]                          │
│  - TerrainComponent        : [ b_elevation, roughness, soil_group,... ]      │
│  - WaterComponent          : [ h_depth, flow_flux, velocity,... ]           │
│  - StructureComponent      : [ type, level, capacity, discharge_rate ]      │
│  - ConstructionWheelComp   : [ slot0_excavators, slot0_mixers, sector ]     │
└──────────────────────────────────▲──────────────────────────────────────────┘
│ Executes queued Commands
┌──────────────────────────────────┴──────────────────────────────────────────┐
│                                CONTROL LAYER                                │
│                         (FSM via XState v5)                             │
│                                                                             │
│  - Governs game loops, phase sequences & strict Turn-Based state machines.  │
└─────────────────────────────────────────────────────────────────────────────┘  


---

## 4. Software Architecture Rules
Codex must enforce the following coding guidelines strictly during code generation and editing tasks:

1.  **Strict MVC / Decoupled Architecture:**
    *   **The Model (bitECS + Honeycomb):** Pure TypeScript. Zero imports from `three`, `document`, or `window`.[29, 28] Grid data must remain contiguous in flat Float32/Uint8 arrays.
    *   **The View (Three.js Renderer):** Reads entity states from bitECS components and deforms custom geometries/updates instanced meshes.[29, 28]
    *   **The Controller (XState v5 + Commands):** The UI captures clicks, instantiates a `BuildCommand` (e.g. `BuildDamCommand(hexId, excavators, mixers)`), and queues it.[13] When the phase transitions, XState fires the command queue.
2.  **Cache Locality & Optimization:**
    *   Systems must iterate through contiguous arrays sequentially inside bitECS systems to prevent cache misses on high-density grids.
    *   Avoid instantiation of temporary objects inside real-time physics loops (Zero Garbage Collection pressure).

---

## 5. File Structure
Codex should maintain and expand this structured workspace:

hydrostrategist/
├──.github/workflows/ci.yml       # Automated test runner 
├──.agents/skills/                # Customized skill integration 
├── PLAN.md                        # Master roadmap and milestone verification 
├── AGENTS.md                      # Codex agent system prompt 
├── src/
│   ├── core/
│   │   ├── types.ts               # Core TS Types (SoilType, WeatherState)
│   │   ├── commands/
│   │   │   └── buildCommands.ts   # Command Pattern implementation
│   │   ├── state/
│   │   │   └── gameFSM.ts         # XState v5 State Machine Setup
│   │   └── ecs/
│   │       ├── components.ts      # bitECS flat schemas
│   │       └── systems/
│   │           ├── shallowWater.ts # SWE Pipe Model flow system
│   │           ├── infiltration.ts # Green-Ampt SDB + SCS Curve Systems
│   │           └── weatherSystem.ts # Markov weather calculations
│   ├── view/
│   │   ├── renderer.ts            # Three.js context, lighting, instances
│   │   └── uishell.ts             # Decoupled HTML/CSS overlay controller
│   └── main.ts                    # Entry-point bootstrapping
├── package.json
└── vite.config.ts  


---

## 6. Implementation Milestones for Codex
When executing the `/co-exec-tasks` command, work sequentially through these milestones :

### Milestone 1: Data Structuring & ECS Setup
*   Define `StructureComponent` and `ConstructionWheelComponent` schemas in bitECS.[30]
*   Integrate `PlayerResourceComponent` as a singleton entity tracking available machinery and credits.[30]

### Milestone 2: Hydrological Physics Expansion
*   Update `ShallowWaterSystem` to factor in `StructureComponent.level` into the hydrostatic pressure elevation barrier ($H_{i,j} = b_{i,j} + h_{i,j} + \text{DamHeight}_{i,j}$).[7, 16]
*   Ensure water cannot flow past a cell containing a dam base unless $h_{i,j}$ exceeds the spillway capacity.[7, 27]

### Milestone 3: Worker Placement & Construction Wheel Systems
*   Implement `src/core/commands/buildCommands.ts`. Deduct resources, trigger machine lockups inside the FSM Planning Phase, and update `StructureComponent`.[31, 13]
*   Write `constructionWheelSystem.ts` to rotate the wheel 60 degrees every round, releasing locked machinery back to the player.

### Milestone 4: Interactive View & Playwright E2E Verification
*   Implement raycasting in `renderer.ts` to map screen coordinates to hex coordinate systems using Honeycomb.[17]
*   Build HTML overlay panels showing construction choices.
*   Use **Playwright interactive** to verify that clicking a tile and queuing a "Build Base Dam" command deducts machinery, updates the Three.js mesh, blocks water flow, and registers ecosystem rating impacts.