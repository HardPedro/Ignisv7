import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FileText, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function PublicQuote() {
  const { tenantId, quoteId } = useParams();
  const [quote, setQuote] = useState<any>(null);
  const [office, setOffice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!tenantId || !quoteId) return;
      try {
        const quoteRef = doc(db, `tenants/${tenantId}/quotes`, quoteId);
        const quoteSnap = await getDoc(quoteRef);
        
        if (quoteSnap.exists()) {
          const quoteData = quoteSnap.data();
          
          // Fetch customer name
          if (quoteData.customerId) {
            const customerRef = doc(db, `tenants/${tenantId}/customers`, quoteData.customerId);
            const customerSnap = await getDoc(customerRef);
            if (customerSnap.exists()) {
              quoteData.customerName = customerSnap.data().name;
            }
          }

          // Fetch vehicle info
          if (quoteData.vehicleId) {
            const vehicleRef = doc(db, `tenants/${tenantId}/vehicles`, quoteData.vehicleId);
            const vehicleSnap = await getDoc(vehicleRef);
            if (vehicleSnap.exists()) {
              const vData = vehicleSnap.data();
              quoteData.vehicleInfo = `${vData.make} ${vData.model} (${vData.plate})`;
            }
          }

          setQuote({ id: quoteSnap.id, ...quoteData });
        }

        const officeRef = doc(db, 'tenants', tenantId);
        const officeSnap = await getDoc(officeRef);
        if (officeSnap.exists()) {
          setOffice(officeSnap.data());
        }
      } catch (error) {
        console.error('Error fetching quote:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [tenantId, quoteId]);

  const handleStatusUpdate = async (newStatus: 'aceito' | 'recusado') => {
    if (!tenantId || !quoteId) return;
    setIsUpdating(true);
    try {
      const quoteRef = doc(db, `tenants/${tenantId}/quotes`, quoteId);
      await updateDoc(quoteRef, { status: newStatus });
      setQuote({ ...quote, status: newStatus });
      toast.success(`Orçamento ${newStatus === 'aceito' ? 'aprovado' : 'recusado'} com sucesso!`);
    } catch (error) {
      console.error('Error updating quote:', error);
      toast.error('Erro ao atualizar o status do orçamento.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Orçamento não encontrado</h2>
          <p className="text-gray-500 mt-2">O link pode estar quebrado ou o orçamento foi removido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
          
          {/* Header */}
          <div className="bg-gray-900 px-8 py-6 text-white flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">{office?.name || 'Oficina'}</h1>
              <p className="text-gray-400 text-sm mt-1">Orçamento #{quote.id.substring(0, 8).toUpperCase()}</p>
            </div>
            {office?.logo_url && (
              <img src={office.logo_url} alt="Logo" className="h-12 w-auto object-contain bg-white p-1 rounded-lg" />
            )}
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Cliente</h3>
                <p className="text-lg font-medium text-gray-900">{quote.customerName}</p>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Veículo</h3>
                <p className="text-lg font-medium text-gray-900">{quote.vehicleInfo}</p>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Itens do Orçamento</h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Unit.</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {quote.items.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{item.qty}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">R$ {item.unitPrice.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">R$ {(item.qty * item.unitPrice).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-right text-sm font-bold text-gray-900">Total Geral</td>
                      <td className="px-6 py-4 text-right text-lg font-bold text-yellow-600">R$ {quote.totalAmount?.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Actions */}
            {quote.status === 'pendente' || quote.status === 'enviado' || quote.status === 'enviado_ai' ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8 pt-8 border-t border-gray-100">
                <button
                  onClick={() => handleStatusUpdate('aceito')}
                  disabled={isUpdating}
                  className="flex-1 inline-flex justify-center items-center px-6 py-4 border border-transparent text-lg font-bold rounded-xl shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="mr-2 h-6 w-6" />
                  Aprovar Orçamento
                </button>
                <button
                  onClick={() => handleStatusUpdate('recusado')}
                  disabled={isUpdating}
                  className="flex-1 inline-flex justify-center items-center px-6 py-4 border border-gray-300 text-lg font-bold rounded-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors disabled:opacity-50"
                >
                  <XCircle className="mr-2 h-6 w-6" />
                  Recusar
                </button>
              </div>
            ) : (
              <div className={`mt-8 pt-8 border-t border-gray-100 text-center p-6 rounded-xl ${
                quote.status === 'aceito' || quote.status === 'convertido_os' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                <h3 className="text-xl font-bold mb-2">
                  {quote.status === 'aceito' || quote.status === 'convertido_os' ? 'Orçamento Aprovado!' : 'Orçamento Recusado'}
                </h3>
                <p>
                  {quote.status === 'aceito' || quote.status === 'convertido_os' 
                    ? 'Obrigado por aprovar o orçamento. A oficina entrará em contato em breve.' 
                    : 'Você recusou este orçamento. Se tiver dúvidas, entre em contato com a oficina.'}
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
