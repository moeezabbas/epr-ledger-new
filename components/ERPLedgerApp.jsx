'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, Users, TrendingUp, TrendingDown, DollarSign, Search, Plus, Eye, X, Trash2, Edit, Download, Wifi, WifiOff } from 'lucide-react';

// API Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbzkUag35Oir80bL6jRx2d_1MaopMs2BexJZaQrDoJO0bCLQONw1jfA79F8eSnyIT2Ef/exec';

export default function ERPLedgerApp() {
  const [customers, setCustomers] = useState([]);
  const [balanceSheet, setBalanceSheet] = useState([]);
  const [summary, setSummary] = useState({ totalDr: 0, totalCr: 0, netPosition: 0, status: 'BALANCED' });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showEditTransaction, setShowEditTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineData, setOfflineData] = useState(null);

  // Offline mode detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load offline data
  useEffect(() => {
    const stored = localStorage.getItem('erp_offline_data');
    if (stored) {
      const data = JSON.parse(stored);
      setOfflineData(data);
      if (!isOnline) {
        setCustomers(data.customers || []);
        setBalanceSheet(data.balanceSheet || []);
        setSummary(data.summary || { totalDr: 0, totalCr: 0, netPosition: 0, status: 'BALANCED' });
      }
    }
  }, [isOnline]);

  // Save to offline storage
  const saveOfflineData = (data) => {
    const offlineCache = {
      customers: data.customers || customers,
      balanceSheet: data.balanceSheet || balanceSheet,
      summary: data.summary || summary,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('erp_offline_data', JSON.stringify(offlineCache));
    setOfflineData(offlineCache);
  };

  // FIXED: Calculate DR/CR summary from balance sheet
  const calculateSummaryFromBalanceSheet = (balances) => {
    const totalDr = balances
      .filter(item => item.drCr === 'DR')
      .reduce((sum, item) => sum + (Math.abs(parseFloat(item.balance)) || 0), 0);
    
    const totalCr = balances
      .filter(item => item.drCr === 'CR')
      .reduce((sum, item) => sum + (Math.abs(parseFloat(item.balance)) || 0), 0);
    
    const netPosition = totalDr - totalCr;
    const status = netPosition > 0 ? 'NET DR' : netPosition < 0 ? 'NET CR' : 'BALANCED';
    
    return {
      totalDr,
      totalCr,
      netPosition: Math.abs(netPosition),
      status
    };
  };

  // FIXED: Transaction summary calculation
  const calculateTransactionSummary = (transactions) => {
    if (!transactions || transactions.length === 0) {
      return {
        totalDebit: 0,
        totalCredit: 0,
        finalBalance: 0,
        finalDRCR: 'DR',
        transactionCount: 0,
        netBalance: 0
      };
    }
    
    const totalDebit = transactions.reduce((sum, txn) => sum + (parseFloat(txn.debit) || 0), 0);
    const totalCredit = transactions.reduce((sum, txn) => sum + (parseFloat(txn.credit) || 0), 0);
    
    const lastTransaction = transactions[transactions.length - 1];
    const finalBalance = lastTransaction.calculatedBalance || 0;
    const finalDRCR = lastTransaction.calculatedDrCr || 'DR';
    
    const netBalance = totalDebit - totalCredit;
    
    return {
      totalDebit,
      totalCredit,
      finalBalance,
      finalDRCR,
      transactionCount: transactions.length,
      netBalance: Math.abs(netBalance),
      netDRCR: netBalance >= 0 ? 'DR' : 'CR'
    };
  };

  // FIXED: Proper running balance calculation
  const calculateRunningBalance = (transactions) => {
    let runningBalance = 0;
    
    return transactions.map((txn, index) => {
      const debit = parseFloat(txn.debit) || 0;
      const credit = parseFloat(txn.credit) || 0;
      
      if (index === 0 && txn.description?.toLowerCase().includes('opening balance')) {
        runningBalance = debit - credit;
      } else {
        runningBalance = runningBalance + debit - credit;
      }
      
      const drCr = runningBalance >= 0 ? 'DR' : 'CR';
      const absoluteBalance = Math.abs(runningBalance);
      
      return {
        ...txn,
        calculatedBalance: absoluteBalance,
        calculatedDrCr: drCr,
        runningBalance: runningBalance
      };
    });
  };

  const refreshAllData = useCallback(async () => {
    if (!isOnline) {
      setError('You are offline. Showing cached data.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [customersData, balanceData] = await Promise.all([
        fetchCustomers(), 
        fetchBalanceSheet()
      ]);
      
      // Calculate summary from balance sheet
      const calculatedSummary = calculateSummaryFromBalanceSheet(balanceData);
      setSummary(calculatedSummary);
      
      // Save to offline storage
      saveOfflineData({
        customers: customersData,
        balanceSheet: balanceData,
        summary: calculatedSummary
      });
      
      setLastSync(new Date());
    } catch (err) {
      setError('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  const fetchCustomers = async () => {
    try {
      let allCustomers = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;
      
      while (hasMore) {
        const response = await fetch(`${API_URL}?method=getCustomersPaginated&limit=${limit}&offset=${offset}`, {
          method: 'GET',
          mode: 'cors',
          headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          return await fetchCustomersNonPaginated();
        }
        
        const data = await response.json();
        if (data.success) {
          allCustomers = allCustomers.concat(data.customers || []);
          hasMore = data.hasMore;
          offset += limit;
          setCustomers([...allCustomers]);
        } else {
          throw new Error(data.error || 'Failed to fetch customers');
        }
      }
      
      return allCustomers;
    } catch (err) {
      return await fetchCustomersNonPaginated();
    }
  };

  const fetchCustomersNonPaginated = async () => {
    try {
      const response = await fetch(`${API_URL}?method=getCustomers`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      if (data.success) {
        setCustomers(data.customers || []);
        return data.customers;
      }
      throw new Error(data.error || 'Failed to fetch customers');
    } catch (err) {
      setError(`Failed to load customers: ${err.message}`);
      return [];
    }
  };

  const fetchBalanceSheet = async () => {
    try {
      const response = await fetch(`${API_URL}?method=getBalanceSheet`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      
      if (data.success) {
        setBalanceSheet(data.balances || []);
        return data.balances;
      }
      throw new Error(data.error || 'Failed to fetch balance sheet');
    } catch (err) {
      console.error('Balance sheet error:', err);
      return [];
    }
  };

  // FIXED: Proper column mapping based on Google Sheets structure
  const fetchCustomerTransactions = async (customerName) => {
    try {
      setLoading(true);
      setError(null);
      
      const encodedName = encodeURIComponent(customerName);
      const url = `${API_URL}?method=getCustomerTransactions&customerName=${encodedName}`;
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (data.success) {
        const validTransactions = (data.transactions || []).filter(txn => {
          if (txn.description === 'Description' || txn.sn === 'S.N' || txn.date === 'Date') {
            return false;
          }
          if (!txn.date || txn.date === '-' || txn.date === '') {
            return false;
          }
          return true;
        }).map((txn, index) => {
          const debit = txn.debit ? parseFloat(txn.debit.toString().replace(/[^\d.-]/g, '')) || 0 : 0;
          const credit = txn.credit ? parseFloat(txn.credit.toString().replace(/[^\d.-]/g, '')) || 0 : 0;
          
          return {
            ...txn,
            sn: txn.sn && !isNaN(txn.sn) ? parseInt(txn.sn) : index + 1,
            debit,
            credit,
            weightQty: txn.weightQty && txn.weightQty !== 'NaN' ? txn.weightQty : '',
            rate: txn.rate && txn.rate !== 'Rs. NaN' ? txn.rate : '',
            item: txn.item && txn.item !== 'NaN' ? txn.item : '',
            transactionType: txn.transactionType || '-',
            paymentMethod: txn.paymentMethod || '-',
            bankName: txn.bankName || '-',
            chequeNo: txn.chequeNo || '-'
          };
        });
        
        const transactionsWithCorrectBalance = calculateRunningBalance(validTransactions);
        setTransactions(transactionsWithCorrectBalance);
        
        const summary = calculateTransactionSummary(transactionsWithCorrectBalance);
        setSelectedCustomer({ name: customerName, summary });
        
        return transactionsWithCorrectBalance;
      }
      throw new Error(data.error || 'Failed to fetch transactions');
    } catch (err) {
      setError('Failed to fetch transactions: ' + err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createCustomer = async (customerData) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        method: 'createCustomer',
        customerName: customerData.name,
        openingBalance: customerData.openingBalance || 0,
        color: customerData.color || 'none'
      });

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        await refreshAllData();
        setShowAddCustomer(false);
        return { success: true };
      }
      throw new Error(data.error || 'Failed to create customer');
    } catch (err) {
      setError('Failed to create customer: ' + err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const deleteCustomer = async (customerName) => {
    if (!confirm(`Are you sure you want to delete ${customerName}? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        method: 'deleteCustomer',
        customerName: customerName
      });

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        await refreshAllData();
        if (selectedCustomer?.name === customerName) {
          setSelectedCustomer(null);
          setActiveTab('customers');
        }
        return { success: true };
      }
      throw new Error(data.error || 'Failed to delete customer');
    } catch (err) {
      setError('Failed to delete customer: ' + err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const createTransaction = async (transactionData) => {
    try {
      setLoading(true);
      
      const apiData = {
        method: 'createTransaction',
        customerName: transactionData.customerName,
        date: transactionData.date,
        description: transactionData.description,
        item: transactionData.item,
        weightQty: transactionData.weightQty,
        rate: transactionData.rate,
        transactionType: transactionData.transactionType,
        paymentMethod: transactionData.paymentMethod,
        bankName: transactionData.bankName,
        chequeNo: transactionData.chequeNo,
        amount: transactionData.amount,
        drCr: transactionData.drCr
      };

      const params = new URLSearchParams(apiData);
      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        await refreshAllData();
        if (selectedCustomer) {
          await fetchCustomerTransactions(selectedCustomer.name);
        }
        setShowAddTransaction(false);
        return { success: true };
      }
      throw new Error(data.error || 'Failed to create transaction');
    } catch (err) {
      setError('Failed to create transaction: ' + err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const updateTransaction = async (transactionData) => {
    try {
      setLoading(true);
      
      const apiData = {
        method: 'updateTransaction',
        customerName: transactionData.customerName,
        sn: transactionData.sn,
        date: transactionData.date,
        description: transactionData.description,
        item: transactionData.item,
        weightQty: transactionData.weightQty,
        rate: transactionData.rate,
        transactionType: transactionData.transactionType,
        paymentMethod: transactionData.paymentMethod,
        bankName: transactionData.bankName,
        chequeNo: transactionData.chequeNo,
        amount: transactionData.amount,
        drCr: transactionData.drCr
      };

      const params = new URLSearchParams(apiData);
      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        await refreshAllData();
        if (selectedCustomer) {
          await fetchCustomerTransactions(selectedCustomer.name);
        }
        setShowEditTransaction(false);
        setEditingTransaction(null);
        return { success: true };
      }
      throw new Error(data.error || 'Failed to update transaction');
    } catch (err) {
      setError('Failed to update transaction: ' + err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const deleteTransaction = async (customerName, sn) => {
    if (!confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        method: 'deleteTransaction',
        customerName: customerName,
        sn: sn
      });

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        await refreshAllData();
        if (selectedCustomer) {
          await fetchCustomerTransactions(selectedCustomer.name);
        }
        return { success: true };
      }
      throw new Error(data.error || 'Failed to delete transaction');
    } catch (err) {
      setError('Failed to delete transaction: ' + err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!selectedCustomer || transactions.length === 0) return;
    
    const headers = ['S.N', 'Date', 'Description', 'Item', 'Weight/Qty', 'Rate', 'Transaction Type', 'Payment Method', 'Bank Name', 'Cheque No', 'Debit', 'Credit', 'Balance', 'DR/CR'];
    const rows = transactions.map(txn => [
      txn.sn,
      txn.date,
      txn.description,
      txn.item,
      txn.weightQty,
      txn.rate,
      txn.transactionType,
      txn.paymentMethod,
      txn.bankName,
      txn.chequeNo,
      txn.debit,
      txn.credit,
      txn.calculatedBalance,
      txn.calculatedDrCr
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCustomer.name}_ledger.csv`;
    a.click();
  };

  useEffect(() => {
    if (autoRefresh && isOnline) {
      const interval = setInterval(refreshAllData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, isOnline, refreshAllData]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (!isOnline) {
          setError('You are offline. Showing cached data.');
          return;
        }

        const testResponse = await fetch(`${API_URL}?method=ping`, {
          method: 'GET',
          mode: 'cors',
          headers: { 'Accept': 'application/json' }
        }).catch(() => null);
        
        if (!testResponse || !testResponse.ok) {
          setError(`⚠️ Cannot connect to API`);
          setLoading(false);
          return;
        }
        
        await refreshAllData();
      } catch (err) {
        setError(`Initial load failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, [refreshAllData, isOnline]);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <header className="bg-white shadow-lg border-b-4 border-blue-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                ERP Ledger System
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-gray-600">
                  {lastSync && `Last sync: ${lastSync.toLocaleTimeString()}`}
                </p>
                {isOnline ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <Wifi className="w-4 h-4" />
                    Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-orange-600 text-sm">
                    <WifiOff className="w-4 h-4" />
                    Offline Mode
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                disabled={!isOnline}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  autoRefresh ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                } disabled:opacity-50`}
              >
                Auto-Sync: {autoRefresh ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={refreshAllData}
                disabled={loading || !isOnline}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <nav className="flex gap-4 mt-4 border-t pt-4">
            {['dashboard', 'customers', 'transactions', 'balance-sheet'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === tab ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-800">Error</p>
                <pre className="text-red-700 text-sm mt-2 whitespace-pre-wrap font-mono">{error}</pre>
              </div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <DashboardView summary={summary} customers={customers} balanceSheet={balanceSheet} />}
        {activeTab === 'customers' && (
          <CustomersView
            customers={filteredCustomers}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddCustomer={() => setShowAddCustomer(true)}
            onViewCustomer={(name) => { fetchCustomerTransactions(name); setActiveTab('transactions'); }}
            onDeleteCustomer={deleteCustomer}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView
            customer={selectedCustomer}
            transactions={transactions}
            onAddTransaction={() => setShowAddTransaction(true)}
            onEditTransaction={(txn) => { setEditingTransaction(txn); setShowEditTransaction(true); }}
            onDeleteTransaction={deleteTransaction}
            onExport={exportToCSV}
            onBack={() => setSelectedCustomer(null)}
          />
        )}
        {activeTab === 'balance-sheet' && (
          <BalanceSheetView
            balanceSheet={balanceSheet}
            onViewCustomer={(name) => { fetchCustomerTransactions(name); setActiveTab('transactions'); }}
          />
        )}
      </main>

      {showAddCustomer && <AddCustomerModal onClose={() => setShowAddCustomer(false)} onSubmit={createCustomer} loading={loading} />}
      {showAddTransaction && <AddTransactionModal customers={customers} selectedCustomer={selectedCustomer?.name} onClose={() => setShowAddTransaction(false)} onSubmit={createTransaction} loading={loading} />}
      {showEditTransaction && editingTransaction && <EditTransactionModal transaction={editingTransaction} onClose={() => { setShowEditTransaction(false); setEditingTransaction(null); }} onSubmit={updateTransaction} loading={loading} />}
    </div>
  );
}

function DashboardView({ summary, customers, balanceSheet }) {
  const stats = [
    { title: 'Total Customers', value: customers.length, icon: Users, gradient: 'from-blue-500 to-blue-600' },
    { title: 'Total DR Balance', value: `Rs. ${summary.totalDr?.toLocaleString() || '0'}`, icon: TrendingUp, gradient: 'from-red-500 to-red-600' },
    { title: 'Total CR Balance', value: `Rs. ${summary.totalCr?.toLocaleString() || '0'}`, icon: TrendingDown, gradient: 'from-green-500 to-green-600' },
    { title: 'Net Position', value: `Rs. ${Math.abs(summary.netPosition || 0).toLocaleString()} ${summary.status || ''}`, icon: DollarSign, gradient: summary.status === 'NET DR' ? 'from-red-500 to-red-600' : summary.status === 'NET CR' ? 'from-green-500 to-green-600' : 'from-blue-500 to-blue-600' }
  ];

  const topCustomers = balanceSheet.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-300">
            <div className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${stat.gradient} mb-4`}>
              <stat.icon className="w-6 h-6 text-white" />
            </div>
            <p className="text-gray-600 text-sm font-medium">{stat.title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Top 10 Customer Balances</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Customer</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Balance</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">DR/CR</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((customer, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{customer.customerName}</td>
                  <td className="py-3 px-4 text-right font-semibold">Rs. {Math.abs(customer.balance).toLocaleString()}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${customer.drCr === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {customer.drCr}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CustomersView({ customers, searchTerm, setSearchTerm, onAddCustomer, onViewCustomer, onDeleteCustomer }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Customer Management</h2>
        <button onClick={onAddCustomer} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all shadow-lg">
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers.map((customer, index) => (
          <div key={index} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">{customer.name}</h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ${customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                {customer.status}
              </span>
            </div>
            <div className="space-y-2 text-sm text-gray-600 mb-4">
              <p>Sheet: {customer.sheetName}</p>
              <p>Created: {customer.createdDate ? new Date(customer.createdDate).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onViewCustomer(customer.name)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
                <Eye className="w-4 h-4" />
                View
              </button>
              <button onClick={() => onDeleteCustomer(customer.name)} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {customers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No customers found</p>
        </div>
      )}
    </div>
  );
}

function TransactionsView({ customer, transactions, onAddTransaction, onEditTransaction, onDeleteTransaction, onExport, onBack }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  if (!customer) {
    return (
      <div className="text-center py-12 bg-white rounded-xl shadow-lg">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">No customer selected</p>
        <button onClick={onBack} className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
          Back to Customers
        </button>
      </div>
    );
  }

  // Filter transactions based on search and date
  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = searchTerm === '' || 
      txn.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.transactionType?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = (!dateFilter.start || txn.date >= dateFilter.start) &&
                       (!dateFilter.end || txn.date <= dateFilter.end);
    
    return matchesSearch && matchesDate;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{customer.name}</h2>
            <p className="text-gray-600 mt-1">Transaction Ledger</p>
            <p className="text-sm text-gray-500 mt-1">
              Showing {filteredTransactions.length} of {transactions.length} transactions
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Final Balance</p>
            <p className="text-2xl font-bold text-gray-900">
              Rs. {customer.summary?.finalBalance?.toLocaleString() || '0'}
            </p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-2 ${
              customer.summary?.finalDRCR === 'DR' ? 'bg-red-100 text-red-700' : 
              'bg-green-100 text-green-700'
            }`}>
              {customer.summary?.finalDRCR || 'DR'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div>
            <p className="text-sm text-gray-600">Total Debit</p>
            <p className="text-lg font-bold text-red-600">
              Rs. {customer.summary?.totalDebit?.toLocaleString() || '0'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Credit</p>
            <p className="text-lg font-bold text-green-600">
              Rs. {customer.summary?.totalCredit?.toLocaleString() || '0'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Net Position</p>
            <p className="text-lg font-bold text-blue-600">
              Rs. {customer.summary?.netBalance?.toLocaleString() || '0'}
            </p>
            <span className={`text-sm font-medium ${
              customer.summary?.netDRCR === 'DR' ? 'text-red-600' : 'text-green-600'
            }`}>
              {customer.summary?.netDRCR}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-600">Transactions</p>
            <p className="text-lg font-bold text-purple-600">
              {customer.summary?.transactionCount || 0}
            </p>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="mt-6 pt-6 border-t space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Search Transactions</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search description, item, type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>
          {(searchTerm || dateFilter.start || dateFilter.end) && (
            <button
              onClick={() => { setSearchTerm(''); setDateFilter({ start: '', end: '' }); }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button 
            onClick={onAddTransaction} 
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </button>
          <button 
            onClick={onExport} 
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button 
            onClick={onBack} 
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all"
          >
            Back
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
              <tr>
                <th className="py-3 px-3 text-left font-semibold">S.N</th>
                <th className="py-3 px-3 text-left font-semibold">Date</th>
                <th className="py-3 px-3 text-left font-semibold">Description</th>
                <th className="py-3 px-3 text-left font-semibold">Item</th>
                <th className="py-3 px-3 text-right font-semibold">Weight/Qty</th>
                <th className="py-3 px-3 text-right font-semibold">Rate</th>
                <th className="py-3 px-3 text-left font-semibold">Type</th>
                <th className="py-3 px-3 text-left font-semibold">Payment</th>
                <th className="py-3 px-3 text-left font-semibold">Bank</th>
                <th className="py-3 px-3 text-left font-semibold">Cheque</th>
                <th className="py-3 px-3 text-right font-semibold">Debit</th>
                <th className="py-3 px-3 text-right font-semibold">Credit</th>
                <th className="py-3 px-3 text-right font-semibold">Balance</th>
                <th className="py-3 px-3 text-center font-semibold">DR/CR</th>
                <th className="py-3 px-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((txn, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-3 font-medium">{txn.sn || index + 1}</td>
                  <td className="py-3 px-3">
                    {txn.date instanceof Date ? txn.date.toLocaleDateString() : txn.date}
                  </td>
                  <td className="py-3 px-3">{txn.description}</td>
                  <td className="py-3 px-3">{txn.item || '-'}</td>
                  <td className="py-3 px-3 text-right font-medium">
                    {txn.weightQty ? parseFloat(txn.weightQty).toLocaleString() : '-'}
                  </td>
                  <td className="py-3 px-3 text-right font-medium">
                    {txn.rate || '-'}
                  </td>
                  <td className="py-3 px-3">{txn.transactionType || '-'}</td>
                  <td className="py-3 px-3">{txn.paymentMethod || '-'}</td>
                  <td className="py-3 px-3">{txn.bankName || '-'}</td>
                  <td className="py-3 px-3">{txn.chequeNo || '-'}</td>
                  <td className="py-3 px-3 text-right font-semibold text-red-600">
                    {txn.debit && txn.debit !== 0 ? `Rs. ${parseFloat(txn.debit).toLocaleString()}` : '-'}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-green-600">
                    {txn.credit && txn.credit !== 0 ? `Rs. ${parseFloat(txn.credit).toLocaleString()}` : '-'}
                  </td>
                  <td className="py-3 px-3 text-right font-bold">
                    Rs. {(txn.calculatedBalance || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      txn.calculatedDrCr === 'DR' ? 'bg-red-100 text-red-700' : 
                      'bg-green-100 text-green-700'
                    }`}>
                      {txn.calculatedDrCr || 'DR'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => onEditTransaction(txn)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteTransaction(customer.name, txn.sn)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              {transactions.length === 0 ? 'No transactions found' : 'No transactions match your filters'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceSheetView({ balanceSheet, onViewCustomer }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Balance Sheet</h2>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
              <tr>
                <th className="py-4 px-6 text-left text-sm font-semibold">Customer Name</th>
                <th className="py-4 px-6 text-right text-sm font-semibold">Balance (PKR)</th>
                <th className="py-4 px-6 text-center text-sm font-semibold">DR/CR</th>
                <th className="py-4 px-6 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {balanceSheet.map((item, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 px-6 font-semibold text-gray-900">{item.customerName}</td>
                  <td className="py-4 px-6 text-right font-bold">Rs. {Math.abs(item.balance).toLocaleString()}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${item.drCr === 'DR' ? 'bg-red-100 text-red-700' : item.drCr === 'CR' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                      {item.drCr}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button onClick={() => onViewCustomer(item.customerName)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm">
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {balanceSheet.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No balance data found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddCustomerModal({ onClose, onSubmit, loading }) {
  const [formData, setFormData] = useState({ name: '', openingBalance: 0, color: 'none' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await onSubmit(formData);
    if (result.success) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Add New Customer</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="Enter customer name"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Opening Balance</label>
            <input
              type="number"
              step="0.01"
              value={formData.openingBalance}
              onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Color Category</label>
            <select
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
            >
              <option value="none">No Color</option>
              <option value="brown">🟨 Brown/Yellow (Dealers)</option>
              <option value="blue">🟦 Blue (Banks)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all font-semibold disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddTransactionModal({ customers, selectedCustomer, onClose, onSubmit, loading }) {
  const [formData, setFormData] = useState({
    customerName: selectedCustomer || '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    item: '',
    weightQty: '',
    rate: '',
    transactionType: 'Sale/Purchase',
    paymentMethod: '',
    bankName: '',
    chequeNo: '',
    drCr: 'Debit',
    amount: ''
  });

  const items = [
    'Chilled Gots',
    'Chilled Scrape',
    'Guides',
    'Chilled Rolls',
    'Silver',
    'Steel',
    'Barring',
    'Nickle',
    'Molli',
    'Fero Powder',
    'Fire Bricks',
    'H Oil',
    'Magnese',
    'Chrome',
    'Black Scrape',
    'White Scrape',
    'Toka Scrape',
    'Pig Scrape'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await onSubmit(formData);
    if (result.success) onClose();
  };

  useEffect(() => {
    const weight = parseFloat(formData.weightQty) || 0;
    const rate = parseFloat(formData.rate) || 0;
    
    if (weight && rate) {
      const scrapeItems = ['Black Scrape', 'White Scrape', 'Toka Scrape', 'Pig Scrape'];
      let amount;
      
      if (scrapeItems.includes(formData.item)) {
        amount = (weight / 37.324) * rate;
      } else {
        amount = weight * rate;
      }
      
      setFormData(prev => ({ ...prev, amount: amount.toFixed(2) }));
    }
  }, [formData.weightQty, formData.rate, formData.item]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 my-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Add New Transaction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Customer *</label>
              <select
                required
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select Customer</option>
                {customers.map((c, i) => (
                  <option key={i} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Date *</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description *</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="Enter transaction description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Item</label>
              <select
                value={formData.item}
                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select Item</option>
                {items.map((item, i) => (
                  <option key={i} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Transaction Type</label>
              <select
                value={formData.transactionType}
                onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="Sale">Sale</option>
                <option value="Purchase">Purchase</option>
                <option value="Payment Received">Payment Received</option>
                <option value="Payment Given">Payment Given</option>
                <option value="Opening Balance">Opening Balance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Weight/Qty</label>
              <input
                type="number"
                step="0.01"
                value={formData.weightQty}
                onChange={(e) => setFormData({ ...formData, weightQty: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Rate (PKR)</label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all bg-yellow-50"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Jazzcash">Jazzcash</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cheque No.</label>
              <input
                type="text"
                value={formData.chequeNo}
                onChange={(e) => setFormData({ ...formData, chequeNo: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Debit/Credit *</label>
            <select
              required
              value={formData.drCr}
              onChange={(e) => setFormData({ ...formData, drCr: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
            >
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all font-semibold disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTransactionModal({ transaction, onClose, onSubmit, loading }) {
  const [formData, setFormData] = useState({
    customerName: transaction.customerName || '',
    sn: transaction.sn,
    date: transaction.date || new Date().toISOString().split('T')[0],
    description: transaction.description || '',
    item: transaction.item || '',
    weightQty: transaction.weightQty || '',
    rate: transaction.rate || '',
    transactionType: transaction.transactionType || 'Sale/Purchase',
    paymentMethod: transaction.paymentMethod || '',
    bankName: transaction.bankName || '',
    chequeNo: transaction.chequeNo || '',
    drCr: transaction.debit > 0 ? 'Debit' : 'Credit',
    amount: transaction.debit || transaction.credit || ''
  });

  const items = [
    'Chilled Gots',
    'Chilled Scrape',
    'Guides',
    'Chilled Rolls',
    'Silver',
    'Steel',
    'Barring',
    'Nickle',
    'Molli',
    'Fero Powder',
    'Fire Bricks',
    'H Oil',
    'Magnese',
    'Chrome',
    'Black Scrape',
    'White Scrape',
    'Toka Scrape',
    'Pig Scrape'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await onSubmit(formData);
    if (result.success) onClose();
  };

  useEffect(() => {
    const weight = parseFloat(formData.weightQty) || 0;
    const rate = parseFloat(formData.rate) || 0;
    
    if (weight && rate) {
      const scrapeItems = ['Black Scrape', 'White Scrape', 'Toka Scrape', 'Pig Scrape'];
      let amount;
      
      if (scrapeItems.includes(formData.item)) {
        amount = (weight / 37.324) * rate;
      } else {
        amount = weight * rate;
      }
      
      setFormData(prev => ({ ...prev, amount: amount.toFixed(2) }));
    }
  }, [formData.weightQty, formData.rate, formData.item]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 my-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Edit Transaction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Customer *</label>
              <input
                type="text"
                required
                disabled
                value={formData.customerName}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-gray-100 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Date *</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description *</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="Enter transaction description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Item</label>
              <select
                value={formData.item}
                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select Item</option>
                {items.map((item, i) => (
                  <option key={i} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Transaction Type</label>
              <select
                value={formData.transactionType}
                onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="Sale">Sale</option>
                <option value="Purchase">Purchase</option>
                <option value="Payment Received">Payment Received</option>
                <option value="Payment Given">Payment Given</option>
                <option value="Opening Balance">Opening Balance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Weight/Qty</label>
              <input
                type="number"
                step="0.01"
                value={formData.weightQty}
                onChange={(e) => setFormData({ ...formData, weightQty: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Rate (PKR)</label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all bg-yellow-50"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Jazzcash">Jazzcash</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cheque No.</label>
              <input
                type="text"
                value={formData.chequeNo}
                onChange={(e) => setFormData({ ...formData, chequeNo: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Debit/Credit *</label>
            <select
              required
              value={formData.drCr}
              onChange={(e) => setFormData({ ...formData, drCr: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
            >
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all font-semibold disabled:opacity-50">
              {loading ? 'Updating...' : 'Update Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
