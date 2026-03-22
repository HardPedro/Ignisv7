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
  { name: 'Troca de Óleo', description: 'Troca de óleo do motor e filtro', price: 150, duration: 60 },
  { name: 'Alinhamento e Balanceamento', description: 'Alinhamento 3D e balanceamento das 4 rodas', price: 120, duration: 90 },
  { name: 'Revisão Geral', description: 'Revisão de 40 itens', price: 300, duration: 180 },
  { name: 'Troca de Pastilhas de Freio', description: 'Substituição das pastilhas dianteiras', price: 200, duration: 120 },
];

const parts = [
  { name: 'Óleo Sintético 5W30', description: 'Óleo para motor', price: 45, stock: 50, minStock: 10 },
  { name: 'Filtro de Óleo', description: 'Filtro de óleo padrão', price: 25, stock: 30, minStock: 5 },
  { name: 'Pastilha de Freio Dianteira', description: 'Jogo de pastilhas', price: 120, stock: 15, minStock: 3 },
  { name: 'Filtro de Ar', description: 'Filtro de ar do motor', price: 35, stock: 20, minStock: 5 },
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
