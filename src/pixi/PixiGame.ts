import {
  Application,
  Container,
  Graphics,
  Sprite,
  Assets,
  Texture,
  Text,
} from 'pixi.js';
import { drawBackground, drawObstacles } from './ArenaScenery';
import { renderHealthBars, renderIntentions } from './CombatOverlays';
import { GameSimulation } from '../core/simulation/GameSimulation';
import { DebugOverlay } from './DebugOverlay';
import { AssetLoader } from '../assets/AssetLoader';
import { AudioManager } from '../audio/AudioManager';
import type { Projectile, ShipState } from '../types/game';
import { ImpactFeedback } from './ImpactFeedback';
import { combatCamera, edgeIndicator, interpolateTransform } from './Camera';
import { placeBearings, type Bearing, type PlacedBearing } from './Bearings';

interface ShipVisual {
  container: Container;
  sprite: Sprite;
  lastDamageTier: number;
  lastHealth: number;
  hitUntil: number;
}

interface ExplosionVisual {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  maxRadius: number;
  color: number;
}

export class PixiGame {
  public debugOverlay?: DebugOverlay;
  public readonly impact = new ImpactFeedback(typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  private foam: {x:number;y:number;age:number;size:number}[] = [];
  private debris: {x:number;y:number;age:number;angle:number;survivor:boolean}[] = [];
  private wakeClock=0;
  private lastPlayerHealth=100;
  private salvageGraphics!: Graphics;
  private splashes: {x:number;y:number;age:number}[] = [];
  private sinking: {container:Container;age:number;rotation:number}[] = [];
  public get feedbackState() {return {sinking:this.sinking.length,splashes:this.splashes.length,freeze:this.impact.freezeSeconds,recoil:Math.hypot(this.impact.recoilX,this.impact.recoilY),shake:this.impact.shakeStrength};}
  public readonly app: Application;
  public readonly simulation: GameSimulation;
  private readonly audio = AudioManager.getInstance();

  private worldContainer!: Container;
  private backgroundLayer!: Container;
  private obstaclesLayer!: Container;
  private shipsLayer!: Container;
  private projectilesGraphics!: Graphics;
  private healthBarsGraphics!: Graphics;
  private vfxGraphics!: Graphics;
  private waterGraphics!: Graphics;
  private wakesGraphics!: Graphics;
  private guideGraphics!: Graphics;
  private intentGraphics!: Graphics;
  private indicatorGraphics!: Graphics;
  private indicatorLabels = new Map<string, Text>();
  public camera = {scale:1,x:0,y:0,portrait:false,follow:false};
  public visibleIndicators: (PlacedBearing & {type:string})[] = [];

  private playerVisual!: ShipVisual;
  private enemyVisuals: Map<string, ShipVisual> = new Map();
  private explosions: ExplosionVisual[] = [];

  private isRunning = false;
  private isDestroyed = false;
  public get isReady(): boolean { return this.isRunning && !this.isDestroyed; }
  private unsubSimulation: (() => void) | null = null;

  constructor(simulation: GameSimulation) {
    this.simulation = simulation;
    this.app = new Application();
  }

  public async init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.isDestroyed) return;
    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x1b4965, // deep naval blue
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      antialias: true,
      autoDensity: true,
      preference: 'webgl',
    });

    if (this.isDestroyed) {
      if (this.app?.renderer) {
        try {
          this.app.destroy(false, { children: true, texture: false });
        } catch {
          // ignore
        }
      }
      return;
    }

    this.setupLayers();
    this.drawBackground();
    this.drawObstacles();
    this.setupPlayerVisual();
    this.setupEventAudio();
    this.handleResize();

    // Start background ocean ambience
    this.audio.play('ocean_ambience_loop', this.simulation.isPaused ? 0 : 1);

    this.isRunning = true;
    if (this.app?.ticker) {
      this.app.ticker.add(this.update, this);
    }
  }

  private setupLayers(): void {
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.backgroundLayer = new Container();
    this.obstaclesLayer = new Container();
    this.shipsLayer = new Container();
    this.projectilesGraphics = new Graphics();
    this.healthBarsGraphics = new Graphics();
    this.vfxGraphics = new Graphics();

    this.worldContainer.addChild(this.backgroundLayer);
    this.waterGraphics = new Graphics();
    this.wakesGraphics = new Graphics();
    this.guideGraphics = new Graphics();
    this.worldContainer.addChild(this.waterGraphics);
    this.worldContainer.addChild(this.obstaclesLayer);
    this.worldContainer.addChild(this.wakesGraphics);
    this.worldContainer.addChild(this.guideGraphics);
    this.worldContainer.addChild(this.shipsLayer);
    this.worldContainer.addChild(this.projectilesGraphics);
    this.worldContainer.addChild(this.healthBarsGraphics);
    this.worldContainer.addChild(this.vfxGraphics);
    this.salvageGraphics = new Graphics();
    this.worldContainer.addChild(this.salvageGraphics);
    this.intentGraphics = new Graphics();
    this.worldContainer.addChild(this.intentGraphics);
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.debugOverlay = new DebugOverlay();
      this.worldContainer.addChild(this.debugOverlay);
      const legend=new Text({text:'DEBUG · green: hull disks · gold: islands / spawn safety · pink: Shooter range · white: projectile lifetime',style:{fontFamily:'monospace',fontSize:11,fill:0xffffff,wordWrap:true,wordWrapWidth:Math.min(this.app.screen.width-24,600),stroke:{color:0x062432,width:3}}});
      legend.position.set(12,90);this.app.stage.addChild(legend);
    }
    this.indicatorGraphics = new Graphics();
    this.app.stage.addChild(this.indicatorGraphics);
  }

  private drawBackground(): void { drawBackground(this.backgroundLayer, this.simulation.config.arena); }

  private drawObstacles(): void { drawObstacles(this.obstaclesLayer, this.simulation); }

  private getShipTexture(series: number, damageTier: number): Texture {
    const frameName = AssetLoader.getShipFrameName(series as any, damageTier as any);
    const texture = Assets.get(frameName);
    if (texture) return texture;

    return Texture.WHITE;
  }

  private setupPlayerVisual(): void {
    const container = new Container();
    const texture = this.getShipTexture(this.simulation.player.series, this.simulation.player.damageTier);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.5);

    sprite.width = 38;
    sprite.height = 70;
    if (texture === Texture.WHITE) {
      sprite.tint = 0xffffff;
    }

    container.addChild(new Graphics().ellipse(3, 8, 20, 32).fill({color:0x082c3c,alpha:0.35}));
    container.addChild(sprite);
    this.shipsLayer.addChild(container);

    this.playerVisual = {
      container,
      sprite,
      lastDamageTier: this.simulation.player.damageTier,
      lastHealth: this.simulation.player.health,
      hitUntil: 0,
    };
  }

  private setupEventAudio(): void {
    this.lastPlayerHealth=this.simulation.player.health;
    this.unsubSimulation = this.simulation.addListener((event) => {
      switch (event.type) {
        case 'broadside_fired': this.impact.broadside(event.payload.side,event.payload.rotation); break;
        case 'ship_sunk': if (event.payload) this.sinkShip(event.payload); break;
        case 'shot_splash':
        case 'hard_turn': this.splashes.push({...event.payload,age:0}); break;
        case 'projectile_spawned': {
          const p = event.payload as Projectile;
          this.spawnExplosion(p.x, p.y, 12, 0xffdfa0);
          if (p.weaponType === 'front') {
            this.audio.playPositioned('cannon_fire_1',p,this.simulation.player.kinematic);
          } else {
            this.audio.playPositioned('cannon_broadside',p,this.simulation.player.kinematic);
          }
          break;
        }
        case 'score_changed': {
          this.audio.play('score_point');
          break;
        }
        case 'salvage_collected': this.audio.play('score_point');this.spawnExplosion(event.payload.x,event.payload.y,32,0x9af0b5);break;
        case 'health_changed': {
          const damaged = event.payload.current < this.lastPlayerHealth;
          this.lastPlayerHealth=event.payload.current;
          if(!damaged) break;
          this.impact.hit();
          const pct = event.payload?.percentage ?? 100;
          if (pct < 30) {
            this.audio.play('health_low');
          } else {
            this.audio.play('ship_wood_hit_1');
          }
          break;
        }
        case 'match_paused': {
          this.audio.play('game_pause');
          this.audio.setLoopVolume('ocean_ambience_loop', 0);
          break;
        }
        case 'match_resumed': {
          this.audio.play('game_resume');
          this.audio.setLoopVolume('ocean_ambience_loop', 1.0);
          break;
        }
        case 'match_ended': {
          this.audio.stopAllLoops();
          const reason = event.payload?.reason;
          if (reason === 'player_destroyed') {
            this.audio.play('game_over');
          } else {
            this.audio.play('game_complete');
          }
          break;
        }
      }
    });
  }

  public update(): void {
    if (!this.isRunning || this.isDestroyed) return;

    // Advance physics simulation
    const dt = this.app.ticker.deltaMS / 1000;
    this.simulation.update(dt);

    this.renderFrame(this.simulation.isPaused ? 0 : dt);
  }

  /** Render a frame independently of the simulation clock for stable visual QA. */
  public renderFrame(dt = 0): void {
    if (!this.isRunning || this.isDestroyed) return;
    if (this.impact.advance(Math.min(dt,.05))) return;
    this.renderWaterAndGuides(dt);
    this.renderSalvage();
    this.renderPlayer();
    this.renderEnemies();
    this.renderProjectiles();
    this.renderHealthBars();
    this.renderIntentions();
    this.updateCamera();
    this.renderVfx(dt);
    this.renderSinking(dt);
    this.debugOverlay?.update(this.simulation);
  }

  private renderPlayer(): void {
    const player = this.simulation.player;
    const { container, sprite } = this.playerVisual;

    const pose = this.pose(player.kinematic);
    container.visible = !player.isDestroyed;
    container.position.set(pose.x + this.impact.recoilX, pose.y + this.impact.recoilY);
    container.rotation = pose.rotation;

    this.updateHitFlash(this.playerVisual, player.health);
    if (this.playerVisual.lastDamageTier !== player.damageTier) {
      this.playerVisual.lastDamageTier = player.damageTier;
      const newTex = this.getShipTexture(player.series, player.damageTier);
      if (newTex) {
        sprite.texture = newTex;
        sprite.width = 38;
        sprite.height = 70;
      }
    }
  }

  private renderEnemies(): void {
    const activeEnemyIds = new Set<string>();

    for (const enemy of this.simulation.enemies) {
      if (enemy.isDestroyed) continue;
      activeEnemyIds.add(enemy.id);
      let visual = this.enemyVisuals.get(enemy.id);

      if (!visual) {
        const container = new Container();
        const texture = this.getShipTexture(enemy.series, enemy.damageTier);
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 0.5);

        sprite.width = 34;
        sprite.height = 64;
        if (texture === Texture.WHITE) {
          sprite.tint = enemy.type === 'chaser' ? 0xe76f51 : 0xf4a261;
        }

        container.addChild(new Graphics().ellipse(3, 8, 18, 30).fill({color:0x082c3c,alpha:0.35}));
        container.addChild(sprite);
        this.shipsLayer.addChild(container);

        visual = {
          container,
          sprite,
          lastDamageTier: enemy.damageTier,
          lastHealth: enemy.health,
          hitUntil: 0,
        };
        this.enemyVisuals.set(enemy.id, visual);
      }

      const pose = this.pose(enemy.kinematic);
      visual.container.position.set(pose.x, pose.y);
      visual.container.rotation = pose.rotation;

      this.updateHitFlash(visual, enemy.health);
      if (visual.lastDamageTier !== enemy.damageTier) {
        visual.lastDamageTier = enemy.damageTier;
        const newTex = this.getShipTexture(enemy.series, enemy.damageTier);
        if (newTex) {
          visual.sprite.texture = newTex;
          visual.sprite.width = 34;
          visual.sprite.height = 64;
        }
      }
    }

    // Clean up removed enemy visuals
    for (const [id, visual] of this.enemyVisuals.entries()) {
      if (!activeEnemyIds.has(id)) {
        this.shipsLayer.removeChild(visual.container);
        visual.container.destroy({ children: true });
        this.enemyVisuals.delete(id);
      }
    }
  }

  private sinkShip(ship: ShipState): void {
    const existing = ship.type === 'player' ? this.playerVisual : this.enemyVisuals.get(ship.id);
    // A ship can spawn and sink between rendered frames. Its final pose is still available.
    const container = new Container();
    const sprite = new Sprite(existing?.sprite.texture ?? this.getShipTexture(ship.series,3));
    sprite.anchor.set(.5);sprite.width=ship.type==='player'?38:34;sprite.height=ship.type==='player'?70:64;
    container.addChild(sprite);container.position.set(ship.kinematic.x,ship.kinematic.y);container.rotation=ship.kinematic.rotation;
    this.shipsLayer.addChild(container);
    this.sinking.push({container,age:0,rotation:container.rotation});
    for(let i=0;i<7;i++) {
      const angle=i*Math.PI*2/7;
      this.debris.push({x:container.x+Math.cos(angle)*22,y:container.y+Math.sin(angle)*22,age:0,angle,survivor:i===0});
    }
    this.debris=this.debris.slice(-112);
    this.impact.sink();this.spawnExplosion(container.x,container.y,42,0xffad67);
    this.splashes.push({x:container.x,y:container.y,age:0});
    this.audio.playPositioned('ship_explosion_1',ship.kinematic,this.simulation.player.kinematic);
  }

  private renderSinking(dt: number): void {
    for(let i=this.sinking.length-1;i>=0;i--) {
      const wreck=this.sinking[i]!;wreck.age+=dt;
      const t=Math.min(1,wreck.age/.65);
      wreck.container.alpha=1-t;
      wreck.container.scale.set(1-t*.4,1-t*.7);
      if(!this.impact.reducedMotion) wreck.container.rotation=wreck.rotation+t*.3;
      if(t>=1) {wreck.container.destroy({children:true});this.sinking.splice(i,1);}
    }
  }

  private updateHitFlash(visual: ShipVisual, health: number): void {
    if (health < visual.lastHealth) {
      visual.hitUntil = this.simulation.elapsedSeconds + 0.16;
      this.spawnExplosion(visual.container.x, visual.container.y, 19, 0xffdd96);
    }
    visual.lastHealth = health;
    visual.sprite.tint = this.simulation.elapsedSeconds < visual.hitUntil ? 0xff9c78 : 0xffffff;
  }

  private renderWaterAndGuides(dt:number): void {
    const time = this.impact.reducedMotion ? 0 : this.simulation.elapsedSeconds;
    this.wakeClock+=dt;
    const emitWake=this.wakeClock>=.075;
    if(emitWake)this.wakeClock=0;
    const {width,height} = this.simulation.config.arena;
    this.waterGraphics.clear();
    for (let i=0;i<45;i++) {
      const x=(i*317)%width, y=(i*173)%height;
      const drift=Math.sin(time*.7+i)*7;
      this.waterGraphics.moveTo(x+drift,y).quadraticCurveTo(x+15+drift,y+4,x+30+drift,y)
        .stroke({width:1.5,color:0xc2ede6,alpha:0.10});
    }
    this.wakesGraphics.clear();
    for (const ship of [this.simulation.player,...this.simulation.enemies]) {
      const k={...ship.kinematic,...this.pose(ship.kinematic)};
      const speed=Math.hypot(k.velocityX,k.velocityY);
      if (speed<12 || ship.isDestroyed) continue;
      const fx=Math.sin(k.rotation), fy=-Math.cos(k.rotation);
      const rx=Math.cos(k.rotation), ry=Math.sin(k.rotation);
      const length=Math.min(speed*.27,60);
      if(emitWake && !this.impact.reducedMotion) {
        for(const side of [-1,1])this.foam.push({x:k.x-fx*34+rx*side*10,y:k.y-fy*34+ry*side*10,age:0,size:2+speed/85});
      }
      if(ship.health/ship.maxHealth<.3) this.wakesGraphics.circle(k.x-fx*20,k.y-fy*20,10).fill({color:0x253c3b,alpha:.3});
      for (const side of [-1,1]) {
        this.wakesGraphics.moveTo(k.x-fx*27+rx*side*7,k.y-fy*27+ry*side*7)
          .lineTo(k.x-fx*(30+length)+rx*side*20,k.y-fy*(30+length)+ry*side*20)
          .stroke({width:3,color:0xb6f0e6,alpha:.22});
      }
    }
    this.foam=this.foam.slice(-160);
    for(let i=this.foam.length-1;i>=0;i--) {
      const particle=this.foam[i]!;particle.age+=dt;
      if(particle.age>2){this.foam.splice(i,1);continue;}
      this.wakesGraphics.circle(particle.x,particle.y,particle.size+particle.age*3).fill({color:0xc9f4e6,alpha:(1-particle.age/2)*.25});
    }
    const k=this.pose(this.simulation.player.kinematic);
    this.guideGraphics.clear();
    this.guideGraphics.circle(k.x,k.y,39).stroke({width:1.5,color:0x9af0d6,alpha:.5});
    const front=this.simulation.config.weaponFront;
    const range=front.projectileSpeed*front.projectileLifetime;
    const fx=Math.sin(k.rotation),fy=-Math.cos(k.rotation);
    for(let distance=62;distance<Math.min(range,250);distance+=26) {
      this.guideGraphics.moveTo(k.x+fx*distance,k.y+fy*distance)
        .lineTo(k.x+fx*(distance+7),k.y+fy*(distance+7))
        .stroke({width:2,color:0xf2dda5,alpha:.22*(1-distance/300)});
    }
    for(const side of [-1,1]) {
      const rx=Math.cos(k.rotation)*side,ry=Math.sin(k.rotation)*side;
      this.guideGraphics.moveTo(k.x+rx*48,k.y+ry*48).lineTo(k.x+rx*90,k.y+ry*90)
        .stroke({width:1.5,color:0xb5e4d9,alpha:.25});
    }
  }

  private renderSalvage(): void {
    const g=this.salvageGraphics.clear();
    for(const pickup of this.simulation.salvage.items) {
      const t=this.impact.reducedMotion ? 0 : Math.sin(this.simulation.elapsedSeconds*3+pickup.id);
      const fade=Math.min(1,pickup.remainingSeconds/2);
      g.circle(pickup.x,pickup.y,24+t*3).fill({color:0x99ecc1,alpha:.14*fade}).stroke({color:0xb1f4d4,width:2,alpha:.7*fade});
      g.roundRect(pickup.x-10,pickup.y-10,20,20,3).fill({color:0x8f643a,alpha:fade}).stroke({color:0xe4d79c,width:2,alpha:fade});
      g.rect(pickup.x-2,pickup.y-7,4,14).fill({color:0xd1ffe0,alpha:fade});
      g.rect(pickup.x-7,pickup.y-2,14,4).fill({color:0xd1ffe0,alpha:fade});
    }
  }

  private renderProjectiles(): void {
    this.projectilesGraphics.clear();
    for (const p of this.simulation.projectiles) {
      const alpha = this.renderAlpha;
      const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
      const color=p.owner==='player'?0xffdda1:0xff8f77;
      const speed=Math.hypot(p.vx,p.vy)||1;
      this.projectilesGraphics.moveTo(x-p.vx/speed*22,y-p.vy/speed*22).lineTo(x,y)
        .stroke({width:p.radius*1.2,color,alpha:.45});
      this.projectilesGraphics.circle(x,y,p.radius+1).fill({color,alpha:.95});
      this.projectilesGraphics.circle(x,y,p.radius*.45).fill(0xffffff);
    }
  }


  private renderHealthBars(): void { renderHealthBars(this.simulation, this.renderAlpha, this.healthBarsGraphics); }

  private get renderAlpha(): number { return this.simulation.isPaused || this.simulation.isEnded ? 1 : this.simulation.alpha; }
  private pose(k: import('../types').KinematicState) { return interpolateTransform(k, this.renderAlpha); }

  private renderIntentions(): void { renderIntentions(this.simulation, this.renderAlpha, this.intentGraphics); }

  private updateCamera(): void {
    const width=this.app.screen.width,height=this.app.screen.height;
    const player=this.pose(this.simulation.player.kinematic);
    this.camera=combatCamera(width,height,this.simulation.config.arena,player,width <= 1000 && !!window.matchMedia?.('(pointer: coarse)').matches);
    const c=this.camera;
    const shake=this.impact.shake;
    this.worldContainer.scale.set(c.scale); this.worldContainer.position.set(c.x+shake.x,c.y+shake.y);
    const g=this.indicatorGraphics.clear(); this.visibleIndicators=[];
    const active=new Set<string>();
    const bearings:Bearing[]=[];
    if (c.follow) for (const enemy of this.simulation.enemies) {
      const k=this.pose(enemy.kinematic);
      const marker=edgeIndicator({x:player.x*c.scale+c.x,y:player.y*c.scale+c.y},{x:k.x*c.scale+c.x,y:k.y*c.scale+c.y},width,height);
      if (!marker) continue;
      const distance=Math.round(Math.hypot(k.x-player.x,k.y-player.y));
      bearings.push({id:enemy.id,kind:enemy.type,...marker,distance});
    }
    for (const bearing of placeBearings(bearings,width,height)) {
      const {id,kind,x,y,rotation,distance,count,edge}=bearing;
      const color = kind === 'chaser' ? 0xff886d : 0xefc475;
      active.add(id);
      this.visibleIndicators.push({...bearing,type:kind});
      const fx=Math.cos(rotation),fy=Math.sin(rotation);
      g.poly([x+fx*15,y+fy*15,x-fx*7-fy*7,y-fy*7+fx*7,x-fx*7+fy*7,y-fy*7-fx*7]).fill(color);
      const sx=x-fx*16,sy=y-fy*16;
      if (kind==='chaser') g.circle(sx,sy,5).fill(color);
      else g.poly([sx,sy-6,sx+6,sy,sx,sy+6,sx-6,sy]).fill(color);
      let label=this.indicatorLabels.get(id);
      if (!label) { label=new Text({text:'',style:{fontFamily:'Arial',fontSize:11,fill:0xfff0cf,stroke:{color:0x08232e,width:3}}}); this.indicatorLabels.set(id,label);this.app.stage.addChild(label); }
      label.text = count > 1 ? `×${count} · ${distance}` : String(distance);
      label.anchor.set(.5);
      const margin=label.width/2+8;
      label.position.set(Math.max(margin,Math.min(width-margin,x-fx*25)),edge==='bottom'?y-38:y+19);
    }
    for (const [id,label] of this.indicatorLabels) if (!active.has(id)) {label.destroy();this.indicatorLabels.delete(id);}
  }

  public spawnExplosion(x: number, y: number, maxRadius = 40, color = 0xffa500): void {
    this.explosions.push({
      x,
      y,
      age: 0,
      maxAge: 0.35,
      maxRadius,
      color,
    });
  }

  private renderVfx(dt: number): void {
    this.vfxGraphics.clear();
    for(let i=this.debris.length-1;i>=0;i--) {
      const bit=this.debris[i]!;bit.age+=dt;
      if(bit.age>6){this.debris.splice(i,1);continue;}
      const drift=this.impact.reducedMotion ? 0 : bit.age*4;
      const x=bit.x+Math.cos(bit.angle)*drift,y=bit.y+Math.sin(bit.angle)*drift;
      const alpha=Math.min(1,6-bit.age)*.75;
      if(bit.survivor) {
        this.vfxGraphics.ellipse(x,y,9,5).stroke({color:0xc9f4e6,width:2,alpha});
        this.vfxGraphics.circle(x,y-2,4).fill({color:0xdba77c,alpha});
        this.vfxGraphics.rect(x-4,y-7,8,3).fill({color:0xdfc38a,alpha});
      } else this.vfxGraphics.moveTo(x,y).lineTo(x+Math.cos(bit.angle)*13,y+Math.sin(bit.angle)*13).stroke({color:0xc69b63,width:4,alpha});
    }
    for(let i=this.splashes.length-1;i>=0;i--) {
      const splash=this.splashes[i]!;splash.age+=dt;
      const t=splash.age/.5;
      if(t>=1) {this.splashes.splice(i,1);continue;}
      this.vfxGraphics.ellipse(splash.x,splash.y,6+(this.impact.reducedMotion ? .5 : t)*27,3+(this.impact.reducedMotion ? .5 : t)*14).stroke({width:2,color:0xb9f5ee,alpha:1-t});
      if(!this.impact.reducedMotion) for(let n=0;n<5;n++) {
        const angle=n*Math.PI*2/5;
        this.vfxGraphics.circle(splash.x+Math.cos(angle)*t*22,splash.y+Math.sin(angle)*t*12-Math.sin(t*Math.PI)*16,2*(1-t)+1).fill({color:0xe5fffa,alpha:1-t});
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      if (!exp) continue;
      exp.age += dt;

      if (exp.age >= exp.maxAge) {
        this.explosions.splice(i, 1);
        continue;
      }

      const progress = exp.age / exp.maxAge;
      const currentRadius = exp.maxRadius * (this.impact.reducedMotion ? .7 : Math.sin(progress * Math.PI * 0.5));
      const alpha = 1 - progress;

      this.vfxGraphics.circle(exp.x, exp.y, currentRadius);
      this.vfxGraphics.stroke({ width: 3 * alpha + 1, color: exp.color, alpha: alpha * 0.8 });
      this.vfxGraphics.circle(exp.x, exp.y, currentRadius * 0.4).fill({color:0xffdf9d,alpha:alpha*.7});
      for (let n=0;n<6;n++) {
        const angle=n*Math.PI/3;
        this.vfxGraphics.circle(exp.x+Math.cos(angle)*currentRadius*.8,exp.y+Math.sin(angle)*currentRadius*.8,3*alpha+1).fill({color:exp.color,alpha});
      }
    }
  }

  public handleResize(): void {
    if (this.isDestroyed || !this.app.renderer || !this.worldContainer) return;
    const canvas = this.app.canvas as HTMLCanvasElement;
    const parent = canvas.parentElement;
    const screenWidth = parent?.clientWidth || window.innerWidth;
    const screenHeight = parent?.clientHeight || window.innerHeight;

    this.app.renderer.resize(screenWidth, screenHeight);

    this.updateCamera();
    // Resizing clears the WebGL drawing buffer. Repaint even between ticks.
    this.renderFrame();
    this.app.render();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isRunning = false;

    // Clean up active ambient audio loops so they do not persist after match exit
    this.audio.stopAllLoops();

    if (this.unsubSimulation) {
      this.unsubSimulation();
      this.unsubSimulation = null;
    }

    if (this.app?.ticker) {
      try {
        this.app.ticker.remove(this.update, this);
      } catch {
        // ignore
      }
    }
    this.enemyVisuals.clear();
    this.indicatorLabels.clear();
    this.explosions = [];
    this.sinking=[];this.splashes=[];this.foam=[];this.debris=[];

    if (this.app?.renderer) {
      try {
        this.app.destroy(false, { children: true, texture: false });
      } catch {
        // ignore
      }
    }
  }
}
