import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

initializeApp({
  credential: applicationDefault(),
  projectId: firebaseConfig.projectId
});

const db = getFirestore();
if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
  db.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
}

async function check() {
  try {
    const numbers = await db.collection('whatsapp_numbers').get();
    console.log(`Found ${numbers.docs.length} numbers.`);
    for (const doc of numbers.docs) {
      console.log(`Number: ${doc.id}`, doc.data());
    }
  } catch (e) {
    console.error(e);
  }
}

check();
