import type { ArenaBounds, IslandObstacle, Vector2D } from '../../types/game';

/** Swept clearance test shared by route smoothing and cannon line of sight. */
export function clearSeaLine(from: Vector2D, to: Vector2D, obstacles: IslandObstacle[], clearance = 0): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, lengthSquared = dx * dx + dy * dy;
  return obstacles.every(obs => {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((obs.x-from.x)*dx+(obs.y-from.y)*dy)/lengthSquared)) : 0;
    return Math.hypot(from.x + t*dx-obs.x, from.y + t*dy-obs.y) > obs.radius + clearance;
  });
}

/** A shared deterministic breadth-first field. Cached state never affects rules. */
export class NavigationField {
  private readonly cell = 40;
  private readonly columns: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly distance: Int32Array;
  private goal = -1;
  constructor(arena: ArenaBounds, private readonly obstacles: IslandObstacle[]) {
    this.columns = Math.ceil(arena.width / this.cell); this.rows = Math.ceil(arena.height / this.cell);
    this.blocked = new Uint8Array(this.columns*this.rows); this.distance = new Int32Array(this.blocked.length);
    for (let i=0;i<this.blocked.length;i++) {
      const p=this.point(i);
      this.blocked[i] = Number(p.x<arena.margin+25 || p.y<arena.margin+25 || p.x>arena.width-arena.margin-25 ||
        p.y>arena.height-arena.margin-25 || obstacles.some(obs=>Math.hypot(p.x-obs.x,p.y-obs.y)<obs.radius+35));
    }
  }
  private point(index: number): Vector2D { return {x:(index%this.columns+.5)*this.cell,y:(Math.floor(index/this.columns)+.5)*this.cell}; }
  private index(p: Vector2D): number {
    return Math.max(0,Math.min(this.rows-1,Math.floor(p.y/this.cell)))*this.columns+
      Math.max(0,Math.min(this.columns-1,Math.floor(p.x/this.cell)));
  }
  private neighbors(index: number): number[] {
    const x=index%this.columns,y=Math.floor(index/this.columns),result:number[]=[];
    if(x>0)result.push(index-1);if(x<this.columns-1)result.push(index+1);
    if(y>0)result.push(index-this.columns);if(y<this.rows-1)result.push(index+this.columns);
    return result;
  }
  private rebuild(target: Vector2D): void {
    let goal=this.index(target);
    if(this.blocked[goal]) {
      let best=Infinity;
      for(let i=0;i<this.blocked.length;i++)if(!this.blocked[i]) {
        const p=this.point(i),d=(p.x-target.x)**2+(p.y-target.y)**2;
        if(d<best){best=d;goal=i;}
      }
    }
    if(this.goal===goal)return;
    this.goal=goal;this.distance.fill(-1);this.distance[goal]=0;
    const queue=[goal];
    for(let head=0;head<queue.length;head++)for(const next of this.neighbors(queue[head]!)) {
      if(this.blocked[next] || this.distance[next]!==-1)continue;
      this.distance[next]=this.distance[queue[head]!]!+1;queue.push(next);
    }
  }
  public waypoint(from: Vector2D, target: Vector2D): Vector2D {
    if(clearSeaLine(from,target,this.obstacles,32))return target;
    this.rebuild(target);
    const origin=this.index(from);
    let current=origin;
    // A ship near a shoreline can be in a blocked cell. Pick a reachable neighbour.
    const starts=[origin,...this.neighbors(origin)].filter(i=>this.distance[i]!>=0);
    if(!starts.length)return target;
    current=starts.reduce((best,i)=>this.distance[i]!<this.distance[best]! ? i : best);
    let result=this.point(current);
    for(let i=0;i<5;i++) {
      const next=this.neighbors(current).find(n=>this.distance[n]!>=0&&this.distance[n]!<this.distance[current]!);
      if(next===undefined)break;
      const point=this.point(next);
      if(!clearSeaLine(from,point,this.obstacles,31))break;
      result=point;current=next;
    }
    return result;
  }
}
