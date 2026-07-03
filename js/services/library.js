import { CloudDB } from './firebase.js';

export class Library {
  constructor(key) { 
    this.items = []; 
  }

  async load() {
    this.items = await CloudDB.getTexts();
    
    if (!this.items.length) {
      const seed = { 
        id: 'seed1', 
        name: 'Brano di prova', 
        timed: true, 
        durationSec: 120, 
        fontSize: 21,
        text: "La lettura è un processo cognitivo complesso che impegna simultaneamente l'attenzione, la memoria di lavoro e i sistemi oculomotori. Quando un lettore affronta un testo sotto pressione temporale, i suoi movimenti oculari cambiano in modo misurabile: le fissazioni si accorciano, le saccadi diventano più ampie e irregolari, e la frequenza dei battiti di ciglia si discosta dal proprio valore di riposo.\n\nQuesto testo di prova serve a verificare il funzionamento della piattaforma. Sostituiscilo con il materiale sperimentale che intendi somministrare ai tuoi partecipanti." 
      };
      this.items = [seed];
      await CloudDB.saveText(seed);
    }
    return this.items;
  }

  find(id) { 
    return this.items.find(x => x.id === id); 
  }

  async upsert(item) {
    const i = this.items.findIndex(x => x.id === item.id);
    if (i >= 0) this.items[i] = item; 
    else this.items.push(item);
    
    await CloudDB.saveText(item);
  }

  async remove(id) { 
    this.items = this.items.filter(x => x.id !== id); 
    
    await CloudDB.deleteText(id); 
  }
}