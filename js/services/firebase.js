import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAn3yLvgZzsnthCv9GLAlOOcJA5QDyDo6M",
  authDomain: "ocuread-37a9d.firebaseapp.com",
  projectId: "ocuread-37a9d",
  storageBucket: "ocuread-37a9d.firebasestorage.app",
  messagingSenderId: "347184547312",
  appId: "1:347184547312:web:edcdb4e90a100b146cc935"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export class CloudDB {
  static async saveSession(sessionData) {
    try {
      const docRef = await addDoc(collection(db, "sessions"), {
        ...sessionData,
        createdAt: serverTimestamp() 
      });
      console.log("Dati salvati in Cloud con successo! ID Documento:", docRef.id);
      return true;
    } catch (e) {
      console.error("Errore durante il salvataggio in Firebase:", e);
      return false;
    }
  }

  static async getTexts() {
    try {
      const snap = await getDocs(collection(db, "texts"));
      return snap.docs.map(doc => doc.data());
    } catch (e) {
      console.error("Errore caricamento testi da Firebase:", e);
      return [];
    }
  }

  static async saveText(item) {
    try {
      await setDoc(doc(db, "texts", item.id), item);
      return true;
    } catch (e) {
      console.error("Errore salvataggio testo:", e);
      return false;
    }
  }

  static async deleteText(id) {
    try {
      await deleteDoc(doc(db, "texts", id));
      return true;
    } catch (e) {
      console.error("Errore eliminazione testo:", e);
      return false;
    }
  }
}