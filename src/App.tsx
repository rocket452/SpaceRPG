import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SpaceCombatEngine } from './game/spaceCombatEngine';
import { StarbaseSiegeModeController } from './game/StarbaseSiegeModeController';
import { SHIP_CLASSES, MISSIONS, getShipAbilities } from './game/shipPresets';
import { PLAYABLE_SHIP_ARCHETYPES } from './game/ShipArchetypeDefinitions';
import { ShieldArcKey, ShipClass, ShipEntity, SubsystemType, Mission, Weapon } from './types';
import { WeaponHardpoint } from './game/WeaponHardpoint';
import { ThreeCanvas } from './components/ThreeCanvas';
import { ShieldStatusWidget } from './components/ShieldStatusWidget';
import { PowerManagementHUD } from './components/PowerManagementHUD';
import { TargetPanel } from './components/TargetPanel';
import { HelmControls } from './components/HelmControls';
import { WeaponsBar } from './components/WeaponsBar';
import { AbilitiesBar } from './components/AbilitiesBar';
import { CombatLogWidget } from './components/CombatLogWidget';
import { HeaderBar } from './components/HeaderBar';
import { MobileHUD } from './components/MobileHUD';
import { Minimap } from './components/Minimap';
import { ShipCustomizerModal } from './components/ShipCustomizerModal';
import { MissionSelectModal } from './components/MissionSelectModal';
import { HangarStatusHUD } from './components/HangarStatusHUD';
import { HotkeysGuideWidget } from './components/HotkeysGuideWidget';
import { BossRaidHUD } from './components/BossRaidHUD';
import { BossRaidModeController, RaidRole } from './game/BossRaidModeController';
import { soundManager } from './audio/soundManager';
import { groupShipWeapons } from './utils/weaponUtils';
import { Shield, Skull, Trophy, RefreshCw } from 'lucide-react';

export default function App() {
  const [currentShipClass, setCurrentShipClass] = useState<ShipClass>(PLAYABLE_SHIP_ARCHETYPES.vanguard_brawler);
  const [currentMission, setCurrentMission] = useState<Mission>(
    MISSIONS.find((m) => m.isBossRaidMode) || MISSIONS[0]
  );
  const [raidRole, setRaidRole] = useState<RaidRole>('tank');

  // Modal dialogs
  const [showHangar, setShowHangar] = useState(false);
  const [showMissions, setShowMissions] = useState(false);

  // Settings & Responsive Detection
  const [cameraMode, setCameraMode] = useState<'follow' | 'target' | 'isometric'>('follow');
  const [isMuted, setIsMuted] = useState(false);
  const [autoFire, setAutoFire] = useState(false);

  // Auto-detect mobile / tablet / small screens, but allow user toggle
  const detectCompactMode = () => {
    if (typeof window === 'undefined') return false;
    const isSmallWidth = window.innerWidth < 1024;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return isSmallWidth || (isTouchDevice && window.innerWidth < 1280);
  };

  const [useCompactHud, setUseCompactHud] = useState(detectCompactMode);

  useEffect(() => {
    const handleResize = () => {
      setUseCompactHud(detectCompactMode());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Combat Engine state holder
  const engineRef = useRef<SpaceCombatEngine | null>(null);
  const [, setTick] = useState(0); // For forcing UI updates every frame

  // Helper: Extract weapons from ship class or hardpoints safely
  const getShipWeapons = (sc: ShipClass): Weapon[] => {
    if (sc.weaponSlots && Array.isArray(sc.weaponSlots)) {
      return sc.weaponSlots.map((w) => ({ ...w, currentCooldown: 0 }));
    }
    if ((sc as any).hardpoints && Array.isArray((sc as any).hardpoints)) {
      return (sc as any).hardpoints.map((hp: any) => new WeaponHardpoint(hp).toWeapon());
    }
    return [];
  };

  // Helper: Instantiate player & enemy entities
  const initEngine = useCallback(
    (shipClass: ShipClass, mission: Mission, activeRaidRole: RaidRole = 'tank') => {
      const buildEntity = (
        id: string,
        sc: ShipClass,
        pos: { x: number; y: number; z: number },
        rotY: number,
        team: 'alpha' | 'beta',
        isPlayerFlag: boolean,
        initialSpeed: number,
        role?: ShipEntity['raidRole']
      ): ShipEntity => ({
        id,
        name: sc.name,
        isPlayer: isPlayerFlag,
        team,
        faction: sc.faction,
        shipClass: sc,
        carrierDesign: sc.carrierDesign || 'solaris',
        raidRole: role,
        position: pos,
        rotation: { x: 0, y: rotY, z: 0 },
        speed: initialSpeed,
        targetSpeed: initialSpeed,
        hull: sc.maxHull,
        maxHull: sc.maxHull,
        shields: {
          front: { current: sc.maxShieldPerArc, max: sc.maxShieldPerArc },
          starboard: { current: sc.maxShieldPerArc, max: sc.maxShieldPerArc },
          back: { current: sc.maxShieldPerArc, max: sc.maxShieldPerArc },
          port: { current: sc.maxShieldPerArc, max: sc.maxShieldPerArc },
        },
        subsystems: { weapons: 100, shields: 100, engines: 100, auxiliary: 100 },
        power: { ...sc.defaultPower },
        powerPreset: 'balanced',
        weapons: getShipWeapons(sc),
        abilities: getShipAbilities(sc),
        targetId: null,
        targetedSubsystem: null,
        isDestroyed: false,
      });

      if (mission.isBossRaidMode) {
        const tankClass = PLAYABLE_SHIP_ARCHETYPES.vanguard_brawler;
        const dpsClass = PLAYABLE_SHIP_ARCHETYPES.vector_dragoon;
        const supportClass = PLAYABLE_SHIP_ARCHETYPES.sanctuary_support;
        const bossClass = PLAYABLE_SHIP_ARCHETYPES.omega_leviathan_boss;

        const tankShip = buildEntity(
          'raid_tank_vanguard',
          tankClass,
          { x: 0, y: 0, z: 54 },
          0,
          'alpha',
          activeRaidRole === 'tank',
          0,
          'tank'
        );
        const dpsShip = buildEntity(
          'raid_dps_dragoon',
          dpsClass,
          { x: -55, y: 0, z: 52 },
          0.7,
          'alpha',
          activeRaidRole === 'dps',
          6,
          'dps'
        );
        const supportShip = buildEntity(
          'raid_support_sanctuary',
          supportClass,
          { x: 0, y: 0, z: 22 },
          0,
          'alpha',
          activeRaidRole === 'support',
          0,
          'support'
        );
        const bossShip = buildEntity(
          'raid_boss_leviathan',
          bossClass,
          { x: 0, y: 0, z: 110 },
          Math.PI,
          'beta',
          false,
          0,
          'boss'
        );

        const partyList = [tankShip, dpsShip, supportShip];
        const playerEntity = partyList.find((s) => s.isPlayer) || supportShip;
        const otherEntities = [...partyList.filter((s) => !s.isPlayer), bossShip];

        playerEntity.targetId = activeRaidRole === 'support' ? tankShip.id : bossShip.id;
        bossShip.targetId = tankShip.id;

        const engine = new SpaceCombatEngine(playerEntity, otherEntities);
        engine.bossRaidController = new BossRaidModeController(tankShip, dpsShip, supportShip, bossShip);

        // Keep central raid combat lane & cover shadow zone free of asteroids
        engine.asteroids = engine.asteroids.filter(
          (a) => Math.abs(a.position.x) > 55 || a.position.z < -25 || a.position.z > 140
        );

        engine.addLog(
          `BOSS RAID ENGAGED: Vanguard (Tank), Dragoon (DPS), and Sanctuary (Support) vs ${bossShip.name}!`,
          'system'
        );
        engine.addLog(
          `RAID MECHANIC: Boss targets Vanguard exclusively — Support must hide behind Vanguard when Obliteration Beam charges!`,
          'ability'
        );

        setCurrentShipClass(playerEntity.shipClass);
        setCameraMode('isometric');
        engineRef.current = engine;
        setTick((t) => t + 1);
        return;
      }

      const playerEntity = buildEntity(
        'player_ship',
        shipClass,
        { x: 0, y: 0, z: 0 },
        0,
        'alpha',
        true,
        12
      );

      // Enemies
      const enemyEntities: ShipEntity[] = [];
      let enemyIndex = 1;

      mission.enemies.forEach((entry) => {
        let sc = SHIP_CLASSES.find((s) => s.id === entry.shipClassId) || PLAYABLE_SHIP_ARCHETYPES.vector_dragoon;
        let namePrefix = entry.namePrefix;

        // If mission enemy is same class as player's chosen ship, swap to opposing archetype
        if (sc.id === shipClass.id) {
          sc = shipClass.id === 'vanguard_brawler'
            ? PLAYABLE_SHIP_ARCHETYPES.vector_dragoon
            : PLAYABLE_SHIP_ARCHETYPES.vanguard_brawler;
          namePrefix = sc.name;
        }

        for (let i = 0; i < entry.count; i++) {
          const isSingleTarget = entry.count === 1 && mission.enemies.length === 1;
          const dist = isSingleTarget ? 220 : 180 + i * 35;
          const angle = isSingleTarget ? 0 : (i * Math.PI * 2) / entry.count + Math.PI / 4;

          const enemy = buildEntity(
            `enemy_${enemyIndex}`,
            sc,
            { x: Math.sin(angle) * dist, y: 0, z: Math.cos(angle) * dist },
            angle + Math.PI,
            'beta',
            false,
            4
          );
          enemy.name = entry.count === 1 ? namePrefix : `${namePrefix} ${i + 1}`;
          enemy.targetId = 'player_ship';
          enemyEntities.push(enemy);

          enemyIndex++;
        }
      });

      const engine = new SpaceCombatEngine(playerEntity, enemyEntities);

      if (mission.isSiegeMode) {
        playerEntity.position = { x: 0, y: 0, z: -190 };
        const siegeController = new StarbaseSiegeModeController(shipClass.faction);
        engine.siegeController = siegeController;
        // Generate asteroids distributed along the MOBA arena flanks
        engine.generateAsteroids(true);
        // Include alphaStarbase and betaStarbase in engine.enemies so they render in 3D scene and are targetable
        engine.enemies.push(siegeController.alphaStarbase, siegeController.betaStarbase);
        // Spawn initial minion waves immediately
        const alphaMinions = siegeController.waveSpawnerAlpha.spawnWave();
        const betaMinions = siegeController.waveSpawnerBeta.spawnWave();
        engine.enemies.push(...alphaMinions, ...betaMinions);
        setCameraMode('isometric');
      }

      // Default target closest facing enemy
      const initialTarget = engine.getSortedTargets(playerEntity)[0];
      if (initialTarget) {
        playerEntity.targetId = initialTarget.id;
      }

      engineRef.current = engine;
      setTick((t) => t + 1);
    },
    []
  );

  // Initialize engine on first load or mission change
  useEffect(() => {
    initEngine(currentShipClass, currentMission, raidRole);
  }, []);

  const handleTakeControlOfShip = useCallback((targetId: string) => {
    const engine = engineRef.current;
    if (!engine) return;

    const targetEnemyIdx = engine.enemies.findIndex((e) => e.id === targetId && !e.isDestroyed);
    if (targetEnemyIdx === -1) return;

    const targetShip = engine.enemies[targetEnemyIdx];
    const oldPlayer = engine.player;

    // Transform target ship into player while preserving class-specific abilities
    targetShip.isPlayer = true;
    targetShip.abilities =
      targetShip.abilities && targetShip.abilities.length > 0
        ? targetShip.abilities
        : getShipAbilities(targetShip.shipClass);

    // Transform old player into AI ship keeping its abilities
    oldPlayer.isPlayer = false;
    oldPlayer.abilities =
      oldPlayer.abilities && oldPlayer.abilities.length > 0
        ? oldPlayer.abilities
        : getShipAbilities(oldPlayer.shipClass);

    if (engine.bossRaidController) {
      const boss = engine.bossRaidController.bossShip;
      targetShip.targetId =
        targetShip.raidRole === 'support' ? engine.bossRaidController.tankShip.id : boss.id;
      oldPlayer.targetId = boss.id;
    } else {
      targetShip.targetId = oldPlayer.id;
      oldPlayer.targetId = targetShip.id;
    }

    // Swap in engine
    engine.player = targetShip;
    engine.enemies[targetEnemyIdx] = oldPlayer;

    if (targetShip.raidRole === 'tank' || targetShip.raidRole === 'dps' || targetShip.raidRole === 'support') {
      setRaidRole(targetShip.raidRole);
    }

    engine.addLog(
      `[COMMAND TRANSFER] Transferred pilot authority to ${targetShip.name} (${targetShip.shipClass.name})!`,
      'system'
    );

    setCurrentShipClass(targetShip.shipClass);
    setTick((t) => t + 1);
  }, []);

  const pressedKeysRef = useRef<Set<string>>(new Set());
  const isKeyboardTurningRef = useRef<boolean>(false);

  // UI Tick & Continuous Movement Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);

      const engine = engineRef.current;
      if (!engine || engine.player.isDestroyed) return;

      const player = engine.player;
      const keys = pressedKeysRef.current;

      const isLeft = keys.has('KeyA') || keys.has('ArrowLeft');
      const isRight = keys.has('KeyD') || keys.has('ArrowRight');
      const isUp = keys.has('KeyW') || keys.has('ArrowUp');
      const isDown = keys.has('KeyS') || keys.has('ArrowDown');
      const isShift = keys.has('ShiftLeft') || keys.has('ShiftRight');

      (player as any).driftDecoupled = isShift;

      if (isLeft || isRight || isUp || isDown) {
        player.waypoint = null;
      }

      const turnRateRad = (player.shipClass.turnRate * Math.PI) / 180;

      if (isLeft && !isRight) {
        player.targetAngularVelocity = turnRateRad;
        isKeyboardTurningRef.current = true;
      } else if (isRight && !isLeft) {
        player.targetAngularVelocity = -turnRateRad;
        isKeyboardTurningRef.current = true;
      } else if (isLeft && isRight) {
        if (isKeyboardTurningRef.current) {
          player.targetAngularVelocity = 0;
          isKeyboardTurningRef.current = false;
        }
      } else {
        if (isKeyboardTurningRef.current) {
          player.targetAngularVelocity = 0;
          isKeyboardTurningRef.current = false;
        }
      }

      const minAllowedSpeed = -player.shipClass.maxSpeed * 0.25;
      const maxAllowedSpeed =
        player.shipClass.maxSpeed * (player.evasiveActiveTimer && player.evasiveActiveTimer > 0 ? 1.75 : 1.0);

      if (isUp) {
        player.targetSpeed = Math.min(maxAllowedSpeed, player.targetSpeed + 1.2);
      }
      if (isDown) {
        player.targetSpeed = Math.max(minAllowedSpeed, player.targetSpeed - 1.2);
      }

      // Auto fire logic (supports healing beams even without hostile lock)
      if (autoFire) {
        const target = player.targetId
          ? engine.enemies.find((e) => e.id === player.targetId && !e.isDestroyed)
          : undefined;
        player.weapons.forEach((w, idx) => {
          const isHeal = w.isHealShield || w.isHealHull || w.type === 'shield_transfer_beam' || w.type === 'hull_repair_beam';
          if (w.currentCooldown <= 0 && (isHeal || target)) {
            engine.fireWeapon(player, idx, target);
          }
        });
      }
    }, 33);

    return () => clearInterval(interval);
  }, [autoFire]);

  // Keyboard Navigation & Tactical Hotkey Controls
  useEffect(() => {
    // Helper to ensure an active target is acquired
    const getOrAcquireTarget = () => {
      const engine = engineRef.current;
      if (!engine) return null;
      const player = engine.player;
      let target = engine.enemies.find((en) => en.id === player.targetId && !en.isDestroyed);
      if (!target) {
        const sorted = engine.getSortedTargets(player);
        if (sorted.length > 0) {
          player.targetId = sorted[0].id;
          target = sorted[0];
        }
      }
      return target;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keypresses if user is typing in an input, textarea, or select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const engine = engineRef.current;
      if (!engine || !engine.player || engine.player.isDestroyed) return;

      const player = engine.player;

      // Prevent default page scroll for active controls
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ShiftLeft',
          'ShiftRight',
          'KeyE',
          'KeyQ',
          'KeyR',
          'KeyF',
          'KeyC',
          'KeyV',
          'KeyG',
          'Tab',
          'Numpad8',
          'Numpad2',
          'Numpad4',
          'Numpad6',
          'Numpad5',
        ].includes(e.code) ||
        e.key === ' '
      ) {
        e.preventDefault();
      }

      const isNewPress = !pressedKeysRef.current.has(e.code);
      pressedKeysRef.current.add(e.code);

      // Sync movement keys for directional Vector Burst
      const keys = pressedKeysRef.current;
      let x = 0;
      let z = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      engine.activeMovementKeys = { x, z };

      if (isNewPress) {
        // Numpad Shield Arc Rerouting (8 = Forward, 2 = Rear, 4 = Left, 6 = Right, 5 = Balance Shields)
        if (e.code === 'Numpad8' || (e.key === '8' && e.location === 3)) {
          engine.rerouteShields('front');
          return;
        }
        if (e.code === 'Numpad2' || (e.key === '2' && e.location === 3)) {
          engine.rerouteShields('back');
          return;
        }
        if (e.code === 'Numpad4' || (e.key === '4' && e.location === 3)) {
          engine.rerouteShields('port');
          return;
        }
        if (e.code === 'Numpad6' || (e.key === '6' && e.location === 3)) {
          engine.rerouteShields('starboard');
          return;
        }
        if (e.code === 'Numpad5' || (e.key === '5' && e.location === 3)) {
          engine.equalizeShields(player);
          return;
        }

        switch (e.code) {
          case 'KeyX':
            // All Stop
            player.targetSpeed = 0;
            break;
          case 'Digit1':
            // [1] MAX WEAPONS
            engine.setPowerPreset(player, 'weapons');
            break;
          case 'Digit2':
            // [2] MAX ENGINES
            engine.setPowerPreset(player, 'engines');
            break;
          case 'Digit3':
            // [3] MAX SHIELDS
            engine.setPowerPreset(player, 'shields');
            break;
          case 'Digit4':
            // [4] EQUALIZE POWER
            engine.setPowerPreset(player, 'balanced');
            break;
          case 'Digit5':
            // [5] BALANCE SHIELD HEALTH BETWEEN ARCS
            engine.equalizeShields(player);
            break;
          case 'KeyQ':
            // Hotkey [Q]: Class Special Ability (Brawler: Mine, Carrier: Launch Fighter, Dragoon: Vector Burst, Support: Aegis Wave)
            if (player.abilities && player.abilities.length > 0) {
              const specialAbility =
                player.abilities.find(
                  (a) =>
                    a.id === 'inertial_mine' ||
                    a.id === 'launch_drone' ||
                    a.id === 'launch_fighter' ||
                    a.id === 'vector_burst' ||
                    a.id === 'swarm_detonation' ||
                    a.id === 'aegis_restoration_pulse'
                ) || player.abilities[0];
              if (specialAbility) {
                engine.useAbility(player, specialAbility.id);
              }
            }
            break;
          case 'Space':
            // Spacebar: Launch Drone on Carrier, or Fire Primary Weapon Group
            {
              const isCarrier =
                player.shipClass.modelType === 'carrier' ||
                player.shipClass.id.includes('carrier') ||
                player.shipClass.id.includes('aegis') ||
                player.shipClass.id.includes('hive') ||
                !!player.hangarState;
              if (isCarrier) {
                engine.launchDrone(player);
              } else {
                const groups = groupShipWeapons(player.weapons);
                if (groups[0]) {
                  const isHealGroup = groups[0].weapons.some((w) => w.isHealShield || w.isHealHull);
                  const currentSelected = player.targetId
                    ? engine.enemies.find((en) => en.id === player.targetId && !en.isDestroyed) || null
                    : null;
                  const target = isHealGroup ? currentSelected : getOrAcquireTarget();
                  engine.fireWeaponGroup(player, groups[0].indices, target || undefined);
                }
              }
            }
            break;
          case 'KeyE':
            // Hotkey [E]: Hold to charge Charged Bow Plasma Ball on Dragoon, or fire Secondary Weapon Group
            {
              const isDragoon = player.shipClass.id.includes('dragoon') || player.shipClass.id.includes('interceptor');
              if (isDragoon) {
                engine.startPlasmaCharge(player);
              } else {
                const groups = groupShipWeapons(player.weapons);
                if (groups[1]) {
                  const isHealGroup = groups[1].weapons.some((w) => w.isHealShield || w.isHealHull);
                  const currentSelected = player.targetId
                    ? engine.enemies.find((en) => en.id === player.targetId && !en.isDestroyed) || null
                    : null;
                  const target = isHealGroup ? currentSelected : getOrAcquireTarget();
                  engine.fireWeaponGroup(player, groups[1].indices, target || undefined);
                } else if (player.abilities && player.abilities.length > 0) {
                  const mineAbility = player.abilities.find(
                    (a) => a.id === 'inertial_mine' || a.id === 'zoning_ordnance' || a.id.includes('mine')
                  );
                  if (mineAbility) {
                    engine.useAbility(player, mineAbility.id);
                  } else {
                    engine.useAbility(player, player.abilities[0].id);
                  }
                }
              }
            }
            break;
          case 'KeyT':
            // Hotkey T: Fire Weapon Group 3 or Ability 1
            {
              const groups = groupShipWeapons(player.weapons);
              if (groups[2]) {
                const isHealGroup = groups[2].weapons.some((w) => w.isHealShield || w.isHealHull);
                const currentSelected = player.targetId
                  ? engine.enemies.find((en) => en.id === player.targetId && !en.isDestroyed) || null
                  : null;
                const target = isHealGroup ? currentSelected : getOrAcquireTarget();
                engine.fireWeaponGroup(player, groups[2].indices, target || undefined);
              } else if (player.abilities[0]) {
                engine.useAbility(player, player.abilities[0].id);
              }
            }
            break;
          case 'KeyR':
            // Hotkey [R]: Recall Drone Swarm for Carrier, or BOff Skill 2
            {
              const isCarrier =
                player.shipClass.modelType === 'carrier' ||
                player.shipClass.id.includes('carrier') ||
                player.shipClass.id.includes('aegis') ||
                player.shipClass.id.includes('hive') ||
                !!player.hangarState;
              if (isCarrier) {
                engine.recallSwarm(player);
              } else if (player.abilities[1]) {
                engine.useAbility(player, player.abilities[1].id);
              }
            }
            break;
          case 'KeyF':
            // BOff Skill 3 (F)
            if (player.abilities[2]) engine.useAbility(player, player.abilities[2].id);
            break;
          case 'KeyC':
          case 'Digit6':
            // BOff Skill 4 (C / 6)
            if (player.abilities[3]) engine.useAbility(player, player.abilities[3].id);
            break;
          case 'KeyV':
          case 'Digit7':
            // BOff Skill 5 (V / 7)
            if (player.abilities[4]) engine.useAbility(player, player.abilities[4].id);
            break;
          case 'KeyG':
          case 'Digit8':
          case 'KeyB':
            // BOff Skill 6 (G / 8 / B)
            if (player.abilities[5]) engine.useAbility(player, player.abilities[5].id);
            break;
          case 'Tab':
          case 'KeyH':
            // Cycle targets in tactical order (closest facing target first)
            engine.cycleTarget(player);
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);

      const engine = engineRef.current;
      if (!engine) return;
      const player = engine.player;

      if ((e.code === 'KeyE' || e.code === 'Space') && player) {
        const isDragoon = player.shipClass.id.includes('dragoon') || player.shipClass.id.includes('interceptor');
        if (isDragoon) {
          const target = getOrAcquireTarget();
          engine.releasePlasmaCharge(player, target || undefined);
        }
      }

      // Sync active directional movement keys for Vector Burst impulse direction
      const keys = pressedKeysRef.current;
      let x = 0;
      let z = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (engine) {
        engine.activeMovementKeys = { x, z };
      }
    };

    const handleBlur = () => {
      pressedKeysRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const engine = engineRef.current;
  if (!engine) return null;

  const player = engine.player;
  const playerTeam = player.team || (player.isPlayer ? 'alpha' : 'beta');
  const activeHostiles = engine.enemies.filter(
    (e) => !e.isDestroyed && (e.team || (e.isPlayer ? 'alpha' : 'beta')) !== playerTeam
  );
  const targetEnemy = engine.enemies.find((e) => e.id === player.targetId && !e.isDestroyed) || null;

  const targetDistance = targetEnemy
    ? Math.hypot(
        targetEnemy.position.x - player.position.x,
        targetEnemy.position.y - player.position.y,
        targetEnemy.position.z - player.position.z
      )
    : null;

  const isVictory = engine.bossRaidController
    ? engine.bossRaidController.matchResult === 'victory'
    : activeHostiles.length === 0;
  const isDefeat = engine.bossRaidController
    ? engine.bossRaidController.matchResult === 'defeat'
    : player.isDestroyed;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 font-sans text-slate-100 overflow-hidden select-none">
      {/* Top Navigation Header (Desktop / Full HUD Mode) */}
      {!useCompactHud && (
        <div className="h-[50px] w-full shrink-0 z-20 relative overflow-visible">
          <div className="w-[109.89%] origin-top-left transform scale-[0.91]">
            <HeaderBar
              cameraMode={cameraMode}
              useCompactHud={useCompactHud}
              onSetCameraMode={setCameraMode}
              onToggleCompactHud={() => setUseCompactHud(!useCompactHud)}
              onOpenHangar={() => setShowHangar(true)}
              onOpenMissions={() => setShowMissions(true)}
              onRestart={() => initEngine(currentShipClass, currentMission, raidRole)}
              isMuted={isMuted}
              onToggleMute={() => setIsMuted(soundManager.toggleMute())}
            />
          </div>
        </div>
      )}

      {/* Main 3D Viewport with HUD Overlays */}
      <div className="relative flex-1 w-full h-full">
        {/* Three.js 3D WebGL Canvas */}
        <ThreeCanvas
          engine={engine}
          cameraMode={cameraMode}
          selectedTargetId={player.targetId}
          onSelectShip={(id) => (player.targetId = id)}
        />

        {useCompactHud ? (
          <MobileHUD
            engine={engine}
            player={player}
            targetEnemy={targetEnemy}
            targetDistance={targetDistance}
            autoFire={autoFire}
            cameraMode={cameraMode}
            isMuted={isMuted}
            useCompactHud={useCompactHud}
            onSetCameraMode={setCameraMode}
            onToggleCompactHud={() => setUseCompactHud(!useCompactHud)}
            onOpenHangar={() => setShowHangar(true)}
            onOpenMissions={() => setShowMissions(true)}
            onRestart={() => initEngine(currentShipClass, currentMission, raidRole)}
            onToggleMute={() => setIsMuted(soundManager.toggleMute())}
            onToggleAutoFire={() => setAutoFire(!autoFire)}
            onCycleTarget={() => engine.cycleTarget(player)}
          />
        ) : (
          <>
            {/* Top-Center Boss Raid HUD Overlay */}
            {engine.bossRaidController && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 origin-top transform scale-[0.91] w-full max-w-[540px] pointer-events-none">
                <BossRaidHUD
                  raidController={engine.bossRaidController}
                  playerShipId={player.id}
                  selectedTargetId={player.targetId}
                  onSelectTarget={(id) => {
                    player.targetId = id;
                    setTick((t) => t + 1);
                  }}
                  onTakeControlOfShip={handleTakeControlOfShip}
                />
              </div>
            )}

            {/* HUD Left Column: Hotkeys Reference, 4 Shield Arcs, Power Shunt Core, & Tactical Radar */}
            <div className="absolute top-2 left-2 z-20 flex flex-col gap-1.5 origin-top-left transform scale-[0.88] pointer-events-none [&>*]:pointer-events-auto max-h-[calc(100vh-16px)] overflow-y-auto no-scrollbar">
              {/* 0. Collapsible Command Hotkeys Reference */}
              <HotkeysGuideWidget ship={player} />

              {/* 1. Shield Status & 4 Arcs ("THE VANGUARD BRAWLER") */}
              <ShieldStatusWidget
                shields={player.shields}
                shieldTargets={player.shieldTargets}
                hull={player.hull}
                maxHull={player.maxHull}
                shipName={player.name}
                rebalanceCooldown={
                  player.abilities.find((a) => a.id === 'distribute_shields')?.currentCooldown ?? 0
                }
                maxRebalanceCooldown={
                  player.abilities.find((a) => a.id === 'distribute_shields')?.cooldown ?? 12
                }
                onDistributeShields={() => {
                  engine.useAbility(player, 'distribute_shields');
                }}
                onRerouteShields={(arcKey) => engine.rerouteShields(arcKey)}
              />

              {/* 2. Subsystem Power Re-routing ("POWER SHUNT CORE") */}
              {player.powerController && (
                <PowerManagementHUD
                  controller={player.powerController}
                  onSelectProfile={(p) => engine.setPowerPreset(player, p)}
                />
              )}

              {/* 3. Tactical Minimap Radar */}
              <Minimap
                engine={engine}
                onSelectTarget={(id) => (player.targetId = id)}
              />
            </div>

            {/* HUD Top Right: Target Inspector & Sector Telemetry */}
            <div className="absolute top-2 right-2 z-10 space-y-3 origin-top-right transform scale-[0.91]">
              <TargetPanel
                target={targetEnemy}
                playerPos={player.position}
                playerRotY={player.rotation.y}
                playerTeam={playerTeam}
                onClearTarget={() => (player.targetId = null)}
              />

              {/* Tactical Telemetry Log */}
              <CombatLogWidget logs={engine.combatLogs} />
            </div>

            {/* HUD Bottom Right: Helm Controls */}
            <div className="absolute bottom-2 right-2 z-10 origin-bottom-right transform scale-[0.91]">
              <HelmControls
                speed={player.speed}
                maxSpeed={player.shipClass.maxSpeed}
                targetSpeed={player.targetSpeed}
                rotationY={player.rotation.y}
                onSetTargetSpeed={(val) => (player.targetSpeed = val)}
                onTurnLeft={() => {
                  const turnRateRad = (player.shipClass.turnRate * Math.PI) / 180;
                  player.targetAngularVelocity = turnRateRad;
                }}
                onTurnRight={() => {
                  const turnRateRad = (player.shipClass.turnRate * Math.PI) / 180;
                  player.targetAngularVelocity = -turnRateRad;
                }}
                onStopTurning={() => {
                  player.targetAngularVelocity = 0;
                }}
                onStop={() => (player.targetSpeed = 0)}
                onFullSpeed={() => (player.targetSpeed = player.shipClass.maxSpeed)}
              />
            </div>

            {/* HUD Bottom Center: Tactical Weapons & Class Utility Bar */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 origin-bottom transform scale-[0.91]">
              <WeaponsBar
                weapons={player.weapons}
                abilities={player.abilities}
                autoFire={autoFire}
                player={player}
                target={targetEnemy}
                onFireWeaponGroup={(indices) => {
                  engine.fireWeaponGroup(player, indices, targetEnemy || undefined);
                }}
                onUseAbility={(id) => engine.useAbility(player, id)}
                onToggleAutoFire={() => setAutoFire(!autoFire)}
              />
            </div>

            {/* Aegis Hive-Carrier Swarm HUD Overlay */}
            <HangarStatusHUD
              ship={player}
              onLaunch={() => engine.launchDrone(player)}
              onRecall={() => engine.recallSwarm(player)}
              onDetonate={() => engine.useAbility(player, 'swarm_detonation')}
              onSelectCarrierDesign={(designId) => {
                player.carrierDesign = designId;
                player.shipClass.carrierDesign = designId;
                setCurrentShipClass({
                  ...player.shipClass,
                  carrierDesign: designId,
                });
                setTick((t) => t + 1);
              }}
            />
          </>
        )}

        {/* Victory Banner */}
        {isVictory && (
          <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <Trophy className="w-16 h-16 text-amber-400 mb-2 animate-bounce" />
            <h2 className="text-3xl font-black uppercase text-amber-400 tracking-widest mb-1">
              SECTOR VICTORY ACQUIRED!
            </h2>
            <p className="text-sm text-slate-300 mb-6 max-w-md">
              All hostile contacts in Sector {currentMission.title} eliminated. All 4 shield arcs held operational.
            </p>
            <button
              onClick={() => initEngine(currentShipClass, currentMission, raidRole)}
              className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold tracking-wide transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" /> RE-ENGAGE SIMULATION
            </button>
          </div>
        )}

        {/* Defeat Banner */}
        {isDefeat && (
          <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <Skull className="w-16 h-16 text-red-500 mb-2 animate-pulse" />
            <h2 className="text-3xl font-black uppercase text-red-500 tracking-widest mb-1">
              SHIP DESTROYED - HULL BREACHED
            </h2>
            <p className="text-sm text-slate-300 mb-6 max-w-md">
              Your starship was destroyed after shield arc failure. Redistribute power and equalize shields in next engagement.
            </p>
            <button
              onClick={() => initEngine(currentShipClass, currentMission, raidRole)}
              className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold tracking-wide transition shadow-lg shadow-red-600/30 flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" /> REBUILD SHIP & RETRY
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showHangar && (
        <ShipCustomizerModal
          currentShipClass={currentShipClass}
          onSelectShipClass={(sc) => {
            setCurrentShipClass(sc);
            let nextRole = raidRole;
            if (currentMission.isBossRaidMode) {
              if (sc.id.includes('brawler') || sc.id.includes('dreadnought')) nextRole = 'tank';
              else if (sc.id.includes('dragoon') || sc.id.includes('interceptor')) nextRole = 'dps';
              else if (sc.id.includes('support') || sc.id.includes('sanctuary')) nextRole = 'support';
              setRaidRole(nextRole);
            }
            initEngine(sc, currentMission, nextRole);
          }}
          onClose={() => setShowHangar(false)}
        />
      )}

      {showMissions && (
        <MissionSelectModal
          currentMission={currentMission}
          selectedRaidRole={raidRole}
          onSelectMission={(m) => {
            setCurrentMission(m);
            initEngine(currentShipClass, m, raidRole);
          }}
          onSelectRaidRole={(role) => {
            setRaidRole(role);
            if (currentMission.isBossRaidMode) {
              initEngine(currentShipClass, currentMission, role);
            }
          }}
          onClose={() => setShowMissions(false)}
        />
      )}
    </div>
  );
}
