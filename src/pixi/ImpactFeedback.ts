/** Presentation clock only. No writes to simulation state or its accumulator. */
export class ImpactFeedback {
  public freezeSeconds = 0;
  public recoilX = 0;
  public recoilY = 0;
  public shakeStrength = 0;
  private phase = 0;
  constructor(public reducedMotion = false) {}
  broadside(side: number, rotation: number): void {
    if (this.reducedMotion) return;
    this.shakeStrength = Math.max(this.shakeStrength, 2.5);
    this.recoilX -= Math.cos(rotation)*side*6;
    this.recoilY -= Math.sin(rotation)*side*6;
  }
  hit(): void { if (!this.reducedMotion) this.shakeStrength = 7; }
  sink(): void { if (!this.reducedMotion) this.freezeSeconds = 3/60; }
  advance(dt: number): boolean {
    const frozen=this.freezeSeconds>0;
    this.freezeSeconds=Math.max(0,this.freezeSeconds-dt);
    this.phase+=dt;
    this.shakeStrength*=Math.exp(-dt*16);
    this.recoilX*=Math.exp(-dt*12);this.recoilY*=Math.exp(-dt*12);
    return frozen;
  }
  get shake(): {x:number;y:number} {
    return {x:Math.sin(this.phase*143)*this.shakeStrength,y:Math.cos(this.phase*109)*this.shakeStrength};
  }
}
