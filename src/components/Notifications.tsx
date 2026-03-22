import React, { useState, useEffect } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export function Notifications() {
  const { userData } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userData?.tenantId) return;

    const notifRef = collection(db, `tenants/${userData.tenantId}/notifications`);
    const q = query(notifRef, where('read', '==', false), orderBy('createdAt', 'desc'));
    
    const unsub = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsub();
  }, [userData]);

  const handleMarkAsRead = async (id: string) => {
    if (!userData?.tenantId) return;
    try {
      await updateDoc(doc(db, `tenants/${userData.tenantId}/notifications`, id), {
        read: true
      });
    } catch (err) {
      console.error('Error marking notification as read', err);
    }
  };

  const handleAction = async (notif: any, action: 'approve_send' | 'reject_send' | 'confirm_system' | 'reject_system') => {
    if (!userData?.tenantId) return;
    
    try {
      const quoteRef = doc(db, `tenants/${userData.tenantId}/quotes`, notif.quoteId);
      
      if (action === 'approve_send') {
        await updateDoc(quoteRef, { status: 'enviado_ai' });
        // Send WhatsApp message to client
        const messageText = notif.formattedText || `Olá! Segue o seu orçamento: R$ ${notif.totalAmount?.toFixed(2)}. Responda "Aprovo" ou "Aceito" para confirmar.`;
        const res = await fetch('/api/whatsapp/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: notif.customerPhone,
            type: 'text',
            text: messageText,
            instanceId: notif.instanceId,
            token: notif.token,
            clientToken: notif.clientToken
          }),
        });
        if (res.ok) {
           const messagesRef = collection(db, `whatsapp_conversations/${notif.convId}/messages`);
           await addDoc(messagesRef, {
             tenantId: userData.tenantId,
             direction: 'outbound',
             type: 'text',
             content: messageText,
             status: 'sent',
             timestamp: serverTimestamp()
           });
        }
      } else if (action === 'reject_send') {
        await updateDoc(quoteRef, { status: 'recusado_ai' });
      } else if (action === 'confirm_system') {
        await updateDoc(quoteRef, { status: 'pendente' }); // Officially in the system as pending (or aceito if you prefer)
        navigate('/quotes');
      } else if (action === 'reject_system') {
        await updateDoc(quoteRef, { status: 'recusado' });
      }

      await handleMarkAsRead(notif.id);
      setIsOpen(false);
    } catch (err) {
      console.error('Error handling notification action', err);
      toast.error('Erro ao processar a ação.');
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell className="h-6 w-6" />
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-white"></span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-900">Notificações</h3>
                <span className="text-xs font-medium bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                  {notifications.length} novas
                </span>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    Nenhuma notificação no momento.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {notifications.map(notif => (
                      <li key={notif.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-medium text-gray-900">{notif.title}</p>
                          <button onClick={() => handleMarkAsRead(notif.id)} className="text-gray-400 hover:text-gray-600">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{notif.message}</p>
                        
                        {notif.type === 'quote_approval' && (
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleAction(notif, 'approve_send')}
                              className="flex-1 bg-green-500 text-white text-xs font-bold py-2 px-3 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center"
                            >
                              <Check className="h-3 w-3 mr-1" /> Aprovar
                            </button>
                            <button 
                              onClick={() => {
                                handleMarkAsRead(notif.id);
                                setIsOpen(false);
                                navigate('/quotes', { state: { editQuoteId: notif.quoteId } });
                              }}
                              className="flex-1 bg-blue-100 text-blue-700 text-xs font-bold py-2 px-3 rounded-lg hover:bg-blue-200 transition-colors flex items-center justify-center"
                            >
                              Editar
                            </button>
                            <button 
                              onClick={() => handleAction(notif, 'reject_send')}
                              className="flex-1 bg-red-100 text-red-700 text-xs font-bold py-2 px-3 rounded-lg hover:bg-red-200 transition-colors flex items-center justify-center"
                            >
                              <X className="h-3 w-3 mr-1" /> Recusar
                            </button>
                          </div>
                        )}

                        {notif.type === 'quote_confirmation' && (
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleAction(notif, 'confirm_system')}
                              className="flex-1 bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center"
                            >
                              <Check className="h-3 w-3 mr-1" /> Confirmar no Sistema
                            </button>
                            <button 
                              onClick={() => handleAction(notif, 'reject_system')}
                              className="flex-1 bg-gray-100 text-gray-700 text-xs font-bold py-2 px-3 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
                            >
                              <X className="h-3 w-3 mr-1" /> Ignorar
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}