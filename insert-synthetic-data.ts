import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const tenantId = 't-superadmin';

const customers = [
  { name: 'João Silva', phone: '5511999999991', email: 'joao@example.com' },
  { name: 'Maria Oliveira', phone: '5511999999992', email: 'maria@example.com' },
  { name: 'Carlos Santos', phone: '5511999999993', email: 'carlos@example.com' },
];

const vehicles = [
  { make: 'Volkswagen', model: 'Gol', year: '2018', plate: 'ABC1234' },
  { make: 'Fiat', model: 'Uno', year: '2015', plate: 'XYZ9876' },
  { make: 'Chevrolet', model: 'Onix', year: '2020', plate: 'DEF5678' },
];

const services = [
  { name: 'Troca de Óleo', category: 'Manutenção', defaultPrice: 150, recallMonths: 6 },
  { name: 'Alinhamento e Balanceamento', category: 'Suspensão', defaultPrice: 120, recallMonths: 12 },
  { name: 'Revisão Geral', category: 'Revisão', defaultPrice: 300, recallMonths: 12 },
  { name: 'Troca de Pastilhas de Freio', category: 'Freios', defaultPrice: 200, recallMonths: 12 },
];

const parts = [
  { sku: 'OLEO-5W30', name: 'Óleo Sintético 5W30', unit: 'L', cost: 25, price: 45, stockQty: 50, minQty: 10 },
  { sku: 'FILTRO-OLEO', name: 'Filtro de Óleo', unit: 'UN', cost: 10, price: 25, stockQty: 30, minQty: 5 },
  { sku: 'PASTILHA-DIANT', name: 'Pastilha de Freio Dianteira', unit: 'JG', cost: 60, price: 120, stockQty: 15, minQty: 3 },
  { sku: 'FILTRO-AR', name: 'Filtro de Ar', unit: 'UN', cost: 15, price: 35, stockQty: 20, minQty: 5 },
];

async function insertData() {
  try {
    console.log('Inserindo dados sintéticos...');

    // Insert Services
    for (const service of services) {
      await addDoc(collection(db, `tenants/${tenantId}/services`), {
        ...service,
        createdAt: serverTimestamp(),
      });
    }
    console.log('Serviços inseridos.');

    // Insert Parts
    for (const part of parts) {
      await addDoc(collection(db, `tenants/${tenantId}/parts`), {
        ...part,
        createdAt: serverTimestamp(),
      });
    }
    console.log('Peças inseridas.');

    // Insert Customers and Vehicles
    for (let i = 0; i < customers.length; i++) {
      const customerRef = await addDoc(collection(db, `tenants/${tenantId}/customers`), {
        ...customers[i],
        createdAt: serverTimestamp(),
      });
      console.log(`Cliente ${customers[i].name} inserido.`);

      await addDoc(collection(db, `tenants/${tenantId}/vehicles`), {
        customerId: customerRef.id,
        ...vehicles[i],
        createdAt: serverTimestamp(),
      });
      console.log(`Veículo ${vehicles[i].model} inserido para ${customers[i].name}.`);
    }

    console.log('Dados sintéticos inseridos com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('Erro ao inserir dados:', error);
    process.exit(1);
  }
}

insertData();
