import React, { useState, useEffect, useRef } from 'react';
import { Bot, Save, MessageSquare, Send, Loader2, CheckCircle, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { toast } from 'react-hot-toast';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export function IntelligentAssistant() {
  const { userData } = useAuth();
  const [behavior, setBehavior] = useState('');
  const [templateInput, setTemplateInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBehaviorModalOpen, setIsBehaviorModalOpen] = useState(false);

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!userData?.tenantId) return;
      try {
        const docRef = doc(db, `tenants/${userData.tenantId}/settings`, 'ai_assistant');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBehavior(data.behavior || '');
          setTemplateInput(data.template || '');
        }
      } catch (error) {
        console.error('Error fetching AI settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [userData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize Gemini Chat
  useEffect(() => {
    if (!process.env.GEMINI_API_KEY) return;
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `Você é um assistente especialista em gestão de oficinas mecânicas. Seu objetivo é ajudar o usuário a criar um template de orçamento (budget template) que será enviado aos clientes via WhatsApp.
Faça perguntas para entender o que ele quer no template (ex: cabeçalho, dados do cliente, veículo, serviços, peças, total, termos de garantia).
IMPORTANTE: Como o envio será via WhatsApp, o template deve ser formatado para leitura em celular (use negrito com *, itálico com _, emojis) e NÃO deve solicitar assinatura física ou digital complexa, apenas uma confirmação por mensagem (ex: "Responda ACEITO para aprovar").
Sempre que o usuário pedir para gerar ou atualizar o template, você DEVE seguir EXATAMENTE este formato:
1. Primeiro, diga: "Gerando template de orçamento..."
2. Em seguida, inclua o template completo envolvido por um bloco de código com a tag 'template', assim:
\`\`\`template
[conteúdo do template aqui]
\`\`\`
3. Por fim, diga que concluiu e explique brevemente o que foi feito.

Use placeholders como {nome_cliente}, {veiculo}, {servicos}, {pecas}, {total}, {data}, etc.
Seja proativo e sugira melhorias. Converse em português do Brasil.`
      }
    });

    // Initial greeting
    setMessages([{
      role: 'model',
      text: 'Olá! Sou seu assistente para criação de templates de orçamento. Como você gostaria de estruturar o orçamento da sua oficina? Posso sugerir um modelo padrão para começarmos?'
    }]);
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isTyping || !chatRef.current) return;

    const userMsg = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      let responseStream = await chatRef.current.sendMessageStream({ message: userMsg });
      
      let fullResponse = '';
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullResponse += chunk.text;
          
          // Extract template if present
          const templateMatch = fullResponse.match(/```template\n([\s\S]*?)\n```/);
          if (templateMatch && templateMatch[1]) {
            setTemplateInput(templateMatch[1]);
          }

          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].text = fullResponse;
            return newMessages;
          });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { role: 'model', text: 'Desculpe, ocorreu um erro ao processar sua mensagem.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!userData?.tenantId) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, `tenants/${userData.tenantId}/settings`, 'ai_assistant');
      await setDoc(docRef, {
        behavior,
        template: templateInput,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success('Configurações salvas com sucesso!');
      setIsBehaviorModalOpen(false);
    } catch (error) {
      console.error('Error saving AI settings:', error);
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Carregando configurações...</div>;
  }

  // Helper to remove template block from chat display to keep it clean
  const displayMessage = (text: string) => {
    return text.replace(/```template\n[\s\S]*?\n```/g, '\n\n*(Template atualizado no painel ao lado)*\n\n');
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-6 flex-shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Assistente Inteligente</h1>
          <p className="text-gray-500 mt-1">Configure o comportamento da IA e crie templates de orçamento conversando com o assistente.</p>
        </div>
        <button
          onClick={() => setIsBehaviorModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors"
        >
          <Settings className="mr-2 h-4 w-4" />
          Comportamento do Bot
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0">
        
        {/* Left Column: Chat Interface */}
        <div className="lg:col-span-4 bg-white rounded-[32px] border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center space-x-3 bg-gray-50/50">
            <div className="p-2 bg-yellow-50 rounded-xl">
              <Bot className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Criador de Templates</h2>
              <p className="text-sm text-gray-500">Converse com a IA</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user' 
                    ? 'bg-yellow-600 text-white rounded-tr-none' 
                    : 'bg-gray-100 text-gray-800 rounded-tl-none'
                }`}>
                  <div className={`prose prose-sm max-w-none prose-p:leading-relaxed ${msg.role === 'user' ? 'prose-invert' : ''}`}>
                    <Markdown>{displayMessage(msg.text)}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-none px-4 py-3 flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                  <span className="text-sm text-gray-500">Digitando...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-100 bg-white">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                disabled={isTyping}
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isTyping}
                className="bg-yellow-600 text-white p-2 rounded-xl hover:bg-yellow-700 disabled:opacity-50 transition-colors flex items-center justify-center w-12"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Template Preview */}
        <div className="lg:col-span-8 bg-white rounded-[32px] border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gray-100 rounded-xl">
                <MessageSquare className="h-6 w-6 text-gray-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Template em Tempo Real</h2>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Finalizar
            </button>
          </div>
          
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <label className="block text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">
                Conteúdo do Template (Editável)
              </label>
              <div className="flex-1 relative rounded-2xl overflow-hidden shadow-inner border border-gray-200 bg-[#1E1E1E]">
                <div className="absolute top-0 left-0 right-0 h-8 bg-[#2D2D2D] flex items-center px-4 space-x-2 border-b border-gray-700">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="ml-4 text-xs text-gray-400 font-mono">template.txt</span>
                </div>
                <textarea
                  value={templateInput}
                  onChange={(e) => setTemplateInput(e.target.value)}
                  placeholder="O template gerado pela IA aparecerá aqui..."
                  className="w-full h-full pt-12 pb-4 px-6 bg-transparent text-gray-100 font-mono text-base leading-relaxed focus:outline-none resize-none custom-scrollbar"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Behavior Settings Modal */}
      <AnimatePresence>
        {isBehaviorModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50" onClick={() => setIsBehaviorModalOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl text-left overflow-hidden shadow-xl w-full max-w-2xl border border-gray-100 flex flex-col"
            >
              <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-yellow-50 rounded-xl">
                    <Settings className="h-6 w-6 text-yellow-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Comportamento do Bot</h3>
                </div>
                <button onClick={() => setIsBehaviorModalOpen(false)} className="text-gray-400 hover:text-gray-500 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Instruções de Atendimento
                    </label>
                    <p className="text-sm text-gray-500 mb-4">
                      Defina como a IA deve se comportar ao interagir com os clientes via WhatsApp. Ex: tom de voz, regras de negócio, etc.
                    </p>
                    <textarea
                      value={behavior}
                      onChange={(e) => setBehavior(e.target.value)}
                      placeholder="Ex: Seja sempre muito educado e prestativo. Chame o cliente pelo nome..."
                      className="w-full h-64 border-2 border-gray-200 rounded-2xl shadow-sm py-4 px-5 focus:outline-none focus:ring-4 focus:ring-yellow-500/20 focus:border-yellow-500 text-base text-gray-700 resize-none transition-all"
                    />
                  </div>
                </div>
                
                <div className="mt-8 pt-4 border-t border-gray-100 flex flex-row-reverse gap-3">
                  <button onClick={handleSaveSettings} disabled={isSaving} className="inline-flex justify-center items-center rounded-xl border border-transparent shadow-sm px-6 py-3 bg-green-600 text-sm font-bold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:opacity-50">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Configurações
                  </button>
                  <button onClick={() => setIsBehaviorModalOpen(false)} className="inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-6 py-3 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
