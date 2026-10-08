import type { Graphics } from 'pixi.js';
import type { GameSimulation } from '../core/simulation/GameSimulation';
import { interpolateTransform } from './Camera';

// Stateless combat cues draw the simulation snapshot without advancing it.

export function renderWaterAndGuides(simulation: GameSimulation, alpha: number, waterGraphics: Graphics, wakesGraphics: Graphics, guideGraphics: Graphics): void {
  const time = simulation.elapsedSeconds;
  const {width,height} = simulation.config.arena;
  waterGraphics.clear();
  for (let i=0;i<45;i++) {
    const x=(i*317)%width, y=(i*173)%height;
    const drift=Math.sin(time*.7+i)*7;
    waterGraphics.moveTo(x+drift,y).quadraticCurveTo(x+15+drift,y+4,x+30+drift,y)
      .stroke({width:1.5,color:0xc2ede6,alpha:0.10});
  }
  wakesGraphics.clear();
  for (const ship of [simulation.player,...simulation.enemies]) {
    const k={...ship.kinematic,...interpolateTransform(ship.kinematic, alpha)};
    const speed=Math.hypot(k.velocityX,k.velocityY);
    if (speed<12 || ship.isDestroyed) continue;
    const fx=Math.sin(k.rotation), fy=-Math.cos(k.rotation);
    const rx=Math.cos(k.rotation), ry=Math.sin(k.rotation);
    const length=Math.min(speed*.27,60);
    for (const side of [-1,1]) {
      wakesGraphics.moveTo(k.x-fx*27+rx*side*7,k.y-fy*27+ry*side*7)
        .lineTo(k.x-fx*(30+length)+rx*side*20,k.y-fy*(30+length)+ry*side*20)
        .stroke({width:3,color:0xb6f0e6,alpha:.22});
    }
  }
  const k=interpolateTransform(simulation.player.kinematic, alpha);
  guideGraphics.clear();
  guideGraphics.circle(k.x,k.y,39).stroke({width:1.5,color:0x9af0d6,alpha:.5});
  const front=simulation.config.weaponFront;
  const range=front.projectileSpeed*front.projectileLifetime;
  const fx=Math.sin(k.rotation),fy=-Math.cos(k.rotation);
  for(let distance=62;distance<Math.min(range,250);distance+=26) {
    guideGraphics.moveTo(k.x+fx*distance,k.y+fy*distance)
      .lineTo(k.x+fx*(distance+7),k.y+fy*(distance+7))
      .stroke({width:2,color:0xf2dda5,alpha:.22*(1-distance/300)});
  }
  for(const side of [-1,1]) {
    const rx=Math.cos(k.rotation)*side,ry=Math.sin(k.rotation)*side;
    guideGraphics.moveTo(k.x+rx*48,k.y+ry*48).lineTo(k.x+rx*90,k.y+ry*90)
      .stroke({width:1.5,color:0xb5e4d9,alpha:.25});
  }
}

export function renderProjectiles(simulation: GameSimulation, alpha: number, projectilesGraphics: Graphics): void {
  projectilesGraphics.clear();
  for (const p of simulation.projectiles) {
    const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
    const color=p.owner==='player'?0xffdda1:0xff8f77;
    const speed=Math.hypot(p.vx,p.vy)||1;
    projectilesGraphics.moveTo(x-p.vx/speed*22,y-p.vy/speed*22).lineTo(x,y)
      .stroke({width:p.radius*1.2,color,alpha:.45});
    projectilesGraphics.circle(x,y,p.radius+1).fill({color,alpha:.95});
    projectilesGraphics.circle(x,y,p.radius*.45).fill(0xffffff);
  }
}

export function renderHealthBars(simulation: GameSimulation, alpha: number, healthBarsGraphics: Graphics): void {
  healthBarsGraphics.clear();

  // 1. Player health bar
  const player = simulation.player;
  const barWidth = 44;
  const barHeight = 5;
  const pose = interpolateTransform(player.kinematic, alpha);
  const px = pose.x - barWidth / 2;
  const py = pose.y - 48;

  healthBarsGraphics.rect(px, py, barWidth, barHeight);
  healthBarsGraphics.fill({ color: 0x000000, alpha: 0.6 });

  const pRatio = Math.max(0, Math.min(1, player.health / player.maxHealth));
  const pColor = pRatio > 0.5 ? 0x2ecc71 : pRatio > 0.25 ? 0xf39c12 : 0xe74c3c;
  healthBarsGraphics.rect(px, py, barWidth * pRatio, barHeight);
  healthBarsGraphics.fill({ color: pColor, alpha: 0.9 });

  // 2. Enemies health bars
  for (const enemy of simulation.enemies) {
    if (enemy.isDestroyed) continue;
    const eWidth = 36;
    const eHeight = 4;
    const pose = interpolateTransform(enemy.kinematic, alpha);
    const ex = pose.x - eWidth / 2;
    const ey = pose.y - 40;
    if (enemy.type === 'chaser') {
      healthBarsGraphics.circle(pose.x, ey - 10, 7).fill(0xff886d).stroke({width:2,color:0xffeddb});
    } else {
      healthBarsGraphics.poly([pose.x,ey-18,pose.x+8,ey-10,pose.x,ey-2,pose.x-8,ey-10]).fill(0xefc475).stroke({width:2,color:0xffeddb});
    }

    healthBarsGraphics.rect(ex, ey, eWidth, eHeight);
    healthBarsGraphics.fill({ color: 0x000000, alpha: 0.6 });

    const eRatio = Math.max(0, Math.min(1, enemy.health / enemy.maxHealth));
    const eColor = enemy.type === 'chaser' ? 0xe74c3c : 0xf39c12;
    healthBarsGraphics.rect(ex, ey, eWidth * eRatio, eHeight);
    healthBarsGraphics.fill({ color: eColor, alpha: 0.9 });
  }
}

export function renderIntentions(simulation: GameSimulation, alpha: number, intentGraphics: Graphics): void {
  const g = intentGraphics.clear();
  for (const enemy of simulation.enemies) {
    const k = interpolateTransform(enemy.kinematic, alpha);
    if (simulation.mode === 'training') {
      g.circle(k.x,k.y,48).stroke({width:3,color:0xffdda1});
      continue;
    }
    const loading = enemy.type === 'shooter' ? (enemy.attackWindup ?? 0) > 0 : enemy.chargeStage === 'loading';
    const charging = enemy.type === 'chaser' && enemy.chargeStage === 'charging';
    if (!loading && !charging) continue;
    const color = enemy.type === 'shooter' ? 0xffdda1 : 0xff886d;
    const progress = enemy.type === 'shooter' ? (enemy.attackWindup ?? 0) / .45 : (enemy.chargeSeconds ?? 0) / .55;
    g.circle(k.x,k.y,44).stroke({width:3,color,alpha:.85});
    if (loading) g.moveTo(k.x,k.y-49).arc(k.x,k.y,49,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,progress)).stroke({width:5,color});
    const heading = k.rotation;
    const fx=Math.sin(heading),fy=-Math.cos(heading);
    const length = enemy.type === 'shooter' ? 140 : 190;
    g.moveTo(k.x+fx*35,k.y+fy*35).lineTo(k.x+fx*length,k.y+fy*length).stroke({width:charging?5:3,color,alpha:.7});
    g.circle(k.x+fx*length,k.y+fy*length,7).stroke({width:2,color});
  }
}
