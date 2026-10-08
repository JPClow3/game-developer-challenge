import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captainTitle, loadCaptainLog, recordPersonalBattle, voyageKey } from '../../../src/game/CaptainLog';
import { battleReport, isBattleReport } from '../../../src/core/simulation/BattleReport';

const config={sessionDurationSeconds:120,enemySpawnIntervalSeconds:3,voyage:{difficulty:'open',map:'archipelago'}} as const;
const report=battleReport({shotsFired:20,hits:10,chasersSunk:3,shootersSunk:2,damageTaken:0,repairsCollected:1,healthRestored:20},5,100,100,true);
describe('captain progress',()=>{
  beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
  afterEach(()=>vi.unstubAllGlobals());
  it('persists bests by all rules and counts replayed results once',()=>{
    const match={id:'one',score:5,endReason:'time_expired',config,report};
    recordPersonalBattle(match);recordPersonalBattle(match);
    const log=loadCaptainLog();expect(log.ids).toEqual(['one']);expect(log.medals).toHaveLength(3);
    expect(captainTitle(log)).toBe('Admiral');expect(log.bests[voyageKey(config)]?.score).toBe(5);
    expect(log.bests[voyageKey({...config,voyage:{difficulty:'storm',map:'archipelago'}})]).toBeUndefined();
    recordPersonalBattle({...match,id:'two',score:1});expect(loadCaptainLog().bests[voyageKey(config)]?.score).toBe(5);
  });
  it('rejects incomplete combat reports from storage',()=>{
    expect(isBattleReport(report)).toBe(true);expect(isBattleReport({...report,stats:[]})).toBe(false);expect(isBattleReport({...report,accuracy:101})).toBe(false);
  });
  it('recovers from damaged storage',()=>{
    localStorage.setItem('pirate_battle_captain_log_v1','{');expect(loadCaptainLog().ids).toEqual([]);
    localStorage.setItem('pirate_battle_captain_log_v1',JSON.stringify({ids:[],medals:['invented'],bests:{bad:{score:-1,grade:'A'}}}));
    expect(loadCaptainLog()).toEqual({ids:[],medals:[],bests:{}});
  });
});
