import React, { useEffect, useRef, useState } from 'react';
import { GameSimulation, DEFAULT_PLAYER_INPUT } from '../core/simulation/GameSimulation';
import { wrapAngle } from '../core/kinematics/ShipKinematics';

/** A pointer controls heading; cannon pointers remain independent. */
export function TouchJoystick({simulation}: {simulation: GameSimulation}) {
  const pointer = useRef<number | null>(null);
  const vector = useRef({x:0,y:0});
  const [knob,setKnob] = useState(vector.current);
  useEffect(()=> {
    const publish = () => {
      const {x,y}=vector.current;
      const active=pointer.current !== null && Math.hypot(x,y)>8;
      const angle=wrapAngle(Math.atan2(x,-y)-simulation.player.kinematic.rotation);
      simulation.setInputs({...DEFAULT_PLAYER_INPUT,throttle:active ? Math.min(1,Math.hypot(x,y)/30) : 0,
        steer:active ? Math.max(-1,Math.min(1,angle/.6)) : 0},'joystick');
    };
    const reset = () => {pointer.current=null;vector.current={x:0,y:0};setKnob(vector.current);publish();};
    const off=simulation.addListener(event=>{if (['match_paused','match_resumed','match_ended','training_progress'].includes(event.type)) reset();});
    const timer=setInterval(publish,25);
    window.addEventListener('blur',reset);
    return ()=>{clearInterval(timer);off();window.removeEventListener('blur',reset);simulation.setInputs({...DEFAULT_PLAYER_INPUT},'joystick');};
  },[simulation]);
  const move = (event:React.PointerEvent<HTMLDivElement>) => {
    if(pointer.current!==event.pointerId) return;
    const box=event.currentTarget.getBoundingClientRect();
    const dx=event.clientX-box.left-box.width/2,dy=event.clientY-box.top-box.height/2;
    const scale=Math.min(1,38/(Math.hypot(dx,dy)||1));
    vector.current={x:dx*scale,y:dy*scale};setKnob(vector.current);
  };
  const release = (event:React.PointerEvent<HTMLDivElement>) => {
    if(pointer.current!==event.pointerId) return;
    pointer.current=null;vector.current={x:0,y:0};setKnob(vector.current);
    simulation.setInputs({...DEFAULT_PLAYER_INPUT},'joystick');
  };
  return <div className="touch-joystick" role="group" aria-label="Touch joystick. Drag toward your desired heading." data-testid="touch-joystick"
    onPointerDown={event=>{if(pointer.current!==null || simulation.isPaused || simulation.isEnded || (event.pointerType==='mouse' && event.button!==0)) return;
      event.preventDefault();pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);move(event);}}
    onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onContextMenu={event=>event.preventDefault()}>
    <span className="joystick-north">↑</span><i style={{transform:`translate(${knob.x}px,${knob.y}px)`}}/><small>Drag to sail</small>
  </div>;
}
