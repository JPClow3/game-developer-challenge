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

export function drawObstacles(layer: Container, obstacles: GameSimulation['obstacles']): void {
  const loader = AssetLoader.getInstance();
  for (const obs of obstacles) {
    const island = new Container();
    island.position.set(obs.x, obs.y);
    layer.addChild(island);
    const shelf = new Graphics().circle(0, 0, obs.radius + 18).fill({color:0x5fbaa9,alpha:0.2})
      .circle(0, 0, obs.radius + 8).stroke({width:3,color:0xd1eae0,alpha:0.35});
    island.addChild(shelf);
    // The sandy shore matches the simulation's circular collision boundary exactly.
    const sand = new Graphics().circle(0, 0, obs.radius).fill(0xd9ba7d);
    island.addChild(sand);
    const sandTexture = loader.getTileTexture(18);
    if (sandTexture) {
      const sprite = new TilingSprite({texture:sandTexture,width:obs.radius*2,height:obs.radius*2});
      sprite.position.set(-obs.radius,-obs.radius);sprite.mask=sand;
      island.addChild(sprite);
    }
    const grassRadius = obs.radius - 19;
    const grassMask = new Graphics().circle(-4, -3, grassRadius).fill(0x688744);
    island.addChild(grassMask);
    const grassTexture = loader.getTileTexture(39);
    if (grassTexture) {
      const grass = new TilingSprite({texture:grassTexture,width:obs.radius*2,height:obs.radius*2});
      grass.position.set(-obs.radius,-obs.radius);grass.mask=grassMask;grass.tint=0xd0dba2;
      island.addChild(grass);
    }
    for (const [tile,x,y,size] of ([[71,-18,-15,70],[70,26,15,48],[65,-22,33,34],[72,26,-27,36]] as const)) {
      const texture = loader.getTileTexture(tile);
      if (!texture) continue;
      const detail = new Sprite(texture);detail.anchor.set(0.5);detail.position.set(x,y);
      detail.width=detail.height=size * obs.radius / 85;
      island.addChild(detail);
    }
  }
}
