import express from 'express';
import { db } from './server/firebase.js';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import path from 'path';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import { handleAIResponse } from './server/aiService.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Email Transporter (Ethereal for testing)
  let transporter: nodemailer.Transporter;
  nodemailer.createTestAccount().then(account => {
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass }
    });
    console.log("Ethereal Email account created for testing.");
  });

  // API Routes
  app.post("/api/send-invite", async (req, res) => {
    const { email, tenantName, role } = req.body;
    try {
      if (transporter) {
        const info = await transporter.sendMail({
          from: '"Sistema de Gestão" <noreply@sistema.com>',
          to: email,
          subject: `Convite para participar do estabelecimento ${tenantName}`,
          text: `Você foi convidado para participar do estabelecimento ${tenantName} como ${role}. Acesse o sistema para aceitar o convite.`,
          html: `<p>Você foi convidado para participar do estabelecimento <b>${tenantName}</b> como <b>${role}</b>.</p><p>Acesse o sistema com sua conta Google para aceitar o convite.</p>`
        });
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Z-API Webhook for incoming messages
  app.post('/webhooks/zapi', async (req, res) => {
    try {
      const data = req.body;
      console.log('Z-API Webhook received event type:', data.type || 'unknown');
      
      // Z-API payload structure
      const instanceId = data.instanceId;
      
      if (!instanceId) {
        console.log('Webhook error: Missing instanceId');
        return res.status(400).send('Missing instanceId');
      }

      // 1. Ignore status updates (delivery, read receipts) if they come to this webhook
      if (data.status && !data.messageId && !data.id) {
        console.log('Ignoring status update event');
        return res.status(200).send('OK');
      }

      // 2. Ignore events that are not messages (like connection status, presence, etc)
      if (!data.phone || (!data.messageId && !data.id)) {
        console.log('Ignoring non-message event from Z-API');
        return res.status(200).send('OK'); // Always return 200 so Z-API doesn't retry
      }

      // 3. Ignore group messages (usually we only want 1-on-1 customer service)
      if (data.isGroup || data.phone.includes('-')) {
        console.log('Ignoring group message');
        return res.status(200).send('OK');
      }

      const phone = data.phone;
      const messageId = data.messageId || data.id;
      const fromMe = data.fromMe || false;
      const type = data.type?.toLowerCase() || 'other';
      
      // Extract text robustly based on message type
      let text = '';
      let mediaUrl = '';
      let fileName = '';
      
      if (type === 'audio') {
        text = '🎵 Áudio recebido';
        mediaUrl = data.audio?.audioUrl || '';
      } else if (type === 'image') {
        text = data.image?.caption || '📷 Imagem recebida';
        mediaUrl = data.image?.imageUrl || '';
      } else if (type === 'document') {
        text = data.document?.caption || '📄 Documento recebido';
        mediaUrl = data.document?.documentUrl || '';
        fileName = data.document?.fileName || '';
      } else if (type === 'video') {
        text = data.video?.caption || '🎥 Vídeo recebido';
        mediaUrl = data.video?.videoUrl || '';
      } else if (type === 'sticker') {
        text = '🎫 Figurinha recebida';
        mediaUrl = data.sticker?.stickerUrl || '';
      } else if (type === 'location') {
        text = '📍 Localização recebida';
      } else if (type === 'contacts') {
        text = '👤 Contato recebido';
      } else if (data.text && data.text.message) {
        text = data.text.message;
      } else if (typeof data.message === 'string') {
        text = data.message;
      } else {
        text = `[Mensagem do tipo: ${type}]`;
      }
      
      // Find the whatsapp_number by instanceId
      const numbersRef = collection(db, 'whatsapp_numbers');
      const qNumber = query(numbersRef, where('instanceId', '==', instanceId));
      const numberSnap = await getDocs(qNumber);
      
      if (numberSnap.empty) {
        console.log(`Webhook error: Instance ${instanceId} not found in database`);
        return res.status(404).send('Instance not found');
      }
      
      const waNumber = numberSnap.docs[0];
      const tenantId = waNumber.data().tenantId;
      
      // Find or create conversation
      const convsRef = collection(db, 'whatsapp_conversations');
      const qConv = query(convsRef, 
        where('whatsapp_number_id', '==', waNumber.id),
        where('customer_phone', '==', phone)
      );
      const convSnap = await getDocs(qConv);
      
      let convId;
      let convData;
      if (convSnap.empty) {
        convData = {
          tenantId,
          whatsapp_number_id: waNumber.id,
          customer_phone: phone,
          customer_name: data.senderName || data.chatName || phone,
          bot_active: true,
          status: 'open'
        };
        const newConv = await addDoc(convsRef, {
          ...convData,
          last_message_at: serverTimestamp()
        });
        convId = newConv.id;
        console.log(`Created new conversation: ${convId} for phone: ${phone}`);
      } else {
        convId = convSnap.docs[0].id;
        convData = convSnap.docs[0].data();
        await updateDoc(doc(db, 'whatsapp_conversations', convId), {
          last_message_at: serverTimestamp(),
          customer_name: data.senderName || data.chatName || convData.customer_name
        });
        console.log(`Updated conversation: ${convId} for phone: ${phone}`);
      }
      
      // Check if message already exists to prevent duplicates (Z-API sometimes retries)
      const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
      const qMsg = query(messagesRef, where('wa_message_id', '==', messageId));
      const msgSnap = await getDocs(qMsg);
      
      if (!msgSnap.empty) {
        console.log(`Message ${messageId} already exists, ignoring duplicate.`);
        return res.status(200).send('OK');
      }

      // Save message
      await addDoc(messagesRef, {
        tenantId,
        wa_message_id: messageId,
        direction: fromMe ? 'outbound' : 'inbound',
        type: type === 'text' ? 'text' : (mediaUrl ? type : 'other'),
        content: text,
        mediaUrl: mediaUrl || null,
        fileName: fileName || null,
        status: fromMe ? 'sent' : 'received',
        timestamp: serverTimestamp()
      });
      console.log(`Message saved successfully to conv ${convId}`);

      // Gemini AI Integration (Moved to backend aiService)
      if (!fromMe && type === 'text') {
        try {
          // Check if AI is enabled for this tenant
          const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
          const tenantData = tenantDoc.data();
          
          if (tenantData?.plan === 'Central Inteligente') {
            await handleAIResponse(
              tenantId,
              tenantData,
              convId,
              convData,
              phone,
              instanceId,
              waNumber.data(),
              messagesRef
            );
          }
        } catch (aiError) {
          console.error('Error generating AI response:', aiError);
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('Z-API Webhook Error:', error);
      // Always return 200 to Z-API even on our internal errors so it doesn't keep retrying and blocking the queue
      res.status(200).send('Internal Server Error Handled');
    }
  });

  // API to manually generate a quote from conversation history
  app.post('/api/whatsapp/generate-quote', async (req, res) => {
    try {
      const { tenantId, convId } = req.body;
      if (!tenantId || !convId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
      const tenantData = tenantDoc.data();
      if (!tenantData) return res.status(404).json({ error: 'Tenant not found' });

      const convDoc = await getDoc(doc(db, 'whatsapp_conversations', convId));
      const convData = convDoc.data();
      if (!convData) return res.status(404).json({ error: 'Conversation not found' });

      const numbersRef = collection(db, 'whatsapp_numbers');
      const qNumber = query(numbersRef, where('instanceId', '==', convData.whatsapp_number_id));
      const numberSnap = await getDocs(qNumber);
      const waNumberData = numberSnap.empty ? {} : numberSnap.docs[0].data();

      const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
      
      await handleAIResponse(
        tenantId,
        tenantData,
        convId,
        convData,
        convData.customer_phone,
        waNumberData.instanceId || '',
        waNumberData,
        messagesRef
      );

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Manual quote generation error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API to send WhatsApp message via Z-API
  app.post('/api/whatsapp/messages', async (req, res) => {
    try {
      const { to, type, text, mediaUrl, mediaType, fileName, instanceId, token, clientToken: bodyClientToken } = req.body;
      
      if (!to || !instanceId || !token) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      let clientToken = bodyClientToken || '';

      // If not provided in body, try to fetch from database as fallback
      if (!clientToken) {
        const numbersRef = collection(db, 'whatsapp_numbers');
        const qNumber = query(numbersRef, where('instanceId', '==', instanceId));
        const numberSnap = await getDocs(qNumber);
        
        if (!numberSnap.empty && numberSnap.docs[0].data().clientToken) {
          clientToken = numberSnap.docs[0].data().clientToken;
        }
      }

      let endpoint = 'send-text';
      let requestBody: any = { phone: to };

      if (mediaUrl) {
        if (mediaType === 'image') {
          endpoint = 'send-image';
          requestBody.image = mediaUrl;
          if (text) requestBody.caption = text;
        } else if (mediaType === 'video') {
          endpoint = 'send-video';
          requestBody.video = mediaUrl;
          if (text) requestBody.caption = text;
        } else if (mediaType === 'audio') {
          endpoint = 'send-audio';
          requestBody.audio = mediaUrl;
        } else if (mediaType === 'document') {
          endpoint = 'send-document';
          requestBody.document = mediaUrl;
          requestBody.fileName = fileName || 'documento';
          if (text) requestBody.caption = text;
        }
      } else {
        requestBody.message = text;
      }

      const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/${endpoint}`;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (clientToken) {
        headers['Client-Token'] = clientToken;
      }

      const response = await fetch(zapiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Z-API Send Error:', errorData);
        return res.status(response.status).json({ error: 'Failed to send message via Z-API', details: errorData });
      }

      const data = await response.json();
      res.json({ success: true, messageId: data.messageId });
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
