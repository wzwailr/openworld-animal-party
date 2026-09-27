# 《动物王国：仲夏森林漫游记》技术设计文档 (TDD)

> **版本**：v1.1
> **状态**：已定稿（选型已确认，进入实现）
> **前置文档**：`docs/PRD_Animal_Kingdom_3D_v1.2.md`（产品设计规范）

---

## 1. 技术选型总览

| 维度 | 选型 | 说明 |
| :--- | :--- | :--- |
| 渲染引擎 | **Three.js (WebGL2)** | 生态最大、对自定义卡通 Shader 最灵活，PRD 所需的高度定制特效（水体/体积光/粒子/Toon）都适合 |
| 构建工具 | **Vite** | 秒级冷启动、原生 TS/ESM 支持、资产 hash 与分包 |
| 开发语言 | **TypeScript** | 多阶段长期维护，强类型约束场景/实体/配置结构 |
| 物理与碰撞 | **轻量自研碰撞**（起步） | 重力 + 地面高度采样 + 球体 vs AABB/网格碰撞；后期需要刚体再引入 Rapier |
| 3D 空间音频 | **Three.js PositionalAudio + Web Audio Gain** | 点声源空间化 + 环境底噪交叉淡入淡出 |
| 后处理 | **Three.js EffectComposer / `postprocessing` 库** | UnrealBloom + 自研 God Rays / 水体 / Toon Pass |
| 资产格式 | **glTF/GLB + DRACO(Meshopt) + KTX2(Basis)** | 几何与纹理双压缩，兼顾画质与加载 |
| 卡通渲染 | **MeshToonMaterial + 渐变贴图** | 统一马卡龙色板与手绘描边感 |
| WebXR | **Three.js 内置 WebXR** | VRButton + 视线凝视交互 |

> **核心决策**：渲染引擎选 **Three.js** 而非 Babylon.js / PlayCanvas / Unity WebGL。
> - 理由：PRD 强调「手绘童话光影 + 高度定制的体积光/水体/粒子」，Three.js 的 Shader 定制自由度最高、社区案例最丰富；且前序讨论全程以 Three.js 为基线。
> - Babylon.js 内置 WebXR 与物理更「全家桶」，但定制卡通渲染相对更绕、体积更大；本项目定制优先级高于开箱即用。

---

## 2. 项目目录结构

```
animal-kingdom/
├── docs/                       # 产品与技术文档
├── public/                     # 静态资产：favicon、环境贴图、占位图
├── index.html                  # 入口
├── package.json / tsconfig.json / vite.config.ts
└── src/
    ├── main.ts                 # 启动入口，装配各系统
    ├── core/                   # 引擎无关核心
    │   ├── Engine.ts           # Renderer/Scene/Camera/RenderLoop
    │   ├── InputManager.ts     # 键鼠 / 触摸 / 陀螺仪统一输入
    │   ├── EventBus.ts         # 全局事件总线
    │   └── StateMachine.ts     # 漫游模式状态机
    ├── world/                  # 场景世界
    │   ├── WorldManager.ts     # 场景加载 / 切换 / 流式卸载
    │   ├── scenes/             # 每个场景一个模块
    │   │   ├── PlazaScene.ts       # 场景3 庆典广场（Phase 1）
    │   │   ├── MoonGateScene.ts    # 场景1
    │   │   ├── MushroomScene.ts    # 场景2
    │   │   ├── StreamScene.ts      # 场景4
    │   │   └── TreehouseScene.ts   # 场景5
    │   ├── terrain/            # 地形与地面高度采样
    │   └── environment/        # 天空 / 光照 / 雾 / 体积光
    ├── player/                 # 第一人称控制器
    │   ├── CameraRig.ts        # 相机层级（身高/低头/平滑）
    │   ├── LocomotionController.ts
    │   └── CollisionSystem.ts
    ├── rendering/              # 渲染管线
    │   ├── ToonMaterial.ts     # 卡通材质工厂
    │   ├── WaterShader.ts      # 风格化水体
    │   ├── GodRays.ts          # 体积光束
    │   └── PostFX.ts           # Bloom / 色调映射 / 降级开关
    ├── fx/                     # 特效
    │   └── ParticleSystem.ts   # GPU 实例化粒子
    ├── audio/                  # 音频
    │   ├── AudioManager.ts
    │   ├── AmbientMixer.ts     # 环境底噪交叉淡入淡出
    │   └── SFXPool.ts          # 拟声音效池
    ├── entities/               # NPC / 可交互对象
    │   ├── Animal.ts           # 动物基类（微动动画）
    │   ├── Interactive.ts      # 可交互基类（准心/触发）
    │   └── ConcertBand.ts      # 交响乐队
    ├── ui/                     # HUD / 图鉴 / 拍照
    ├── data/                   # 数据驱动配置
    │   ├── scenes.config.ts    # 场景元信息
    │   ├── npc.config.ts       # NPC 定义
    │   └── letters.ts          # 童话信件内容
    └── utils/                  # 通用工具 / 数学 / 性能
```

---

## 3. 系统架构与核心流程

### 3.1 分层架构
```
[UI 层]        HUD / 图鉴 / 拍照 / WebXR 按钮
     ↕ (EventBus)
[逻辑层]       WorldManager · StateMachine · Locomotion · Interaction
     ↕
[渲染层]       Engine · Rendering(FX/Water/Toon/GodRays) · fx/粒子
     ↕
[数据层]       scenes.config · npc.config · letters · 资产加载
```

### 3.2 主循环 (RenderLoop)
```
每帧：
  1. InputManager 采样输入 → LocomotionController 计算位移
  2. CollisionSystem 求解碰撞 → 更新 CameraRig
  3. WorldManager 更新当前场景（NPC 微动 / 粒子 / 水体 / 体积光）
  4. AudioManager 根据玩家位置更新声源与底噪混音
  5. 后处理渲染输出
```

### 3.3 漫游模式状态机 (StateMachine)
```
Init → Onboarding(可选) ⇄ FreeRoam ⇄ CinematicTour
                                  ⇄ PhotoMode
                                  ⇄ Journal(图鉴)
```
- 各模式互斥，切换时淡入淡出；`PhotoMode` 与 `Journal` 会暂停移动但保留场景动画。

---

## 4. 美术资产管线（原画 → Web 3D）

### 4.1 分阶段策略（关键决策）
| 阶段 | 资产来源 | 目标 |
| :--- | :--- | :--- |
| **Phase 1 (MVP)** | **程序化几何体**（球体/胶囊/圆柱/挤压 + Toon 材质） | 快速验证广场氛围、光照、动效、音频，不动用重资产 |
| **Phase 2+** | **Blender 手工建模 → GLB** | 替换为精致软萌角色与建筑，保持原画质感 |

> 推荐「**程序化起步、Blender 迭代**」：先用手写几何体拼出「巨型蘑菇、舞台、蛋糕、溪流」，确认视觉方向与性能基线；再逐步替换成正式资产，避免前期卡在建模上。

### 4.2 卡通渲染规范
- 统一使用 `MeshToonMaterial`（渐变贴图模拟手绘明暗分层）+ 柔和描边（可选）。
- 建立**全局马卡龙色板**与光照强度基线，所有材质引用同一色板，避免各场景色温不统一。
- 光照：主方向光（暖奶金）+ 半球光（天光补色）+ 低强度环境光；禁用高对比硬阴影，用软阴影/接触阴影。

### 4.3 资产压缩与加载
- 几何：DRACO 或 Meshopt 压缩。
- 纹理：KTX2（Basis Universal）压缩，移动端显著降低显存占用。
- 资源按场景**流式加载**：进入场景前预载、离开后卸载，配合低清占位图实现首屏 ≤ 8s。

---

## 5. 渲染管线与特效实现

### 5.1 体积光束 / 丁达尔光 (God Rays)
- 方案：**后处理径向模糊 God Rays Pass** + 屏幕空间光罩（遮挡物 = 树冠遮罩图）。
- 低配降级：以静态渐变半透明光锥 Mesh 替代后处理。

### 5.2 风格化水体 (Stylized Water)
- 自研 Shader：多层正弦波叠加法线扰动 + 菲涅尔边缘 + 浅滩透明度渐变 + 柔和镜面高光。
- 交互：物体接触水面生成细碎白色软泡沫（粒子）。

### 5.3 粒子系统 (Particles)
- 基于 **GPU 实例化 Points**，统一一个粒子管理器支持：光尘 / 孢子 / 萤火虫 / 水雾 / 流星雨 / 泡沫。
- 所有粒子低饱和、缓慢飘落，受「柔和模式」开关统一控制数量与速度。

### 5.4 后处理
- Bloom（柔光溢出）、色调映射（护眼低对比）、可选描边。
- 设备三档：高档全开 / 中档关描边精简粒子 / 低档关体积光+烘焙光照。

---

## 6. 交互与物理系统

### 6.1 第一人称移动 (Locomotion)
- 相机层级 `CameraRig`：独立高度（模拟儿童视角 ~1.1m 视高），支持低头看水/抬头看树冠。
- PC：PointerLock + WASD + Shift 慢跑 + Space 轻跳；移动/平板：虚拟摇杆 + 滑屏 + 可选陀螺仪。

### 6.2 碰撞检测
- 起步用**轻量自研**：地面高度采样（地形函数/高度图）+ 玩家球体 vs 静态碰撞体（AABB/圆柱/胶囊）分离。
- 满足「不穿树、不穿墙、踩台阶、缓坡」即可，不引入刚体动力学，保持低负载。
- 后续需要「可推开的门、漂浮小舟」等刚体时再引入 **Rapier (wasm)**。

### 6.3 交互拾取 (Interaction)
- 屏幕准心射线 `Raycaster`，检测可交互对象；命中后准心变为兔子头像 + 提示「点击打招呼」。
- 支持「视线凝视触发」作为可选的点击替代（桌面/移动/VR 通用）。

---

## 7. 音频系统

### 7.1 架构
- **点声源**：`PositionalAudio`（乐队、水车、蛙鸣、NPC 语气音），随距离自然衰减，具双耳方位感。
- **环境底噪**：`AmbientMixer` 用多个 Gain 节点对「风声/树叶/鸟鸣/溪流」按场景实时交叉淡入淡出。
- **拟声音效池**：`SFXPool` 预加载少量短音效（笑声、呼唤、咕噜），随机触发，规避同频重复。

### 7.2 无台词实现
- 小动物仅发拟声语气音 + 童谣哼唱（无歌词/无意义音节），不加载任何对白资产。

---

## 8. 性能与多端适配

- **设备三档分级**：运行时检测 GPU/内存，自动切档（详见 PRD 第 8 章）。
- **通用优化**：视锥剔除（引擎内置）、`InstancedMesh` 批量花草树木、LOD（远景低模）、纹理压缩、粒子数量预算。
- **首屏**：入口极简加载器 → 预载核心资产 → 流式加载当前场景，目标可交互时间 ≤ 8s。
- **WebXR 防眩晕**：边缘虚化、降速、传送式移动选项。

---

## 9. 数据驱动设计

- `scenes.config.ts`：每场景的名称、起始坐标、边界、声源、粒子参数、NPC 列表。
- `npc.config.ts`：动物 id、模型/占位几何体、位置、微动类型、可交互事件。
- `letters.ts`：信件 id、标题、插画、正文短句、解锁条件。
- 好处：新增动物/场景/信件只改配置，不改核心逻辑，便于内容迭代。

---

## 10. Phase 1 MVP 技术落地清单

**目标**：单场景「仲夏动物庆典广场」跑通全链路。

| # | 任务 | 产出 |
| :--- | :--- | :--- |
| 1 | Vite + TS + Three.js 脚手架 | 可运行空场景 |
| 2 | Engine + 渲染循环 + 后处理骨架 | 基础渲染管线 |
| 3 | 程序化广场场景（舞台/巨菇/蛋糕/溪流） | 可看的广场 |
| 4 | Toon 材质 + 暖金光照 + 雾 | 手绘童话基调 |
| 5 | 第一人称 Locomotion + 碰撞 | 可走动、不穿模 |
| 6 | 风格化水体 + 光尘粒子 + 体积光 | 核心特效 |
| 7 | 兔子乐队（占位模型 + 微动）+ 空间音频 | 可听可看 |
| 8 | HUD 极简 + 准心交互 + 曲目切换 | 首个交互闭环 |
| 9 | 移动端虚拟摇杆 + 陀螺仪 | 多端可玩 |
| 10 | 设备分档 + 性能基线 | 达标 60/30 FPS |

---

## 11. 已确认关键决策（v1.1 定稿）

| # | 决策项 | 结论 |
| :--- | :--- | :--- |
| 1 | 渲染引擎 | **Three.js (WebGL2)** |
| 2 | 开发语言 | **TypeScript**（严格模式） |
| 3 | 美术管线 | **程序化几何体起步 → Blender 迭代**（AI 生图补纹理/天空盒/粒子贴图） |
| 4 | 碰撞与物理 | **轻量自研碰撞起步**（圆形 vs AABB + 高度场），需要刚体时再引入 Rapier |
| 5 | 代码基础 | **从零重搭**（参考 Codex 原型 `ji-t/outputs/animal-kingdom-vr`，但独立以 TS 实现，不迁移其代码） |

> 落地顺序按第 10 节 Phase 1 清单执行。
