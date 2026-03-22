import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { db } from './firebase.js';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc, orderBy, limit } from 'firebase/firestore';

const generateQuoteFunctionDeclaration: FunctionDeclaration = {
  name: "generateQuote",
  parameters: {
    type: Type.OBJECT,
    description: "Gera um orçamento automático para o cliente com base nos serviços e peças solicitados.",
    properties: {
      customer_name: {
        type: Type.STRING,
        description: "Nome do cliente. OBRIGATÓRIO perguntar ao cliente antes de gerar o orçamento.",
      },
      services: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Lista de serviços solicitados (ex: 'Troca de Óleo', 'Alinhamento')",
      },
      parts: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Lista de peças solicitadas (ex: 'Filtro de Óleo', 'Pastilha de Freio')",
      },
      vehicle_make: {
        type: Type.STRING,
        description: "Marca do veículo do cliente (ex: 'Volkswagen', 'Fiat')",
      },
      vehicle_model: {
        type: Type.STRING,
        description: "Modelo do veículo do cliente (ex: 'Gol', 'Uno')",
      }
    },
    required: ["services", "customer_name"],
  },
};

const acceptQuoteFunctionDeclaration: FunctionDeclaration = {
  name: 'acceptQuote',
  description: 'Registra que o cliente aceitou o orçamento enviado.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      quoteId: { type: Type.STRING, description: 'O ID do orçamento que foi aceito.' }
    },
    required: ['quoteId']
  }
};

export async function handleAIResponse(
  tenantId: string,
  tenantData: any,
  convId: string,
  convData: any,
  phone: string,
  instanceId: string,
  waNumberData: any,
  messagesRef: any
) {
  const aiSettings = tenantData.aiSettings;
  if (!aiSettings || !aiSettings.enabled) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not found');
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Fetch catalog
    const servicesSnap = await getDocs(collection(db, `tenants/${tenantId}/services`));
    const partsSnap = await getDocs(collection(db, `tenants/${tenantId}/parts`));
    const catalog = {
      services: servicesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      parts: partsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    };

    // Fetch pending quotes for this customer
    let pendingQuoteInfo = "";
    let pendingQuoteId: string | null = null;
    if (convData.customer_id) {
      const quotesQuery = query(
        collection(db, `tenants/${tenantId}/quotes`),
        where('customerId', '==', convData.customer_id),
        where('status', '==', 'pendente')
      );
      const quotesSnap = await getDocs(quotesQuery);
      if (!quotesSnap.empty) {
        const q = quotesSnap.docs[0];
        pendingQuoteId = q.id;
        pendingQuoteInfo = `\nOrçamento pendente atual: ID ${q.id}, Valor R$ ${q.data().totalAmount?.toFixed(2)}`;
      }
    }

    // Fetch recent messages
    const msgsQuery = query(messagesRef, orderBy('timestamp', 'desc'), limit(10));
    const msgsSnap = await getDocs(msgsQuery);
    const recentMsgs = msgsSnap.docs.map(d => d.data()).reverse();

    // Build prompt
    let prompt = `Você é um assistente virtual de uma oficina mecânica chamada ${tenantData.name}. 
Responda de forma educada, prestativa e proativa. 
Seu objetivo é ajudar o cliente, tirar dúvidas e, se possível, encaminhar para um orçamento.

Informações da Oficina:
- Nome: ${tenantData.name}
- Serviços Disponíveis: ${catalog.services.map((s: any) => s.name).join(', ')}
- Peças em Estoque: ${catalog.parts.map((p: any) => p.name).join(', ')}${pendingQuoteInfo}

Diretrizes de Comportamento:
${aiSettings.behavior || '1. Seja amigável e use emojis ocasionalmente para parecer humano.\n2. Se o cliente perguntar sobre um serviço que temos, confirme e ofereça um orçamento.\n3. Mantenha as respostas concisas, mas completas.'}

Regras do Sistema para Orçamentos:
1. Quando o cliente demonstrar interesse em um serviço ou peça, VOCÊ DEVE perguntar: "Gostaria que eu gerasse um orçamento?"
2. Se o cliente disser SIM, VOCÊ DEVE perguntar o nome dele (ex: "Qual o seu nome para eu colocar no orçamento?").
3. SOMENTE APÓS o cliente informar o nome, você deve usar a ferramenta generateQuote.
4. NUNCA use a ferramenta generateQuote sem antes ter a confirmação do cliente e o nome dele.
5. Se o cliente aprovar um orçamento existente, use a ferramenta acceptQuote.

Histórico da conversa:
`;

    recentMsgs.forEach((msg: any) => {
      prompt += `${msg.direction === 'inbound' ? 'Cliente' : 'Oficina'}: ${msg.content}\n`;
    });
    prompt += "\nOficina:";

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-preview',
      contents: prompt,
      config: {
        tools: [{ functionDeclarations: [generateQuoteFunctionDeclaration, acceptQuoteFunctionDeclaration] }],
        systemInstruction: "Você é o assistente virtual da Oficina. Siga estritamente o fluxo de orçamento: 1) Ofereça o orçamento. 2) Se aceito, peça o nome. 3) Só então use generateQuote. Se o cliente aprovar um orçamento pendente, use acceptQuote."
      }
    });

    let replyText = "";
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === 'generateQuote') {
        const args = call.args as any;
        try {
          const quoteData = await generateAutoQuote(tenantId, convData, args, catalog, waNumberData, aiSettings, apiKey);
          replyText = `Acabei de gerar um orçamento para você! O valor total estimado é de R$ ${quoteData.totalAmount.toFixed(2)}. Já enviei para o mecânico aprovar e te retorno em breve!`;
        } catch (err) {
          console.error('Error generating quote', err);
          replyText = "Tentei gerar o orçamento, mas ocorreu um erro no sistema. Um de nossos atendentes falará com você em breve.";
        }
      } else if (call.name === 'acceptQuote') {
        try {
          if (pendingQuoteId) {
            await updateDoc(doc(db, `tenants/${tenantId}/quotes`, pendingQuoteId), { 
              status: 'aceito_cliente_ai',
              server_token: 'ignishard18458416'
            });
            
            // Notify user
            const notifRef = collection(db, `tenants/${tenantId}/notifications`);
            await addDoc(notifRef, {
              type: 'quote_confirmation',
              title: 'Orçamento Aceito pelo Cliente',
              message: `O cliente ${convData.customer_name || convData.customer_phone} aceitou o orçamento. Confirme para registrar no sistema.`,
              quoteId: pendingQuoteId,
              convId: convId,
              read: false,
              createdAt: serverTimestamp(),
              server_token: 'ignishard18458416'
            });
            
            replyText = "Que ótimo! Já registrei a sua aprovação. O mecânico vai confirmar e entraremos em contato para agendar o serviço.";
          } else {
            replyText = "Não encontrei um orçamento pendente para aprovar.";
          }
        } catch (err) {
          console.error('Error accepting quote', err);
          replyText = "Ocorreu um erro ao registrar a aprovação.";
        }
      }
    } else {
      replyText = response.text || "Desculpe, não consegui entender. Pode repetir?";
    }

    if (replyText) {
      // Send back via Z-API
      const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${waNumberData.token}/send-text`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (waNumberData.clientToken) headers['Client-Token'] = waNumberData.clientToken;

      const res = await fetch(zapiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone, message: replyText })
      });

      if (res.ok) {
        // Save AI response to Firestore
        await addDoc(messagesRef, {
          tenantId,
          wa_message_id: `ai_${Date.now()}`,
          direction: 'outbound',
          type: 'text',
          content: replyText,
          status: 'sent',
          timestamp: serverTimestamp(),
          isAiGenerated: true,
          server_token: 'ignishard18458416'
        });
        console.log(`AI response sent and saved for conv ${convId}`);
      }
    }

  } catch (aiError) {
    console.error('Error generating AI response:', aiError);
  }
}

async function generateAutoQuote(tenantId: string, conv: any, args: any, catalog: { services: any[], parts: any[] }, waNumberData: any, aiSettings: any, apiKey: string) {
  let totalAmount = 0;
  const items: any[] = [];

  if (args.services) {
    args.services.forEach((serviceName: string) => {
      const service = catalog.services.find(s => s.name.toLowerCase().includes(serviceName.toLowerCase()));
      if (service) {
        items.push({ type: 'service', refId: service.id, name: service.name, qty: 1, unitPrice: service.price });
        totalAmount += service.price;
      } else {
        items.push({ type: 'service', refId: null, name: serviceName, qty: 1, unitPrice: 0 });
      }
    });
  }

  if (args.parts) {
    args.parts.forEach((partName: string) => {
      const part = catalog.parts.find(p => p.name.toLowerCase().includes(partName.toLowerCase()));
      if (part) {
        items.push({ type: 'part', refId: part.id, name: part.name, qty: 1, unitPrice: part.price });
        totalAmount += part.price;
      } else {
        items.push({ type: 'part', refId: null, name: partName, qty: 1, unitPrice: 0 });
      }
    });
  }

  // Find or create customer
  let customerId = null;
  const customersRef = collection(db, `tenants/${tenantId}/customers`);
  const qCustomer = query(customersRef, where('phone', '==', conv.customer_phone));
  const customerSnapshot = await getDocs(qCustomer);
  
  if (!customerSnapshot.empty) {
    customerId = customerSnapshot.docs[0].id;
    if (args.customer_name && customerSnapshot.docs[0].data().name === 'Cliente WhatsApp') {
      await updateDoc(doc(db, `tenants/${tenantId}/customers`, customerId), {
        name: args.customer_name,
        server_token: 'ignishard18458416'
      });
    }
  } else {
    const newCustomerRef = await addDoc(customersRef, {
      name: args.customer_name || conv.customer_name || 'Cliente WhatsApp',
      phone: conv.customer_phone,
      createdAt: serverTimestamp(),
      server_token: 'ignishard18458416'
    });
    customerId = newCustomerRef.id;
  }

  // Find or create vehicle if make/model provided
  let vehicleId = null;
  if (args.vehicle_make && args.vehicle_model) {
    const vehiclesRef = collection(db, `tenants/${tenantId}/vehicles`);
    const qVehicle = query(vehiclesRef, where('customerId', '==', customerId), where('make', '==', args.vehicle_make), where('model', '==', args.vehicle_model));
    const vehicleSnapshot = await getDocs(qVehicle);
    
    if (!vehicleSnapshot.empty) {
      vehicleId = vehicleSnapshot.docs[0].id;
    } else {
      const newVehicleRef = await addDoc(vehiclesRef, {
        customerId,
        make: args.vehicle_make,
        model: args.vehicle_model,
        year: '',
        plate: '',
        createdAt: serverTimestamp(),
        server_token: 'ignishard18458416'
      });
      vehicleId = newVehicleRef.id;
    }
  }

  // Create quote
  const quotesRef = collection(db, `tenants/${tenantId}/quotes`);
  const newQuoteRef = await addDoc(quotesRef, {
    customerId,
    vehicleId,
    items,
    totalAmount,
    status: 'draft_ai',
    createdAt: serverTimestamp(),
    server_token: 'ignishard18458416'
  });

  // Generate formatted text using AI if template exists
  let formattedText = `Olá! Segue o seu orçamento: R$ ${totalAmount.toFixed(2)}. Responda "Aprovo" ou "Aceito" para confirmar.`;
  
  if (aiSettings?.template && apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `Preencha o seguinte template de orçamento com os dados fornecidos.
      
Template:
${aiSettings.template}

Dados:
- Nome do Cliente: ${args.customer_name || conv.customer_name || 'Cliente'}
- Veículo: ${args.vehicle_make || ''} ${args.vehicle_model || ''}
- Serviços: ${items.filter(i => i.type === 'service').map(i => i.name).join(', ')}
- Peças: ${items.filter(i => i.type === 'part').map(i => i.name).join(', ')}
- Total: R$ ${totalAmount.toFixed(2)}
- Data: ${new Date().toLocaleDateString('pt-BR')}

Retorne APENAS o texto preenchido, sem formatação markdown de bloco de código, pronto para ser enviado no WhatsApp.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-preview',
        contents: prompt,
      });
      
      if (response.text) {
        formattedText = response.text.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
      }
    } catch (err) {
      console.error('Error formatting quote with AI', err);
    }
  }

  // Notify user
  const notifRef = collection(db, `tenants/${tenantId}/notifications`);
  await addDoc(notifRef, {
    type: 'quote_approval',
    title: 'Novo Orçamento da IA',
    message: `A IA gerou um orçamento de R$ ${totalAmount.toFixed(2)} para ${args.customer_name || conv.customer_name || 'Cliente WhatsApp'}.`,
    quoteId: newQuoteRef.id,
    convId: conv.id,
    customerPhone: conv.customer_phone,
    totalAmount,
    formattedText,
    instanceId: waNumberData?.instanceId,
    token: waNumberData?.token,
    clientToken: waNumberData?.clientToken,
    read: false,
    createdAt: serverTimestamp(),
    server_token: 'ignishard18458416'
  });

  return { totalAmount };
}
