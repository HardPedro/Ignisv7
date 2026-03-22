import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Terminal, Key, Shield, Users, Plus, X, Trash2, RefreshCw, Smartphone, QrCode, Bot, MessageSquare } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

export function Settings() {
  const { currentUser, userData, tenantData } = useAuth();
  const [isDevAreaOpen, setIsDevAreaOpen] = useState(false);
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [zapiToken, setZapiToken] = useState('');
  const [zapiClientToken, setZapiClientToken] = useState('');
  const [zapiUrl, setZapiUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [generalSaveMessage, setGeneralSaveMessage] = useState('');
  
  // General settings state
  const [officeSettings, setOfficeSettings] = useState({
    name: '',
    cnpj: '',
    address: '',
    phone: '',
    logo_url: '',
    quoteMessageTemplate: '',
    osMessageTemplate: '',
    mecanicoPermissions: {
      canViewFinancial: false,
      canDeleteOS: false,
      canEditSettings: false
    }
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  
  // Team state
  const [team, setTeam] = useState<any[]>([]);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: 'Mecanico' });
  
  // Admin state
  const [user, setUser] = useState<any>(null);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);
  const [isLeadsModalOpen, setIsLeadsModalOpen] = useState(false);
  const [platformLeads, setPlatformLeads] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  
  // New account form state
  const [newAccount, setNewAccount] = useState({
    companyName: '',
    plan: 'Core Operacional'
  });
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
  
  // Tenant Users Management
  const [selectedTenantForUsers, setSelectedTenantForUsers] = useState<any>(null);
  const [newUserForTenant, setNewUserForTenant] = useState({ name: '', email: '', role: 'Gestor' });
  const [isCreatingTenantUser, setIsCreatingTenantUser] = useState(false);
  
  // Password modal state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [whatsappPassword, setWhatsappPassword] = useState('');

  // QR Code Modal state
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState('');

  // Z-API QR Code Modal state
  const [isZapiQrModalOpen, setIsZapiQrModalOpen] = useState(false);
  const [zapiQrUrl, setZapiQrUrl] = useState('');
  
  // AI Settings State
  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    assistantName: 'Assistente Virtual',
    assistantTone: 'Profissional e prestativo',
    customPrompt: ''
  });
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [aiSaveMessage, setAiSaveMessage] = useState('');

  useEffect(() => {
    // Load saved settings
    const savedInstanceId = localStorage.getItem('zapi_instance_id') || '';
    const savedToken = localStorage.getItem('zapi_token') || '';
    const savedClientToken = localStorage.getItem('zapi_client_token') || '';
    const savedUrl = localStorage.getItem('zapi_url') || '';
    setZapiInstanceId(savedInstanceId);
    setZapiToken(savedToken);
    setZapiClientToken(savedClientToken);
    setZapiUrl(savedUrl);
    
    if (userData) {
      setUser(userData);
      fetchOfficeSettings();
      fetchTeam();
    }
  }, [userData]);

  const fetchTeam = async () => {
    if (!userData?.tenantId) return;
    try {
      const qUsers = query(collection(db, 'users'), where('tenantId', '==', userData.tenantId));
      const usersSnapshot = await getDocs(qUsers);
      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), status: 'Ativo' })).filter((u: any) => !u.deleted);

      const qInvites = query(collection(db, 'invitations'), where('tenantId', '==', userData.tenantId));
      const invitesSnapshot = await getDocs(qInvites);
      const invitesData = invitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), status: 'Pendente' }));

      setTeam([...usersData, ...invitesData]);
    } catch (error) {
      console.error('Failed to fetch team', error);
    }
  };

  const handleCreateTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) return;
    try {
      const emailLower = newMember.email.toLowerCase();
      await setDoc(doc(db, 'invitations', emailLower), {
        tenantId: userData.tenantId,
        email: emailLower,
        name: newMember.name,
        role: newMember.role,
        createdAt: new Date().toISOString()
      });
      
      // Send email notification
      try {
        await fetch('/api/send-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailLower,
            tenantName: userData.tenantName || 'Nossa Oficina',
            role: newMember.role
          })
        });
      } catch (emailError) {
        console.error('Failed to send invite email', emailError);
      }
      
      setIsTeamModalOpen(false);
      setNewMember({ name: '', email: '', role: 'Mecanico' });
      fetchTeam();
    } catch (error) {
      console.error('Failed to create team member', error);
      toast.error('Erro ao criar membro da equipe');
    }
  };

  const handleDeleteTeamMember = async (id: string, isInvite: boolean) => {
    if (!confirm('Tem certeza que deseja remover este membro da equipe?')) return;
    try {
      if (isInvite) {
        await deleteDoc(doc(db, 'invitations', id));
      } else {
        await updateDoc(doc(db, 'users', id), { deleted: true, deletedAt: serverTimestamp() });
      }
      fetchTeam();
    } catch (error) {
      console.error('Failed to delete team member', error);
    }
  };

  const fetchOfficeSettings = async () => {
    if (!userData?.tenantId) return;
    setIsLoadingSettings(true);
    try {
      const docRef = doc(db, 'tenants', userData.tenantId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOfficeSettings({
          name: data.name || '',
          cnpj: data.cnpj || '',
          address: data.address || '',
          phone: data.phone || '',
          logo_url: data.logo_url || '',
          quoteMessageTemplate: data.quoteMessageTemplate || 'Olá {cliente}, segue o orçamento {id} no valor de R$ {valor}. Para aprovar, acesse o link: {link}',
          osMessageTemplate: data.osMessageTemplate || 'Olá {cliente}, sua Ordem de Serviço {id} está com status: {status}. Valor total: R$ {valor}.',
          mecanicoPermissions: data.mecanicoPermissions || {
            canViewFinancial: false,
            canDeleteOS: false,
            canEditSettings: false
          }
        });
        
        if (data.aiSettings) {
          setAiSettings({
            enabled: data.aiSettings.enabled || false,
            assistantName: data.aiSettings.assistantName || 'Assistente Virtual',
            assistantTone: data.aiSettings.assistantTone || 'Profissional e prestativo',
            customPrompt: data.aiSettings.customPrompt || ''
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch office settings', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'tenants', userData.tenantId), officeSettings);
      setGeneralSaveMessage('Configurações salvas com sucesso!');
      setTimeout(() => setGeneralSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save general settings', error);
      toast.error('Erro de conexão ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) return;
    setIsSavingAi(true);
    try {
      await updateDoc(doc(db, 'tenants', userData.tenantId), {
        aiSettings: aiSettings
      });
      setAiSaveMessage('Configurações de IA salvas com sucesso!');
      setTimeout(() => setAiSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save AI settings', error);
      setAiSaveMessage('Erro ao salvar configurações.');
    } finally {
      setIsSavingAi(false);
    }
  };

  const handleSaveDevSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPasswordModalOpen(true);
  };

  const confirmSaveDevSettings = async () => {
    if (whatsappPassword !== 'ignishard18458416') {
      toast.error("Senha incorreta.");
      return;
    }
    setIsPasswordModalOpen(false);
    setWhatsappPassword('');

    if (!userData?.tenantId) {
      setSaveMessage('Erro: Usuário não possui uma oficina (tenantId) vinculada.');
      return;
    }
    setIsSaving(true);
    
    // Save to localStorage for MVP purposes
    localStorage.setItem('zapi_instance_id', zapiInstanceId);
    localStorage.setItem('zapi_token', zapiToken);
    localStorage.setItem('zapi_client_token', zapiClientToken);
    localStorage.setItem('zapi_url', zapiUrl);
    
    try {
      const finalInstanceId = zapiInstanceId.trim();
      if (!finalInstanceId) throw new Error('ID da Instância é obrigatório.');
      if (finalInstanceId.includes('/')) throw new Error('ID da Instância inválido. Use o campo "API da Instância" para colar a URL completa.');
      
      // Register the number in the backend so the webhook can find it
      await setDoc(doc(db, `whatsapp_numbers`, finalInstanceId), {
        tenantId: userData.tenantId,
        instanceId: finalInstanceId,
        token: zapiToken,
        clientToken: zapiClientToken,
        phone_number: 'Z-API Instance',
        updatedAt: new Date().toISOString()
      });
      
      setIsSaving(false);
      setSaveMessage('Configurações salvas com sucesso!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error: any) {
      console.error('Failed to save Z-API settings to backend', error);
      setIsSaving(false);
      setSaveMessage(error.message || 'Erro ao salvar no servidor.');
    }
  };

  const handleRegister360Webhook = async () => {
    toast.error('Webhook configuration is handled by the backend. Please ensure your Z-API or Evolution API is configured to point to your server URL.');
  };

  const loadAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const tenantsSnapshot = await getDocs(collection(db, 'tenants'));
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const invitesSnapshot = await getDocs(collection(db, 'invitations'));
      
      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any, status: 'Ativo' })).filter((u: any) => !u.deleted);
      const invitesData = invitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any, status: 'Pendente' }));
      
      const allUsers = [...usersData, ...invitesData];
      
      const accountsData = tenantsSnapshot.docs.map(doc => {
        const tenantData = doc.data();
        const tenantUsers = allUsers.filter(u => u.tenantId === doc.id);
        
        return { 
          id: doc.id, 
          name: tenantData.name,
          plan: tenantData.plan,
          createdAt: tenantData.createdAt,
          usersCount: tenantUsers.length,
          users: tenantUsers,
          deleted: tenantData.deleted
        };
      }).filter(account => !account.deleted);
      setAccounts(accountsData);
    } catch (error) {
      console.error('Failed to load accounts', error);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleOpenAccountsModal = () => {
    setIsAccountsModalOpen(true);
    loadAccounts();
  };

  const handleOpenLeadsModal = async () => {
    setIsLeadsModalOpen(true);
    try {
      const leadsRef = collection(db, 'platform_leads');
      const q = query(leadsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const leadsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlatformLeads(leadsData);
    } catch (error) {
      console.error("Error fetching platform leads:", error);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingAccount(true);
    try {
      const tenantId = 't-' + Date.now();
      await setDoc(doc(db, 'tenants', tenantId), {
        name: newAccount.companyName,
        plan: newAccount.plan,
        createdAt: new Date().toISOString()
      });
      
      setNewAccount({ companyName: '', plan: 'Core Operacional' });
      loadAccounts();
    } catch (error) {
      console.error('Failed to create account', error);
      toast.error('Erro ao criar conta');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleCreateTenantUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantForUsers) return;
    setIsCreatingTenantUser(true);
    try {
      const emailLower = newUserForTenant.email.toLowerCase();
      await setDoc(doc(db, 'invitations', emailLower), {
        tenantId: selectedTenantForUsers.id,
        email: emailLower,
        name: newUserForTenant.name,
        role: newUserForTenant.role,
        createdAt: new Date().toISOString()
      });
      
      // Send email notification
      try {
        await fetch('/api/send-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailLower,
            tenantName: selectedTenantForUsers.name || 'A Oficina',
            role: newUserForTenant.role
          })
        });
      } catch (emailError) {
        console.error('Failed to send invite email', emailError);
      }
      
      setNewUserForTenant({ name: '', email: '', role: 'Gestor' });
      await loadAccounts();
      
      const usersSnapshot = await getDocs(query(collection(db, 'users'), where('tenantId', '==', selectedTenantForUsers.id)));
      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any, status: 'Ativo' })).filter((u: any) => !u.deleted);
      
      const invitesSnapshot = await getDocs(query(collection(db, 'invitations'), where('tenantId', '==', selectedTenantForUsers.id)));
      const invitesData = invitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any, status: 'Pendente' }));
      
      const updatedUsers = [...usersData, ...invitesData];
      
      setSelectedTenantForUsers({
        ...selectedTenantForUsers,
        users: updatedUsers,
        usersCount: updatedUsers.length
      });
      
    } catch (error) {
      console.error('Failed to create user', error);
      toast.error('Erro ao criar usuário');
    } finally {
      setIsCreatingTenantUser(false);
    }
  };

  const handleDeleteTenantUser = async (userId: string, isInvite: boolean) => {
    if (!window.confirm('Tem certeza que deseja remover este usuário?')) return;
    try {
      if (isInvite) {
        await deleteDoc(doc(db, 'invitations', userId));
      } else {
        await updateDoc(doc(db, 'users', userId), { deleted: true, deletedAt: serverTimestamp() });
      }
      await loadAccounts();
      
      const usersSnapshot = await getDocs(query(collection(db, 'users'), where('tenantId', '==', selectedTenantForUsers.id)));
      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any, status: 'Ativo' })).filter((u: any) => !u.deleted);
      
      const invitesSnapshot = await getDocs(query(collection(db, 'invitations'), where('tenantId', '==', selectedTenantForUsers.id)));
      const invitesData = invitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any, status: 'Pendente' }));
      
      const updatedUsers = [...usersData, ...invitesData];
      
      setSelectedTenantForUsers({
        ...selectedTenantForUsers,
        users: updatedUsers,
        usersCount: updatedUsers.length
      });
    } catch (error) {
      console.error('Failed to delete user', error);
      toast.error('Erro ao remover usuário');
    }
  };

  const handleDeleteAccount = async (tenantId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.')) return;
    
    try {
      await updateDoc(doc(db, 'tenants', tenantId), { deleted: true, deletedAt: serverTimestamp() });
      loadAccounts();
    } catch (error) {
      console.error('Failed to delete account', error);
      toast.error('Erro ao excluir conta');
    }
  };

  const handleUpdatePlan = async (tenantId: string, plan: string) => {
    setUpdatingPlanId(tenantId);
    try {
      await updateDoc(doc(db, 'tenants', tenantId), { plan });
      loadAccounts();
    } catch (error) {
      console.error('Failed to update plan', error);
      toast.error('Erro ao atualizar plano');
    } finally {
      setUpdatingPlanId(null);
    }
  };

  const handleOpenQrModal = () => {
    if (!officeSettings.phone) {
      toast.error('Por favor, configure o telefone da oficina na aba Geral primeiro.');
      return;
    }
    // Remove all non-numeric characters
    const cleanPhone = officeSettings.phone.replace(/\D/g, '');
    // Ensure it has country code (assuming Brazil 55 if not present and length is 10 or 11)
    let finalPhone = cleanPhone;
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      finalPhone = `55${cleanPhone}`;
    }
    
    setWhatsappLink(`https://wa.me/${finalPhone}?text=Ol%C3%A1%2C%20vim%20da%20oficina!`);
    setIsQrModalOpen(true);
  };

  const handleOpenZapiQr = () => {
    if (!zapiUrl) {
      toast.error('Por favor, configure e salve a API da Instância primeiro.');
      return;
    }
    setZapiQrUrl(`${zapiUrl}/qr-code/image?t=${Date.now()}`);
    setIsZapiQrModalOpen(true);
  };

  const isSuperAdmin = userData?.email === 'harddisk1911@gmail.com';
  const isCoreOperacional = tenantData?.plan === 'Core Operacional';
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <SettingsIcon className="mr-3 h-8 w-8 text-yellow-500" />
          Configurações
        </h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('general')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'general'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Geral
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'team'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Equipe
          </button>
          {!isCoreOperacional && (
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'whatsapp'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              WhatsApp
            </button>
          )}
          {!isCoreOperacional && (
            <button
              onClick={() => setActiveTab('ai')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'ai'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Assistente AI
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'admin'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Admin
            </button>
          )}
        </nav>
      </div>

      {activeTab === 'general' && (
        <div className="bg-white shadow-sm sm:rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Configurações Gerais</h2>
            
            <form onSubmit={handleSaveGeneralSettings} className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Oficina</label>
                  <input 
                    type="text" 
                    value={officeSettings.name}
                    onChange={e => setOfficeSettings({...officeSettings, name: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input 
                    type="text" 
                    value={officeSettings.cnpj}
                    onChange={e => setOfficeSettings({...officeSettings, cnpj: e.target.value})}
                    placeholder="00.000.000/0000-00"
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input 
                    type="text" 
                    value={officeSettings.phone}
                    onChange={e => setOfficeSettings({...officeSettings, phone: e.target.value})}
                    placeholder="(00) 00000-0000"
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                  <input 
                    type="text" 
                    value={officeSettings.logo_url}
                    onChange={e => setOfficeSettings({...officeSettings, logo_url: e.target.value})}
                    placeholder="https://exemplo.com/logo.png"
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                <textarea 
                  rows={2}
                  value={officeSettings.address}
                  onChange={e => setOfficeSettings({...officeSettings, address: e.target.value})}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem Padrão (Orçamento via WhatsApp)</label>
                  <textarea 
                    rows={3}
                    value={officeSettings.quoteMessageTemplate || 'Olá {cliente}, segue o orçamento {id} no valor de R$ {valor}. Para aprovar, acesse o link: {link}'}
                    onChange={e => setOfficeSettings({...officeSettings, quoteMessageTemplate: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                  <p className="text-xs text-gray-500 mt-1">Variáveis: {'{cliente}'}, {'{id}'}, {'{valor}'}, {'{link}'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem Padrão (OS via WhatsApp)</label>
                  <textarea 
                    rows={3}
                    value={officeSettings.osMessageTemplate || 'Olá {cliente}, sua Ordem de Serviço {id} está com status: {status}. Valor total: R$ {valor}.'}
                    onChange={e => setOfficeSettings({...officeSettings, osMessageTemplate: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                  <p className="text-xs text-gray-500 mt-1">Variáveis: {'{cliente}'}, {'{id}'}, {'{status}'}, {'{valor}'}</p>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <div className="flex items-center">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                  {generalSaveMessage && (
                    <span className="ml-4 text-sm text-green-600 font-medium flex items-center">
                      {generalSaveMessage}
                    </span>
                  )}
                </div>
                
                <button
                  type="button"
                  onClick={handleOpenQrModal}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-bold rounded-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200"
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  Gerar QR Code (Cliente)
                </button>
              </div>
            </form>
          </div>
          
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 flex justify-end">
            {isSuperAdmin && (
              <button 
                onClick={() => setIsDevAreaOpen(!isDevAreaOpen)}
                className="text-xs font-mono text-gray-500 hover:text-gray-900 flex items-center transition-colors"
              >
                <Terminal className="h-3 w-3 mr-1" />
                Área DEV
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Gestão da Equipe</h2>
            <button 
              onClick={() => setIsTeamModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Membro
            </button>
          </div>

          <div className="overflow-hidden border border-gray-100 rounded-2xl mb-8">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Cargo</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {team.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{member.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{member.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        member.role === 'Gestor' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        member.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {member.id !== user?.id && (
                        <button 
                          onClick={() => handleDeleteTeamMember(member.id, member.status === 'Pendente')}
                          className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Permissões do Perfil: Mecânico</h3>
            <p className="text-sm text-gray-500 mb-6">Configure o que os usuários com o perfil de Mecânico podem acessar ou modificar no sistema.</p>
            
            <div className="space-y-4 max-w-2xl">
              <label className="flex items-center space-x-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={officeSettings.mecanicoPermissions.canViewFinancial}
                  onChange={e => setOfficeSettings({
                    ...officeSettings, 
                    mecanicoPermissions: { ...officeSettings.mecanicoPermissions, canViewFinancial: e.target.checked }
                  })}
                  className="h-5 w-5 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-900">Acessar Financeiro</span>
                  <span className="block text-xs text-gray-500">Permite visualizar relatórios financeiros, fluxo de caixa e faturamento.</span>
                </div>
              </label>

              <label className="flex items-center space-x-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={officeSettings.mecanicoPermissions.canDeleteOS}
                  onChange={e => setOfficeSettings({
                    ...officeSettings, 
                    mecanicoPermissions: { ...officeSettings.mecanicoPermissions, canDeleteOS: e.target.checked }
                  })}
                  className="h-5 w-5 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-900">Excluir Ordens de Serviço</span>
                  <span className="block text-xs text-gray-500">Permite apagar ordens de serviço do sistema permanentemente.</span>
                </div>
              </label>

              <label className="flex items-center space-x-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={officeSettings.mecanicoPermissions.canEditSettings}
                  onChange={e => setOfficeSettings({
                    ...officeSettings, 
                    mecanicoPermissions: { ...officeSettings.mecanicoPermissions, canEditSettings: e.target.checked }
                  })}
                  className="h-5 w-5 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-900">Editar Configurações</span>
                  <span className="block text-xs text-gray-500">Permite alterar dados da oficina, integrações e configurações gerais.</span>
                </div>
              </label>
            </div>

            <div className="mt-6">
              <button 
                onClick={handleSaveGeneralSettings}
                disabled={isSaving}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Salvando...' : 'Salvar Permissões'}
              </button>
              {generalSaveMessage && (
                <span className="ml-4 text-sm text-green-600 font-medium inline-flex items-center">
                  {generalSaveMessage}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && !isCoreOperacional && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Assistente Inteligente (IA)</h2>
            <form onSubmit={handleSaveAiSettings} className="space-y-6 max-w-2xl">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Ativar Assistente</h3>
                  <p className="text-sm text-gray-500">O assistente responderá automaticamente aos clientes no WhatsApp.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAiSettings({ ...aiSettings, enabled: !aiSettings.enabled })}
                  className={`${
                    aiSettings.enabled ? 'bg-yellow-500' : 'bg-gray-200'
                  } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2`}
                >
                  <span
                    aria-hidden="true"
                    className={`${
                      aiSettings.enabled ? 'translate-x-5' : 'translate-x-0'
                    } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Assistente</label>
                <input 
                  type="text" 
                  value={aiSettings.assistantName}
                  onChange={e => setAiSettings({...aiSettings, assistantName: e.target.value})}
                  placeholder="Ex: Ana, João, Assistente Virtual"
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tom de Voz</label>
                <select
                  value={aiSettings.assistantTone}
                  onChange={e => setAiSettings({...aiSettings, assistantTone: e.target.value})}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors"
                >
                  <option value="Profissional e prestativo">Profissional e prestativo</option>
                  <option value="Amigável e informal">Amigável e informal</option>
                  <option value="Técnico e direto">Técnico e direto</option>
                  <option value="Entusiasta e vendedor">Entusiasta e vendedor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instruções Personalizadas (Prompt)</label>
                <textarea 
                  rows={6}
                  value={aiSettings.customPrompt}
                  onChange={e => setAiSettings({...aiSettings, customPrompt: e.target.value})}
                  placeholder="Instruções adicionais para a IA. Ex: 'Sempre ofereça um café quando o cliente chegar', 'Não dê descontos sem aprovação'."
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                />
                <p className="text-xs text-gray-500 mt-2">
                  A IA já conhece os dados da sua oficina (nome, endereço, telefone). Use este campo apenas para instruções extras de comportamento.
                </p>
              </div>

              <div className="pt-4 flex items-center">
                <button 
                  type="submit" 
                  disabled={isSavingAi}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSavingAi ? 'Salvando...' : 'Salvar Configurações de IA'}
                </button>
                {aiSaveMessage && (
                  <span className="ml-4 text-sm text-green-600 font-medium">
                    {aiSaveMessage}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'whatsapp' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">WhatsApp API (Z-API)</h2>
            <form onSubmit={handleSaveDevSettings} className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API da Instância (URL Completa)</label>
                <input 
                  type="text" 
                  value={zapiUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    setZapiUrl(url);
                    try {
                      const urlObj = new URL(url);
                      const pathParts = urlObj.pathname.split('/').filter(p => p);
                      const instancesIndex = pathParts.indexOf('instances');
                      const tokenIndex = pathParts.indexOf('token');
                      
                      if (instancesIndex !== -1 && instancesIndex + 1 < pathParts.length) {
                        setZapiInstanceId(pathParts[instancesIndex + 1]);
                      }
                      if (tokenIndex !== -1 && tokenIndex + 1 < pathParts.length) {
                        setZapiToken(pathParts[tokenIndex + 1]);
                      }
                    } catch (err) {
                      // Fallback to regex if not a valid URL yet
                      const match = url.match(/instances\/([^\/]+)\/token\/([^\/]+)/);
                      if (match) {
                        setZapiInstanceId(match[1]);
                        setZapiToken(match[2].replace(/\/$/, '')); // Remove trailing slash if exists
                      }
                    }
                  }}
                  placeholder="Ex: https://api.z-api.io/instances/3F00.../token/3199..."
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                />
                <p className="text-xs text-gray-500 mt-1">Cole a URL completa aqui e nós extraímos o ID e o Token automaticamente.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID da Instância</label>
                  <input 
                    type="text" 
                    value={zapiInstanceId}
                    onChange={e => setZapiInstanceId(e.target.value)}
                    readOnly
                    className="block w-full bg-gray-50 border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none sm:text-sm text-gray-500 font-mono" 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Token da Instância</label>
                  <input 
                    type="password" 
                    value={zapiToken}
                    onChange={e => setZapiToken(e.target.value)}
                    readOnly
                    className="block w-full bg-gray-50 border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none sm:text-sm text-gray-500 font-mono" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Token de Segurança (Client-Token)</label>
                <input 
                  type="password" 
                  value={zapiClientToken}
                  onChange={e => setZapiClientToken(e.target.value)}
                  placeholder="Opcional, usado para enviar mensagens"
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                />
                <p className="text-xs text-gray-500 mt-1">Encontrado no painel da Z-API em Segurança {'>'} Token de Segurança.</p>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-4">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? 'Salvando...' : 'Salvar Configurações API'}
                </button>
                <button
                  type="button"
                  onClick={handleOpenZapiQr}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-bold rounded-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200"
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  Conectar WhatsApp (QR Code)
                </button>
              </div>
              {saveMessage && (
                <p className={`text-sm font-medium ${saveMessage.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage}
                </p>
              )}
            </form>
          </div>

          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">URLs de Webhook</h2>
            <p className="text-sm text-gray-500 mb-6">
              Copie as URLs abaixo e cole nas configurações do seu provedor (Z-API ou Stripe) para receber os eventos em tempo real.
            </p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Webhook do WhatsApp (Z-API)</label>
                <div className="flex items-center">
                  <input 
                    type="text" 
                    readOnly
                    value={`${window.location.origin}/webhooks/zapi`}
                    className="block w-full bg-gray-50 border border-gray-300 rounded-l-xl shadow-sm py-3 px-4 text-gray-600 focus:outline-none sm:text-sm font-mono" 
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/webhooks/zapi`);
                      toast.success('URL do Z-API copiada para a área de transferência!');
                    }}
                    className="inline-flex items-center px-4 py-3 border border-l-0 border-gray-300 text-sm font-bold rounded-r-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all"
                  >
                    Copiar
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Configure esta URL na Z-API para receber as mensagens dos clientes.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          </div>
        </div>
      )}

      {activeTab === 'admin' && isSuperAdmin && (
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Painel de Administração (SuperAdmin)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-2">Gerenciar Contas</h3>
              <p className="text-sm text-gray-500 mb-4">Visualize, crie e gerencie todas as oficinas cadastradas no sistema.</p>
              <button 
                onClick={handleOpenAccountsModal}
                className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all"
              >
                <Users className="mr-2 h-4 w-4" />
                Ver Todas as Contas
              </button>
            </div>
            
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-2">Leads (Landing Page)</h3>
              <p className="text-sm text-gray-500 mb-4">Visualize as solicitações de acesso recebidas pela landing page.</p>
              <button 
                onClick={handleOpenLeadsModal}
                className="inline-flex items-center px-4 py-2 bg-yellow-500 text-gray-900 rounded-xl text-sm font-bold hover:bg-yellow-400 transition-all"
              >
                <Users className="mr-2 h-4 w-4" />
                Ver Solicitações
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isDevAreaOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-900 shadow-sm sm:rounded-2xl border border-gray-800 overflow-hidden">
              <div className="px-8 py-6 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center">
                  <Terminal className="h-6 w-6 text-yellow-500 mr-3" />
                  <h2 className="text-xl font-semibold text-white">Área do Desenvolvedor</h2>
                </div>
                <div className="flex items-center space-x-4">
                  {isSuperAdmin && (
                    <button
                      onClick={handleOpenAccountsModal}
                      className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 text-sm font-bold px-4 py-2 rounded-xl flex items-center transition-colors"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Administrar Contas
                    </button>
                  )}
                  <span className="bg-red-500/10 text-red-400 text-xs font-bold px-3 py-1 rounded-full flex items-center">
                    <Shield className="h-3 w-3 mr-1" />
                    Zona de Perigo
                  </span>
                </div>
              </div>
              
              <div className="p-8">
                <div className="mb-6 bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                  <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center">
                    <Key className="h-4 w-4 mr-2 text-yellow-500" />
                    Integração WhatsApp via Z-API
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Insira suas credenciais da Z-API para habilitar o envio e recebimento de mensagens.
                    O sistema utilizará essas chaves para se comunicar com a instância do WhatsApp.
                  </p>
                </div>

                <form onSubmit={handleSaveDevSettings} className="space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">ID da Instância</label>
                    <input 
                      type="text" 
                      value={zapiInstanceId}
                      onChange={(e) => setZapiInstanceId(e.target.value)}
                      placeholder="Ex: 3F00CCD5AE7541FFFB8086C84BA70"
                      className="block w-full bg-gray-800 border border-gray-700 rounded-xl shadow-sm py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Token da Instância</label>
                    <input 
                      type="password" 
                      value={zapiToken}
                      onChange={(e) => setZapiToken(e.target.value)}
                      placeholder="Ex: 3199E688571927B4B2352F44"
                      className="block w-full bg-gray-800 border border-gray-700 rounded-xl shadow-sm py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Token de Segurança (Client-Token)</label>
                    <input 
                      type="password" 
                      value={zapiClientToken}
                      onChange={(e) => setZapiClientToken(e.target.value)}
                      placeholder="Opcional, usado para enviar mensagens"
                      className="block w-full bg-gray-800 border border-gray-700 rounded-xl shadow-sm py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                    />
                  </div>

                  <div className="pt-4 flex items-center space-x-4">
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-yellow-500 transition-all duration-200 disabled:opacity-50"
                    >
                      {isSaving ? 'Salvando...' : 'Salvar Credenciais'}
                    </button>
                    
                    <button 
                      type="button"
                      onClick={handleRegister360Webhook}
                      className="inline-flex items-center px-4 py-2 border border-gray-600 text-sm font-bold rounded-xl shadow-sm text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500 transition-all duration-200"
                    >
                      Configurar Webhook 360dialog
                    </button>
                    
                    {saveMessage && (
                      <span className="text-sm text-green-400 flex items-center">
                        {saveMessage}
                      </span>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team Modal */}
      <AnimatePresence>
        {isTeamModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-gray-100"
            >
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Novo Membro da Equipe</h3>
              <form onSubmit={handleCreateTeamMember} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                  <input 
                    type="text" 
                    required
                    value={newMember.name}
                    onChange={e => setNewMember({...newMember, name: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl py-3 px-4 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (Google)</label>
                  <input 
                    type="email" 
                    required
                    value={newMember.email}
                    onChange={e => setNewMember({...newMember, email: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl py-3 px-4 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <select 
                    value={newMember.role}
                    onChange={e => setNewMember({...newMember, role: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl py-3 px-4 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                  >
                    <option value="Mecanico">Mecânico</option>
                    <option value="Gestor">Gestor</option>
                  </select>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="submit" className="flex-1 bg-yellow-500 text-gray-900 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-all">
                    Criar Membro
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsTeamModalOpen(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Accounts Modal */}
      {/* Leads Modal */}
      <AnimatePresence>
        {isLeadsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsLeadsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <Users className="h-5 w-5 mr-2 text-yellow-500" />
                  Solicitações de Acesso
                </h2>
                <button 
                  onClick={() => setIsLeadsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                {platformLeads.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    Nenhuma solicitação recebida ainda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WhatsApp</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oficina</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cód. Vendedor</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {platformLeads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {lead.createdAt?.toDate ? new Date(lead.createdAt.toDate()).toLocaleString('pt-BR') : 'N/A'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {lead.name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {lead.whatsapp}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {lead.establishment}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {lead.sellerCode || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAccountsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <Users className="h-5 w-5 mr-2 text-yellow-500" />
                  Administrar Contas (Estabelecimentos)
                </h2>
                <button 
                  onClick={() => setIsAccountsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
                {selectedTenantForUsers ? (
                  <div className="w-full flex flex-col">
                    <div className="flex items-center mb-6">
                      <button 
                        onClick={() => setSelectedTenantForUsers(null)}
                        className="mr-4 text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        &larr; Voltar
                      </button>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Usuários do Estabelecimento: <span className="text-yellow-600">{selectedTenantForUsers.name}</span>
                      </h3>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-8">
                      {/* Create User Form */}
                      <div className="w-full md:w-1/3 space-y-4">
                        <h4 className="text-md font-semibold text-gray-900 border-b pb-2">Novo Usuário</h4>
                        <form onSubmit={handleCreateTenantUser} className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                            <input 
                              type="text" 
                              required
                              value={newUserForTenant.name}
                              onChange={e => setNewUserForTenant({...newUserForTenant, name: e.target.value})}
                              className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (Google)</label>
                            <input 
                              type="email" 
                              required
                              value={newUserForTenant.email}
                              onChange={e => setNewUserForTenant({...newUserForTenant, email: e.target.value})}
                              className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                            <select 
                              required
                              value={newUserForTenant.role}
                              onChange={e => setNewUserForTenant({...newUserForTenant, role: e.target.value})}
                              className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                            >
                              <option value="Gestor">Gestor</option>
                              <option value="Mecanico">Mecânico</option>
                              <option value="Atendimento">Atendimento</option>
                            </select>
                          </div>
                          <button 
                            type="submit"
                            disabled={isCreatingTenantUser}
                            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-gray-900 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                          >
                            {isCreatingTenantUser ? 'Criando...' : (
                              <>
                                <Plus className="h-4 w-4 mr-2" />
                                Criar Usuário
                              </>
                            )}
                          </button>
                        </form>
                      </div>

                      {/* Users List */}
                      <div className="w-full md:w-2/3">
                        <h4 className="text-md font-semibold text-gray-900 border-b pb-2 mb-4">Usuários Ativos</h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">E-mail</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {selectedTenantForUsers.users.map((u: any) => (
                                <tr key={u.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{u.name}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{u.email}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ${
                                      u.role === 'Gestor' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                                    }`}>
                                      {u.role}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ${
                                      u.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {u.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <button 
                                      onClick={() => handleDeleteTenantUser(u.id, u.status === 'Pendente')}
                                      className="text-red-600 hover:text-red-900 transition-colors"
                                      title="Excluir usuário"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {selectedTenantForUsers.users.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                                    Nenhum usuário encontrado.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Create Account Form */}
                    <div className="w-full md:w-1/3 space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Novo Estabelecimento</h3>
                      <form onSubmit={handleCreateAccount} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Estabelecimento</label>
                          <input 
                            type="text" 
                            required
                            value={newAccount.companyName}
                            onChange={e => setNewAccount({...newAccount, companyName: e.target.value})}
                            className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                          <select 
                            required
                            value={newAccount.plan}
                            onChange={e => setNewAccount({...newAccount, plan: e.target.value})}
                            className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                          >
                            <option value="Core Operacional">Core Operacional (R$ 397)</option>
                            <option value="Central Inteligente">Central Inteligente (R$ 697)</option>
                          </select>
                        </div>
                        <button 
                          type="submit"
                          disabled={isCreatingAccount}
                          className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-gray-900 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                        >
                          {isCreatingAccount ? 'Criando...' : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              Criar Estabelecimento
                            </>
                          )}
                        </button>
                      </form>
                    </div>

                    {/* Accounts List */}
                    <div className="w-full md:w-2/3">
                      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Estabelecimentos Ativos</h3>
                      {isLoadingAccounts ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estabelecimento</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuários</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plano</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {accounts.map((acc) => {
                                return (
                                <tr key={acc.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{acc.name}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    <button 
                                      onClick={() => setSelectedTenantForUsers(acc)}
                                      className="text-yellow-600 hover:text-yellow-800 font-medium underline"
                                    >
                                      {acc.usersCount} usuário(s)
                                    </button>
                                  </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {acc.id !== 't-superadmin' ? (
                          <select
                            value={acc.plan || 'Core Operacional'}
                            onChange={(e) => handleUpdatePlan(acc.id, e.target.value)}
                            disabled={updatingPlanId === acc.id}
                            className="block w-full border border-gray-300 rounded-lg shadow-sm py-1 px-2 focus:ring-yellow-500 focus:border-yellow-500 sm:text-xs"
                          >
                            <option value="Core Operacional">Core Operacional</option>
                            <option value="Central Inteligente">Central Inteligente</option>
                          </select>
                        ) : (
                          <span className="px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full bg-gray-100 text-gray-800">
                            Admin
                          </span>
                        )}
                      </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    {acc.id !== 't-superadmin' && (
                                      <div className="flex justify-end space-x-2">
                                        <button 
                                          onClick={() => handleDeleteAccount(acc.id)}
                                          className="text-red-600 hover:text-red-900 transition-colors"
                                          title="Excluir estabelecimento"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )})}
                              {accounts.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                                    Nenhum estabelecimento encontrado.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Password Modal */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-yellow-500" />
                  Autenticação Necessária
                </h2>
                <button 
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Digite a senha para modificar as chaves da API do WhatsApp:
                </p>
                <input
                  type="password"
                  value={whatsappPassword}
                  onChange={(e) => setWhatsappPassword(e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm mb-4"
                  placeholder="Senha"
                />
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmSaveDevSettings}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* QR Code Modal */}
      <AnimatePresence>
        {isQrModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <QrCode className="h-5 w-5 mr-2 text-yellow-500" />
                  QR Code WhatsApp
                </h2>
                <button 
                  onClick={() => setIsQrModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                  <QRCodeSVG 
                    value={whatsappLink} 
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Fale Conosco!</h3>
                <p className="text-sm text-gray-500 mb-6">
                  Peça para o cliente escanear este código com a câmera do celular para iniciar uma conversa no WhatsApp da oficina.
                </p>
                <div className="w-full">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 text-left">Link Direto</label>
                  <div className="flex items-center">
                    <input 
                      type="text" 
                      readOnly
                      value={whatsappLink}
                      className="block w-full bg-gray-50 border border-gray-300 rounded-l-lg shadow-sm py-2 px-3 text-gray-600 focus:outline-none text-xs font-mono" 
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(whatsappLink);
                        toast.success('Link copiado!');
                      }}
                      className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 text-xs font-bold rounded-r-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Z-API QR Code Modal */}
      <AnimatePresence>
        {isZapiQrModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <Smartphone className="h-5 w-5 mr-2 text-green-500" />
                  Conectar WhatsApp
                </h2>
                <button 
                  onClick={() => setIsZapiQrModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 min-h-[250px] flex items-center justify-center">
                  {zapiQrUrl ? (
                    <img 
                      src={zapiQrUrl} 
                      alt="QR Code do WhatsApp" 
                      className="max-w-[200px] max-h-[200px]" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        toast.error('Erro ao carregar o QR Code. Verifique se a URL da instância está correta e se a instância está desconectada.');
                      }} 
                    />
                  ) : (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                  )}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Escaneie o QR Code</h3>
                <ol className="text-sm text-gray-500 mb-6 text-left list-decimal pl-5 space-y-2">
                  <li>Abra o WhatsApp no seu celular.</li>
                  <li>Toque em <strong>Mais opções</strong> (três pontos) ou <strong>Configurações</strong>.</li>
                  <li>Selecione <strong>Aparelhos conectados</strong> e depois <strong>Conectar um aparelho</strong>.</li>
                  <li>Aponte a câmera para esta tela para capturar o código.</li>
                </ol>
                <button 
                  onClick={() => setZapiQrUrl(`${zapiUrl}/qr-code/image?t=${Date.now()}`)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-bold rounded-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar QR Code
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
