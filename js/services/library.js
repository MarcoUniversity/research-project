export class Library {
  constructor(key){ this.key=key; this.items=[]; }
  load(){
    try{ const raw=localStorage.getItem(this.key); this.items = raw? JSON.parse(raw):[]; }
    catch(e){ this.items=[]; }
    if(!this.items.length){
      this.items=[{ id:'seed1', name:'Brano di prova', timed:true, durationSec:120, fontSize:21,
        text:"La lettura è un processo cognitivo complesso che impegna simultaneamente l'attenzione, la memoria di lavoro e i sistemi oculomotori. Quando un lettore affronta un testo sotto pressione temporale, i suoi movimenti oculari cambiano in modo misurabile: le fissazioni si accorciano, le saccadi diventano più ampie e irregolari, e la frequenza dei battiti di ciglia si discosta dal proprio valore di riposo.\n\nQuesto testo di prova serve a verificare il funzionamento della piattaforma. Sostituiscilo con il materiale sperimentale che intendi somministrare ai tuoi partecipanti." }];
      this.save();
    }
    return this.items;
  }
  save(){ try{ localStorage.setItem(this.key, JSON.stringify(this.items)); }catch(e){} }
  find(id){ return this.items.find(x=>x.id===id); }
  upsert(item){
    const i=this.items.findIndex(x=>x.id===item.id);
    if(i>=0) this.items[i]=item; else this.items.push(item);
    this.save();
  }
  remove(id){ this.items=this.items.filter(x=>x.id!==id); this.save(); }
}