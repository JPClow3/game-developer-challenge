export interface HelmSettings { swapped: boolean; toggleFire: boolean; muted: boolean; volume: number; }
const SETTINGS_KEY='pirate_battle_helm_v1';
let unsavedSettings: HelmSettings | undefined;
export function loadHelmSettings(): HelmSettings {
  if (unsavedSettings) return {...unsavedSettings};
  const defaults={swapped:false,toggleFire:false,muted:false,volume:.8};
  try {
    const value=JSON.parse(localStorage.getItem(SETTINGS_KEY)??'null');
    return value ? {swapped:value.swapped===true,toggleFire:value.toggleFire===true,muted:value.muted===true,
      volume:typeof value.volume==='number' && Number.isFinite(value.volume) ? Math.max(0,Math.min(1,value.volume)) : .8} : defaults;
  } catch {return defaults;}
}
export function saveHelmSettings(settings:HelmSettings): void {
  try {localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));unsavedSettings=undefined;}
  catch {unsavedSettings={...settings};}
}
