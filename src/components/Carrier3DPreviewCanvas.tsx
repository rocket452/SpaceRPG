import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CarrierDesignId, Faction } from '../types';
import { ShipModelBuilder } from '../game/shipModelBuilder';

interface Carrier3DPreviewCanvasProps {
  carrierDesign: CarrierDesignId;
  faction?: Faction;
  accentColor?: string;
}

export const Carrier3DPreviewCanvas: React.FC<Carrier3DPreviewCanvasProps> = ({
  carrierDesign,
  faction = 'federation',
  accentColor = '#38bdf8',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 220;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 4.5, 9.5);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight1.position.set(8, 12, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(new THREE.Color(accentColor), 1.8);
    dirLight2.position.set(-8, -6, -8);
    scene.add(dirLight2);

    // Subtle Grid Floor
    const gridHelper = new THREE.GridHelper(14, 14, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -2.2;
    scene.add(gridHelper);

    // Build Ship Mesh
    const shipMeshGroup = ShipModelBuilder.createShipMesh('carrier', faction as Faction, undefined, carrierDesign);
    shipMeshGroup.position.set(0, 0, 0);
    scene.add(shipMeshGroup);

    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      // Gentle floating and rotation
      shipMeshGroup.rotation.y += 0.008;
      shipMeshGroup.position.y = Math.sin(Date.now() * 0.0015) * 0.15;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [carrierDesign, faction, accentColor]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
      <div ref={mountRef} className="w-full h-full min-h-[200px]" />
      <div className="absolute top-2 left-2 pointer-events-none text-[10px] font-mono tracking-widest text-slate-400 uppercase bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 backdrop-blur">
        3D Holographic Model Preview
      </div>
    </div>
  );
};
