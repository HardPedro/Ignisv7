import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
  try {
    const numbers = await getDocs(collection(db, 'whatsapp_numbers'));
    console.log(`Found ${numbers.docs.length} numbers.`);
    for (const doc of numbers.docs) {
      console.log(`Number: ${doc.id}`, doc.data());
    }
  } catch (e) {
    console.error(e);
  }
}

check();
