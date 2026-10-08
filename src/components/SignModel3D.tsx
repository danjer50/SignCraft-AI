import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraView, SignDesign } from '../design/model';
import type { TextShapes } from '../design/render';
import { buildSignGroup, disposeGroup } from '../design/threeScene';
import { useLanguage } from '../context/LanguageContext';
import { ErrorBoundary } from './ErrorBoundary';

function Scene({design,shapes,night,cameraView,exploded,onSelect}:{design:SignDesign;shapes:TextShapes;night:number;cameraView:CameraView;exploded:boolean;onSelect?:(id:string)=>void}){
 const {camera,gl,invalidate}=useThree();
 const group=useMemo(()=>buildSignGroup(design,shapes,{night:0,exploded}),[design,shapes,exploded]);
 const width=design.dimensions.width*.001,height=design.dimensions.height*.001;
 useEffect(()=>()=>disposeGroup(group),[group]);
 useEffect(()=>{group.traverse((object)=>{if(object instanceof THREE.Mesh&&object.material instanceof THREE.MeshStandardMaterial){const entry=design.objects.find((o)=>o.id===object.userData.objectId);if(entry&&(entry.kind==='text'&&design.lighting.type!=='none'||entry.kind==='panel'&&design.construction==='lightbox'))object.material.emissiveIntensity=night*design.lighting.brightness*.55;}});invalidate();},[group,night,design.objects,design.lighting,design.construction,invalidate]);
 useEffect(()=>{
  const size=Math.max(width,height,1);const target=new THREE.Vector3(0,0,0);
  const points:Record<CameraView,[number,number,number]>={front:[0,0,size*1.65],back:[0,0,-size*1.65],side:[size*1.65,0,.03],top:[0,size*1.65,.03],perspective:[size*.75,size*.28,size*1.5]};
  camera.position.set(...points[cameraView]);camera.lookAt(target);
  const controls=new OrbitControls(camera,gl.domElement);controls.target.copy(target);controls.enableDamping=false;controls.minDistance=.2;controls.maxDistance=size*6;controls.enablePan=true;controls.addEventListener('change',()=>invalidate());controls.update();invalidate();
  return()=>controls.dispose();
 },[camera,gl,invalidate,width,height,cameraView]);
 return <>
  <color attach="background" args={[night>.5?'#101b22':'#18252c']}/>
  <ambientLight intensity={.45+(.65*(1-night))}/>
  <hemisphereLight args={['#dfeaf0','#293d48',1.1*(1-night)+.2]}/>
  <directionalLight position={[width*1.2,height*2,4]} intensity={2.4*(1-night)+.45} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-width*2} shadow-camera-right={width*2} shadow-camera-top={Math.max(height*2,3)} shadow-camera-bottom={-Math.max(height*2,3)} shadow-bias={-.0002}/>
  <pointLight position={[-width*.3,0,.18]} color={design.lighting.color} intensity={night*design.lighting.brightness*.8} distance={Math.max(width,2)}/>
  <primitive object={group} onPointerDown={(event:{stopPropagation:()=>void;object:THREE.Object3D})=>{event.stopPropagation();const object=event.object.userData.objectId as string|undefined;if(object)onSelect?.(object);}}/>
  <mesh position={[0,-height/2-.13,-.1]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[Math.max(width*4,5),8]}/><meshStandardMaterial color="#1a2a31" roughness={.9}/></mesh>
  {design.lighting.type==='halo'&&<mesh position={[0,0,-design.mounting.clearance*.001-.04]} receiveShadow><boxGeometry args={[width+1,height+.6,.025]}/><meshStandardMaterial color="#2b3b3e" roughness={.92}/></mesh>}
 </>;
}
export default function SignModel3D({design,shapes,night,cameraView,exploded=false,onSelect}:{design:SignDesign;shapes:TextShapes;night:number;cameraView:CameraView;exploded?:boolean;onSelect?:(id:string)=>void}){
 const {t}=useLanguage();const [lost,setLost]=useState(false);
 if(lost)return <div className="model-unavailable" role="status"><strong>{t('ws.graphicsUnavailable')}</strong><p>{t('ws.graphicsRecovery')}</p><button onClick={()=>setLost(false)}>{t('common.retry')}</button></div>;
 return <ErrorBoundary resetKey={`${cameraView}:${design.construction}`}>
  <div className="model-canvas" aria-label={t('ws.real3d')}>
   <Suspense fallback={<p>{t('common.loading')}</p>}>
    <Canvas shadows frameloop="demand" dpr={[1,1.5]} camera={{fov:38,near:.005,far:200}} gl={{antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true}} fallback={<p role="status">{t('ws.graphicsUnavailable')}</p>} onCreated={({gl})=>{gl.domElement.addEventListener('webglcontextlost',(event)=>{event.preventDefault();setLost(true);},{once:true});}}>
     <Scene design={design} shapes={shapes} night={night} cameraView={cameraView} exploded={exploded} onSelect={onSelect}/>
    </Canvas>
   </Suspense>
  </div>
  <p className="viewport-note">{t('ws.orbitHint')} · {t('ws.exteriorGeometry')}</p>
 </ErrorBoundary>;
}
