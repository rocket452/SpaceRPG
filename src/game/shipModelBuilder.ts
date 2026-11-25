import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { Faction, FiringArc, ModelType, Weapon } from '../types';
import { getWeaponColorTheme } from '../utils/weaponUtils';

export class ShipModelBuilder {
  private static loadedModelCache = new Map<string, THREE.Object3D>();

  /**
   * Asynchronously load 3D OBJ + MTL models (e.g. Interstellar Runner)
   */
  public static loadOBJModel(
    objUrl: string,
    mtlUrl?: string,
    basePath?: string
  ): Promise<THREE.Object3D> {
    const key = objUrl;
    if (this.loadedModelCache.has(key)) {
      return Promise.resolve(this.loadedModelCache.get(key)!.clone(true));
    }

    return new Promise((resolve, reject) => {
      const objLoader = new OBJLoader();

      const onObjLoaded = (object: THREE.Group) => {
        // Calculate bounding box center and center the pivot
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);

        const wrapper = new THREE.Group();
        wrapper.add(object);

        wrapper.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const urlLower = objUrl.toLowerCase();
            const isTranstellar = urlLower.includes('transtellar');
            const isRedFighter = urlLower.includes('redfighter');
            const isWarship = urlLower.includes('warship');
            const isInterstellar = urlLower.includes('interstellar');
            const isMicroRecon = urlLower.includes('microrecon');
            const isInfraredFurtive = urlLower.includes('infrared');

            if ((isTranstellar || isRedFighter || isWarship || isInterstellar || isMicroRecon || isInfraredFurtive) && mesh.geometry) {
              const pos = mesh.geometry.attributes.position;

              if (pos) {
                // Group faces into styled submesh categories with dedicated PBR & emissive materials
                const groups: Record<string, number[]> = {};

                for (let i = 0; i < pos.count; i += 3) {
                  const x1 = pos.getX(i), y1 = pos.getY(i), z1 = pos.getZ(i);
                  const x2 = pos.getX(i + 1), y2 = pos.getY(i + 1), z2 = pos.getZ(i + 1);
                  const x3 = pos.getX(i + 2), y3 = pos.getY(i + 2), z3 = pos.getZ(i + 2);

                  const cx = (x1 + x2 + x3) / 3;
                  const cy = (y1 + y2 + y3) / 3;
                  const cz = (z1 + z2 + z3) / 3;

                  let cat = 'hull';

                  if (isTranstellar) {
                    if (cz < -2.7) cat = 'engines';
                    else if (cy > 1.25 && cx > 0.5) cat = 'canopy';
                    else if (cy > 0.55 && cx > 0.5) cat = 'tower';
                    else if (Math.abs(cx) > 1.75) cat = 'pods';
                    else if (cy > -0.3 && cz > 0.4) cat = 'deck';
                  } else if (isRedFighter) {
                    if (cz < -1.8) cat = 'engines';
                    else if (cy > 0.25 && cz > -0.5 && cz < 0.8) cat = 'canopy';
                    else if (Math.abs(cx) > 1.6) cat = 'wings';
                    else if (cy > 0.0) cat = 'deck';
                  } else if (isWarship) {
                    if (cz < -6.0) cat = 'engines';
                    else if (cy > 1.2 && cz > -2.0) cat = 'tower';
                    else if (Math.abs(cx - 1.7) < 0.5) cat = 'flanks';
                    else if (cy > 0.6) cat = 'deck';
                  } else if (isInterstellar) {
                    if (cz < -4.2) cat = 'engines';
                    else if (cy > 0.6 && cz > -2.5) cat = 'canopy';
                    else if (cx > 2.0 || cx < -0.2) cat = 'wings';
                  } else if (isMicroRecon) {
                    if (cz < -0.4) cat = 'engines';
                    else if (cy > 0.1) cat = 'canopy';
                  } else if (isInfraredFurtive) {
                    if (cz < -0.9) cat = 'engines';
                    else if (cy > 0.15) cat = 'canopy';
                  }

                  if (!groups[cat]) groups[cat] = [];
                  groups[cat].push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
                }

                // Create submesh Group to replace original single flat mesh
                const submeshGroup = new THREE.Group();
                submeshGroup.name = mesh.name || 'styled_ship_submeshes';

                for (const cat in groups) {
                  const floatArr = new Float32Array(groups[cat]);
                  const subGeo = new THREE.BufferGeometry();
                  subGeo.setAttribute('position', new THREE.BufferAttribute(floatArr, 3));
                  subGeo.computeVertexNormals();

                  let mat: THREE.Material;

                  if (cat === 'engines') {
                    const engineColor = isInfraredFurtive ? 0xa855f7 : isRedFighter || isWarship ? 0xff4500 : 0x00f0ff;
                    mat = new THREE.MeshStandardMaterial({
                      color: engineColor,
                      emissive: engineColor,
                      emissiveIntensity: 4.0,
                      roughness: 0.1,
                      metalness: 0.1,
                      side: THREE.DoubleSide,
                    });
                  } else if (cat === 'canopy') {
                    const canopyColor = isInfraredFurtive ? 0xc084fc : isRedFighter ? 0xfbbf24 : 0x38bdf8;
                    const emissiveColor = isInfraredFurtive ? 0x9333ea : isRedFighter ? 0xd97706 : 0x0284c7;
                    mat = new THREE.MeshStandardMaterial({
                      color: canopyColor,
                      emissive: emissiveColor,
                      emissiveIntensity: 2.5,
                      roughness: 0.1,
                      metalness: 0.2,
                      side: THREE.DoubleSide,
                    });
                  } else if (cat === 'deck') {
                    mat = new THREE.MeshStandardMaterial({
                      color: isTranstellar ? 0xf1f5f9 : 0x94a3b8,
                      roughness: 0.25,
                      metalness: 0.6,
                      side: THREE.DoubleSide,
                    });
                  } else if (cat === 'tower') {
                    mat = new THREE.MeshStandardMaterial({
                      color: 0x334155,
                      roughness: 0.35,
                      metalness: 0.75,
                      side: THREE.DoubleSide,
                    });
                  } else if (cat === 'pods' || cat === 'wings' || cat === 'flanks') {
                    const accentColor = isTranstellar ? 0x0284c7 : isRedFighter ? 0xd97706 : 0x334155;
                    mat = new THREE.MeshStandardMaterial({
                      color: accentColor,
                      roughness: 0.25,
                      metalness: 0.8,
                      side: THREE.DoubleSide,
                    });
                  } else {
                    // Hull
                    const hullColor = isInfraredFurtive ? 0x1e1b4b : isRedFighter ? 0x0f172a : 0x1e293b;
                    mat = new THREE.MeshStandardMaterial({
                      color: hullColor,
                      roughness: 0.3,
                      metalness: 0.85,
                      side: THREE.DoubleSide,
                    });
                  }

                  const subMesh = new THREE.Mesh(subGeo, mat);
                  subMesh.castShadow = true;
                  subMesh.receiveShadow = true;
                  submeshGroup.add(subMesh);
                }

                if (mesh.parent) {
                  mesh.parent.add(submeshGroup);
                  mesh.parent.remove(mesh);
                }
              }
            } else if (mesh.material) {
              const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              const newMats = oldMats.map((m: any) => {
                const tex = m.map;
                if (tex) {
                  tex.magFilter = THREE.NearestFilter;
                  tex.minFilter = THREE.NearestFilter;
                  tex.colorSpace = THREE.SRGBColorSpace;
                  tex.needsUpdate = true;
                }
                return new THREE.MeshStandardMaterial({
                  map: tex || null,
                  color: m.color ? m.color : 0xffffff,
                  roughness: 0.35,
                  metalness: 0.2,
                  side: THREE.DoubleSide,
                });
              });
              mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
            }
          }
        });

        this.loadedModelCache.set(key, wrapper);
        resolve(wrapper.clone(true));
      };

      if (mtlUrl) {
        const mtlLoader = new MTLLoader();
        if (basePath) {
          mtlLoader.setPath(basePath);
        }
        mtlLoader.load(
          mtlUrl,
          (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(objUrl, onObjLoaded, undefined, (err) => {
              console.warn('[ShipModelBuilder] OBJ load failed with MTL, trying OBJ alone:', err);
              objLoader.load(objUrl, onObjLoaded, undefined, reject);
            });
          },
          undefined,
          (err) => {
            console.warn('[ShipModelBuilder] MTL load failed, loading OBJ alone:', err);
            objLoader.load(objUrl, onObjLoaded, undefined, reject);
          }
        );
      } else {
        objLoader.load(objUrl, onObjLoaded, undefined, reject);
      }
    });
  }

  // Create 3D Voxel / Model Spaceship
  public static createShipMesh(
    modelType: ModelType,
    faction: Faction = 'federation',
    assetModelPath?: string,
    carrierDesign: string = 'solaris'
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `ship_${modelType}_${faction}`;

    // Voxel Palette Materials based on Max Parata Voxel Art styling
    const materials = this.createVoxelPalette(faction, modelType);

    switch (modelType) {
      case 'dreadnought':
        // Max Parata Asset: assets/models/spaceships/Warship.obj
        this.buildVoxelDreadnought(group, materials);
        break;
      case 'interceptor':
        // Max Parata Asset: assets/models/spaceships/InterstellarRunner.obj
        this.buildVoxelInterceptor(group, materials);
        break;
      case 'shield_breaker':
        // Max Parata Asset: assets/spaceships/RedFighter/Package/RedFighter.obj
        this.buildVoxelShieldBreaker(group, materials);
        break;
      case 'carrier':
      case 'escort':
        if (carrierDesign === 'fortress') {
          this.buildCarrierFortress(group, materials);
        } else if (carrierDesign === 'stealth') {
          this.buildCarrierStealth(group, materials);
        } else if (carrierDesign === 'solaris') {
          this.buildCarrierSolaris(group, materials);
        } else if (carrierDesign === 'hyperion_ring') {
          this.buildCarrierHyperionRing(group, materials);
        } else if (carrierDesign === 'vortex_hive') {
          this.buildCarrierVortexHive(group, materials);
        } else if (carrierDesign === 'celestial_forge') {
          this.buildCarrierCelestialForge(group, materials);
        } else if (carrierDesign === 'chronos_phantom') {
          this.buildCarrierChronosPhantom(group, materials);
        } else {
          // Max Parata Asset: assets/spaceships/Transtellar/Package/Transtellar.obj
          this.buildVoxelCarrier(group, materials);
        }
        break;
      case 'micro_recon':
        // Max Parata Asset: assets/models/spaceships/MicroRecon.obj
        this.buildVoxelMicroRecon(group, materials);
        break;
      case 'infrared_furtive':
        // Max Parata Asset / Voxel Model: assets/models/spaceships/InfraredFurtive.obj
        this.buildVoxelInfraredFurtive(group, materials);
        break;
      case 'cruiser':
        this.buildVoxelCruiser(group, materials);
        break;
      case 'science':
        this.buildVoxelScience(group, materials);
        break;
      case 'warbird':
        this.buildVoxelWarbird(group, materials);
        break;
      case 'bird_of_prey':
        this.buildVoxelBirdOfPrey(group, materials);
        break;
      case 'cube':
        this.buildVoxelCube(group, materials);
        break;
      case 'sphere':
        this.buildVoxelSphere(group, materials);
        break;
      case 'station':
        this.buildVoxelStarbase(group, materials);
        break;
      case 'support':
        this.buildVoxelSupport(group, materials);
        break;
      case 'boss_leviathan':
        this.buildVoxelBossLeviathan(group, materials);
        break;
      default:
        this.buildVoxelCruiser(group, materials);
    }

    // Add Voxel Navigation Lights
    this.addVoxelNavLights(group, faction);

    return group;
  }

  // Create Max Parata Voxel Color Palette Materials
  private static createVoxelPalette(faction: Faction, modelType: string) {
    let mainColor = 0xe2e8f0;    // Stark White / Light Slate
    let darkColor = 0x1e293b;    // Dark Navy Slate Frame
    let accentColor = 0xf97316;  // Max Parata Signature Bright Orange
    let visorColor = 0x06b6d4;   // Glowing Cyan Visor
    let thrusterColor = 0xff4500;// Fire Orange Thruster Glow

    if (faction === 'klingon') {
      mainColor = 0x4a5d4e;      // Hunter Emerald Green
      darkColor = 0x1a241b;      // Dark Gunmetal
      accentColor = 0xd97706;    // Gold / Bronze Accent
      visorColor = 0xef4444;     // Crimson Visor
      thrusterColor = 0xf59e0b;  // Amber Thruster
    } else if (faction === 'romulan') {
      mainColor = 0x1e4a38;      // Romulan Deep Emerald
      darkColor = 0x0f231a;      // Obsidian Green Frame
      accentColor = 0x10b981;    // Neon Green Stripe
      visorColor = 0x34d399;     // Glowing Mint Plasma Visor
      thrusterColor = 0x06b6d4;  // Deep Cyan Plasma
    } else if (faction === 'borg') {
      mainColor = 0x27272a;      // Obsidian Matrix Steel
      darkColor = 0x18181b;      // Charcoal Pitch
      accentColor = 0x22c55e;    // Cybernetic Matrix Green
      visorColor = 0x4ade80;     // Glowing Green Core
      thrusterColor = 0x22c55e;  // Green Warp Nodes
    } else if (faction === 'pirate') {
      mainColor = 0xb45309;      // Rust Amber
      darkColor = 0x292524;      // Burnt Charcoal
      accentColor = 0xf59e0b;    // Hazard Yellow
      visorColor = 0xfacc15;     // Gold Visor
      thrusterColor = 0xe11d48;  // Crimson Thruster
    }

    if (modelType === 'escort' && faction === 'federation') {
      accentColor = 0x0284c7;    // Tactical Blue accent for escort
    }

    const mainMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      roughness: 0.3,
      metalness: 0.5,
      flatShading: true,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: darkColor,
      roughness: 0.4,
      metalness: 0.7,
      flatShading: true,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.2,
      metalness: 0.3,
      flatShading: true,
    });

    const visorMat = new THREE.MeshBasicMaterial({
      color: visorColor,
    });

    const thrusterMat = new THREE.MeshBasicMaterial({
      color: thrusterColor,
    });

    return { mainMat, darkMat, accentMat, visorMat, thrusterMat };
  }

  // Voxel Helper: Adds a 3D Voxel Box (or mirrored pair across X)
  private static addVoxel(
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat: THREE.Material,
    mirrorX: boolean = false
  ) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);

    if (mirrorX && x !== 0) {
      const mirrorMesh = new THREE.Mesh(geo, mat);
      mirrorMesh.position.set(-x, y, z);
      group.add(mirrorMesh);
    }
  }

  // Max Parata Voxel Cruiser / Heavy Corvette
  private static buildVoxelCruiser(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;

    // 1. Central Voxel Fuselage
    this.addVoxel(group, 0, 0, 0, 1.2, 0.8, 3.2, mainMat);
    this.addVoxel(group, 0, -0.1, 0, 1.4, 0.6, 2.8, darkMat);

    // 2. Elevated Voxel Cockpit & Visor
    this.addVoxel(group, 0, 0.6, 0.6, 0.8, 0.5, 1.2, mainMat);
    this.addVoxel(group, 0, 0.7, 1.0, 0.6, 0.3, 0.4, visorMat); // Cyan Cockpit Visor

    // Nose Voxel Cap
    this.addVoxel(group, 0, 0.1, 1.8, 0.8, 0.5, 0.6, mainMat);
    this.addVoxel(group, 0, 0.2, 2.0, 0.6, 0.3, 0.4, accentMat); // Orange Nose Stripe

    // 3. Side Voxel Wing-Pods with Racing Stripes
    this.addVoxel(group, 1.2, 0, 0.2, 1.2, 0.5, 2.0, mainMat, true);
    this.addVoxel(group, 1.4, 0.05, 0.2, 0.4, 0.2, 2.2, accentMat, true); // Accent stripe
    this.addVoxel(group, 1.8, -0.1, -0.2, 0.6, 0.4, 1.2, darkMat, true);

    // 4. Voxel Wing Spoilers / Stabilizers (Angled)
    this.addVoxel(group, 1.0, 0.7, -0.8, 0.2, 0.8, 0.8, mainMat, true);
    this.addVoxel(group, 1.0, 1.0, -0.8, 0.2, 0.3, 0.6, accentMat, true);

    // 5. Heavy Voxel Cannon Pods on Wings
    this.addVoxel(group, 2.0, 0, 0.6, 0.2, 0.2, 1.4, darkMat, true);
    this.addVoxel(group, 2.0, 0, 1.3, 0.15, 0.15, 0.4, visorMat, true); // Glowing muzzle

    // 6. Rear Triple-Thruster Engine Bay
    this.addVoxel(group, 0, 0.1, -1.7, 1.0, 0.6, 0.3, darkMat);
    this.addVoxel(group, 0, 0.2, -1.85, 0.4, 0.3, 0.1, thrusterMat); // Center Thruster
    this.addVoxel(group, 0.7, 0, -1.35, 0.3, 0.3, 0.1, thrusterMat, true); // Side Thrusters
  }

  // Max Parata Voxel Escort / Fighter Interceptor
  private static buildVoxelEscort(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;

    // 1. Needle-Nosed Voxel Core
    this.addVoxel(group, 0, 0, 0.2, 0.8, 0.6, 3.0, mainMat);
    this.addVoxel(group, 0, 0.4, 0.5, 0.6, 0.4, 1.0, mainMat);
    this.addVoxel(group, 0, 0.5, 0.8, 0.45, 0.25, 0.4, visorMat); // Cockpit Visor

    // Sharp Voxel Nose
    this.addVoxel(group, 0, 0.1, 1.9, 0.5, 0.4, 0.8, accentMat);
    this.addVoxel(group, 0, 0.15, 2.4, 0.3, 0.2, 0.4, darkMat);

    // 2. Heavy Dual Forward Voxel Cannons
    this.addVoxel(group, 0.6, -0.1, 1.2, 0.25, 0.25, 2.2, darkMat, true);
    this.addVoxel(group, 0.6, -0.1, 2.3, 0.2, 0.2, 0.3, visorMat, true); // Muzzle tip

    // 3. Compact Delta Voxel Wings
    this.addVoxel(group, 1.0, 0, -0.2, 1.2, 0.25, 1.6, mainMat, true);
    this.addVoxel(group, 1.2, 0.02, -0.2, 0.8, 0.1, 1.2, accentMat, true); // Stripe
    this.addVoxel(group, 1.8, 0.2, -0.6, 0.15, 0.6, 0.6, darkMat, true); // Winglet

    // 4. Twin Rear Thruster Blocks
    this.addVoxel(group, 0.35, 0.1, -1.35, 0.3, 0.3, 0.1, thrusterMat, true);
    this.addVoxel(group, 0, -0.1, -1.2, 0.6, 0.4, 0.3, darkMat);
  }

  // Max Parata Voxel Science / Explorer Vessel
  private static buildVoxelScience(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;

    // 1. Wide Voxel Saucer Head
    this.addVoxel(group, 0, 0, 1.2, 2.4, 0.5, 1.8, mainMat);
    this.addVoxel(group, 0, 0.3, 1.2, 1.6, 0.3, 1.2, mainMat);

    // Glowing Multi-Block Sensor Dome
    this.addVoxel(group, 0, 0.5, 1.2, 0.8, 0.3, 0.8, visorMat);
    this.addVoxel(group, 0, 0.1, 2.1, 1.0, 0.2, 0.3, accentMat);

    // 2. Neck & Lower Fuselage
    this.addVoxel(group, 0, -0.2, 0.2, 0.8, 0.6, 1.8, darkMat);

    // 3. Extended Rear Pylon Arms holding Voxel Nacelles
    this.addVoxel(group, 1.2, -0.1, -0.6, 1.2, 0.25, 0.6, mainMat, true);

    // Twin Voxel Engine Pods
    this.addVoxel(group, 1.8, 0.1, -0.8, 0.4, 0.4, 2.2, mainMat, true);
    this.addVoxel(group, 1.8, 0.1, 0.2, 0.25, 0.25, 0.2, visorMat, true); // Bussard glow
    this.addVoxel(group, 1.8, 0.1, -1.95, 0.3, 0.3, 0.1, thrusterMat, true); // Rear thruster
  }

  // Max Parata Voxel Klingon Bird-of-Prey
  private static buildVoxelBirdOfPrey(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;

    // 1. Voxel Command Pod Head
    this.addVoxel(group, 0, 0.1, 1.8, 0.8, 0.5, 1.0, mainMat);
    this.addVoxel(group, 0, 0.2, 2.2, 0.5, 0.3, 0.4, visorMat); // Crimson Visor

    // Neck Boom
    this.addVoxel(group, 0, 0.05, 1.0, 0.4, 0.3, 1.0, darkMat);

    // 2. Central Voxel Core
    this.addVoxel(group, 0, 0, 0, 1.2, 0.7, 1.2, mainMat);
    this.addVoxel(group, 0, 0.4, 0, 0.8, 0.3, 0.8, accentMat); // Gold crest

    // 3. Swept-Forward Voxel Wings
    this.addVoxel(group, 1.2, -0.1, 0.2, 1.4, 0.25, 1.0, mainMat, true);
    this.addVoxel(group, 2.2, -0.3, 0.6, 1.0, 0.2, 0.8, mainMat, true); // Drooped wingtip

    // Wingtip Heavy Disruptor Cannon Pods
    this.addVoxel(group, 2.7, -0.3, 0.8, 0.3, 0.3, 1.4, darkMat, true);
    this.addVoxel(group, 2.7, -0.3, 1.5, 0.2, 0.2, 0.2, visorMat, true); // Muzzle glow

    // 4. Rear Engine Thruster Block
    this.addVoxel(group, 0, 0, -0.7, 1.0, 0.5, 0.3, darkMat);
    this.addVoxel(group, 0, 0.05, -0.85, 0.7, 0.3, 0.1, thrusterMat);
  }

  // Max Parata Voxel Romulan Warbird
  private static buildVoxelWarbird(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;

    // 1. Raptor Head
    this.addVoxel(group, 0, 0, 2.0, 1.0, 0.6, 1.4, mainMat);
    this.addVoxel(group, 0, 0.1, 2.6, 0.6, 0.3, 0.4, visorMat); // Plasma Green Visor

    // 2. Upper Voxel Arch
    this.addVoxel(group, 0, 0.8, 0.2, 1.2, 0.3, 2.0, mainMat);
    this.addVoxel(group, 1.2, 0.8, 0.2, 1.2, 0.3, 1.6, mainMat, true);

    // 3. Lower Voxel Arch (Creating double-hull hollow raptor gap)
    this.addVoxel(group, 0, -0.8, 0.2, 1.2, 0.3, 2.0, mainMat);
    this.addVoxel(group, 1.2, -0.8, 0.2, 1.2, 0.3, 1.6, mainMat, true);

    // Vertical Connecting Wingtip Pillars
    this.addVoxel(group, 2.0, 0, 0, 0.4, 1.8, 1.2, darkMat, true);
    this.addVoxel(group, 2.0, 0, 0.6, 0.25, 1.2, 0.3, accentMat, true); // Neon green stripe

    // 4. Central Singularity Core Voxel
    this.addVoxel(group, 0, 0, -0.2, 0.8, 0.8, 0.8, visorMat);
    this.addVoxel(group, 0, 0, -1.1, 0.6, 0.4, 0.2, thrusterMat);
  }

  // Max Parata Voxel Borg Cube Matrix
  private static buildVoxelCube(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, visorMat } = palette;

    const size = 3;
    const step = 0.8;

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // Skip inner core to leave room for glowing core matrix
          if (x === 0 && y === 0 && z === 0) continue;

          // Alternate main and dark voxel armor blocks
          const isCorner = Math.abs(x) + Math.abs(y) + Math.abs(z) === 3;
          const mat = isCorner ? darkMat : mainMat;

          this.addVoxel(group, x * step, y * step, z * step, 0.7, 0.7, 0.7, mat);
        }
      }
    }

    // Glowing Neon-Green Core Matrix
    this.addVoxel(group, 0, 0, 0, 1.2, 1.2, 1.2, visorMat);
  }

  // Max Parata Voxel Borg Sphere
  private static buildVoxelSphere(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, visorMat } = palette;

    // Layered Voxel Stepped Orb
    this.addVoxel(group, 0, 0, 0, 2.2, 2.2, 2.2, mainMat);
    this.addVoxel(group, 0, 0, 0, 2.6, 1.6, 1.6, darkMat);
    this.addVoxel(group, 0, 0, 0, 1.6, 2.6, 1.6, darkMat);
    this.addVoxel(group, 0, 0, 0, 1.6, 1.6, 2.6, darkMat);

    // Central Oculus Oculus Eye
    this.addVoxel(group, 0, 0, 1.35, 0.8, 0.8, 0.2, visorMat);
  }

  // Max Parata Voxel Starbase / Space Station
  private static buildVoxelStarbase(
    group: THREE.Group,
    palette: ReturnType<typeof ShipModelBuilder.createVoxelPalette>
  ) {
    const { mainMat, darkMat, accentMat, visorMat } = palette;

    // Central Voxel Spire
    this.addVoxel(group, 0, 0, 0, 1.4, 8.0, 1.4, darkMat);

    // Upper Docking Hub
    this.addVoxel(group, 0, 2.0, 0, 3.8, 1.2, 3.8, mainMat);
    this.addVoxel(group, 0, 2.0, 0, 4.2, 0.6, 4.2, accentMat);

    // Lower Solar Docking Ring
    this.addVoxel(group, 2.5, -2.0, 0, 1.2, 0.4, 1.2, mainMat, true);
    this.addVoxel(group, 0, -2.0, 2.5, 1.2, 0.4, 1.2, mainMat);
    this.addVoxel(group, 0, -2.0, -2.5, 1.2, 0.4, 1.2, mainMat);

    // Top Antenna Tower
    this.addVoxel(group, 0, 4.5, 0, 0.3, 1.8, 0.3, visorMat);
  }

  // Dreadnought (Warship.obj) - Heavy Bastion
  private static buildVoxelDreadnought(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'procedural_fallback';

    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;
    // Heavy Armored Citadel Hull
    this.addVoxel(fallback, 0, 0, 0, 3.2, 1.8, 6.5, mainMat);
    this.addVoxel(fallback, 0, 0.6, 0.5, 2.2, 1.2, 4.2, darkMat);
    // Port & Starboard Heavy Broadside Armor Wings
    this.addVoxel(fallback, -2.4, -0.2, -0.5, 1.8, 1.2, 4.8, accentMat);
    this.addVoxel(fallback, 2.4, -0.2, -0.5, 1.8, 1.2, 4.8, accentMat);
    // Command Bridge Visor
    this.addVoxel(fallback, 0, 1.2, 1.8, 1.4, 0.6, 1.2, visorMat);
    // Rear Quad Thrusters
    this.addVoxel(fallback, -1.0, 0, -3.4, 0.8, 0.8, 0.6, thrusterMat);
    this.addVoxel(fallback, 1.0, 0, -3.4, 0.8, 0.8, 0.6, thrusterMat);

    group.add(fallback);

    // Load actual 3D OBJ + MTL Warship model
    const objUrl = '/assets/spaceships/Warship/Package/Warship.obj';
    const mtlUrl = 'Warship.mtl';
    const basePath = '/assets/spaceships/Warship/Package/';

    this.loadOBJModel(objUrl, mtlUrl, basePath)
      .then((objModel) => {
        fallback.visible = false;
        objModel.name = 'warship_3d_mesh';
        objModel.scale.set(1.5, 1.5, 1.5);
        group.add(objModel);
      })
      .catch((err) => {
        console.warn('[ShipModelBuilder] Could not load Warship OBJ model, retaining procedural fallback:', err);
      });
  }

  // Interceptor (InterstellarRunner.obj) - Vector Strike Raider
  private static buildVoxelInterceptor(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'procedural_fallback';

    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;
    // Sleek Forward Fuselage & Spinal Railgun Mount
    this.addVoxel(fallback, 0, 0, 1.2, 1.0, 0.8, 4.2, mainMat);
    this.addVoxel(fallback, 0, 0.2, 2.5, 0.4, 0.4, 1.8, darkMat); // Spinal Railgun barrel
    // Swept Vector Wings
    this.addVoxel(fallback, -1.8, -0.1, -0.4, 2.4, 0.3, 1.6, accentMat);
    this.addVoxel(fallback, 2.8, -0.1, -0.4, 2.4, 0.3, 1.6, accentMat);
    // Cockpit Canopy
    this.addVoxel(fallback, 0, 0.5, 0.6, 0.7, 0.5, 1.2, visorMat);
    // Main Afterburner Thruster
    this.addVoxel(fallback, 0, 0, -1.2, 0.9, 0.9, 0.6, thrusterMat);

    group.add(fallback);

    // Load actual 3D OBJ + MTL Interstellar Runner model uploaded by user
    const objUrl = '/assets/spaceships/Interstellar Runner/Package/InterstellarRunner.obj';
    const mtlUrl = 'InterstellarRunner.mtl';
    const basePath = '/assets/spaceships/Interstellar Runner/Package/';

    this.loadOBJModel(objUrl, mtlUrl, basePath)
      .then((objModel) => {
        fallback.visible = false;
        objModel.name = 'interstellar_runner_3d_mesh';
        objModel.scale.set(1.2, 1.2, 1.2);
        group.add(objModel);
      })
      .catch((err) => {
        console.warn('[ShipModelBuilder] Could not load Interstellar Runner OBJ model, retaining procedural fallback:', err);
      });
  }

  // Shield Breaker (Transtellar / RedFighter) - Quadrant Collapser
  private static buildVoxelShieldBreaker(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'procedural_fallback';

    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;
    // Twin Catamaran Twin Hulls
    this.addVoxel(fallback, -1.4, 0, 0.5, 1.2, 1.0, 4.8, mainMat);
    this.addVoxel(fallback, 1.4, 0, 0.5, 1.2, 1.0, 4.8, mainMat);
    // Central Connecting Power Core & Disruptor Emitters
    this.addVoxel(fallback, 0, 0.2, -0.2, 2.2, 0.8, 2.4, darkMat);
    this.addVoxel(fallback, -1.4, 0.3, 2.6, 0.5, 0.5, 1.0, visorMat); // Port Beam Emitter
    this.addVoxel(fallback, 1.4, 0.3, 2.6, 0.5, 0.5, 1.0, visorMat);  // Starboard Beam Emitter
    // Rear Dual Thrusters
    this.addVoxel(fallback, -1.4, 0, -2.0, 0.7, 0.7, 0.5, thrusterMat);
    this.addVoxel(fallback, 1.4, 0, -2.0, 0.7, 0.7, 0.5, thrusterMat);

    group.add(fallback);

    // Try loading 3D OBJ RedFighter model
    const primaryObjUrl = '/assets/spaceships/RedFighter/Package/RedFighter.obj';
    const primaryMtlUrl = 'RedFighter.mtl';
    const primaryBasePath = '/assets/spaceships/RedFighter/Package/';

    this.loadOBJModel(primaryObjUrl, primaryMtlUrl, primaryBasePath)
      .then((objModel) => {
        fallback.visible = false;
        objModel.name = 'redfighter_3d_mesh';
        objModel.scale.set(1.4, 1.4, 1.4);
        group.add(objModel);
      })
      .catch(() => {
        this.loadOBJModel('/assets/models/spaceships/RedFighter.obj', 'RedFighter.mtl', '/assets/models/spaceships/')
          .then((objModel) => {
            fallback.visible = false;
            objModel.name = 'redfighter_3d_mesh';
            objModel.scale.set(1.4, 1.4, 1.4);
            group.add(objModel);
          })
          .catch((err) => {
            console.warn('[ShipModelBuilder] Could not load RedFighter model for Shield Breaker:', err);
          });
      });
  }

  // Carrier / Tactical Escort (Transtellar.obj)
  private static buildVoxelCarrier(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'procedural_fallback';

    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;
    // Wide Deck Frame & Hangar Bay
    this.addVoxel(fallback, 0, 0, -0.5, 3.8, 1.4, 5.2, mainMat);
    this.addVoxel(fallback, 0, -0.2, 1.5, 2.8, 0.8, 1.8, darkMat); // Front Hangar Bay Opening
    // Raised Conning Tower Command Island
    this.addVoxel(fallback, 1.2, 1.1, -0.8, 1.2, 1.0, 1.8, accentMat);
    this.addVoxel(fallback, 1.2, 1.4, -0.2, 1.0, 0.5, 0.8, visorMat);
    // Massive Rear Thruster Array
    this.addVoxel(fallback, -1.2, 0, -3.2, 1.1, 0.9, 0.6, thrusterMat);
    this.addVoxel(fallback, 1.2, 0, -3.2, 1.1, 0.9, 0.6, thrusterMat);

    group.add(fallback);

    // Load actual 3D OBJ + MTL Transtellar model
    const objUrl = '/assets/spaceships/Transtellar/Package/Transtellar.obj';
    const mtlUrl = 'Transtellar.mtl';
    const basePath = '/assets/spaceships/Transtellar/Package/';

    this.loadOBJModel(objUrl, mtlUrl, basePath)
      .then((objModel) => {
        fallback.visible = false;
        objModel.name = 'transtellar_carrier_3d_mesh';
        objModel.scale.set(1.5, 1.5, 1.5);
        group.add(objModel);
      })
      .catch(() => {
        this.loadOBJModel('/assets/models/spaceships/Transtellar.obj', 'Transtellar.mtl', '/assets/models/spaceships/')
          .then((objModel) => {
            fallback.visible = false;
            objModel.name = 'transtellar_carrier_3d_mesh';
            objModel.scale.set(1.5, 1.5, 1.5);
            group.add(objModel);
          })
          .catch((err) => {
            console.warn('[ShipModelBuilder] Could not load Transtellar OBJ model for Carrier:', err);
          });
      });
  }

  // Aegis Fortress Citadel Dreadnought-Carrier
  private static buildCarrierFortress(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'fortress_carrier_mesh';

    const { mainMat, darkMat, accentMat, visorMat, thrusterMat } = palette;

    const launchGlowMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
    });
    const bayCavityMat = new THREE.MeshStandardMaterial({
      color: 0x070b19,
      metalness: 0.9,
      roughness: 0.2,
    });

    // Dual Catamaran Armored Side Pontoons
    this.addVoxel(fallback, -2.8, 0, 0, 1.8, 1.8, 6.2, mainMat);
    this.addVoxel(fallback, 2.8, 0, 0, 1.8, 1.8, 6.2, mainMat);

    // Heavy Top Armor Ribs on Pontoons
    this.addVoxel(fallback, -2.8, 1.0, 0, 1.4, 0.4, 4.8, accentMat);
    this.addVoxel(fallback, 2.8, 1.0, 0, 1.4, 0.4, 4.8, accentMat);

    // Central Connecting Armored Bridge Deck & Command Center
    this.addVoxel(fallback, 0, 0.3, -0.2, 4.2, 1.2, 4.4, darkMat);
    this.addVoxel(fallback, 0, 1.2, -0.8, 2.4, 1.1, 2.2, mainMat);
    this.addVoxel(fallback, 0, 1.6, -0.2, 1.8, 0.6, 1.2, visorMat);

    // Quad Hangar Bay Launch Tubes
    this.addVoxel(fallback, -2.8, 0.1, 2.6, 1.2, 1.0, 1.2, bayCavityMat);
    this.addVoxel(fallback, 2.8, 0.1, 2.6, 1.2, 1.0, 1.2, bayCavityMat);
    this.addVoxel(fallback, -2.8, -0.4, 2.8, 1.4, 0.15, 0.6, launchGlowMat);
    this.addVoxel(fallback, 2.8, -0.4, 2.8, 1.4, 0.15, 0.6, launchGlowMat);

    // Ventral Under-deck Launch Chute
    this.addVoxel(fallback, 0, -0.6, 0.5, 3.0, 0.8, 3.2, darkMat);
    this.addVoxel(fallback, 0, -0.9, 1.8, 2.2, 0.2, 0.6, launchGlowMat);

    // Quad Heavy Impulse Engines at rear
    this.addVoxel(fallback, -3.0, 0.1, -3.2, 1.1, 1.1, 0.6, thrusterMat);
    this.addVoxel(fallback, 3.0, 0.1, -3.2, 1.1, 1.1, 0.6, thrusterMat);
    this.addVoxel(fallback, -1.2, 0.2, -2.5, 0.9, 0.9, 0.5, thrusterMat);
    this.addVoxel(fallback, 1.2, 0.2, -2.5, 0.9, 0.9, 0.5, thrusterMat);

    group.add(fallback);

    this.loadOBJModel('/assets/spaceships/Warship/Package/Warship.obj', 'Warship.mtl', '/assets/spaceships/Warship/Package/')
      .then((objModel) => {
        fallback.visible = false;
        const fortressGroup = new THREE.Group();
        fortressGroup.name = 'fortress_carrier_combined';
        objModel.scale.set(1.4, 1.4, 1.4);
        fortressGroup.add(objModel);

        const deckExt = new THREE.Group();
        this.addVoxel(deckExt, -2.6, -0.2, 1.2, 1.6, 0.4, 4.0, launchGlowMat);
        this.addVoxel(deckExt, 2.6, -0.2, 1.2, 1.6, 0.4, 4.0, launchGlowMat);
        fortressGroup.add(deckExt);

        group.add(fortressGroup);
      })
      .catch(() => {
        this.loadOBJModel('/assets/models/spaceships/Warship.obj', 'Warship.mtl', '/assets/models/spaceships/')
          .then((objModel) => {
            fallback.visible = false;
            const fortressGroup = new THREE.Group();
            fortressGroup.name = 'fortress_carrier_combined';
            objModel.scale.set(1.4, 1.4, 1.4);
            fortressGroup.add(objModel);

            const deckExt = new THREE.Group();
            this.addVoxel(deckExt, -2.6, -0.2, 1.2, 1.6, 0.4, 4.0, launchGlowMat);
            this.addVoxel(deckExt, 2.6, -0.2, 1.2, 1.6, 0.4, 4.0, launchGlowMat);
            fortressGroup.add(deckExt);

            group.add(fortressGroup);
          })
          .catch((err) => {
            console.warn('[ShipModelBuilder] Using procedural fallback for Fortress Carrier:', err);
          });
      });
  }

  // Obsidian Shadow-Bay Stealth Supercarrier
  private static buildCarrierStealth(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'stealth_carrier_mesh';

    const { visorMat } = palette;

    const stealthMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.85,
      roughness: 0.25,
    });
    const stealthPanelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.3,
    });
    const redGlowMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
    });
    const cyanTrackMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
    });

    // Sleek faceted central stealth fuselage
    this.addVoxel(fallback, 0, 0, 0.2, 2.6, 1.0, 6.4, stealthMat);
    this.addVoxel(fallback, 0, 0.4, 0.8, 1.8, 0.6, 4.2, stealthPanelMat);
    this.addVoxel(fallback, 0, 0.6, 2.2, 1.2, 0.4, 1.8, redGlowMat);

    // Swept Angular Stealth Wings
    this.addVoxel(fallback, -2.6, -0.1, 0, 2.4, 0.4, 4.6, stealthMat);
    this.addVoxel(fallback, 2.6, -0.1, 0, 2.4, 0.4, 4.6, stealthMat);

    // Internal Catapult Wing Tunnels
    this.addVoxel(fallback, -2.6, 0, 0.5, 1.0, 0.3, 3.2, stealthPanelMat);
    this.addVoxel(fallback, 2.6, 0, 0.5, 1.0, 0.3, 3.2, stealthPanelMat);
    this.addVoxel(fallback, -2.6, 0.15, 0.5, 0.4, 0.08, 3.0, cyanTrackMat);
    this.addVoxel(fallback, 2.6, 0.15, 0.5, 0.4, 0.08, 3.0, cyanTrackMat);

    // Flush Cockpit Canopy
    this.addVoxel(fallback, 0, 0.8, -0.4, 1.0, 0.35, 1.4, visorMat);

    // Dual Rear Vectoring Engine Exhausts
    this.addVoxel(fallback, -1.1, 0, -3.1, 0.9, 0.7, 0.5, redGlowMat);
    this.addVoxel(fallback, 1.1, 0, -3.1, 0.9, 0.7, 0.5, redGlowMat);

    group.add(fallback);

    this.loadOBJModel('/assets/spaceships/InfraredFurtive/Package/InfraredFurtive.obj', 'InfraredFurtive.mtl', '/assets/spaceships/InfraredFurtive/Package/')
      .then((objModel) => {
        fallback.visible = false;
        objModel.name = 'infrared_furtive_carrier_3d_mesh';
        objModel.scale.set(2.4, 2.0, 2.4);
        group.add(objModel);
      })
      .catch(() => {
        this.loadOBJModel('/assets/models/spaceships/InfraredFurtive.obj', 'InfraredFurtive.mtl', '/assets/models/spaceships/')
          .then((objModel) => {
            fallback.visible = false;
            objModel.name = 'infrared_furtive_carrier_3d_mesh';
            objModel.scale.set(2.4, 2.0, 2.4);
            group.add(objModel);
          })
          .catch((err) => {
            console.warn('[ShipModelBuilder] Could not load InfraredFurtive OBJ for Stealth Carrier:', err);
          });
      });
  }

  // Solaris Vanguard Forward Catapult Twin-Runway Carrier
  private static buildCarrierSolaris(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'solaris_carrier_mesh';

    const { darkMat } = palette;

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.8,
      roughness: 0.2,
    });
    const amberGlowMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
    });
    const whiteHullMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.4,
      roughness: 0.3,
    });

    // Central Rear Fuselage & Command Core
    this.addVoxel(fallback, 0, 0, -0.8, 3.2, 1.3, 4.2, whiteHullMat);
    this.addVoxel(fallback, 0, 0.8, -1.0, 2.0, 0.9, 2.2, goldMat);

    // Central Glowing Sensor Sphere Dome
    const sphereGeo = new THREE.SphereGeometry(0.7, 12, 12);
    const sphereMesh = new THREE.Mesh(sphereGeo, amberGlowMat);
    sphereMesh.position.set(0, 1.4, -0.6);
    fallback.add(sphereMesh);

    // Twin Forward Flight Deck Runway Prongs
    this.addVoxel(fallback, -2.0, 0.1, 2.4, 1.4, 0.6, 4.8, whiteHullMat);
    this.addVoxel(fallback, 2.0, 0.1, 2.4, 1.4, 0.6, 4.8, whiteHullMat);

    // Amber Deck Landing Strips
    this.addVoxel(fallback, -2.0, 0.42, 2.4, 0.6, 0.08, 4.4, amberGlowMat);
    this.addVoxel(fallback, 2.0, 0.42, 2.4, 0.6, 0.08, 4.4, amberGlowMat);

    // Swept-Back Outrigger Impulse Thruster Pods
    this.addVoxel(fallback, -3.4, -0.2, -1.8, 1.2, 0.8, 2.8, darkMat);
    this.addVoxel(fallback, 3.4, -0.2, -1.8, 1.2, 0.8, 2.8, darkMat);
    this.addVoxel(fallback, -3.4, -0.2, -3.2, 1.0, 0.7, 0.4, amberGlowMat);
    this.addVoxel(fallback, 3.4, -0.2, -3.2, 1.0, 0.7, 0.4, amberGlowMat);

    group.add(fallback);
  }

  // Hyperion Celestial Ring Supercarrier
  private static buildCarrierHyperionRing(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'hyperion_ring_carrier_mesh';

    const { mainMat, darkMat } = palette;
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.8,
      roughness: 0.2,
    });
    const cyanCoreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    const whiteBeamMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
    });

    // Ring Structure (Torus Geometry)
    const torusGeo = new THREE.TorusGeometry(3.2, 0.6, 16, 32);
    const torusMesh = new THREE.Mesh(torusGeo, ringMat);
    torusMesh.rotation.x = Math.PI / 2;
    fallback.add(torusMesh);

    // Inner Glowing Singularity Launcher Core
    const coreGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const coreMesh = new THREE.Mesh(coreGeo, cyanCoreMat);
    fallback.add(coreMesh);

    // Central Vertical Launch Ejection Column
    this.addVoxel(fallback, 0, 0, 0, 0.8, 2.2, 0.8, whiteBeamMat);

    // 4 Radial Stabilizer Pylons Connecting Ring to Core
    this.addVoxel(fallback, -2.0, 0, 0, 2.2, 0.4, 0.6, darkMat);
    this.addVoxel(fallback, 2.0, 0, 0, 2.2, 0.4, 0.6, darkMat);
    this.addVoxel(fallback, 0, 0, -2.0, 0.6, 0.4, 2.2, darkMat);
    this.addVoxel(fallback, 0, 0, 2.0, 0.6, 0.4, 2.2, darkMat);

    // Rear Impulse Engine Modules
    this.addVoxel(fallback, -1.8, -0.2, -3.4, 0.9, 0.8, 0.6, mainMat);
    this.addVoxel(fallback, 1.8, -0.2, -3.4, 0.9, 0.8, 0.6, mainMat);
    this.addVoxel(fallback, -1.8, -0.2, -3.8, 0.7, 0.6, 0.3, cyanCoreMat);
    this.addVoxel(fallback, 1.8, -0.2, -3.8, 0.7, 0.6, 0.3, cyanCoreMat);

    group.add(fallback);
  }

  // Vortex Bio-Mechanical Hive Carrier
  private static buildCarrierVortexHive(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'vortex_hive_carrier_mesh';

    const chitinMat = new THREE.MeshStandardMaterial({
      color: 0x064e3b,
      metalness: 0.6,
      roughness: 0.4,
    });
    const darkChitinMat = new THREE.MeshStandardMaterial({
      color: 0x022c22,
      metalness: 0.9,
      roughness: 0.3,
    });
    const emeraldSporeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
    });
    const limeGlowMat = new THREE.MeshBasicMaterial({
      color: 0x84cc16,
    });

    // Segmented Tapered Chitinous Carapace Spine
    this.addVoxel(fallback, 0, 0, -1.0, 2.8, 1.4, 3.2, darkChitinMat);
    this.addVoxel(fallback, 0, 0.2, 1.2, 2.2, 1.2, 2.8, chitinMat);
    this.addVoxel(fallback, 0, 0.3, 3.0, 1.6, 0.9, 2.2, darkChitinMat);

    // Lateral Bio-Spore Launch Pores along carapace flanks
    this.addVoxel(fallback, -1.6, 0.3, 0.8, 0.6, 0.4, 1.8, emeraldSporeMat);
    this.addVoxel(fallback, 1.6, 0.3, 0.8, 0.6, 0.4, 1.8, emeraldSporeMat);
    this.addVoxel(fallback, -1.2, 0.4, 2.6, 0.5, 0.3, 1.2, limeGlowMat);
    this.addVoxel(fallback, 1.2, 0.4, 2.6, 0.5, 0.3, 1.2, limeGlowMat);

    // Forward Swept Mandible Pylons
    this.addVoxel(fallback, -2.4, -0.1, 2.4, 0.8, 0.5, 3.2, chitinMat);
    this.addVoxel(fallback, 2.4, -0.1, 2.4, 0.8, 0.5, 3.2, chitinMat);

    // Bio-Kinetic Propulsion Sacs at Rear
    this.addVoxel(fallback, -1.0, -0.1, -2.8, 1.0, 0.9, 0.8, emeraldSporeMat);
    this.addVoxel(fallback, 1.0, -0.1, -2.8, 1.0, 0.9, 0.8, emeraldSporeMat);

    group.add(fallback);
  }

  // Sol-Forge Orbital Foundry Carrier
  private static buildCarrierCelestialForge(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'celestial_forge_carrier_mesh';

    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      metalness: 0.85,
      roughness: 0.3,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2,
    });
    const forgeOrangeMat = new THREE.MeshBasicMaterial({
      color: 0xea580c,
    });
    const yellowGlowMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
    });

    // Heavy Industrial Frame & Central Reactor Core
    this.addVoxel(fallback, 0, 0, 0, 3.6, 1.8, 4.8, bronzeMat);
    this.addVoxel(fallback, 0, 0.2, -0.2, 2.2, 1.2, 3.2, forgeOrangeMat);

    // Wide Solar radiation collector wings
    this.addVoxel(fallback, -4.2, 0.2, -0.5, 3.2, 0.15, 3.8, panelMat);
    this.addVoxel(fallback, 4.2, 0.2, -0.5, 3.2, 0.15, 3.8, panelMat);
    this.addVoxel(fallback, -4.2, 0.28, -0.5, 3.0, 0.05, 0.4, yellowGlowMat);
    this.addVoxel(fallback, 4.2, 0.28, -0.5, 3.0, 0.05, 0.4, yellowGlowMat);

    // Forward Industrial Gantry Crane Bay Arms
    this.addVoxel(fallback, -1.8, -0.2, 3.2, 0.8, 0.8, 3.4, bronzeMat);
    this.addVoxel(fallback, 1.8, -0.2, 3.2, 0.8, 0.8, 3.4, bronzeMat);
    this.addVoxel(fallback, 0, -0.4, 2.6, 2.8, 0.3, 1.2, forgeOrangeMat);

    // Heavy Quad Exhaust Block
    this.addVoxel(fallback, -1.2, -0.2, -2.8, 1.0, 1.0, 0.8, forgeOrangeMat);
    this.addVoxel(fallback, 1.2, -0.2, -2.8, 1.0, 1.0, 0.8, forgeOrangeMat);

    group.add(fallback);
  }

  // Chronos Quantum Blade Carrier
  private static buildCarrierChronosPhantom(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'chronos_phantom_carrier_mesh';

    const indigoMat = new THREE.MeshStandardMaterial({
      color: 0x312e81,
      metalness: 0.9,
      roughness: 0.2,
    });
    const violetMat = new THREE.MeshStandardMaterial({
      color: 0x581c87,
      metalness: 0.85,
      roughness: 0.25,
    });
    const quantumVioletGlow = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
    });
    const whiteCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf3e8ff,
    });

    // Sleek Needle Delta Core
    this.addVoxel(fallback, 0, 0, 0.6, 2.0, 0.9, 6.8, indigoMat);
    this.addVoxel(fallback, 0, 0.4, 1.2, 1.2, 0.6, 4.2, violetMat);

    // Forward Swept Wing Stabilizer Blades
    this.addVoxel(fallback, -3.0, 0, 1.0, 2.8, 0.25, 4.4, violetMat);
    this.addVoxel(fallback, 3.0, 0, 1.0, 2.8, 0.25, 4.4, violetMat);

    // Quantum Catapult Track Strips along Wing Blades
    this.addVoxel(fallback, -3.0, 0.16, 1.0, 0.6, 0.08, 4.0, quantumVioletGlow);
    this.addVoxel(fallback, 3.0, 0.16, 1.0, 0.6, 0.08, 4.0, quantumVioletGlow);

    // Elevated Tachyon Sensor Crown Canopy
    this.addVoxel(fallback, 0, 0.8, 0, 0.8, 0.4, 1.8, whiteCoreMat);

    // Quad Hyper-Ion Impulse Drive Exhausts
    this.addVoxel(fallback, -0.9, 0, -3.0, 0.7, 0.7, 0.6, quantumVioletGlow);
    this.addVoxel(fallback, 0.9, 0, -3.0, 0.7, 0.7, 0.6, quantumVioletGlow);
    this.addVoxel(fallback, 0, 0.2, -3.1, 0.8, 0.5, 0.5, whiteCoreMat);

    group.add(fallback);
  }

  // Micro Recon (MicroRecon.obj) - Drone Creep
  private static buildVoxelMicroRecon(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'procedural_fallback';

    const { mainMat, darkMat, accentMat, visorMat } = palette;
    // Compact Drone Body
    this.addVoxel(fallback, 0, 0, 0, 0.9, 0.6, 1.4, darkMat);
    this.addVoxel(fallback, 0, 0.2, 0.3, 0.6, 0.4, 0.8, visorMat);
    this.addVoxel(fallback, -0.8, -0.1, 0, 0.8, 0.2, 0.8, accentMat);
    this.addVoxel(fallback, 0.8, -0.1, 0, 0.8, 0.2, 0.8, accentMat);

    group.add(fallback);

    // Load actual 3D OBJ + MTL MicroRecon model
    const objUrl = '/assets/spaceships/MicroRecon/Package/MicroRecon.obj';
    const mtlUrl = 'MicroRecon.mtl';
    const basePath = '/assets/spaceships/MicroRecon/Package/';

    this.loadOBJModel(objUrl, mtlUrl, basePath)
      .then((objModel) => {
        fallback.visible = false;
        objModel.name = 'microrecon_3d_mesh';
        objModel.scale.set(1.0, 1.0, 1.0);
        group.add(objModel);
      })
      .catch((err) => {
        console.warn('[ShipModelBuilder] Could not load MicroRecon OBJ model, retaining procedural fallback:', err);
      });
  }

  // Infrared Furtive (InfraredFurtive.obj) - Enemy Covert Raider
  private static buildVoxelInfraredFurtive(group: THREE.Group, palette: any) {
    const fallback = new THREE.Group();
    fallback.name = 'procedural_fallback';

    const { mainMat, darkMat, accentMat } = palette;
    // Glowing Infrared Sensors
    const redGlowMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    this.addVoxel(fallback, 0, 0, 0, 1.0, 0.5, 2.8, darkMat);
    this.addVoxel(fallback, 0, 0.1, 1.2, 0.6, 0.3, 0.9, redGlowMat);
    this.addVoxel(fallback, -1.2, -0.05, 0.2, 1.6, 0.2, 1.6, mainMat);
    this.addVoxel(fallback, 1.2, -0.05, 0.2, 1.6, 0.2, 1.6, mainMat);
    this.addVoxel(fallback, -1.0, -0.2, 0.8, 0.35, 0.35, 1.2, accentMat);
    this.addVoxel(fallback, 1.0, -0.2, 0.8, 0.35, 0.35, 1.2, accentMat);

    group.add(fallback);

    // Load actual 3D OBJ + MTL InfraredFurtive model
    const objUrl = '/assets/spaceships/InfraredFurtive/Package/InfraredFurtive.obj';
    const mtlUrl = 'InfraredFurtive.mtl';
    const basePath = '/assets/spaceships/InfraredFurtive/Package/';

    this.loadOBJModel(objUrl, mtlUrl, basePath)
      .then((objModel) => {
        fallback.visible = false;
        objModel.name = 'infraredfurtive_3d_mesh';
        objModel.scale.set(1.1, 1.1, 1.1);
        group.add(objModel);
      })
      .catch((err) => {
        console.warn('[ShipModelBuilder] Could not load InfraredFurtive OBJ model, retaining procedural fallback:', err);
      });
  }

  // Sanctuary Support Frigate - Medical & Shield Transfer Catamaran
  private static buildVoxelSupport(group: THREE.Group, palette: any) {
    const { mainMat, darkMat, thrusterMat } = palette;

    const shieldEmitterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.3,
    });

    const naniteSpireMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.25,
    });

    // Central spine & armored medical bay
    this.addVoxel(group, 0, 0.05, 0.2, 1.4, 0.8, 4.4, mainMat);
    this.addVoxel(group, 0, 0.55, -0.4, 1.0, 0.5, 2.2, darkMat);

    // Dual forward sensor & emitter prongs
    this.addVoxel(group, 1.1, 0.0, 1.8, 0.55, 0.45, 2.4, mainMat, true);
    this.addVoxel(group, 1.1, 0.05, 3.05, 0.32, 0.32, 0.45, shieldEmitterMat, true);

    // Swept catamaran support wings & glowing shield projector domes
    this.addVoxel(group, 1.9, -0.1, 0.0, 1.4, 0.28, 2.2, darkMat, true);
    const domeGeo = new THREE.SphereGeometry(0.42, 12, 10);
    [-1.85, 1.85].forEach((xPos) => {
      const dome = new THREE.Mesh(domeGeo, shieldEmitterMat);
      dome.position.set(xPos, 0.22, 0.1);
      group.add(dome);
    });

    // Dorsal emerald nanite repair spire crystal
    const spireGeo = new THREE.OctahedronGeometry(0.48, 0);
    const spire = new THREE.Mesh(spireGeo, naniteSpireMat);
    spire.position.set(0, 1.08, -0.2);
    spire.scale.set(0.8, 1.35, 0.8);
    group.add(spire);

    // Twin elevated engineering warp nacelles & glowing aft thrusters
    this.addVoxel(group, 1.45, 0.42, -1.65, 0.48, 0.48, 2.8, mainMat, true);
    this.addVoxel(group, 1.45, 0.42, -3.1, 0.36, 0.36, 0.3, thrusterMat, true);
    this.addVoxel(group, 0, 0.0, -2.15, 0.65, 0.45, 0.25, thrusterMat);
  }

  // Omega Leviathan Dreadnought - Huge Stationary Raid Boss Citadel
  private static buildVoxelBossLeviathan(group: THREE.Group, palette: any) {
    const { darkMat } = palette;

    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b2e,
      roughness: 0.45,
      metalness: 0.78,
      flatShading: true,
    });

    const obsidianRibMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.85,
      flatShading: true,
    });

    const crimsonCoreMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 1.2,
      roughness: 0.15,
      metalness: 0.2,
    });

    const matrixEmeraldMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.3,
    });

    // Massive central dreadnought spine & multi-tiered armored hull
    this.addVoxel(group, 0, 0.5, 0, 11.0, 4.4, 24.0, armorMat);
    this.addVoxel(group, 0, 3.2, -2.0, 7.6, 2.4, 15.0, obsidianRibMat);
    this.addVoxel(group, 0, -2.2, 0.0, 8.2, 2.0, 18.0, obsidianRibMat);

    // Forward siege jaw prow & Obliteration Beam cannon aperture
    this.addVoxel(group, 4.6, 0.4, 11.5, 3.2, 3.4, 7.0, darkMat, true);
    this.addVoxel(group, 0, 0.4, 12.2, 3.6, 2.2, 4.0, obsidianRibMat);

    const beamMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 2.4, 16), crimsonCoreMat);
    beamMuzzle.rotation.x = Math.PI / 2;
    beamMuzzle.position.set(0, 0.4, 13.8);
    group.add(beamMuzzle);

    // Flanking heavy siege bastions
    this.addVoxel(group, 9.2, 0.6, 1.5, 5.2, 4.8, 16.5, darkMat, true);
    this.addVoxel(group, 12.6, 0.4, 0.5, 2.2, 3.2, 12.0, obsidianRibMat, true);

    // Matrix cybernetic conduits along flanks
    this.addVoxel(group, 8.8, 3.1, 1.5, 1.1, 0.6, 13.0, matrixEmeraldMat, true);
    this.addVoxel(group, 4.8, 2.8, 6.0, 0.9, 0.6, 6.5, crimsonCoreMat, true);

    // Dorsal reactor core housing & command citadel spire
    this.addVoxel(group, 0, 5.4, -3.5, 4.8, 3.2, 7.2, darkMat);
    const dorsalCore = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 1), crimsonCoreMat);
    dorsalCore.position.set(0, 4.6, 4.2);
    group.add(dorsalCore);

    // Structural ring around the forward reactor core
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.38, 10, 24), matrixEmeraldMat);
    ring.position.set(0, 4.6, 4.2);
    group.add(ring);

    // Aft reactor vents
    this.addVoxel(group, 5.5, 0.5, -12.6, 3.0, 2.6, 1.2, matrixEmeraldMat, true);
    this.addVoxel(group, 0, 0.8, -12.8, 4.2, 2.4, 1.2, crimsonCoreMat);
  }

  // Navigation lights
  private static addVoxelNavLights(group: THREE.Group, faction: Faction) {
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

    this.addVoxel(group, 1.8, 0.2, 1.0, 0.12, 0.12, 0.12, greenMat);
    this.addVoxel(group, -1.8, 0.2, 1.0, 0.12, 0.12, 0.12, redMat);
  }

  // Asteroid Mesh Generator (Voxel Jagged Style)
  public static createAsteroidMesh(size: number = 2): THREE.Group {
    const group = new THREE.Group();
    group.name = 'voxel_asteroid';

    const mat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.8,
      metalness: 0.2,
      flatShading: true,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });

    // Composite cluster of offset voxels
    const count = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const sx = (0.5 + Math.random() * 0.8) * size;
      const sy = (0.5 + Math.random() * 0.8) * size;
      const sz = (0.5 + Math.random() * 0.8) * size;

      const px = (Math.random() - 0.5) * size * 0.8;
      const py = (Math.random() - 0.5) * size * 0.8;
      const pz = (Math.random() - 0.5) * size * 0.8;

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), i % 2 === 0 ? mat : darkMat);
      mesh.position.set(px, py, pz);
      group.add(mesh);
    }

    return group as any;
  }

  /**
   * Returns the exact shield arc outer radius suited for each ship class model
   * to ensure no geometric intersection between ship 3D models, shield arcs, and weapon arcs.
   */
  public static getShieldRadius(modelType?: ModelType): number {
    switch (modelType) {
      case 'boss_leviathan':
        return 21.0;
      case 'station':
        return 10.5;
      case 'dreadnought':
      case 'warbird':
        return 8.0;
      case 'carrier':
      case 'cruiser':
      case 'escort':
      case 'science':
        return 7.6;
      case 'shield_breaker':
      case 'support':
        return 6.5;
      case 'interceptor':
      case 'bird_of_prey':
        return 5.3;
      case 'infrared_furtive':
        return 4.8;
      case 'cube':
      case 'sphere':
        return 3.5;
      case 'micro_recon':
        return 3.5;
      default:
        return 5.5;
    }
  }

  /**
   * Returns physical hull radius for each ship class model when shields are depleted
   */
  public static getHullRadius(modelType?: ModelType): number {
    switch (modelType) {
      case 'boss_leviathan':
        return 15.0;
      case 'station':
        return 8.5;
      case 'dreadnought':
      case 'warbird':
        return 4.5;
      case 'carrier':
      case 'cruiser':
      case 'escort':
      case 'science':
        return 4.0;
      case 'shield_breaker':
      case 'support':
        return 3.6;
      case 'interceptor':
      case 'bird_of_prey':
        return 2.8;
      case 'infrared_furtive':
        return 2.5;
      case 'cube':
      case 'sphere':
        return 2.2;
      case 'micro_recon':
        return 2.8;
      default:
        return 3.0;
    }
  }

  // 4 Shield Arcs Mesh Visualizer (3D Volumetric Forcefield Arc Segments with Vertical Depth)
  public static createShieldArcVisualizer(radius: number = 5.5): THREE.Group {
    const shieldGroup = new THREE.Group();
    shieldGroup.name = 'shield_arcs_visualizer';

    const gap = 0.05; // Gap in radians between segments for a clean split look
    const innerRadius = radius * 0.82;
    const outerRadius = radius * 1.15;
    const height = Math.max(0.9, radius * 0.21); // 3D vertical height of shield forcefield wall

    const arcAngles = [
      { key: 'front', startAngle: -Math.PI / 4, endAngle: Math.PI / 4 },
      { key: 'starboard', startAngle: Math.PI / 4, endAngle: (3 * Math.PI) / 4 },
      { key: 'back', startAngle: (3 * Math.PI) / 4, endAngle: (5 * Math.PI) / 4 },
      { key: 'port', startAngle: (5 * Math.PI) / 4, endAngle: (7 * Math.PI) / 4 },
    ];

    arcAngles.forEach(({ key, startAngle, endAngle }) => {
      const thetaStart = startAngle + gap;
      const thetaLength = (endAngle - startAngle) - (2 * gap);
      const thetaEnd = thetaStart + thetaLength;
      const segments = 16;
      const halfH = height / 2;

      // Common material template
      const baseMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      // 1. Primary Outer Curved Wall
      const outerWallPos: number[] = [];
      for (let i = 0; i < segments; i++) {
        const t1 = thetaStart + (i / segments) * thetaLength;
        const t2 = thetaStart + ((i + 1) / segments) * thetaLength;

        const x1 = Math.sin(t1) * outerRadius;
        const z1 = Math.cos(t1) * outerRadius;
        const x2 = Math.sin(t2) * outerRadius;
        const z2 = Math.cos(t2) * outerRadius;

        outerWallPos.push(
          x1, halfH, z1,   x1, -halfH, z1,  x2, -halfH, z2,
          x1, halfH, z1,   x2, -halfH, z2,  x2, halfH, z2
        );
      }
      const outerWallGeo = new THREE.BufferGeometry();
      outerWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(outerWallPos, 3));
      outerWallGeo.computeVertexNormals();
      const arcMesh = new THREE.Mesh(outerWallGeo, baseMat.clone());
      arcMesh.name = `shield_arc_${key}`;

      // 2. Secondary Inner Curved Wall
      const innerWallPos: number[] = [];
      for (let i = 0; i < segments; i++) {
        const t1 = thetaStart + (i / segments) * thetaLength;
        const t2 = thetaStart + ((i + 1) / segments) * thetaLength;

        const x1 = Math.sin(t1) * innerRadius;
        const z1 = Math.cos(t1) * innerRadius;
        const x2 = Math.sin(t2) * innerRadius;
        const z2 = Math.cos(t2) * innerRadius;

        innerWallPos.push(
          x1, halfH, z1,   x1, -halfH, z1,  x2, -halfH, z2,
          x1, halfH, z1,   x2, -halfH, z2,  x2, halfH, z2
        );
      }
      const innerWallGeo = new THREE.BufferGeometry();
      innerWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerWallPos, 3));
      innerWallGeo.computeVertexNormals();
      const innerWallMesh = new THREE.Mesh(innerWallGeo, baseMat.clone());
      innerWallMesh.name = 'inner_wall';
      arcMesh.add(innerWallMesh);

      // 3. Top Cap
      const topCapPos: number[] = [];
      for (let i = 0; i < segments; i++) {
        const t1 = thetaStart + (i / segments) * thetaLength;
        const t2 = thetaStart + ((i + 1) / segments) * thetaLength;

        const x1In = Math.sin(t1) * innerRadius;
        const z1In = Math.cos(t1) * innerRadius;
        const x1Out = Math.sin(t1) * outerRadius;
        const z1Out = Math.cos(t1) * outerRadius;

        const x2In = Math.sin(t2) * innerRadius;
        const z2In = Math.cos(t2) * innerRadius;
        const x2Out = Math.sin(t2) * outerRadius;
        const z2Out = Math.cos(t2) * outerRadius;

        topCapPos.push(
          x1In, halfH, z1In,  x1Out, halfH, z1Out,  x2Out, halfH, z2Out,
          x1In, halfH, z1In,  x2Out, halfH, z2Out,  x2In, halfH, z2In
        );
      }
      const topCapGeo = new THREE.BufferGeometry();
      topCapGeo.setAttribute('position', new THREE.Float32BufferAttribute(topCapPos, 3));
      topCapGeo.computeVertexNormals();
      const topCapMesh = new THREE.Mesh(topCapGeo, baseMat.clone());
      topCapMesh.name = 'top_cap';
      arcMesh.add(topCapMesh);

      // 4. Floor (Bottom Cap)
      const floorPos: number[] = [];
      for (let i = 0; i < segments; i++) {
        const t1 = thetaStart + (i / segments) * thetaLength;
        const t2 = thetaStart + ((i + 1) / segments) * thetaLength;

        const x1In = Math.sin(t1) * innerRadius;
        const z1In = Math.cos(t1) * innerRadius;
        const x1Out = Math.sin(t1) * outerRadius;
        const z1Out = Math.cos(t1) * outerRadius;

        const x2In = Math.sin(t2) * innerRadius;
        const z2In = Math.cos(t2) * innerRadius;
        const x2Out = Math.sin(t2) * outerRadius;
        const z2Out = Math.cos(t2) * outerRadius;

        floorPos.push(
          x1In, -halfH, z1In,  x1Out, -halfH, z1Out,  x2Out, -halfH, z2Out,
          x1In, -halfH, z1In,  x2Out, -halfH, z2Out,  x2In, -halfH, z2In
        );
      }
      const floorGeo = new THREE.BufferGeometry();
      floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3));
      floorGeo.computeVertexNormals();
      const floorMesh = new THREE.Mesh(floorGeo, baseMat.clone());
      floorMesh.name = 'floor';
      arcMesh.add(floorMesh);

      // 5. Left Side Wall
      const xInStart = Math.sin(thetaStart) * innerRadius;
      const zInStart = Math.cos(thetaStart) * innerRadius;
      const xOutStart = Math.sin(thetaStart) * outerRadius;
      const zOutStart = Math.cos(thetaStart) * outerRadius;

      const leftWallPos = [
        xInStart, -halfH, zInStart,  xOutStart, -halfH, zOutStart,  xOutStart, halfH, zOutStart,
        xInStart, -halfH, zInStart,  xOutStart, halfH, zOutStart,   xInStart, halfH, zInStart
      ];
      const leftWallGeo = new THREE.BufferGeometry();
      leftWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(leftWallPos, 3));
      leftWallGeo.computeVertexNormals();
      const leftSideWall = new THREE.Mesh(leftWallGeo, baseMat.clone());
      leftSideWall.name = 'left_side_wall';
      arcMesh.add(leftSideWall);

      // 6. Right Side Wall
      const xInEnd = Math.sin(thetaEnd) * innerRadius;
      const zInEnd = Math.cos(thetaEnd) * innerRadius;
      const xOutEnd = Math.sin(thetaEnd) * outerRadius;
      const zOutEnd = Math.cos(thetaEnd) * outerRadius;

      const rightWallPos = [
        xInEnd, -halfH, zInEnd,  xOutEnd, -halfH, zOutEnd,  xOutEnd, halfH, zOutEnd,
        xInEnd, -halfH, zInEnd,  xOutEnd, halfH, zOutEnd,   xInEnd, halfH, zInEnd
      ];
      const rightWallGeo = new THREE.BufferGeometry();
      rightWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(rightWallPos, 3));
      rightWallGeo.computeVertexNormals();
      const rightSideWall = new THREE.Mesh(rightWallGeo, baseMat.clone());
      rightSideWall.name = 'right_side_wall';
      arcMesh.add(rightSideWall);

      // Helper for wireframe border lines
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
      });

      const createArcLine = (r: number, y: number, name: string) => {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
          const t = thetaStart + (i / segments) * thetaLength;
          points.push(new THREE.Vector3(Math.sin(t) * r, y, Math.cos(t) * r));
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeo, lineMat.clone());
        line.name = name;
        return line;
      };

      // Border lines
      arcMesh.add(createArcLine(outerRadius, halfH, 'border'));
      arcMesh.add(createArcLine(outerRadius, -halfH, 'bottom_border'));
      arcMesh.add(createArcLine(outerRadius, 0, 'mid_border'));

      // Vertical corner pillar lines
      const leftPillarGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xOutStart, -halfH, zOutStart),
        new THREE.Vector3(xOutStart, halfH, zOutStart),
      ]);
      const leftPillar = new THREE.Line(leftPillarGeo, lineMat.clone());
      leftPillar.name = 'side_line_start';
      arcMesh.add(leftPillar);

      const rightPillarGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xOutEnd, -halfH, zOutEnd),
        new THREE.Vector3(xOutEnd, halfH, zOutEnd),
      ]);
      const rightPillar = new THREE.Line(rightPillarGeo, lineMat.clone());
      rightPillar.name = 'side_line_end';
      arcMesh.add(rightPillar);

      // Radial top and bottom connector lines
      const leftFloorGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xInStart, -halfH, zInStart),
        new THREE.Vector3(xOutStart, -halfH, zOutStart),
      ]);
      const leftFloorLine = new THREE.Line(leftFloorGeo, lineMat.clone());
      leftFloorLine.name = 'left_floor_line';
      arcMesh.add(leftFloorLine);

      const rightFloorGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xInEnd, -halfH, zInEnd),
        new THREE.Vector3(xOutEnd, -halfH, zOutEnd),
      ]);
      const rightFloorLine = new THREE.Line(rightFloorGeo, lineMat.clone());
      rightFloorLine.name = 'right_floor_line';
      arcMesh.add(rightFloorLine);

      const leftTopGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xInStart, halfH, zInStart),
        new THREE.Vector3(xOutStart, halfH, zOutStart),
      ]);
      const leftTopLine = new THREE.Line(leftTopGeo, lineMat.clone());
      leftTopLine.name = 'left_top_line';
      arcMesh.add(leftTopLine);

      const rightTopGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xInEnd, halfH, zInEnd),
        new THREE.Vector3(xOutEnd, halfH, zOutEnd),
      ]);
      const rightTopLine = new THREE.Line(rightTopGeo, lineMat.clone());
      rightTopLine.name = 'right_top_line';
      arcMesh.add(rightTopLine);

      shieldGroup.add(arcMesh);
    });

    return shieldGroup;
  }

  // Faint Color-Coded Firing Arcs Visualizer (Renders weapon firing fields around ship)
  public static createWeaponArcVisualizer(weapons: Weapon[], shieldRadius: number = 5.5): THREE.Group {
    const arcGroup = new THREE.Group();
    arcGroup.name = 'weapon_arcs_visualizer';
    arcGroup.visible = false;

    const uniqueArcs = new Set<FiringArc>();
    weapons.forEach((w) => uniqueArcs.add(w.firingArc));

    const innerRadius = shieldRadius * 1.20;

    uniqueArcs.forEach((arc) => {
      const matchingWeapons = weapons.filter((w) => w.firingArc === arc);
      const isTorpedoArc = matchingWeapons.some((w) => w.isTorpedo);
      const matchingWeapon = matchingWeapons[0];
      const theme = getWeaponColorTheme(matchingWeapon?.color, isTorpedoArc);
      const arcColor = theme.hex;
      const brightColor = theme.brightHex;

      // Determine maximum range for weapons in this firing arc
      const maxRange = matchingWeapons.length > 0
        ? Math.max(...matchingWeapons.map((w) => w.range || 88))
        : 88;

      const outerRadius = maxRange;

      if (isTorpedoArc) {
        // Torpedo launchers are represented by a straight targeting vector line extending out to max weapon range
        const lineLength = Math.max(20.0, maxRange - innerRadius);
        const lineWidth = 0.8;
        const isAft = arc.startsWith('aft');
        const zCenter = isAft ? -(innerRadius + lineLength / 2) : (innerRadius + lineLength / 2);

        // Core straight line fill plane
        const fillGeo = new THREE.PlaneGeometry(lineWidth, lineLength);
        const mat = new THREE.MeshBasicMaterial({
          color: arcColor,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

        const arcMesh = new THREE.Mesh(fillGeo, mat);
        arcMesh.name = `weapon_arc_${arc}`;
        arcMesh.userData = { arcType: arc, baseColor: arcColor, brightColor, label: arc, isTorpedoLine: true };
        arcMesh.rotation.x = -Math.PI / 2;
        arcMesh.position.set(0, -0.02, zCenter);

        // Outer glowing border plane
        const borderGeo = new THREE.PlaneGeometry(lineWidth + 0.4, lineLength + 0.5);
        const borderMat = new THREE.MeshBasicMaterial({
          color: arcColor,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const borderMesh = new THREE.Mesh(borderGeo, borderMat);
        borderMesh.name = 'arc_border';
        borderMesh.position.z = -0.001; // Sits slightly below main plane
        arcMesh.add(borderMesh);

        // Side laser guide lines
        const lineMat = new THREE.LineBasicMaterial({
          color: arcColor,
          transparent: true,
          opacity: 0.8,
        });

        // Left guide line
        const p1 = new THREE.Vector3(-lineWidth / 2, -lineLength / 2, 0.003);
        const p2 = new THREE.Vector3(-lineWidth / 2, lineLength / 2, 0.003);
        const leftLineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const leftLine = new THREE.Line(leftLineGeo, lineMat);
        arcMesh.add(leftLine);

        // Right guide line
        const p3 = new THREE.Vector3(lineWidth / 2, -lineLength / 2, 0.003);
        const p4 = new THREE.Vector3(lineWidth / 2, lineLength / 2, 0.003);
        const rightLineGeo = new THREE.BufferGeometry().setFromPoints([p3, p4]);
        const rightLine = new THREE.Line(rightLineGeo, lineMat);
        arcMesh.add(rightLine);

        // Max Range Crossbar Cap Line at the end of the torpedo line
        const capY = isAft ? -lineLength / 2 : lineLength / 2;
        const p5 = new THREE.Vector3(-lineWidth * 2.5, capY, 0.003);
        const p6 = new THREE.Vector3(lineWidth * 2.5, capY, 0.003);
        const capGeo = new THREE.BufferGeometry().setFromPoints([p5, p6]);
        const capLine = new THREE.Line(capGeo, lineMat);
        arcMesh.add(capLine);

        arcGroup.add(arcMesh);
        return;
      }

      const segments: Array<{ start: number; length: number; color: number; label: string; isThin360?: boolean }> = [];

      if (arc === 'broadside') {
        // Port Broadside (135° to 225° / 3π/4 to 5π/4)
        segments.push({
          start: (3 * Math.PI) / 4,
          length: Math.PI / 2,
          color: arcColor,
          label: 'broadside_port',
        });
        // Starboard Broadside (-45° to +45° / -π/4 to +π/4)
        segments.push({
          start: -Math.PI / 4,
          length: Math.PI / 2,
          color: arcColor,
          label: 'broadside_starboard',
        });
      } else if (arc === 'broadside_port' || arc === 'port_90') {
        segments.push({
          start: (3 * Math.PI) / 4,
          length: Math.PI / 2,
          color: arcColor,
          label: arc,
        });
      } else if (arc === 'port_45') {
        segments.push({
          start: (7 * Math.PI) / 8,
          length: Math.PI / 4,
          color: arcColor,
          label: 'port_45',
        });
      } else if (arc === 'port_180') {
        segments.push({
          start: Math.PI / 2,
          length: Math.PI,
          color: arcColor,
          label: 'port_180',
        });
      } else if (arc === 'broadside_starboard' || arc === 'starboard_90') {
        segments.push({
          start: -Math.PI / 4,
          length: Math.PI / 2,
          color: arcColor,
          label: arc,
        });
      } else if (arc === 'starboard_45') {
        segments.push({
          start: -Math.PI / 8,
          length: Math.PI / 4,
          color: arcColor,
          label: 'starboard_45',
        });
      } else if (arc === 'starboard_180') {
        segments.push({
          start: -Math.PI / 2,
          length: Math.PI,
          color: arcColor,
          label: 'starboard_180',
        });
      } else if (arc === 'forward_15') {
        // Spinal Precision 15° Arc (centered at 3π/2)
        segments.push({
          start: (3 * Math.PI) / 2 - Math.PI / 24,
          length: Math.PI / 12,
          color: arcColor,
          label: 'forward_15',
        });
      } else if (arc === 'forward_30') {
        // Fore Torpedo 30° Arc (centered at 3π/2)
        segments.push({
          start: (3 * Math.PI) / 2 - Math.PI / 12,
          length: Math.PI / 6,
          color: arcColor,
          label: 'forward_30',
        });
      } else if (arc === 'forward_45') {
        // Forward Nose 45° Cone (centered at 3π/2)
        segments.push({
          start: (11 * Math.PI) / 8,
          length: Math.PI / 4,
          color: arcColor,
          label: 'forward_45',
        });
      } else if (arc === 'forward_90') {
        // Forward Nose 90° Arc
        segments.push({
          start: (5 * Math.PI) / 4,
          length: Math.PI / 2,
          color: arcColor,
          label: 'forward_90',
        });
      } else if (arc === 'forward_180') {
        // Forward Hemisphere 180°
        segments.push({
          start: Math.PI,
          length: Math.PI,
          color: arcColor,
          label: 'forward_180',
        });
      } else if (arc === 'aft_45') {
        // Aft Engine 45° Cone (centered at π/2)
        segments.push({
          start: (3 * Math.PI) / 8,
          length: Math.PI / 4,
          color: arcColor,
          label: 'aft_45',
        });
      } else if (arc === 'aft_90') {
        // Aft Engine 90° Arc
        segments.push({
          start: Math.PI / 4,
          length: Math.PI / 2,
          color: arcColor,
          label: 'aft_90',
        });
      } else if (arc === 'aft_180') {
        // Aft Hemisphere 180°
        segments.push({
          start: 0,
          length: Math.PI,
          color: arcColor,
          label: 'aft_180',
        });
      } else if (arc === 'broadside_360') {
        segments.push({
          start: 0,
          length: 2 * Math.PI,
          color: arcColor,
          label: 'broadside_360',
          isThin360: true,
        });
      } else if (matchingWeapon?.localFacingAngle !== undefined && matchingWeapon?.arcAngleDegrees !== undefined) {
        const angleRad = (matchingWeapon.arcAngleDegrees * Math.PI) / 180;
        const centerAngle = (3 * Math.PI) / 2 - matchingWeapon.localFacingAngle;
        const startAngle = centerAngle - angleRad / 2;
        segments.push({
          start: startAngle,
          length: angleRad,
          color: arcColor,
          label: arc,
        });
      }

      segments.forEach((seg) => {
        const segInnerRadius = seg.isThin360 ? outerRadius - 1.5 : innerRadius;
        const ringGeo = new THREE.RingGeometry(
          segInnerRadius,
          outerRadius,
          64,
          1,
          seg.start,
          seg.length
        );

        const mat = new THREE.MeshBasicMaterial({
          color: seg.color,
          transparent: true,
          opacity: seg.isThin360 ? 0.05 : 0.15,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

        const arcMesh = new THREE.Mesh(ringGeo, mat);
        arcMesh.name = `weapon_arc_${seg.label}`;
        arcMesh.userData = { arcType: arc, baseColor: seg.color, brightColor, label: seg.label };
        arcMesh.rotation.x = -Math.PI / 2;
        arcMesh.position.y = -0.02; // Float right beneath ship/shields

        // Outer Glowing Border Line at MAX WEAPON RANGE
        const borderWidth = seg.isThin360 ? 1.5 : Math.max(1.0, outerRadius * 0.015);
        const borderGeo = new THREE.RingGeometry(
          outerRadius - borderWidth,
          outerRadius,
          64,
          1,
          seg.start,
          seg.length
        );
        const borderMat = new THREE.MeshBasicMaterial({
          color: seg.color,
          transparent: true,
          opacity: seg.isThin360 ? 0.35 : 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const borderMesh = new THREE.Mesh(borderGeo, borderMat);
        borderMesh.name = 'arc_border';
        borderMesh.position.z = 0.002;
        arcMesh.add(borderMesh);

        if (!seg.isThin360) {
          // Radial Border Side Lines for directional arcs extending out to max range
          const lineMat = new THREE.LineBasicMaterial({
            color: seg.color,
            transparent: true,
            opacity: 0.45,
          });

          // Radial Line Start
          const p1 = new THREE.Vector3(segInnerRadius * Math.cos(seg.start), segInnerRadius * Math.sin(seg.start), 0.003);
          const p2 = new THREE.Vector3(outerRadius * Math.cos(seg.start), outerRadius * Math.sin(seg.start), 0.003);
          const lineGeo1 = new THREE.BufferGeometry().setFromPoints([p1, p2]);
          const line1 = new THREE.Line(lineGeo1, lineMat);
          line1.name = 'line_start';
          arcMesh.add(line1);

          // Radial Line End
          const endAngle = seg.start + seg.length;
          const p3 = new THREE.Vector3(segInnerRadius * Math.cos(endAngle), segInnerRadius * Math.sin(endAngle), 0.003);
          const p4 = new THREE.Vector3(outerRadius * Math.cos(endAngle), outerRadius * Math.sin(endAngle), 0.003);
          const lineGeo2 = new THREE.BufferGeometry().setFromPoints([p3, p4]);
          const line2 = new THREE.Line(lineGeo2, lineMat);
          line2.name = 'line_end';
          arcMesh.add(line2);

          // Intermediate range ring ticks (e.g. at 50% and 75% max range)
          [0.5, 0.75].forEach((factor) => {
            const tickR = segInnerRadius + (outerRadius - segInnerRadius) * factor;
            const tickWidth = Math.max(0.5, outerRadius * 0.008);
            const tickGeo = new THREE.RingGeometry(tickR - tickWidth, tickR, 48, 1, seg.start, seg.length);
            const tickMat = new THREE.MeshBasicMaterial({
              color: seg.color,
              transparent: true,
              opacity: 0.2,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            const tickMesh = new THREE.Mesh(tickGeo, tickMat);
            tickMesh.position.z = 0.001;
            arcMesh.add(tickMesh);
          });
        }

        arcGroup.add(arcMesh);
      });
    });

    return arcGroup;
  }
}

