import React, { useState } from 'react';
import { SHIP_CLASSES } from '../game/shipPresets';
import { ShipClass, Faction, CarrierDesignId } from '../types';
import { CARRIER_DESIGNS, getCarrierDesign } from '../game/carrierDesigns';
import { Carrier3DPreviewCanvas } from './Carrier3DPreviewCanvas';
import { Shield, Zap, Navigation, Radio, Check, X, Skull, ShieldAlert, Sparkles, Box, Layers } from 'lucide-react';

interface ShipCustomizerModalProps {
  currentShipClass: ShipClass;
  onSelectShipClass: (shipClass: ShipClass) => void;
  onClose: () => void;
}

type FactionFilter = 'all' | Faction;

export const ShipCustomizerModal: React.FC<ShipCustomizerModalProps> = ({
  currentShipClass,
  onSelectShipClass,
  onClose,
}) => {
  const [selectedFaction, setSelectedFaction] = useState<FactionFilter>('all');
  const [selectedCarrierDesignId, setSelectedCarrierDesignId] = useState<CarrierDesignId>(
    currentShipClass.carrierDesign || 'solaris'
  );

  const isCarrierSelected =
    currentShipClass.modelType === 'carrier' ||
    currentShipClass.id.includes('carrier') ||
    currentShipClass.id.includes('aegis');

  const filteredShips = SHIP_CLASSES.filter((s) => {
    // Hide automated MOBA minion drones from playable hangar
    if (s.id.includes('micro_recon') || s.id.includes('infrared_furtive')) return false;
    if (selectedFaction === 'all') return true;
    return s.faction === selectedFaction;
  });

  const handleSelectCarrierDesign = (designId: CarrierDesignId) => {
    setSelectedCarrierDesignId(designId);
    onSelectShipClass({
      ...currentShipClass,
      carrierDesign: designId,
    });
  };

  const handleSelectShipClass = (sc: ShipClass) => {
    const isCarrier = sc.modelType === 'carrier' || sc.id.includes('carrier') || sc.id.includes('aegis');
    onSelectShipClass({
      ...sc,
      carrierDesign: isCarrier ? selectedCarrierDesignId : sc.carrierDesign,
    });
  };

  const activeCarrierInfo = getCarrierDesign(selectedCarrierDesignId);

  const getFactionBadge = (faction: Faction) => {
    switch (faction) {
      case 'federation':
        return {
          label: 'Federation Starfleet',
          color: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80',
          borderActive: 'border-cyan-500 ring-2 ring-cyan-500/50 bg-cyan-950/40',
        };
      case 'klingon':
        return {
          label: 'Klingon Empire',
          color: 'bg-red-950/80 text-red-400 border-red-700/80',
          borderActive: 'border-red-500 ring-2 ring-red-500/50 bg-red-950/40',
        };
      case 'romulan':
        return {
          label: 'Romulan Star Empire',
          color: 'bg-emerald-950/80 text-emerald-400 border-emerald-700/80',
          borderActive: 'border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-950/40',
        };
      case 'borg':
        return {
          label: 'Borg Collective',
          color: 'bg-lime-950/80 text-lime-400 border-lime-700/80',
          borderActive: 'border-lime-500 ring-2 ring-lime-500/50 bg-lime-950/40',
        };
      default:
        return {
          label: 'Independent',
          color: 'bg-slate-800 text-slate-300 border-slate-700',
          borderActive: 'border-cyan-500 ring-2 ring-cyan-500/50 bg-cyan-950/40',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full p-6 text-slate-100 shadow-2xl overflow-y-auto max-h-[92vh] transform scale-[0.91] origin-center">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold tracking-wide uppercase text-cyan-400 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-cyan-400" />
              Tactical Hangar & Command Select
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select your Flagship archetype and customize 3D Carrier hull variants
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Faction Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-slate-800/80 pb-3">
          {(
            [
              { id: 'all', label: 'All Playable Archetypes' },
              { id: 'federation', label: 'Federation' },
              { id: 'klingon', label: 'Klingon Empire' },
            ] as const
          ).map((f) => {
            const isActive = selectedFaction === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setSelectedFaction(f.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition border ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-md'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Ship Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {filteredShips.map((sc, index) => {
            const isSelected = currentShipClass?.id === sc.id;
            const factionInfo = getFactionBadge(sc.faction);
            const isCarrier = sc.modelType === 'carrier' || sc.id.includes('carrier') || sc.id.includes('aegis');
            const weaponCount =
              (sc.weaponSlots && sc.weaponSlots.length) ||
              ((sc as any).hardpoints && (sc as any).hardpoints.length) ||
              0;

            return (
              <div
                key={`${sc.id}_${index}`}
                onClick={() => handleSelectShipClass(sc)}
                className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                  isSelected
                    ? factionInfo.borderActive
                    : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-slate-100 uppercase tracking-wide flex items-center gap-1.5">
                      {sc.name}
                      {isCarrier && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-cyan-500/20 text-cyan-300 border border-cyan-500/50">
                          Carrier
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="w-5 h-5 text-cyan-400 shrink-0" />}
                  </div>

                  <div className="mb-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border ${factionInfo.color}`}
                    >
                      {factionInfo.label}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 mb-3 leading-relaxed min-h-[2.5rem]">
                    {sc.description}
                  </p>
                </div>

                <div className="space-y-1.5 text-[11px] font-mono pt-3 border-t border-slate-800">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Hull Integrity:</span>
                    <span className="font-bold text-slate-200">{sc.maxHull} HP</span>
                  </div>
                  <div className="flex justify-between text-cyan-400">
                    <span className="text-slate-500">4 Shield Arcs:</span>
                    <span className="font-bold">4 x {sc.maxShieldPerArc}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span className="text-slate-500">Turn Agility:</span>
                    <span className="font-bold">{sc.turnRate}°/s</span>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <span className="text-slate-500">Top Impulse:</span>
                    <span className="font-bold">{sc.maxSpeed} Speed</span>
                  </div>
                  <div className="flex justify-between text-purple-400">
                    <span className="text-slate-500">Weapons Array:</span>
                    <span className="font-bold">{weaponCount} Slots</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CARRIER MODEL DESIGN SELECTOR (Displayed whenever Carrier is selected) */}
        {isCarrierSelected && (
          <div className="mb-6 p-5 rounded-2xl bg-slate-950/90 border border-cyan-800/60 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Box className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300">
                  Carrier Hull Model & Hangar Design Options
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-700/60 rounded">
                  {CARRIER_DESIGNS.length} Models Available
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Choose a 3D Carrier hull variant to pilot in space sector combat
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* 3D Interactive Model Preview Box */}
              <div className="lg:col-span-5 flex flex-col">
                <div className="w-full h-56">
                  <Carrier3DPreviewCanvas
                    carrierDesign={selectedCarrierDesignId}
                    faction={currentShipClass.faction}
                    accentColor={activeCarrierInfo.accentColor}
                  />
                </div>
                <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">{activeCarrierInfo.name}</span>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${activeCarrierInfo.badgeColor}`}>
                      {activeCarrierInfo.launchType}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug mb-2">
                    {activeCarrierInfo.description}
                  </p>
                  <div className="space-y-1">
                    {activeCarrierInfo.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-300">
                        <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Carrier Design Options Grid */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CARRIER_DESIGNS.map((design) => {
                  const isActive = selectedCarrierDesignId === design.id;
                  return (
                    <div
                      key={design.id}
                      onClick={() => handleSelectCarrierDesign(design.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        isActive
                          ? 'bg-cyan-950/40 border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg'
                          : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-slate-100 uppercase tracking-wide">
                            {design.name}
                          </span>
                          {isActive ? (
                            <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                          ) : (
                            <span
                              className="w-3 h-3 rounded-full border border-slate-600"
                              style={{ backgroundColor: design.accentColor }}
                            />
                          )}
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono mb-2">{design.subtitle}</div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                          {design.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${design.badgeColor}`}>
                          {design.badge}
                        </span>
                        <span className="text-[10px] font-bold text-cyan-400">
                          {isActive ? 'Active Model' : 'Select Model'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Deploy Button */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="text-slate-500 font-mono">SELECTED FLAGSHIP:</span>
            <span className="font-bold text-cyan-300 uppercase">
              {currentShipClass?.name || 'Selected Ship'}
              {isCarrierSelected && ` (${activeCarrierInfo.name})`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-bold text-slate-950 tracking-wide text-sm transition shadow-lg shadow-cyan-500/20"
          >
            CONFIRM & DEPLOY TO SECTOR
          </button>
        </div>
      </div>
    </div>
  );
};
