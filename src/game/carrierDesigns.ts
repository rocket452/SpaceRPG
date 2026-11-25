import { CarrierDesignInfo, CarrierDesignId } from '../types';

export const CARRIER_DESIGNS: CarrierDesignInfo[] = [
  {
    id: 'transtellar',
    name: 'Transtellar Tactical',
    subtitle: 'Starfleet Standard Flight-Deck Carrier',
    description: 'Heavy armored classic flight deck featuring twin starboard & port launch catapults, twin warp pod nacelles, and an elevated tactical command superstructure.',
    badge: 'Standard Deck',
    badgeColor: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80',
    accentColor: '#38bdf8',
    launchType: 'Dual Side Catapult',
    features: [
      'Twin starboard/port flight deck runways',
      'High-durability Starfleet hull armor',
      'Elevated tactical island bridge',
      'Dual warp nacelle propulsion'
    ]
  },
  {
    id: 'fortress',
    name: 'Aegis Fortress Citadel',
    subtitle: 'Heavy Armored Double-Hull Dreadnought Carrier',
    description: 'Reinforced dual-catamaran super-dreadnought frame with quad heavy hangar elevators, ventral bay launch chutes, and pulsing plasma energy conduits.',
    badge: 'Heavy Citadel',
    badgeColor: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/80',
    accentColor: '#6366f1',
    launchType: 'Quad Ventral Elevator',
    features: [
      'Double-hulled armored catamaran chassis',
      'Quad synchronized hangar launch elevators',
      'Heavy ventral launch chutes',
      'Pulsing plasma energy conduits'
    ]
  },
  {
    id: 'stealth',
    name: 'Obsidian Shadow-Bay',
    subtitle: 'Covert Ops Angular Stealth Supercarrier',
    description: 'Low-RCS angular diamond stealth hull with magnetic catapult wing-tunnels, dark matte armor plating, and crimson sensor emitter arrays.',
    badge: 'Stealth Wing',
    badgeColor: 'bg-rose-950/80 text-rose-300 border-rose-700/80',
    accentColor: '#f43f5e',
    launchType: 'Magnetic Wing Tunnel',
    features: [
      'Low-radar cross-section faceted hull',
      'Enclosed magnetic launch tube tunnels',
      'Crimson heat-dissipation grilles',
      'Covert deployment bay hatches'
    ]
  },
  {
    id: 'solaris',
    name: 'Solaris Vanguard',
    subtitle: 'Forward Catapult Twin-Runway Carrier',
    description: 'Aggressive forward-pronged flight deck runways with bright illuminated deck guide strips, outrigger impulse nacelles, and golden photon shield projectors.',
    badge: 'Forward Runway',
    badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-700/80',
    accentColor: '#f59e0b',
    launchType: 'Forward Prong Catapult',
    features: [
      'Dual forward-extended flight deck runways',
      'High-visibility deck landing strips',
      'Quad outrigger impulse engine pods',
      'Central sensor dome & command tower'
    ]
  },
  {
    id: 'hyperion_ring',
    name: 'Hyperion Celestial Ring',
    subtitle: 'Ring-Hulled Gravity Launch Supercarrier',
    description: 'Majestic circular toroidal superstructure surrounding a central singularity gravity-well launch core with cyan energy rings and radial stabilizer pods.',
    badge: 'Toroidal Ring',
    badgeColor: 'bg-sky-950/80 text-sky-300 border-sky-700/80',
    accentColor: '#0ea5e9',
    launchType: 'Gravity Well Core',
    features: [
      'Toroidal gravity ring capital chassis',
      'Central tachyon ejection port',
      'Radial stabilizing nacelles',
      'Quantum barrier shield projectors'
    ]
  },
  {
    id: 'vortex_hive',
    name: 'Vortex Bio-Mechanical Hive',
    subtitle: 'Chitinous Swarm Spawner Leviathan',
    description: 'Alien organic bio-mechanical carapace with segmented chitinous plates, pulsing emerald bio-luminescent launch pores, and living organic propulsion vents.',
    badge: 'Bio Swarm Hive',
    badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80',
    accentColor: '#10b981',
    launchType: 'Living Bio-Pore Spawner',
    features: [
      'Segmented bio-metallic chitin carapace',
      'Pulsing emerald bio-spore vents',
      'Bio-kinetic acceleration channels',
      'Self-regenerating hull matrix'
    ]
  },
  {
    id: 'celestial_forge',
    name: 'Sol-Forge Orbital Foundry',
    subtitle: 'Heavy Mobile Industrial Ship-Foundry',
    description: 'Industrial dreadnought carrier equipped with expansive solar radiation collector arrays, twin molten plasma forge reactors, and industrial scaffolding launch bays.',
    badge: 'Orbital Foundry',
    badgeColor: 'bg-orange-950/80 text-orange-300 border-orange-700/80',
    accentColor: '#ea580c',
    launchType: 'Industrial Gantry Bay',
    features: [
      'Wide solar-radiation collector panels',
      'Twin molten forge reactor cores',
      'Automated industrial gantry launch bays',
      'Heavy reinforced hull plating'
    ]
  },
  {
    id: 'chronos_phantom',
    name: 'Chronos Quantum Blade',
    subtitle: 'Quantum Slipstream Needle-Delta Supercarrier',
    description: 'Ultra-sleek needle-delta hull with forward-swept wing stabilizer blades, glowing violet quantum catapult tracks, and quad hyper-ion impulse drives.',
    badge: 'Quantum Blade',
    badgeColor: 'bg-purple-950/80 text-purple-300 border-purple-700/80',
    accentColor: '#a855f7',
    launchType: 'Quantum Catapult Track',
    features: [
      'Ultra-sleek needle-delta hull geometry',
      'Violet quantum slipstream catapult tracks',
      'Forward-swept wing stabilizer blades',
      'Quad hyper-ion impulse array'
    ]
  }
];

export const getCarrierDesign = (id?: CarrierDesignId): CarrierDesignInfo => {
  return CARRIER_DESIGNS.find((d) => d.id === id) || CARRIER_DESIGNS[0];
};
