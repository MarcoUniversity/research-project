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
        name: 'Sample passage', 
        timed: true, 
        durationSec: 120, 
        fontSize: 21,
        text: "Reading is a complex cognitive process that simultaneously engages attention, working memory, and oculomotor systems. When a reader faces a text under time pressure, eye movements change in measurable ways: fixations become shorter, saccades become wider and more irregular, and blink frequency deviates from baseline rest values.\n\nThis sample text is meant to verify that the platform works correctly. Replace it with the experimental material you intend to administer to your participants." 
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