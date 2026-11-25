import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RotateCcw, Crosshair } from 'lucide-react';
import { SpaceCombatEngine, DRONE_CONTROL_RANGE } from '../game/spaceCombatEngine';
import { ShipModelBuilder } from '../game/shipModelBuilder';
import { FiringArc, ShieldArcKey, ShipEntity } from '../types';
import { DragoonReticleHUD } from './DragoonReticleHUD';

interface ThreeCanvasProps {
  engine: SpaceCombatEngine;
  cameraMode: 'follow' | 'target' | 'isometric';
  selectedTargetId: string | null;
  onSelectShip: (id: string) => void;
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  engine,
  cameraMode,
  selectedTargetId,
  onSelectShip,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Ship mesh caches
  const shipMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const shieldMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const weaponArcMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const droneRangeRingMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const projectileMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const ordnanceMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const beamLinesRef = useRef<Map<string, THREE.Group>>(new Map());
  const particleGroupRef = useRef<THREE.Group | null>(null);
  const asteroidGroupRef = useRef<THREE.Group | null>(null);
  const asteroidMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());

  // Particle pool & shared geometry
  const particlePoolRef = useRef<THREE.Mesh[]>([]);
  const activeParticleMeshesRef = useRef<THREE.Mesh[]>([]);
  const sharedParticleGeoRef = useRef<THREE.BufferGeometry | null>(null);

  // Keep refs for props used in animation loop to prevent stale closures
  const engineRef = useRef<SpaceCombatEngine>(engine);
  const cameraModeRef = useRef<'follow' | 'target' | 'isometric'>(cameraMode);
  const selectedTargetIdRef = useRef<string | null>(selectedTargetId);

  // Mouse & Touch interaction
  const isDraggingRef = useRef(false);
  const dragButtonRef = useRef<number>(0);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const cameraOrbitAngleRef = useRef({ theta: 0, phi: 0.35 });
  const isoYawRef = useRef<number>(Math.PI / 4);
  const isoPitchRef = useRef<number>(Math.atan2(0.85, 1.0));
  const cameraZoomLevelRef = useRef<number>(1.0);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomLevelRef = useRef<number>(1.0);

  // Sync prop refs when they change
  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    selectedTargetIdRef.current = selectedTargetId;
  }, [selectedTargetId]);

  // Helper to dispose geometries and materials recursively
  const disposeObject3D = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  };

  // Handle engine instance changes (e.g., restart combat, select new ship/mission)
  useEffect(() => {
    const isNewEngine = engineRef.current !== engine;
    engineRef.current = engine;

    if (isNewEngine && sceneRef.current) {
      const scene = sceneRef.current;

      // Clean up old ship meshes & shield visualizers
      shipMeshesRef.current.forEach((mesh) => {
        scene.remove(mesh);
        disposeObject3D(mesh);
      });
      shipMeshesRef.current.clear();
      shieldMeshesRef.current.clear();
      weaponArcMeshesRef.current.clear();
      droneRangeRingMeshesRef.current.forEach((ring) => {
        scene.remove(ring);
        disposeObject3D(ring);
      });
      droneRangeRingMeshesRef.current.clear();

      // Clean up old projectiles & beams & ordnances
      projectileMeshesRef.current.forEach((mesh) => {
        scene.remove(mesh);
        disposeObject3D(mesh);
      });
      projectileMeshesRef.current.clear();
      ordnanceMeshesRef.current.forEach((mesh) => {
        scene.remove(mesh);
        disposeObject3D(mesh);
      });
      ordnanceMeshesRef.current.clear();
      beamLinesRef.current.forEach((line) => {
        scene.remove(line);
        disposeObject3D(line);
      });
      beamLinesRef.current.clear();

      // Clean up old asteroid meshes
      asteroidMeshesRef.current.forEach((mesh) => {
        if (asteroidGroupRef.current) {
          asteroidGroupRef.current.remove(mesh);
        }
        disposeObject3D(mesh);
      });
      asteroidMeshesRef.current.clear();

      // Clean up Boss Raid telegraph overlay if present
      const existingTelegraph = scene.getObjectByName('boss_raid_telegraph_overlay');
      if (existingTelegraph) {
        scene.remove(existingTelegraph);
        disposeObject3D(existingTelegraph);
      }

      // Reset camera to focus on new player ship
      if (cameraRef.current) {
        const initPlayer = engine.player;
        const isPortrait = cameraRef.current.aspect < 1.0;
        const dist = isPortrait ? 15 : 28;
        const height = isPortrait ? 14 : 20;
        const { theta, phi } = cameraOrbitAngleRef.current;
        const horizDist = dist * Math.cos(phi);
        cameraRef.current.position.set(
          initPlayer.position.x - Math.sin(theta) * horizDist,
          initPlayer.position.y + height,
          initPlayer.position.z - Math.cos(theta) * horizDist
        );
        cameraRef.current.lookAt(initPlayer.position.x, initPlayer.position.y + 1.5, initPlayer.position.z);
      }
    }
  }, [engine]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene Setup
    sceneRef.current = null;
    shipMeshesRef.current.clear();
    shieldMeshesRef.current.clear();
    weaponArcMeshesRef.current.clear();
    projectileMeshesRef.current.clear();
    beamLinesRef.current.clear();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712); // Deep space dark
    scene.fog = new THREE.FogExp2(0x030712, 0.00025); // Ultra-long render distance for MOBA arena
    sceneRef.current = scene;

    // 2. Camera Setup
    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    // Position camera immediately near player so ship is instantly visible
    const initPlayer = engine.player;
    camera.position.set(
      initPlayer.position.x,
      initPlayer.position.y + 12,
      initPlayer.position.z - 22
    );
    camera.lookAt(
      initPlayer.position.x,
      initPlayer.position.y + 1.5,
      initPlayer.position.z
    );
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0x404050, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight1.position.set(100, 150, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.8); // Blue nebular tint
    dirLight2.position.set(-100, -50, -100);
    scene.add(dirLight2);

    // 5. Deep Space Background (Starfield & Dust)
    createStarfield(scene);
    createAsteroidBelt(scene);

    // Group for dynamic particles
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    particleGroupRef.current = particleGroup;

    // 6. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    });
    resizeObserver.observe(container);

    // Raycaster for Ship Clicking & Swarm Spatial Waypoints
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // 7. Mouse & Touch Orbit & Zoom Controls
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!container) return;

      // Ignore right-click waypoint if user was dragging to orbit camera
      const distDragged = Math.hypot(
        e.clientX - mouseDownPosRef.current.x,
        e.clientY - mouseDownPosRef.current.y
      );
      if (distDragged > 8) return;

      const currentEngine = engineRef.current;
      const player = currentEngine.player;
      if (!player || player.isDestroyed) return;

      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const isCarrier =
        player.shipClass.modelType === 'carrier' ||
        player.shipClass.id.includes('carrier') ||
        player.shipClass.id.includes('aegis') ||
        player.shipClass.id.includes('hive') ||
        !!player.hangarState;

      // 1. Check if right-clicking directly on an enemy ship mesh
      const targetMeshes: THREE.Object3D[] = [];
      shipMeshesRef.current.forEach((mesh, id) => {
        if (id !== player.id) targetMeshes.push(mesh);
      });

      const intersects = raycaster.intersectObjects(targetMeshes, true);
      if (intersects.length > 0) {
        let curr: THREE.Object3D | null = intersects[0].object;
        while (curr && !curr.name.startsWith('ship_')) {
          curr = curr.parent;
        }
        if (curr && curr.userData.shipId) {
          const enemyShip = currentEngine.enemies.find((e) => e.id === curr.userData.shipId);
          if (enemyShip) {
            onSelectShip(enemyShip.id);
            if (isCarrier) {
              currentEngine.setSwarmWaypoint(enemyShip.position.x, enemyShip.position.z, player, enemyShip.id);
            }
            return;
          }
        }
      }

      // 2. Point on ground plane
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();

      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        // Carrier Drones Waypoint
        if (isCarrier) {
          currentEngine.setSwarmWaypoint(hitPoint.x, hitPoint.z, player);
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 2) {
        if (e.button === 2) {
          e.preventDefault();
        }
        isDraggingRef.current = true;
        dragButtonRef.current = e.button;
        previousMousePosition.current = { x: e.clientX, y: e.clientY };
        mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePosition.current.x;
        const deltaY = e.clientY - previousMousePosition.current.y;

        if (cameraModeRef.current === 'isometric' || cameraModeRef.current === 'target') {
          isoYawRef.current -= deltaX * 0.007;
          isoPitchRef.current = Math.max(
            0.05,
            Math.min(Math.PI / 2.05, isoPitchRef.current + deltaY * 0.007)
          );
        } else {
          cameraOrbitAngleRef.current.theta -= deltaX * 0.007;
          cameraOrbitAngleRef.current.phi = Math.max(
            0.05,
            Math.min(Math.PI / 2.1, cameraOrbitAngleRef.current.phi + deltaY * 0.007)
          );
        }

        previousMousePosition.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const zoomFactor = delta > 0 ? 1.12 : 0.88;
      cameraZoomLevelRef.current = Math.max(0.35, Math.min(3.5, cameraZoomLevelRef.current * zoomFactor));
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        previousMousePosition.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialPinchDistRef.current = dist;
        initialZoomLevelRef.current = cameraZoomLevelRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistRef.current > 0) {
        if (e.cancelable) e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (currentDist > 5) {
          const ratio = initialPinchDistRef.current / currentDist;
          cameraZoomLevelRef.current = Math.max(0.35, Math.min(3.5, initialZoomLevelRef.current * ratio));
        }
      } else if (isDraggingRef.current && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - previousMousePosition.current.x;
        const deltaY = e.touches[0].clientY - previousMousePosition.current.y;

        if (cameraModeRef.current === 'isometric' || cameraModeRef.current === 'target') {
          isoYawRef.current -= deltaX * 0.007;
          isoPitchRef.current = Math.max(
            0.05,
            Math.min(Math.PI / 2.05, isoPitchRef.current + deltaY * 0.007)
          );
        } else {
          cameraOrbitAngleRef.current.theta -= deltaX * 0.007;
          cameraOrbitAngleRef.current.phi = Math.max(
            0.05,
            Math.min(Math.PI / 2.1, cameraOrbitAngleRef.current.phi + deltaY * 0.007)
          );
        }

        previousMousePosition.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDistRef.current = 0;
      }
      if (e.touches.length === 0) {
        isDraggingRef.current = false;
      } else if (e.touches.length === 1) {
        isDraggingRef.current = true;
        previousMousePosition.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleDoubleClick = () => {
      cameraOrbitAngleRef.current = { theta: 0, phi: 0.35 };
      isoYawRef.current = Math.PI / 4;
      isoPitchRef.current = Math.atan2(0.85, 1.0);
      cameraZoomLevelRef.current = 1.0;
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('contextmenu', handleContextMenu);
    domElem.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domElem.addEventListener('wheel', handleWheel, { passive: false });
    domElem.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    domElem.addEventListener('dblclick', handleDoubleClick);

    // Raycaster for Ship Clicking
    const handleClick = (e: MouseEvent) => {
      if (!container) return;
      if (e.button !== 0) return;
      // Ignore click if mouse moved more than 6px (was a camera drag operation)
      const distDragged = Math.hypot(
        e.clientX - mouseDownPosRef.current.x,
        e.clientY - mouseDownPosRef.current.y
      );
      if (distDragged > 6) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Check intersections with enemy meshes
      const targetMeshes: THREE.Object3D[] = [];
      const currentEngine = engineRef.current;
      shipMeshesRef.current.forEach((mesh, id) => {
        if (id !== currentEngine.player.id) {
          targetMeshes.push(mesh);
        }
      });

      const intersects = raycaster.intersectObjects(targetMeshes, true);
      if (intersects.length > 0) {
        let curr: THREE.Object3D | null = intersects[0].object;
        while (curr && !curr.name.startsWith('ship_')) {
          curr = curr.parent;
        }
        if (curr) {
          const shipId = curr.userData.shipId;
          if (shipId) {
            onSelectShip(shipId);
            return;
          }
        }
      }

      // Point-and-Click ground plane raycast in Isometric / Target / MOBA mode
      if (cameraModeRef.current === 'isometric' || cameraModeRef.current === 'target') {
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const hitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
          const player = currentEngine.player;
          player.waypoint = { x: hitPoint.x, z: hitPoint.z };
          player.targetSpeed = player.shipClass.maxSpeed;
        }
      }
    };

    domElem.addEventListener('click', handleClick);

    // 8. Animation Loop
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      const activeEngine = engineRef.current;

      // Tick Combat Engine Logic
      activeEngine.update(delta);

      // Render Scene Updates
      updateSceneFromEngine(
        scene,
        camera,
        activeEngine,
        cameraModeRef.current,
        selectedTargetIdRef.current
      );

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      domElem.removeEventListener('contextmenu', handleContextMenu);
      domElem.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domElem.removeEventListener('wheel', handleWheel);
      domElem.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      domElem.removeEventListener('click', handleClick);
      domElem.removeEventListener('dblclick', handleDoubleClick);
      shipMeshesRef.current.forEach((mesh) => disposeObject3D(mesh));
      shipMeshesRef.current.clear();
      shieldMeshesRef.current.clear();
      weaponArcMeshesRef.current.clear();
      droneRangeRingMeshesRef.current.forEach((ring) => disposeObject3D(ring));
      droneRangeRingMeshesRef.current.clear();

      projectileMeshesRef.current.forEach((mesh) => disposeObject3D(mesh));
      projectileMeshesRef.current.clear();

      beamLinesRef.current.forEach((line) => disposeObject3D(line));
      beamLinesRef.current.clear();

      particlePoolRef.current.forEach((mesh) => disposeObject3D(mesh));
      particlePoolRef.current = [];
      activeParticleMeshesRef.current.forEach((mesh) => disposeObject3D(mesh));
      activeParticleMeshesRef.current = [];

      if (sharedParticleGeoRef.current) {
        sharedParticleGeoRef.current.dispose();
        sharedParticleGeoRef.current = null;
      }
      sceneRef.current = null;
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Scene 3D meshes based on game engine state
  const updateSceneFromEngine = (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    combatEngine: SpaceCombatEngine,
    camMode: 'follow' | 'target' | 'isometric',
    targetId: string | null
  ) => {
    // Sync Asteroid Meshes (Add missing ones, remove destroyed/stale ones)
    if (asteroidGroupRef.current && combatEngine.asteroids) {
      const activeAstIds = new Set(combatEngine.asteroids.map((a) => a.id));

      // Remove destroyed or stale meshes
      asteroidMeshesRef.current.forEach((mesh, id) => {
        if (!activeAstIds.has(id)) {
          asteroidGroupRef.current?.remove(mesh);
          disposeObject3D(mesh);
          asteroidMeshesRef.current.delete(id);
        }
      });

      // Add missing 3D meshes for active asteroids
      combatEngine.asteroids.forEach((ast) => {
        if (!asteroidMeshesRef.current.has(ast.id)) {
          const mesh = ShipModelBuilder.createAsteroidMesh(ast.radius);
          mesh.position.set(ast.position.x, ast.position.y, ast.position.z);
          asteroidGroupRef.current?.add(mesh);
          asteroidMeshesRef.current.set(ast.id, mesh);
        }
      });
    }

    const allShips = [combatEngine.player, ...combatEngine.enemies];

    // Clean up meshes of ships/drones that no longer exist or were removed
    const currentShipIds = new Set(allShips.map((s) => s.id));
    shipMeshesRef.current.forEach((mesh, id) => {
      if (!currentShipIds.has(id)) {
        if (mesh.parent) mesh.parent.remove(mesh);
        disposeObject3D(mesh);
        shipMeshesRef.current.delete(id);
      }
    });

    droneRangeRingMeshesRef.current.forEach((ringGroup, id) => {
      if (!currentShipIds.has(id)) {
        if (ringGroup.parent) ringGroup.parent.remove(ringGroup);
        disposeObject3D(ringGroup);
        droneRangeRingMeshesRef.current.delete(id);
      }
    });

    // 1. Sync Ship Meshes
    allShips.forEach((ship) => {
      let shipGroup = shipMeshesRef.current.get(ship.id);
      const currentDesign = ship.carrierDesign || ship.shipClass.carrierDesign || 'solaris';

      if (!shipGroup || shipGroup.parent !== scene || shipGroup.userData.carrierDesign !== currentDesign) {
        if (shipGroup && shipGroup.parent) {
          shipGroup.parent.remove(shipGroup);
        }
        // Create 3D low-poly / model mesh
        shipGroup = ShipModelBuilder.createShipMesh(
          ship.shipClass.modelType,
          ship.faction,
          (ship.shipClass as any).assetModelPath,
          currentDesign
        );
        shipGroup.userData = { shipId: ship.id, carrierDesign: currentDesign };

        const isStation = ship.shipClass.modelType === 'station';
        if (isStation) {
          shipGroup.scale.set(4.0, 4.0, 4.0);
          // Add a high vertical beacon beam light so starbases stand out across the MOBA map
          const beaconGeo = new THREE.CylinderGeometry(0.8, 2.5, 140, 12, 1, true);
          const beaconMat = new THREE.MeshBasicMaterial({
            color: ship.faction === 'federation' ? 0x38bdf8 : 0xef4444,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          });
          const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
          beaconMesh.position.y = 70;
          shipGroup.add(beaconMesh);

          // Add a bright point light for distant illumination
          const pLight = new THREE.PointLight(ship.faction === 'federation' ? 0x38bdf8 : 0xef4444, 4.0, 500);
          pLight.position.y = 15;
          shipGroup.add(pLight);
        } else if (ship.shipClass.modelType === 'boss_leviathan') {
          const bossLight = new THREE.PointLight(0xef4444, 5.5, 220);
          bossLight.position.set(0, 12, -8);
          shipGroup.add(bossLight);
        }

        scene.add(shipGroup);
        shipMeshesRef.current.set(ship.id, shipGroup);

        // Add 4-Arc Shield Visualizer
        const shieldRadius = ShipModelBuilder.getShieldRadius(ship.shipClass.modelType);

        const shieldVisualizer = ShipModelBuilder.createShieldArcVisualizer(shieldRadius);
        const sX = shipGroup.scale.x || 1.0;
        const sY = shipGroup.scale.y || 1.0;
        const sZ = shipGroup.scale.z || 1.0;
        shieldVisualizer.scale.set(1.0 / sX, 1.0 / sY, 1.0 / sZ);
        shipGroup.add(shieldVisualizer);
        shieldMeshesRef.current.set(ship.id, shieldVisualizer);

        // Add Weapon Firing Arcs Visualizer
        const weaponArcVisualizer = ShipModelBuilder.createWeaponArcVisualizer(ship.weapons, shieldRadius);
        weaponArcVisualizer.scale.set(1.0 / sX, 1.0 / sY, 1.0 / sZ);
        shipGroup.add(weaponArcVisualizer);
        weaponArcMeshesRef.current.set(ship.id, weaponArcVisualizer);
      }

      // 2. Drone Control Range Ring for Hive Carrier & Carrier Ships
      const isCarrier =
        ship.shipClass.modelType === 'carrier' ||
        ship.shipClass.id.includes('carrier') ||
        ship.shipClass.id.includes('aegis') ||
        ship.shipClass.id.includes('hive') ||
        ship.carrierDesign === 'vortex_hive' ||
        !!ship.hangarState;

      let ringGroup = droneRangeRingMeshesRef.current.get(ship.id);
      if (isCarrier) {
        if (!ringGroup || ringGroup.parent !== scene) {
          if (ringGroup && ringGroup.parent) ringGroup.parent.remove(ringGroup);

          ringGroup = new THREE.Group();
          ringGroup.name = `drone_range_ring_${ship.id}`;

          const isHive = ship.carrierDesign === 'vortex_hive' || ship.shipClass.id.includes('hive');
          const ringColor = isHive
            ? 0x10b981
            : (ship.faction === 'federation' ? 0x00f0ff : 0xf59e0b);

          // 1. Primary Outer Perimeter Ring
          const outerGeo = new THREE.RingGeometry(DRONE_CONTROL_RANGE - 1.2, DRONE_CONTROL_RANGE + 1.2, 128);
          outerGeo.rotateX(Math.PI / 2);
          const outerMat = new THREE.MeshBasicMaterial({
            color: ringColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending,
          });
          const outerMesh = new THREE.Mesh(outerGeo, outerMat);
          outerMesh.name = 'outer_ring';
          ringGroup.add(outerMesh);

          // 2. Secondary Inner Dashed Ring
          const innerGeo = new THREE.RingGeometry(DRONE_CONTROL_RANGE - 3.5, DRONE_CONTROL_RANGE - 2.8, 128);
          innerGeo.rotateX(Math.PI / 2);
          const innerMat = new THREE.MeshBasicMaterial({
            color: ringColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending,
          });
          const innerMesh = new THREE.Mesh(innerGeo, innerMat);
          innerMesh.name = 'inner_ring';
          ringGroup.add(innerMesh);

          // 3. 12 Cardinal Tick / Node Markers around perimeter
          for (let i = 0; i < 12; i++) {
            const angle = (i * Math.PI) / 6;
            const tickGeo = new THREE.BoxGeometry(1.2, 0.2, 3.5);
            const tickMat = new THREE.MeshBasicMaterial({
              color: ringColor,
              transparent: true,
              opacity: 0.8,
            });
            const tickMesh = new THREE.Mesh(tickGeo, tickMat);
            tickMesh.position.set(
              Math.sin(angle) * DRONE_CONTROL_RANGE,
              0,
              Math.cos(angle) * DRONE_CONTROL_RANGE
            );
            tickMesh.rotation.y = angle;
            ringGroup.add(tickMesh);
          }

          // 4. Subtle Area Field Tint Overlay
          const fieldGeo = new THREE.RingGeometry(0, DRONE_CONTROL_RANGE - 3.5, 96);
          fieldGeo.rotateX(Math.PI / 2);
          const fieldMat = new THREE.MeshBasicMaterial({
            color: ringColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.02,
          });
          const fieldMesh = new THREE.Mesh(fieldGeo, fieldMat);
          ringGroup.add(fieldMesh);

          scene.add(ringGroup);
          droneRangeRingMeshesRef.current.set(ship.id, ringGroup);
        }

        if (ship.isDestroyed) {
          ringGroup.visible = false;
        } else {
          ringGroup.visible = true;
          ringGroup.position.set(ship.position.x, 0.3, ship.position.z);
          ringGroup.rotation.y += 0.0015; // Slow ambient rotation
          const outerMesh = ringGroup.getObjectByName('outer_ring') as THREE.Mesh;
          if (outerMesh && outerMesh.material) {
            (outerMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(Date.now() * 0.003);
          }
        }
      } else if (ringGroup) {
        ringGroup.visible = false;
      }

      if (ship.isDestroyed) {
        shipGroup.visible = false;
        return;
      }

      shipGroup.visible = true;

      // Update position & heading rotation
      shipGroup.position.set(ship.position.x, ship.position.y, ship.position.z);
      shipGroup.rotation.y = ship.rotation.y;

      // Slight banking roll when turning
      const targetRoll = -Math.sin(ship.rotation.y) * 0.1;
      shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, targetRoll, 0.1);

      const isTargeted = !!(targetId && ship.id === targetId && !ship.isDestroyed);
      const isStation = ship.shipClass.modelType === 'station';
      const isBoss = ship.shipClass.modelType === 'boss_leviathan' || ship.raidRole === 'boss';
      const playerTeam = combatEngine.player.team || 'alpha';
      const isAllyShip = (ship.team || (ship.isPlayer ? 'alpha' : 'beta')) === playerTeam;

      // 1. Target Highlight Light (PointLight that illuminates the ship brighter when targeted; disabled on Boss)
      let highlightLight = shipGroup.getObjectByName('target_highlight_light') as THREE.PointLight;
      if (!highlightLight) {
        const highlightColor = isAllyShip ? 0x38bdf8 : 0xef4444;
        highlightLight = new THREE.PointLight(highlightColor, 0, isStation ? 350 : 120);
        highlightLight.name = 'target_highlight_light';
        highlightLight.position.set(0, isStation ? 25 : 6, 0);
        shipGroup.add(highlightLight);
      } else {
        highlightLight.color.setHex(isAllyShip ? 0x38bdf8 : 0xef4444);
      }

      // Calculate pulsing flash factor for targeted ship (oscillates between brighter and darker)
      const flashTime = performance.now() * 0.007;
      const flashFactor = (Math.sin(flashTime) + 1) / 2; // 0 to 1 oscillation

      highlightLight.visible = isTargeted && !isBoss;
      const baseLight = isStation ? 16.0 : 7.0;
      highlightLight.intensity = isTargeted && !isBoss ? baseLight * (0.2 + 0.8 * flashFactor) : 0;

      // 2. Modulate ship hull materials emissive glow when targeted (never flash the Boss hull)
      if (!isBoss) {
        shipGroup.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            child.name !== 'border' &&
            child.name !== 'arc_border' &&
            !child.name.startsWith('shield_arc_') &&
            !child.name.startsWith('arc_')
          ) {
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial) {
                  if (isTargeted) {
                    const emissiveColor = isAllyShip ? 0x38bdf8 : 0xf59e0b;
                    mat.emissive.setHex(emissiveColor);
                    mat.emissiveIntensity = 0.1 + 0.8 * flashFactor; // Flashes between dim (0.1) and bright (0.9)
                  } else {
                    mat.emissive.setHex(0x000000);
                    mat.emissiveIntensity = 0;
                  }
                }
              });
            }
          }
        });
      }

      // Update 4 Shield Arc Visualizer Colors & Opacity
      const shieldVisualizer = shieldMeshesRef.current.get(ship.id);
      if (shieldVisualizer) {
        const arcKeys: ShieldArcKey[] = ['front', 'starboard', 'back', 'port'];
        const activeImpacts = combatEngine.shieldImpacts.filter((imp) => imp.shipId === ship.id);

        arcKeys.forEach((key) => {
          const arcMesh = shieldVisualizer.getObjectByName(`shield_arc_${key}`) as THREE.Mesh;
          if (arcMesh) {
            const arcData = ship.shields[key];
            const ratio = arcData.current / arcData.max;

            const hasImpact = activeImpacts.some((imp) => imp.arc === key);
            const pulse = 0.85 + Math.sin(Date.now() * 0.03) * 0.15; // High frequency phaser impact shimmer

            let fillOpacity = 0;
            let borderOpacity = 0;
            let fillColor = 0x38bdf8;
            let borderColor = 0x38bdf8;

            if (ratio <= 0.05) {
              fillOpacity = 0; // Shield segment <= 5% HP disappears completely!
              borderOpacity = 0;
            } else {
              // Determine health threshold base color & struck flash color
              let idleColor = 0x38bdf8; // Cyan (>= 60%)
              let flashFillColor = 0x7dd3fc; // Bright Cyan Flash
              let flashBorderColor = 0xffffff; // Pure white-cyan border

              if (ratio < 0.3) {
                // RED HEALTH THRESHOLD (5% < ratio < 30%) -> Returns as Red segment
                idleColor = 0xef4444; // Red
                flashFillColor = 0xef4444; // Bright Red Flash
                flashBorderColor = 0xf87171; // Glowing Red Border
              } else if (ratio < 0.6) {
                // YELLOW HEALTH THRESHOLD (30% - 60%)
                idleColor = 0xf59e0b; // Amber/Yellow
                flashFillColor = 0xfacc15; // Vibrant Yellow Flash
                flashBorderColor = 0xfde047; // Glowing Yellow Border
              }

              if (hasImpact) {
                fillOpacity = 0.85 * pulse;
                borderOpacity = 1.0;
                fillColor = flashFillColor;
                borderColor = flashBorderColor;
              } else {
                fillOpacity = 0.08;
                borderOpacity = 0.25;
                fillColor = idleColor;
                borderColor = idleColor;
              }
            }

            // Apply fill color/opacity to primary outer 3D forcefield wall
            if (arcMesh.material) {
              const mat = arcMesh.material as THREE.MeshBasicMaterial;
              mat.opacity = fillOpacity;
              mat.color.setHex(fillColor);
            }

            // Traverse and update all child 3D forcefield structures (all 6 faces of the block + edge borders)
            arcMesh.traverse((child) => {
              if (child === arcMesh) return;
              if (child instanceof THREE.Mesh) {
                const cMat = child.material as THREE.MeshBasicMaterial;
                if (cMat) {
                  if (
                    child.name.includes('border') ||
                    child.name.includes('line')
                  ) {
                    cMat.opacity = borderOpacity;
                    cMat.color.setHex(borderColor);
                  } else if (
                    child.name === 'top_cap' ||
                    child.name === 'floor' ||
                    child.name === 'left_side_wall' ||
                    child.name === 'right_side_wall' ||
                    child.name === 'inner_wall'
                  ) {
                    cMat.opacity = fillOpacity * 0.9;
                    cMat.color.setHex(fillColor);
                  } else {
                    cMat.opacity = fillOpacity;
                    cMat.color.setHex(fillColor);
                  }
                }
              } else if (child instanceof THREE.Line) {
                const lMat = child.material as THREE.LineBasicMaterial;
                if (lMat) {
                  lMat.opacity = borderOpacity;
                  lMat.color.setHex(borderColor);
                }
              }
            });
          }
        });
      }

      // Update Faint Weapon Firing Arcs Visualizer
      const weaponArcVisualizer = weaponArcMeshesRef.current.get(ship.id);
      if (weaponArcVisualizer) {
        const isHumanPlayer = ship.isPlayer && ship.id === combatEngine.player?.id;
        const showArcs = isHumanPlayer && !ship.isDestroyed;

        weaponArcVisualizer.visible = showArcs;
        weaponArcVisualizer.traverse((child) => {
          if (child !== weaponArcVisualizer) {
            child.visible = showArcs;
          }
        });

        if (showArcs) {
          const currentTarget = allShips.find(
            (s) => s.id === selectedTargetIdRef.current && !s.isDestroyed
          );

          const targetDist = currentTarget
            ? Math.hypot(
                ship.position.x - currentTarget.position.x,
                (ship.position.y || 0) - (currentTarget.position.y || 0),
                ship.position.z - currentTarget.position.z
              )
            : Infinity;

          weaponArcVisualizer.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
              const arcType = child.userData.arcType as FiringArc;
              const mat = child.material as THREE.MeshBasicMaterial;
              const borderMesh = child.getObjectByName('arc_border') as THREE.Mesh;
              const borderMat = borderMesh?.material as THREE.MeshBasicMaterial;

              let isInArcAndRange = false;
              let isWeaponReady = true;

              if (ship.weapons && ship.weapons.length > 0) {
                const matchingWeapons = ship.weapons.filter((w) => w.firingArc === arcType);
                if (matchingWeapons.length > 0) {
                  isWeaponReady = matchingWeapons.some((w) => w.currentCooldown <= 0);
                }
              }

              const arcLabel = (child.userData.label || arcType) as string;
              if (currentTarget && !currentTarget.isDestroyed) {
                if (ship.weapons && ship.weapons.length > 0) {
                  const matchingWeapons = ship.weapons.filter(
                    (w) => w.firingArc === arcType || w.firingArc === arcLabel
                  );
                  if (matchingWeapons.length > 0) {
                    isInArcAndRange = matchingWeapons.some(
                      (w) =>
                        targetDist <= w.range &&
                        SpaceCombatEngine.isInFiringArc(
                          ship.position,
                          ship.rotation.y,
                          currentTarget.position,
                          w.firingArc,
                          w
                        )
                    );
                  } else {
                    const inArc = SpaceCombatEngine.isInFiringArc(
                      ship.position,
                      ship.rotation.y,
                      currentTarget.position,
                      arcLabel
                    );
                    const maxArcRange = ship.weapons.length > 0
                      ? Math.max(...ship.weapons.map((w) => w.range || 88))
                      : 88;
                    isInArcAndRange = inArc && targetDist <= maxArcRange;
                  }
                } else {
                  isInArcAndRange = SpaceCombatEngine.isInFiringArc(
                    ship.position,
                    ship.rotation.y,
                    currentTarget.position,
                    arcLabel
                  );
                }
              }

              const baseColor = child.userData.baseColor ?? 0x38bdf8;
              const brightColor = child.userData.brightColor ?? 0xbae6fd;

              if (isInArcAndRange && isWeaponReady) {
                // Target IN ARC & IN RANGE & Weapon READY -> Bright Glow matching weapon theme color
                mat.opacity = child.userData.isTorpedoLine ? 0.75 : 0.45;
                mat.color.setHex(baseColor);
                if (borderMesh && borderMat) {
                  borderMat.opacity = 1.0;
                  borderMat.color.setHex(brightColor);
                }
              } else {
                // OUT OF ARC, OUT OF RANGE, or NO TARGET -> Faded matching weapon theme color
                mat.opacity = child.userData.isTorpedoLine ? 0.20 : 0.15;
                mat.color.setHex(baseColor);
                if (borderMesh && borderMat) {
                  borderMat.opacity = 0.45;
                  borderMat.color.setHex(baseColor);
                }
              }
            }
          });
        }
      }
    });

    // 1.5. Render 3D Waypoint Marker Beacon if player has an active waypoint
    const playerShip = combatEngine.player;
    let waypointBeacon = scene.getObjectByName('player_waypoint_beacon') as THREE.Group;
    if (playerShip.waypoint) {
      if (!waypointBeacon) {
        waypointBeacon = new THREE.Group();
        waypointBeacon.name = 'player_waypoint_beacon';

        // Cyan ring mesh
        const ringGeo = new THREE.RingGeometry(3.5, 4.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.name = 'ring';
        waypointBeacon.add(ringMesh);

        // Vertical cyan beam
        const beamGeo = new THREE.CylinderGeometry(0.5, 2.5, 40, 16, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.y = 20;
        beamMesh.name = 'beam';
        waypointBeacon.add(beamMesh);

        scene.add(waypointBeacon);
      }

      waypointBeacon.position.set(playerShip.waypoint.x, 0, playerShip.waypoint.z);
      waypointBeacon.visible = true;

      // Pulse and spin waypoint ring
      const ringMesh = waypointBeacon.getObjectByName('ring') as THREE.Mesh;
      if (ringMesh) {
        ringMesh.rotation.z += 0.02;
        const pulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
        (ringMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
    } else if (waypointBeacon) {
      waypointBeacon.visible = false;
    }

    // 1.6. Render 3D Swarm Spatial Waypoint Beacon
    const swarmWaypoint = playerShip.hangarState?.swarmWaypoint;
    let swarmBeacon = scene.getObjectByName('player_swarm_beacon') as THREE.Group;
    if (swarmWaypoint) {
      if (!swarmBeacon) {
        swarmBeacon = new THREE.Group();
        swarmBeacon.name = 'player_swarm_beacon';

        // Outer Hex/Circle ring mesh (Cyan/Amber)
        const ringGeo = new THREE.RingGeometry(4.0, 5.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.name = 'ring';
        swarmBeacon.add(ringMesh);

        // Inner targeting crosshair ring
        const innerGeo = new THREE.RingGeometry(1.5, 2.2, 16);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        innerMesh.rotation.x = Math.PI / 2;
        innerMesh.name = 'inner_ring';
        swarmBeacon.add(innerMesh);

        // Vertical cyan beacon pillar
        const beamGeo = new THREE.CylinderGeometry(0.6, 3.5, 45, 16, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.y = 22.5;
        beamMesh.name = 'beam';
        swarmBeacon.add(beamMesh);

        scene.add(swarmBeacon);
      }

      swarmBeacon.position.set(swarmWaypoint.x, 0, swarmWaypoint.z);
      swarmBeacon.visible = true;

      const ringMesh = swarmBeacon.getObjectByName('ring') as THREE.Mesh;
      if (ringMesh) {
        ringMesh.rotation.z -= 0.03;
      }
      const innerMesh = swarmBeacon.getObjectByName('inner_ring') as THREE.Mesh;
      if (innerMesh) {
        innerMesh.rotation.z += 0.04;
      }
    } else if (swarmBeacon) {
      swarmBeacon.visible = false;
    }

    // 2. Camera Positioning & Viewport Shift
    const player = combatEngine.player;
    const isPortrait = camera.aspect < 1.1;

    if (camera.view && camera.view.enabled) {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }

    const zoomLevel = cameraZoomLevelRef.current;

    if (camMode === 'follow') {
      const baseDist = isPortrait ? 17 : 30;
      const dist = baseDist * zoomLevel;

      const { theta, phi } = cameraOrbitAngleRef.current;
      const camYaw = theta;

      const horizDist = dist * Math.cos(phi);
      const vertHeight = (dist * Math.sin(phi) + (isPortrait ? 6 : 8)) * 1.5 * zoomLevel;

      const targetCamX = player.position.x - Math.sin(camYaw) * Math.max(2, horizDist);
      const targetCamY = player.position.y + Math.max(2.5, vertHeight);
      const targetCamZ = player.position.z - Math.cos(camYaw) * Math.max(2, horizDist);

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.18);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.18);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.18);

      const targetLookX = player.position.x;
      const targetLookY = player.position.y + (isPortrait ? 2.5 : 1.5);
      const targetLookZ = player.position.z;

      camera.lookAt(targetLookX, targetLookY, targetLookZ);
    } else {
      // 'isometric' or 'target' Camera Mode
      const isSiege = !!combatEngine.siegeController;
      const baseDist = isSiege ? (isPortrait ? 234 : 338) : (isPortrait ? 45.5 : 84.5);
      const isoDist = baseDist * zoomLevel;

      if (camMode === 'target') {
        const activeTargetId = targetId || player.targetId;
        const targetShip =
          allShips.find((s) => s.id === activeTargetId && s.id !== player.id && !s.isDestroyed) ||
          combatEngine.enemies.find((e) => !e.isDestroyed);

        if (targetShip && !isDraggingRef.current) {
          // Calculate yaw so camera is behind player facing towards target
          const dx = player.position.x - targetShip.position.x;
          const dz = player.position.z - targetShip.position.z;
          const desiredYaw = Math.atan2(dx, dz);
          let diff = desiredYaw - isoYawRef.current;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          isoYawRef.current += diff * 0.08;
        }
      }

      // Rotatable Isometric Camera perspective (player centered in view)
      const horizRadius = isoDist * Math.cos(isoPitchRef.current);
      const offsetX = horizRadius * Math.sin(isoYawRef.current);
      const offsetZ = horizRadius * Math.cos(isoYawRef.current);
      const offsetY = isoDist * Math.sin(isoPitchRef.current);

      const targetCamX = player.position.x + offsetX;
      const targetCamY = player.position.y + offsetY;
      const targetCamZ = player.position.z + offsetZ;

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.18);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.18);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.18);

      camera.lookAt(player.position.x, player.position.y + (isPortrait ? 1.5 : 0.5), player.position.z);
    }

    // 3. Render Torpedo Projectiles
    updateProjectilesInScene(scene, combatEngine);

    // 3b. Render Zoning Ordnance Field Barriers
    updateOrdnancesInScene(scene, combatEngine);

    // 4. Render Beam Weapon Lasers
    updateBeamsInScene(scene, combatEngine);

    // 5. Render Particle Explosions
    updateParticlesInScene(combatEngine);

    // 6. Render Boss Raid Obliteration Beam Telegraph & Tank Cover Shadow Zone
    updateBossRaidTelegraphInScene(scene, combatEngine);
  };

  const updateBossRaidTelegraphInScene = (scene: THREE.Scene, combatEngine: SpaceCombatEngine) => {
    const raid = combatEngine.bossRaidController;
    let overlay = scene.getObjectByName('boss_raid_telegraph_overlay') as THREE.Group | undefined;

    if (!raid || !raid.isBossRaidActive || raid.targetedAttack.state !== 'charging') {
      if (overlay) {
        overlay.visible = false;
      }
      return;
    }

    if (!overlay) {
      overlay = new THREE.Group();
      overlay.name = 'boss_raid_telegraph_overlay';

      // 1. Targeting Laser Line (Cylinder stretched from Boss muzzle to intercept point)
      const lineGeo = new THREE.CylinderGeometry(0.32, 0.32, 1, 10);
      lineGeo.rotateX(Math.PI / 2);
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
      });
      const lineMesh = new THREE.Mesh(lineGeo, lineMat);
      lineMesh.name = 'telegraph_laser';
      overlay.add(lineMesh);

      // 2. Impact Focal Orb (on Tank shield when covered, on Support when exposed)
      const orbGeo = new THREE.SphereGeometry(2.2, 14, 14);
      const orbMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      });
      const orbMesh = new THREE.Mesh(orbGeo, orbMat);
      orbMesh.name = 'telegraph_orb';
      overlay.add(orbMesh);

      // 3. Support Target Warning Ring on ground plane
      const ringGeo = new THREE.RingGeometry(7.5, 9.2, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.name = 'support_warning_ring';
      overlay.add(ringMesh);

      // 4. Tank Shadow Safe-Cover Corridor strip behind Tank
      const coverGeo = new THREE.PlaneGeometry(18, 46);
      coverGeo.rotateX(-Math.PI / 2);
      const coverMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const coverMesh = new THREE.Mesh(coverGeo, coverMat);
      coverMesh.name = 'tank_cover_corridor';
      overlay.add(coverMesh);

      scene.add(overlay);
    }

    overlay.visible = true;

    const { bossShip, tankShip, supportShip, targetedAttack } = raid;
    const isCovered = targetedAttack.isIntercepted;
    const statusColor = isCovered ? 0x10b981 : 0xef4444;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.015);
    const chargeProgress = 1 - Math.max(0, targetedAttack.chargeTimer) / targetedAttack.maxChargeTime;

    const bossMuzzle = new THREE.Vector3(bossShip.position.x, bossShip.position.y + 0.6, bossShip.position.z - 14.0);
    const targetPt = new THREE.Vector3(
      targetedAttack.interceptPoint.x,
      targetedAttack.interceptPoint.y + 0.4,
      targetedAttack.interceptPoint.z
    );

    // Update Laser
    const laser = overlay.getObjectByName('telegraph_laser') as THREE.Mesh;
    if (laser) {
      const dist = bossMuzzle.distanceTo(targetPt);
      const mid = new THREE.Vector3().addVectors(bossMuzzle, targetPt).multiplyScalar(0.5);
      laser.position.copy(mid);
      laser.lookAt(targetPt);
      const radiusScale = 0.6 + chargeProgress * 1.4;
      laser.scale.set(radiusScale, radiusScale, Math.max(0.1, dist));
      const mat = laser.material as THREE.MeshBasicMaterial;
      mat.color.setHex(statusColor);
      mat.opacity = 0.45 + 0.45 * pulse;
    }

    // Update Orb
    const orb = overlay.getObjectByName('telegraph_orb') as THREE.Mesh;
    if (orb) {
      orb.position.copy(targetPt);
      orb.scale.setScalar(0.75 + 0.6 * chargeProgress + 0.2 * pulse);
      const mat = orb.material as THREE.MeshBasicMaterial;
      mat.color.setHex(statusColor);
      mat.opacity = 0.4 + 0.4 * pulse;
    }

    // Update Support Warning Ring
    const ring = overlay.getObjectByName('support_warning_ring') as THREE.Mesh;
    if (ring && !supportShip.isDestroyed) {
      ring.visible = true;
      ring.position.set(supportShip.position.x, 0.35, supportShip.position.z);
      ring.scale.setScalar(0.95 + 0.12 * pulse);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.color.setHex(statusColor);
      mat.opacity = 0.45 + 0.4 * pulse;
    } else if (ring) {
      ring.visible = false;
    }

    // Update Tank Cover Shadow Corridor behind Tank relative to Boss
    const cover = overlay.getObjectByName('tank_cover_corridor') as THREE.Mesh;
    if (cover && !tankShip.isDestroyed) {
      cover.visible = true;
      const btX = tankShip.position.x - bossShip.position.x;
      const btZ = tankShip.position.z - bossShip.position.z;
      const btLen = Math.hypot(btX, btZ) || 1;
      const ux = btX / btLen;
      const uz = btZ / btLen;
      // Place center of 46m-long corridor 30m behind Tank away from Boss
      cover.position.set(tankShip.position.x + ux * 30, 0.22, tankShip.position.z + uz * 30);
      cover.rotation.y = Math.atan2(ux, uz);
      const mat = cover.material as THREE.MeshBasicMaterial;
      mat.opacity = isCovered ? 0.32 : 0.18 + 0.12 * pulse;
    } else if (cover) {
      cover.visible = false;
    }
  };

  // Helper: Torpedoes rendering (Multi-Layer Plasma Orbs)
  const updateProjectilesInScene = (scene: THREE.Scene, combatEngine: SpaceCombatEngine) => {
    const currentIds = new Set(combatEngine.projectiles.map((p) => p.id));

    // Remove old meshes
    projectileMeshesRef.current.forEach((group, id) => {
      if (!currentIds.has(id)) {
        scene.remove(group);
        disposeObject3D(group);
        projectileMeshesRef.current.delete(id);
      }
    });

    // Add / update current torpedoes & pulse projectiles
    combatEngine.projectiles.forEach((p) => {
      let group = projectileMeshesRef.current.get(p.id);

      if (!group) {
        group = new THREE.Group();

        if (p.isPulse) {
          // 1. Stretched pulse core capsule
          const coreGeo = new THREE.SphereGeometry(0.18, 8, 8);
          coreGeo.scale(1, 1, 2.5);
          const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const coreMesh = new THREE.Mesh(coreGeo, coreMat);
          group.add(coreMesh);

          // 2. High-intensity pulse plasma glow
          const glowGeo = new THREE.SphereGeometry(0.42, 8, 8);
          glowGeo.scale(1, 1, 2.2);
          const glowMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.85 });
          const glowMesh = new THREE.Mesh(glowGeo, glowMat);
          group.add(glowMesh);

          // 3. Wide energy halo
          const haloGeo = new THREE.SphereGeometry(0.8, 8, 8);
          haloGeo.scale(1, 1, 1.8);
          const haloMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.35 });
          const haloMesh = new THREE.Mesh(haloGeo, haloMat);
          group.add(haloMesh);
        } else {
          // 1. Hot white core sphere
          const coreGeo = new THREE.SphereGeometry(0.25, 8, 8);
          const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const coreMesh = new THREE.Mesh(coreGeo, coreMat);
          group.add(coreMesh);

          // 2. Colored plasma glow aura
          const glowGeo = new THREE.SphereGeometry(0.65, 10, 10);
          const glowMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.75 });
          const glowMesh = new THREE.Mesh(glowGeo, glowMat);
          group.add(glowMesh);

          // 3. Wide energy halo
          const haloGeo = new THREE.SphereGeometry(1.1, 8, 8);
          const haloMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.3 });
          const haloMesh = new THREE.Mesh(haloGeo, haloMat);
          group.add(haloMesh);

          // 4. Directional plasma exhaust cone trailing behind torpedo
          const tailGeo = new THREE.ConeGeometry(0.35, 2.2, 8);
          tailGeo.rotateX(Math.PI / 2); // Align along Z axis
          tailGeo.translate(0, 0, -1.1); // Position behind torpedo core
          const tailMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.85 });
          const tailMesh = new THREE.Mesh(tailGeo, tailMat);
          group.add(tailMesh);
        }

        scene.add(group);
        projectileMeshesRef.current.set(p.id, group);
      }

      // Hide before launch frame
      const isWaitingToLaunch = p.launchDelay !== undefined && p.launchDelay > 0 && !p.hasLaunched;
      group.visible = !isWaitingToLaunch;

      group.position.set(p.position.x, p.position.y, p.position.z);
      if (p.velocity && (p.velocity.x !== 0 || p.velocity.z !== 0)) {
        group.lookAt(
          p.position.x + p.velocity.x,
          p.position.y + p.velocity.y,
          p.position.z + p.velocity.z
        );
      }
    });
  };

  // Helper: Inertial Magnetic Mine rendering (3D mine core, arming strobe light & 30m boundary hazard ring)
  const updateOrdnancesInScene = (scene: THREE.Scene, combatEngine: SpaceCombatEngine) => {
    const currentIds = new Set(combatEngine.ordnances.map((o) => o.id));

    // Remove despawned mine meshes
    ordnanceMeshesRef.current.forEach((group, id) => {
      if (!currentIds.has(id)) {
        scene.remove(group);
        disposeObject3D(group);
        ordnanceMeshesRef.current.delete(id);
      }
    });

    // Add / update current active Inertial Mines
    combatEngine.ordnances.forEach((ord) => {
      let group = ordnanceMeshesRef.current.get(ord.id);

      if (!group) {
        group = new THREE.Group();

        // 1. Heavy Mechanical Mine Core
        const mineGroup = new THREE.Group();
        mineGroup.name = 'mine_model';

        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          metalness: 0.9,
          roughness: 0.2,
        });
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0x00e5ff,
          emissive: 0x0284c7,
          emissiveIntensity: 1.5,
          roughness: 0.1,
        });
        const warningMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.9,
        });

        // Mine Hull (Icosahedron Core)
        const coreGeo = new THREE.IcosahedronGeometry(1.8, 1);
        const coreMesh = new THREE.Mesh(coreGeo, bodyMat);
        mineGroup.add(coreMesh);

        // Glowing Power Nucleus
        const nucleusGeo = new THREE.SphereGeometry(1.0, 16, 16);
        const nucleusMesh = new THREE.Mesh(nucleusGeo, coreMat);
        nucleusMesh.name = 'nucleus';
        mineGroup.add(nucleusMesh);

        // Arming / Warning Strobe Beacons (x6 pods)
        const beaconGroup = new THREE.Group();
        beaconGroup.name = 'beacons';
        for (let b = 0; b < 6; b++) {
          const beaconGeo = new THREE.SphereGeometry(0.3, 8, 8);
          const beaconMesh = new THREE.Mesh(beaconGeo, warningMat);
          const angle = (b * Math.PI * 2) / 6;
          beaconMesh.position.set(Math.cos(angle) * 2.0, b % 2 === 0 ? 0.6 : -0.6, Math.sin(angle) * 2.0);
          beaconGroup.add(beaconMesh);
        }
        mineGroup.add(beaconGroup);

        group.add(mineGroup);

        // 2. Physical 2.5m Area3D Skillshot Collider Lattice
        const latticeGeo = new THREE.IcosahedronGeometry(2.5, 1);
        const latticeMat = new THREE.MeshBasicMaterial({
          color: 0x00e5ff,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
        });
        const latticeMesh = new THREE.Mesh(latticeGeo, latticeMat);
        latticeMesh.name = 'lattice';
        group.add(latticeMesh);

        // 3. Glowing 30m Boundary Hazard Area Ring (Projected on ground spatial grid)
        const hazardRadius = ord.hazardRadius || 30.0;
        const ringGeo = new THREE.RingGeometry(hazardRadius - 0.5, hazardRadius + 0.5, 64);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x00e5ff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.15,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.name = 'hazard_ring';
        group.add(ringMesh);

        // Inner Pulsing Hazard Boundary Edge Line
        const edgeGeo = new THREE.RingGeometry(hazardRadius - 0.15, hazardRadius + 0.15, 64);
        edgeGeo.rotateX(Math.PI / 2);
        const edgeMat = new THREE.MeshBasicMaterial({
          color: 0xef4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
        });
        const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
        edgeMesh.name = 'hazard_edge';
        group.add(edgeMesh);

        // Point light for spatial illumination
        const mineLight = new THREE.PointLight(0x00e5ff, 2.5, 35);
        mineLight.name = 'mine_light';
        group.add(mineLight);

        scene.add(group);
        ordnanceMeshesRef.current.set(ord.id, group);
      }

      group.position.set(ord.position.x, ord.position.y, ord.position.z);

      const hazardRing = group.getObjectByName('hazard_ring');
      const hazardEdge = group.getObjectByName('hazard_edge');
      const lattice = group.getObjectByName('lattice');
      const beacons = group.getObjectByName('beacons');
      const mineLight = group.getObjectByName('mine_light') as THREE.PointLight;

      if (!ord.isArmed) {
        // Arming phase (1.2s): pulse warning amber light, hide 30m hazard ring
        if (hazardRing) hazardRing.visible = false;
        if (hazardEdge) hazardEdge.visible = false;
        if (lattice) lattice.rotation.y += 0.05;

        const warningBlink = Math.sin(Date.now() * 0.015) > 0;
        if (beacons) {
          beacons.visible = warningBlink;
        }
        if (mineLight) {
          mineLight.color.setHex(0xf59e0b);
          mineLight.intensity = warningBlink ? 3.0 : 0.5;
        }
      } else {
        // Armed phase (12s): display glowing 30m boundary hazard ring
        if (hazardRing) {
          hazardRing.visible = true;
          hazardRing.rotation.z -= 0.005;
          (hazardRing.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(Date.now() * 0.004) * 0.1;
        }
        if (hazardEdge) {
          hazardEdge.visible = true;
          hazardEdge.rotation.z += 0.008;
          (hazardEdge.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(Date.now() * 0.006) * 0.25;
        }
        if (lattice) {
          lattice.rotation.y += 0.02;
          lattice.rotation.x += 0.01;
        }
        if (beacons) {
          beacons.visible = true;
        }
        if (mineLight) {
          mineLight.color.setHex(0x00e5ff);
          mineLight.intensity = 3.5 + Math.sin(Date.now() * 0.008) * 1.5;
        }
      }
    });
  };

  // Helper: 3D Volumetric Energy Beam rendering (Dynamic endpoint tracking)
  const updateBeamsInScene = (scene: THREE.Scene, combatEngine: SpaceCombatEngine) => {
    const currentIds = new Set(combatEngine.beamEffects.map((b) => b.id));

    beamLinesRef.current.forEach((beamGroup, id) => {
      if (!currentIds.has(id)) {
        scene.remove(beamGroup);
        disposeObject3D(beamGroup);
        beamLinesRef.current.delete(id);
      }
    });

    combatEngine.beamEffects.forEach((b) => {
      let beamGroup = beamLinesRef.current.get(b.id);

      const source = new THREE.Vector3(b.sourcePos.x, b.sourcePos.y + 0.2, b.sourcePos.z);
      const target = new THREE.Vector3(b.targetPos.x, b.targetPos.y + 0.2, b.targetPos.z);
      const dist = source.distanceTo(target) || 0.1;
      const mid = source.clone().add(target).multiplyScalar(0.5);
      const dir = target.clone().sub(source).normalize();

      const yAxis = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);

      const pulseRatio = Math.max(0, b.duration / b.maxDuration);
      const thickness = b.thickness || 1.0;

      if (!beamGroup) {
        beamGroup = new THREE.Group();

        // White-hot inner core cylinder (Unit height = 1)
        const coreGeo = new THREE.CylinderGeometry(0.12 * thickness, 0.12 * thickness, 1, 8);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.name = 'core';
        beamGroup.add(coreMesh);

        // Volumetric energy glow cylinder (Unit height = 1)
        const glowGeo = new THREE.CylinderGeometry(0.4 * thickness, 0.4 * thickness, 1, 8);
        const glowMat = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.65 });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.name = 'glow';
        beamGroup.add(glowMesh);

        // Muzzle Energy Flash
        const muzzleGeo = new THREE.SphereGeometry(0.55 * thickness, 8, 8);
        const muzzleMat = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.85 });
        const muzzleMesh = new THREE.Mesh(muzzleGeo, muzzleMat);
        muzzleMesh.name = 'muzzle';
        beamGroup.add(muzzleMesh);

        // Impact Energy Flash
        const impactGeo = new THREE.SphereGeometry(0.75 * thickness, 8, 8);
        const impactMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
        const impactMesh = new THREE.Mesh(impactGeo, impactMat);
        impactMesh.name = 'impact';
        beamGroup.add(impactMesh);

        scene.add(beamGroup);
        beamLinesRef.current.set(b.id, beamGroup);
      }

      // Update midpoint position and 3D orientation every frame
      beamGroup.position.copy(mid);
      beamGroup.quaternion.copy(quat);

      // Dynamically re-scale cylinders and re-position endpoints as ships move
      const core = beamGroup.getObjectByName('core') as THREE.Mesh;
      if (core) core.scale.set(1, dist, 1);

      const glow = beamGroup.getObjectByName('glow') as THREE.Mesh;
      if (glow) {
        glow.scale.set(1, dist, 1);
        if (glow.material) {
          (glow.material as THREE.MeshBasicMaterial).opacity = 0.65 * pulseRatio;
        }
      }

      const muzzle = beamGroup.getObjectByName('muzzle') as THREE.Mesh;
      if (muzzle) muzzle.position.set(0, -dist / 2, 0);

      const impact = beamGroup.getObjectByName('impact') as THREE.Mesh;
      if (impact) impact.position.set(0, dist / 2, 0);
    });
  };

  // Helper: Pooled Explosion & Spark particles with zero per-frame allocation
  const updateParticlesInScene = (combatEngine: SpaceCombatEngine) => {
    const pGroup = particleGroupRef.current;
    if (!pGroup) return;

    if (!sharedParticleGeoRef.current) {
      sharedParticleGeoRef.current = new THREE.SphereGeometry(1, 6, 6);
    }

    const pool = particlePoolRef.current;
    const activeMeshes = activeParticleMeshesRef.current;

    // Hide and pool all active particle meshes
    while (activeMeshes.length > 0) {
      const mesh = activeMeshes.pop()!;
      mesh.visible = false;
      pool.push(mesh);
    }

    // Re-assign pooled meshes for current active engine particles
    const particles = combatEngine.particles;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      let mesh: THREE.Mesh;

      if (pool.length > 0) {
        mesh = pool.pop()!;
      } else {
        const mat = new THREE.MeshBasicMaterial({ transparent: true });
        mesh = new THREE.Mesh(sharedParticleGeoRef.current, mat);
        pGroup.add(mesh);
      }

      const ratio = Math.max(0, p.lifetime / p.maxLifetime);
      const animatedSize = Math.max(0.05, p.size * (0.35 + ratio * 0.65));
      const baseOpacity = p.opacity !== undefined ? p.opacity : 1.0;

      mesh.visible = true;
      mesh.position.set(p.position.x, p.position.y, p.position.z);
      mesh.scale.setScalar(animatedSize);

      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setStyle(p.color);
      mat.opacity = Math.min(1.0, ratio * 1.25) * baseOpacity;

      activeMeshes.push(mesh);
    }
  };

  // Create Deep Space Background Starfield
  const createStarfield = (scene: THREE.Scene) => {
    const count = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const radius = 300 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Star color variation (White, Ice Blue, Soft Yellow)
      const starColor = Math.random() > 0.3 ? new THREE.Color(0xffffff) : new THREE.Color(0x38bdf8);
      colors[i * 3] = starColor.r;
      colors[i * 3 + 1] = starColor.g;
      colors[i * 3 + 2] = starColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });

    const starfield = new THREE.Points(geometry, material);
    scene.add(starfield);
  };

  // Create Asteroids Field matching combat engine obstacles
  const createAsteroidBelt = (scene: THREE.Scene) => {
    const asteroidGroup = new THREE.Group();
    asteroidGroupRef.current = asteroidGroup;
    asteroidMeshesRef.current.clear();

    if (!engine.asteroids || engine.asteroids.length === 0) {
      engine.generateAsteroids(!!engine.siegeController);
    }

    engine.asteroids.forEach((ast) => {
      const mesh = ShipModelBuilder.createAsteroidMesh(ast.radius);
      mesh.position.set(ast.position.x, ast.position.y, ast.position.z);
      asteroidGroup.add(mesh);
      asteroidMeshesRef.current.set(ast.id, mesh);
    });

    scene.add(asteroidGroup);
  };

  const resetCamera = () => {
    cameraOrbitAngleRef.current = { theta: 0, phi: 0.35 };
    isoYawRef.current = Math.PI / 4;
    isoPitchRef.current = Math.atan2(0.85, 1.0);
    cameraZoomLevelRef.current = 1.0;
  };

  const targetEnemy =
    engine.enemies.find((e) => e.id === (selectedTargetId || engine.player.targetId) && !e.isDestroyed) ||
    engine.enemies.find((e) => !e.isDestroyed) ||
    null;

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full cursor-crosshair overflow-hidden rounded-xl border border-slate-800 bg-black shadow-2xl select-none touch-none"
    >
      {/* Dragoon Charging HUD Reticle Widget */}
      <DragoonReticleHUD ship={engine.player} targetEnemy={targetEnemy} />

      {cameraMode === 'target' && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-bold bg-slate-900/90 border border-cyan-500/50 rounded-lg text-cyan-300 shadow-xl backdrop-blur">
          <Crosshair className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>
            TARGET CAM:{' '}
            {
              ([engine.player, ...engine.enemies].find(
                (s) => s.id === (selectedTargetId || engine.player.targetId) && !s.isDestroyed
              ) || engine.enemies.find((e) => !e.isDestroyed) || engine.player).name
            }
          </span>
        </div>
      )}

      <button
        onClick={resetCamera}
        className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 rounded-lg shadow-lg backdrop-blur-sm transition-all active:scale-95 cursor-pointer"
        title="Reset Camera Angle to Rear"
      >
        <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
        <span>Recenter View</span>
      </button>
    </div>
  );
};
