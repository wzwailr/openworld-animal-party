import type { WorldInteraction } from '../world/interactions';

/** No autoplay: sound is created only in the user's E/click event. */
export function createInteractionHud(root:HTMLElement) {
  const panel=document.createElement('div');panel.className='interaction-hud';panel.hidden=true;
  const prompt=document.createElement('span'),message=document.createElement('div');
  message.className='interaction-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  panel.append(prompt);root.append(panel,message);
  let timeout:number|undefined,context:AudioContext|undefined;
  return {
    focus(target:WorldInteraction|null){panel.hidden=!target;prompt.textContent=target?`E / 点击 · ${target.label}`:'';},
    result(text:string){message.textContent=text;window.clearTimeout(timeout);timeout=window.setTimeout(()=>{message.textContent='';},3200);},
    chime(){
      try{
        context??=new AudioContext();const audio=context;
        void audio.resume().then(()=>{
          for(const [i,frequency] of [523.25,659.25,783.99].entries()){
            const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+i*.12;
            oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);
            gain.gain.linearRampToValueAtTime(.025,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+1.1);
            oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(start);oscillator.stop(start+1.2);
            oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
          }
        }).catch(()=>{});
      }catch{/* Audio unavailable: keep the complete visual interaction. */}
    },
    dispose(){window.clearTimeout(timeout);panel.remove();message.remove();if(context)void context.close().catch(()=>{});}
  };
}
