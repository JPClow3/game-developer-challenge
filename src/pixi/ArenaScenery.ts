import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { AssetLoader } from '../assets/AssetLoader';
import type { GameSimulation } from '../core/simulation/GameSimulation';

// Static arena art. The parent PixiGame owns and destroys these layers.

export function drawBackground(layer: Container, arena: GameSimulation['config']['arena']): void {
  const { width, height } = arena;
  const base = new Graphics().rect(0, 0, width, height).fill(0x184b60);
  layer.addChild(base);
  const waterTexture = AssetLoader.getInstance().getTileTexture(73);
  if (waterTexture) {
    const water = new TilingSprite({ texture: waterTexture, width, height });
    water.tileScale.set(2.5);
    water.tint = 0x4f9da9;
    water.alpha = 0.55;
    layer.addChild(water);
  }
  const border = new Graphics().roundRect(12, 12, width - 24, height - 24, 14)
    .stroke({ width: 3, color: 0xb5d8d3, alpha: 0.35 });
  layer.addChild(border);
  // Chart-style corner marks keep the arena boundary visible without a bright frame.
  for (const x of [24, width - 24]) for (const y of [24, height - 24]) {
    const dx = x < width / 2 ? 1 : -1;
    const dy = y < height / 2 ? 1 : -1;
    border.moveTo(x + dx * 34, y).lineTo(x, y).lineTo(x, y + dy * 34)
      .stroke({width:2,color:0xf0d197,alpha:0.75});
  }
}

export function drawObstacles(layer: Container, simulation: GameSimulation): void {
    const loader = AssetLoader.getInstance();
    const obstacles = simulation.obstacles;
    if (!obstacles.length) return;
    const land = new Container(); layer.addChild(land);
    const shelf=new Graphics(), sand=new Graphics(), grassMask=new Graphics();
    for(const obs of obstacles) {
      shelf.circle(obs.x,obs.y,obs.radius+18);
      sand.circle(obs.x,obs.y,obs.radius);
      grassMask.circle(obs.x-3,obs.y-3,Math.max(8,obs.radius-17));
    }
    shelf.fill(0x62bba9);shelf.alpha=.24;land.addChild(shelf);
    sand.fill(0xd9ba7d);land.addChild(sand);
    const {width,height}=simulation.config.arena;
    const sandTexture=loader.getTileTexture(18);
    if(sandTexture) {const texture=new TilingSprite({texture:sandTexture,width,height});texture.mask=sand;land.addChild(texture);}
    grassMask.fill(0x688744);land.addChild(grassMask);
    const grassTexture=loader.getTileTexture(39);
    if(grassTexture) {const texture=new TilingSprite({texture:grassTexture,width,height});texture.mask=grassMask;texture.tint=0xd0dba2;land.addChild(texture);}
    // Only the exposed arcs of each disk form the shoreline of the compound island.
    const shoreline=new Graphics();
    for(const obs of obstacles) for(let angle=0;angle<Math.PI*2;angle+=Math.PI/90) {
      const point={x:obs.x+Math.cos(angle)*obs.radius,y:obs.y+Math.sin(angle)*obs.radius};
      if(obstacles.some(other=>other!==obs && Math.hypot(point.x-other.x,point.y-other.y)<other.radius+1)) continue;
      const next=angle+Math.PI/90;
      shoreline.moveTo(point.x,point.y).lineTo(obs.x+Math.cos(next)*obs.radius,obs.y+Math.sin(next)*obs.radius);
    }
    shoreline.stroke({width:3,color:0xe5f3d9,alpha:.75});land.addChild(shoreline);
    obstacles.forEach((obs,index)=> {
      if(obstacles.some((other,i)=>i<index && Math.hypot(obs.x-other.x,obs.y-other.y)<other.radius+obs.radius)) return;
      const detail=new Container();detail.position.set(obs.x,obs.y);land.addChild(detail);
      const palms = simulation.config.voyage?.map==='straits' ? 3 : 2;
      for(let i=0;i<palms;i++) {
        const texture=loader.getTileTexture(i%2 ? 70 : 71);if(!texture)continue;
        const palm=new Sprite(texture);palm.anchor.set(.5);palm.position.set(-obs.radius*.32+i*22,-obs.radius*.32);
        palm.width=palm.height=45+i*7;detail.addChild(palm);
      }
      const landmark=new Graphics();
      if(simulation.config.voyage?.map==='fortress' && index===0) {
        landmark.roundRect(-40,-19,80,62,4).fill(0x415b61).stroke({color:0x9cafab,width:6});
        landmark.rect(-22,-2,44,30).fill(0xbaa983);
        for(const x of [-38,38])for(const y of [-17,40]) landmark.circle(x,y,13).fill(0x586f73).stroke({color:0xb4c2bb,width:3});
        landmark.rect(-9,31,18,16).fill(0x193b45);
      } else if(index%3===0) {
        landmark.rect(-16,9,38,29).fill(0x805737).stroke({color:0xc29d69,width:2});
        landmark.poly([-23,12,3,-10,28,12]).fill(0xb87850).stroke({color:0xe1b77e,width:2});
        landmark.rect(-1,22,9,16).fill(0x2c392d);
        landmark.rect(28,18,13,12).fill(0xa58151).stroke({color:0xe1bb77,width:2});
      } else {
        landmark.circle(4,22,10).fill(0x4d6244).stroke({color:0xc4af85,width:3});
        landmark.poly([-5,25,7,7,17,24]).fill(0xe9bc74);
        landmark.rect(-19,28,15,5).fill(0x805737);
      }
      landmark.moveTo(28,6).lineTo(28,-25).stroke({color:0xc6bca0,width:3});
      landmark.poly([29,-25,48,-19,29,-12]).fill(index%2 ? 0xd58962 : 0x76bcb1);
      detail.addChild(landmark);
    });
  }

