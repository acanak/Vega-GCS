import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { TrajSample } from '@wmp/logparser';
import { useTheme } from '../gcs/theme';

export function Cesium3DReplay({ traj }: { traj: TrajSample[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { effective } = useTheme();
  useEffect(() => {
    if (!ref.current || traj.length < 2) return;
    Cesium.Ion.defaultAccessToken = '';
    const viewer = new Cesium.Viewer(ref.current, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
      animation: true,
      timeline: true,
    });
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maximumLevel: 19, credit: '© OpenStreetMap' }),
    );
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(effective === 'light' ? '#dbe7f2' : '#0a0f14');

    const start = Cesium.JulianDate.now();
    const posProp = new Cesium.SampledPositionProperty();
    const oriProp = new Cesium.SampledProperty(Cesium.Quaternion);
    for (const s of traj) {
      const time = Cesium.JulianDate.addSeconds(start, s.t, new Cesium.JulianDate());
      const p = Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.alt);
      posProp.addSample(time, p);
      const hpr = new Cesium.HeadingPitchRoll(s.yaw, s.pitch, s.roll);
      oriProp.addSample(time, Cesium.Transforms.headingPitchRollQuaternion(p, hpr));
    }
    const stop = Cesium.JulianDate.addSeconds(start, traj[traj.length - 1]!.t, new Cesium.JulianDate());
    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 4;
    viewer.clock.shouldAnimate = true;
    viewer.timeline.zoomTo(start, stop);

    const entity = viewer.entities.add({
      position: posProp,
      orientation: oriProp,
      point: { pixelSize: 12, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
      path: { resolution: 1, material: Cesium.Color.CYAN.withAlpha(0.85), width: 2, leadTime: 0, trailTime: 1e12 },
    });
    viewer.trackedEntity = entity;

    return () => { if (!viewer.isDestroyed()) viewer.destroy(); };
  }, [traj, effective]);

  return <div ref={ref} className="cesium-view" />;
}
