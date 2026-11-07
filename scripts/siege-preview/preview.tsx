/** Review production screens, pose swaps, articulated attacks, endings and phone building. */
import { render } from "preact";
import { useState } from "preact/hooks";
import type { HostSiegeState, HostView, PlayerSiegeView, SiegePhase, HostSiegeDefender, HostSiegeMonster } from "../../src/shared/protocol.ts";
import type { SiegeTheme } from "../../src/shared/siege-theme.ts";
import { SiegeStage, SiegeLobbyPreview } from "../../src/client/host/siege.tsx";
import { SiegePlayer } from "../../src/client/player/siege.tsx";
import { setPhoneArt } from "../../src/client/shared/phone-art.ts";

function Preview({ phone, fixture }: { phone: boolean; fixture: { host: HostSiegeState; phone: PlayerSiegeView } }) {
  const [theme,setTheme] = useState<SiegeTheme>(new URLSearchParams(location.search).get("theme") === "classic" ? "classic" : "christmas");
  const [scene,setScene] = useState("wave");
  const [seq,setSeq] = useState(0);
  const [built,setBuilt] = useState<HostSiegeDefender[]>([]);
  const defenders: HostSiegeDefender[] = Array.from({length:5},(_,lane)=>[
    {id:lane*3,type:"archer" as const,lane,square:1,level:1+lane%3,health:4,maxHealth:4,hitSeq:0,attackSeq:seq},
    {id:lane*3+1,type:"knight" as const,lane,square:3,level:1+lane%3,health:12,maxHealth:12,hitSeq:0,attackSeq:seq},
    {id:lane*3+2,type:"wall" as const,lane,square:4,level:1+lane%3,health:lane%2 ? 3:10,maxHealth:10,hitSeq:0,attackSeq:0},
  ]).flat().concat(built);
  const monsters: HostSiegeMonster[] = (["goblin","wolf","troll","goblin","giant"] as const).map((type,lane)=>({
    id:lane+100,type,lane,x:5.5,toX:5.5,moveMs:0,state:seq%2 ? "attack":"walk",health:10,maxHealth:10,hitSeq:0,attackSeq:seq,
  }));
  const phase: SiegePhase = scene === "lobby" || scene === "damaged" ? "wave" : scene as SiegePhase;
  const ended = ["stands","fallen","podium"].includes(scene);
  const result = ended ? {outcome:scene === "fallen" ? "fallen" as const : "stands" as const,wave:5,waves:5 as const,wavesSurvived:5,hearts:scene === "fallen" ? 0:8,headline:scene === "fallen" ? "The castle fell on wave 5 of 5." : "The kingdom stands with 8 of 10 hearts!",avgScale:null,record:null,newRecord:false} : null;
  const host: Extract<HostView,{kind:"siege"}> = {
    ...fixture.host,phase,settings:{waves:5,theme},wave:5,hearts:scene === "fallen" ? 0:scene === "damaged" ? 4:8,
    defenders,monsters,monsterCount:monsters.length,phaseRemainingMs:60000,phaseDurationMs:60000,result,
    shots:seq ? [{seq,lane:1,square:1,toX:5.5}] : [],
    join:{url:"http://localhost:8095/phone",qrSvg:"",address:"localhost",addresses:[],port:8095},
  };
  const player: PlayerSiegeView = {...fixture.phone,theme,phase:ended ? phase:"wave",wave:5,hearts:host.hearts,gold:500,map:{defenders,monsters:monsters.map(m=>({lane:m.lane,square:6}))},result:result ? {...result,goldEarned:500,goldSpent:200,placed:{archer:5,knight:5,wall:5},upgrades:3,defeated:12,awards:[]} : null};
  return <div style={{height:"100dvh",display:"flex",flexDirection:"column"}}>
    <nav style={{display:"flex",gap:8,flexWrap:"wrap",padding:6,background:"#173b30",zIndex:100,fontSize:12}}>
      <select aria-label="Theme" value={theme} onChange={e=>setTheme(e.currentTarget.value as SiegeTheme)}><option value="christmas">Christmas Toybox</option><option value="classic">Classic</option></select>
      <select aria-label="Scene" value={scene} onChange={e=>setScene(e.currentTarget.value)}>{["lobby","countdown","build","wave","damaged","stands","fallen","podium"].map(s=><option key={s}>{s}</option>)}</select>
      <button onClick={()=>setSeq(seq+1)}>Attack</button>
      <a href={phone ? "/":"/phone"}>{phone ? "Projector":"Phone"}</a>
    </nav>
    <div style={{flex:1,minHeight:0,position:"relative",display:"flex",flexDirection:"column"}}>
      {phone ? <SiegePlayer view={player} send={m=>{
        if(m.type === "siege.place") setBuilt([...built,{id:1000+built.length,type:m.defender,lane:m.lane,square:m.square,level:1,health:10,maxHealth:10,hitSeq:0,attackSeq:0}]);
      }} /> : scene === "lobby" ? <SiegeLobbyPreview theme={theme} /> : <SiegeStage view={host} send={()=>{}} />}
    </div>
  </div>;
}
export async function mount(phone: boolean) {
  if(phone) setPhoneArt();
  const fixture = await fetch("/fixture").then(r=>r.json());
  render(<Preview phone={phone} fixture={fixture} />,document.getElementById("app")!);
}
