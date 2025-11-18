'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, RefreshCw, Users, TrendingUp, TrendingDown, DollarSign, Search, Plus, Eye, X, Trash2, Edit, Download, Wifi, WifiOff, Menu, Home, FileText, DollarSign as BalanceIcon } from 'lucide-react';

// API Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbzkUag35Oir80bL6jRx2d_1MaopMs2BexJZaQrDoJO0bCLQONw1jfA79F8eSnyIT2Ef/exec';

export default function ERPLedgerApp() {
  const [customers, setCustomers] = useState([]);
  const [balanceSheet, setBalanceSheet] = useState([]);
  const [summary, setSummary] = useState({ totalDr: 0, totalCr: 0, netPosition: 0, status: 'BALANCED' });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false); // Disabled by default for speed
  const [lastSync, setLastSync] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showEditTransaction, setShowEditTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineData, setOfflineData] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      try {
        const data = JSON.parse(stored);
        setOfflineData(data);
        if (!isOnline) {
          setCustomers(data.customers || []);
          setBalanceSheet(data.balanceSheet || []);
          setSummary(data.summary || { totalDr: 0, totalCr: 0, netPosition: 0, status: 'BALANCED' });
        }
      } catch (e) {
        console.error('Failed to load offline data:', e);
      }
    }
  }, [isOnline]);

  // Save to offline storage
  const saveOfflineData = useCallback((data) => {
    const offlineCache = {
      customers: data.customers || customers,
      balanceSheet: data.balanceSheet || balanceSheet,
      summary: data.summary || summary,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('erp_offline_data', JSON.stringify(offlineCache));
    setOfflineData(offlineCache);
  }, [customers, balanceSheet, summary]);

  // Calculate DR/CR summary from balance sheet
  const calculateSummaryFromBalanceSheet = useCallback((balances) => {
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
  }, []);

  // Transaction summary calculation
  const calculateTransactionSummary = useCallback((transactions) => {
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
  }, []);

  // Proper running balance calculation - FIXED
  const calculateRunningBalance = useCallback((transactions) => {
    let runningBalance = 0;
    
    return transactions.map((txn, index) => {
      const debit = parseFloat(txn.debit) || 0;
      const credit = parseFloat(txn.credit) || 0;
      
      // Opening balance: Credit increases balance (we owe them), Debit decreases
      if (index === 0 && txn.description?.toLowerCase().includes('opening balance')) {
        runningBalance = credit - debit;
      } else {
        // Normal transactions:
        // Credit = Money coming in (increases balance) 
        // Debit = Money going out (decreases balance)
        runningBalance = runningBalance + credit - debit;
      }
      
      const drCr = runningBalance >= 0 ? 'CR' : 'DR';
      const absoluteBalance = Math.abs(runningBalance);
      
      console.log(`Transaction ${index + 1}: Debit=${debit}, Credit=${credit}, Balance=${runningBalance}, DR/CR=${drCr}`);
      
      return {
        ...txn,
        calculatedBalance: absoluteBalance,
        calculatedDrCr: drCr,
        runningBalance: runningBalance
      };
    });
  }, []);

  const refreshAllData = useCallback(async () => {
  if (!isOnline) {
    setError('You are offline. Showing cached data.');
    return;
  }

  setLoading(true);
  setError(null);
  try {
    console.log('Refreshing all data...');
    const [customersData, balanceData] = await Promise.all([
      fetchCustomers(), 
      fetchBalanceSheet()
    ]);
    
    console.log('Customers data:', customersData);
    console.log('Balance data:', balanceData);
    
    const calculatedSummary = calculateSummaryFromBalanceSheet(balanceData);
    setSummary(calculatedSummary);
    
    saveOfflineData({
      customers: customersData,
      balanceSheet: balanceData,
      summary: calculatedSummary
    });
    
    setLastSync(new Date());
    console.log('Refresh completed successfully');
  } catch (err) {
    console.error('Refresh error:', err);
    setError('Failed to refresh data: ' + err.message);
  } finally {
    setLoading(false);
  }
}, [isOnline, calculateSummaryFromBalanceSheet, saveOfflineData]);
  
  const fetchCustomers = async () => {
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
      console.error('Fetch customers error:', err);
      return customers;
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
      return balanceSheet;
    }
  };

  const fetchCustomerTransactions = useCallback(async (customerName) => {
    setTransactionLoading(true);
    setError(null);
    
    try {
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
          // Skip header rows
          if (txn.description === 'Description' || txn.sn === 'S.N' || txn.date === 'Date') {
            return false;
          }
          if (!txn.date || txn.date === '-' || txn.date === '') {
            return false;
          }
          return true;
        }).map((txn, index) => {
          // Parse debit and credit - they come as strings with "Rs. " prefix
          const debitStr = txn.debit ? txn.debit.toString().replace(/[^\d.-]/g, '') : '0';
          const creditStr = txn.credit ? txn.credit.toString().replace(/[^\d.-]/g, '') : '0';
          
          const debit = parseFloat(debitStr) || 0;
          const credit = parseFloat(creditStr) || 0;
          
          // FIXED: Proper column mapping based on Google Sheets structure
          // Columns: S.N, Date, Description, Item, Weight/Qty, Rate, Transaction Type, Payment Method, Bank Name, Cheque No, Debit, Credit, Balance, DR/CR
          
          return {
            ...txn,
            sn: txn.sn && !isNaN(txn.sn) ? parseInt(txn.sn) : index + 1,
            debit: debit,
            credit: credit,
            weightQty: txn.weightQty && txn.weightQty !== 'NaN' && txn.weightQty !== '-' ? txn.weightQty : '',
            rate: txn.rate && txn.rate !== 'Rs. NaN' && txn.rate !== '-' ? txn.rate : '',
            item: txn.item && txn.item !== 'NaN' && txn.item !== '-' ? txn.item : '',
            // Keep original values without modification
            transactionType: txn.transactionType || '-',
            paymentMethod: txn.paymentMethod || '-',
            bankName: txn.bankName || '-',
            chequeNo: txn.chequeNo || '-'
          };
        });
        
        console.log('Raw transactions from API:', data.transactions);
        console.log('Processed transactions:', validTransactions);
        
        // Calculate proper running balance
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
      setTransactionLoading(false);
    }
  }, [calculateRunningBalance, calculateTransactionSummary]);

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
    if (!confirm(`Are you sure you want to delete ${customerName}?`)) {
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
      console.log('Sending transaction data:', transactionData); // ADD THIS
      const apiData = {
      method: 'createTransaction',
      customerName: transactionData.customerName.trim(),
      date: transactionData.date,
      description: transactionData.description.trim(),
      item: (transactionData.item || '').trim(),
      weightQty: transactionData.weightQty || '',
      rate: transactionData.rate || '',
      transactionType: transactionData.transactionType,
      paymentMethod: transactionData.paymentMethod || '',
      bankName: transactionData.bankName || '',
      chequeNo: transactionData.chequeNo || '',
      amount: parseFloat(transactionData.amount) || 0, // Ensure it's a number
      drCr: transactionData.drCr
    };
console.log('Formatted API Data:', apiData);

    const params = new URLSearchParams();
    Object.entries(apiData).forEach(([key, value]) => {
      params.append(key, value.toString());
    });

    const url = `${API_URL}?${params.toString()}`;
    console.log('Final URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    });

    const data = await response.json();
    console.log('Full API Response:', data);
      
      if (data.success) {
      // Force refresh all data
      await Promise.all([
        fetchCustomers(),
        fetchBalanceSheet()
      ]);
      
      if (selectedCustomer) {
        await fetchCustomerTransactions(selectedCustomer.name);
      }
      
      setShowAddTransaction(false);
      return { success: true };
    }
    throw new Error(data.error || 'Failed to create transaction');
  } catch (err) {
    console.error('Transaction error details:', err);
    setError(`Failed: ${err.message}`);
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
    if (!confirm('Delete this transaction?')) {
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
    
    const headers = ['S.N', 'Date', 'Description', 'Item', 'Weight/Qty', 'Rate', 'Type', 'Payment', 'Bank', 'Cheque', 'Debit', 'Credit', 'Balance', 'DR/CR'];
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

  // Clear transactions when switching tabs
  useEffect(() => {
    if (activeTab !== 'transactions') {
      setTransactions([]);
      setSelectedCustomer(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (autoRefresh && isOnline) {
      const interval = setInterval(refreshAllData, 60000); // 60s instead of 30s
      return () => clearInterval(interval);
    }
  }, [autoRefresh, isOnline, refreshAllData]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (!isOnline) {
          setError('⚠️ Offline mode - showing cached data');
          setLoading(false);
          return;
        }

        await refreshAllData();
      } catch (err) {
        setError(`Failed to load: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, []);

  const filteredCustomers = useMemo(() => 
    customers.filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ), [customers, searchTerm]);

  // Fixed tab change handler
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setError(null);
  }, []);

  // Fixed customer view handler
  const handleViewCustomer = useCallback((name) => {
    setActiveTab('transactions');
    fetchCustomerTransactions(name);
  }, [fetchCustomerTransactions]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Mobile-Optimized Header */}
      <header className="bg-white shadow-md sticky top-0 z-40 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  ERP Ledger
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  {isOnline ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs">
                      <Wifi className="w-3 h-3" />
                      Online
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-orange-600 text-xs">
                      <WifiOff className="w-3 h-3" />
                      Offline
                    </span>
                  )}
                  {lastSync && (
                    <span className="text-xs text-slate-500 hidden sm:inline">
                      {lastSync.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                disabled={!isOnline}
                className={`hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                  autoRefresh ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-700'
                } disabled:opacity-50`}
              >
                Auto: {autoRefresh ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={refreshAllData}
                disabled={loading || !isOnline}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 text-xs sm:text-sm"
              >
                <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync</span>
              </button>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex gap-2 mt-3 pt-3 border-t">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Home },
              { id: 'customers', label: 'Customers', icon: Users },
              { id: 'transactions', label: 'Transactions', icon: FileText },
              { id: 'balance-sheet', label: 'Balance Sheet', icon: BalanceIcon }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === tab.id ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setMobileMenuOpen(false)}>
          <div className="bg-white w-64 h-full shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Menu</h2>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="space-y-2">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: Home },
                { id: 'customers', label: 'Customers', icon: Users },
                { id: 'transactions', label: 'Transactions', icon: FileText },
                { id: 'balance-sheet', label: 'Balance Sheet', icon: BalanceIcon }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
                    activeTab === tab.id ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 mt-3">
          <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {activeTab === 'dashboard' && <DashboardView summary={summary} customers={customers} balanceSheet={balanceSheet} />}
        {activeTab === 'customers' && (
          <CustomersView
            customers={filteredCustomers}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddCustomer={() => setShowAddCustomer(true)}
            onViewCustomer={handleViewCustomer}
            onDeleteCustomer={deleteCustomer}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView
            customer={selectedCustomer}
            transactions={transactions}
            loading={transactionLoading}
            onAddTransaction={() => setShowAddTransaction(true)}
            onEditTransaction={(txn) => { setEditingTransaction(txn); setShowEditTransaction(true); }}
            onDeleteTransaction={deleteTransaction}
            onExport={exportToCSV}
            onBack={() => setActiveTab('customers')}
          />
        )}
        {activeTab === 'balance-sheet' && (
          <BalanceSheetView
            balanceSheet={balanceSheet}
            onViewCustomer={handleViewCustomer}
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
    { title: 'Customers', value: customers.length, icon: Users, gradient: 'from-blue-500 to-blue-600' },
    { title: 'Total DR', value: `Rs. ${summary.totalDr?.toLocaleString() || '0'}`, icon: TrendingUp, gradient: 'from-red-500 to-red-600' },
    { title: 'Total CR', value: `Rs. ${summary.totalCr?.toLocaleString() || '0'}`, icon: TrendingDown, gradient: 'from-green-500 to-green-600' },
    { title: 'Net Position', value: `Rs. ${Math.abs(summary.netPosition || 0).toLocaleString()} ${summary.status || ''}`, icon: DollarSign, gradient: summary.status === 'NET DR' ? 'from-red-500 to-red-600' : summary.status === 'NET CR' ? 'from-green-500 to-green-600' : 'from-blue-500 to-blue-600' }
  ];

  const topCustomers = balanceSheet.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 10);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-md p-4 sm:p-6 hover:shadow-lg transition-all">
            <div className={`inline-flex p-2 sm:p-3 rounded-lg bg-gradient-to-br ${stat.gradient} mb-3`}>
              <stat.icon className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <p className="text-slate-600 text-xs sm:text-sm font-medium">{stat.title}</p>
            <p className="text-lg sm:text-2xl font-bold text-slate-900 mt-1 sm:mt-2 break-words">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Top 10 Balances</h3>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-3 px-3 sm:px-4 font-semibold text-slate-700 text-sm">Customer</th>
                <th className="text-right py-3 px-3 sm:px-4 font-semibold text-slate-700 text-sm">Balance</th>
                <th className="text-center py-3 px-3 sm:px-4 font-semibold text-slate-700 text-sm">Type</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((customer, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-3 sm:px-4 font-medium text-sm">{customer.customerName}</td>
                  <td className="py-3 px-3 sm:px-4 text-right font-semibold text-sm">Rs. {Math.abs(customer.balance).toLocaleString()}</td>
                  <td className="py-3 px-3 sm:px-4 text-center">
                    <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-bold ${customer.drCr === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Customers</h2>
        <button onClick={onAddCustomer} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all shadow-md">
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map((customer, index) => (
          <div key={index} className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-all">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-base font-bold text-slate-900 break-words flex-1">{customer.name}</h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ml-2 flex-shrink-0 ${customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                {customer.status}
              </span>
            </div>
            <div className="space-y-1 text-sm text-slate-600 mb-4">
              <p className="truncate">Sheet: {customer.sheetName}</p>
              <p>Created: {customer.createdDate ? new Date(customer.createdDate).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onViewCustomer(customer.name)} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm">
                <Eye className="w-4 h-4" />
                View
              </button>
              <button onClick={() => onDeleteCustomer(customer.name)} className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {customers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-base sm:text-lg">No customers found</p>
        </div>
      )}
    </div>
  );
}

function TransactionsView({ customer, transactions, loading, onAddTransaction, onEditTransaction, onDeleteTransaction, onExport, onBack }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  if (!customer) {
    return (
      <div className="text-center py-12 bg-white rounded-xl shadow-md">
        <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500 text-base sm:text-lg mb-4">No customer selected</p>
        <button onClick={onBack} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
          Back to Customers
        </button>
      </div>
    );
  }

  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = searchTerm === '' || 
      txn.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.transactionType?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = (!dateFilter.start || txn.date >= dateFilter.start) &&
                       (!dateFilter.end || txn.date <= dateFilter.end);
    
    return matchesSearch && matchesDate;
  });

  if (loading) {
    return (
      <div className="text-center py-12 bg-white rounded-xl shadow-md">
        <RefreshCw className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
        <p className="text-slate-500 text-lg">Loading transactions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{customer.name}</h2>
            <p className="text-slate-600 text-sm mt-1">Transaction Ledger</p>
            <p className="text-xs text-slate-500 mt-1">
              {filteredTransactions.length} of {transactions.length} transactions
            </p>
          </div>
          <div className="text-left sm:text-right w-full sm:w-auto">
            <p className="text-sm text-slate-600">Final Balance</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900">
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pb-6 border-b">
          <div>
            <p className="text-xs sm:text-sm text-slate-600">Total Debit</p>
            <p className="text-base sm:text-lg font-bold text-red-600">
              Rs. {customer.summary?.totalDebit?.toLocaleString() || '0'}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-slate-600">Total Credit</p>
            <p className="text-base sm:text-lg font-bold text-green-600">
              Rs. {customer.summary?.totalCredit?.toLocaleString() || '0'}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-slate-600">Net Position</p>
            <p className="text-base sm:text-lg font-bold text-blue-600">
              Rs. {customer.summary?.netBalance?.toLocaleString() || '0'}
            </p>
            <span className={`text-xs font-medium ${
              customer.summary?.netDRCR === 'DR' ? 'text-red-600' : 'text-green-600'
            }`}>
              {customer.summary?.netDRCR}
            </span>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-slate-600">Transactions</p>
            <p className="text-base sm:text-lg font-bold text-purple-600">
              {customer.summary?.transactionCount || 0}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Start Date</label>
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all text-sm"
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

        <div className="flex flex-wrap gap-2 mt-6">
          <button 
            onClick={onAddTransaction} 
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-md text-sm"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
          <button 
            onClick={onExport} 
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-md text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button 
            onClick={onBack} 
            className="flex-1 sm:flex-none px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all text-sm"
          >
            Back
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[1200px]">
            <thead className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
              <tr>
                <th className="py-2 px-2 text-left font-semibold">S.N</th>
                <th className="py-2 px-2 text-left font-semibold">Date</th>
                <th className="py-2 px-2 text-left font-semibold">Description</th>
                <th className="py-2 px-2 text-left font-semibold">Item</th>
                <th className="py-2 px-2 text-right font-semibold">Qty</th>
                <th className="py-2 px-2 text-right font-semibold">Rate</th>
                <th className="py-2 px-2 text-left font-semibold">Type</th>
                <th className="py-2 px-2 text-left font-semibold">Payment</th>
                <th className="py-2 px-2 text-right font-semibold">Debit</th>
                <th className="py-2 px-2 text-right font-semibold">Credit</th>
                <th className="py-2 px-2 text-right font-semibold">Balance</th>
                <th className="py-2 px-2 text-center font-semibold">DR/CR</th>
                <th className="py-2 px-2 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((txn, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-2 font-medium">{txn.sn || index + 1}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    {txn.date instanceof Date ? txn.date.toLocaleDateString() : txn.date}
                  </td>
                  <td className="py-2 px-2">{txn.description}</td>
                  <td className="py-2 px-2">{txn.item || '-'}</td>
                  <td className="py-2 px-2 text-right font-medium">
                    {txn.weightQty ? parseFloat(txn.weightQty).toLocaleString() : '-'}
                  </td>
                  <td className="py-2 px-2 text-right font-medium">
                    {txn.rate || '-'}
                  </td>
                  <td className="py-2 px-2 text-xs" title={`Raw: ${JSON.stringify({type: txn.transactionType, payment: txn.paymentMethod})}`}>
                    {txn.transactionType || '-'}
                  </td>
                  <td className="py-2 px-2 text-xs">{txn.paymentMethod || '-'}</td>
                  <td className="py-2 px-2 text-right font-semibold text-red-600">
                    {txn.debit && txn.debit !== 0 ? `Rs. ${parseFloat(txn.debit).toLocaleString()}` : '-'}
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-green-600">
                    {txn.credit && txn.credit !== 0 ? `Rs. ${parseFloat(txn.credit).toLocaleString()}` : '-'}
                  </td>
                  <td className="py-2 px-2 text-right font-bold">
                    Rs. {(txn.calculatedBalance || 0).toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      txn.calculatedDrCr === 'DR' ? 'bg-red-100 text-red-700' : 
                      'bg-green-100 text-green-700'
                    }`}>
                      {txn.calculatedDrCr || 'DR'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
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
            <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-base sm:text-lg">
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
    <div className="space-y-4">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Balance Sheet</h2>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
              <tr>
                <th className="py-3 px-3 sm:px-4 text-left text-sm font-semibold">Customer Name</th>
                <th className="py-3 px-3 sm:px-4 text-right text-sm font-semibold">Balance (PKR)</th>
                <th className="py-3 px-3 sm:px-4 text-center text-sm font-semibold">DR/CR</th>
                <th className="py-3 px-3 sm:px-4 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {balanceSheet.map((item, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-3 sm:px-4 font-semibold text-slate-900 text-sm">{item.customerName}</td>
                  <td className="py-3 px-3 sm:px-4 text-right font-bold text-sm">Rs. {Math.abs(item.balance).toLocaleString()}</td>
                  <td className="py-3 px-3 sm:px-4 text-center">
                    <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-bold ${item.drCr === 'DR' ? 'bg-red-100 text-red-700' : item.drCr === 'CR' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                      {item.drCr}
                    </span>
                  </td>
                  <td className="py-3 px-3 sm:px-4 text-center">
                    <button onClick={() => onViewCustomer(item.customerName)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm">
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
            <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-base sm:text-lg">No balance data found</p>
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
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Add Customer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Customer Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="Enter customer name"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Opening Balance</label>
            <input
              type="number"
              step="0.01"
              value={formData.openingBalance}
              onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Color Category</label>
            <select
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
            >
              <option value="none">No Color</option>
              <option value="brown">🟨 Brown/Yellow (Dealers)</option>
              <option value="blue">🟦 Blue (Banks)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all font-semibold disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
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
    transactionType: 'Sale',
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
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Add Transaction</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Customer *</label>
              <select
                required
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select Customer</option>
                {customers.map((c, i) => (
                  <option key={i} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Date *</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Description *</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="Enter transaction description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Item</label>
              <select
                value={formData.item}
                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select Item</option>
                {items.map((item, i) => (
                  <option key={i} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Transaction Type *</label>
              <select
                required
                value={formData.transactionType}
                onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="Sale">Sale</option>
                <option value="Purchase">Purchase</option>
                <option value="Payment Received">Payment Received</option>
                <option value="Payment Given">Payment Given</option>
                <option value="Opening Balance">Opening Balance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Weight/Qty</label>
              <input
                type="number"
                step="0.01"
                value={formData.weightQty}
                onChange={(e) => setFormData({ ...formData, weightQty: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Rate (PKR)</label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all bg-yellow-50"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Jazzcash">Jazzcash</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Bank Name</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Cheque No.</label>
              <input
                type="text"
                value={formData.chequeNo}
                onChange={(e) => setFormData({ ...formData, chequeNo: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Debit/Credit *</label>
            <select
              required
              value={formData.drCr}
              onChange={(e) => setFormData({ ...formData, drCr: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
            >
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all font-semibold disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
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
    transactionType: transaction.transactionType || 'Sale',
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
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Edit Transaction</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Customer *</label>
              <input
                type="text"
                required
                disabled
                value={formData.customerName}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg bg-slate-100 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Date *</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Description *</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              placeholder="Enter transaction description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Item</label>
              <select
                value={formData.item}
                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select Item</option>
                {items.map((item, i) => (
                  <option key={i} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Transaction Type *</label>
              <select
                required
                value={formData.transactionType}
                onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="Sale">Sale</option>
                <option value="Purchase">Purchase</option>
                <option value="Payment Received">Payment Received</option>
                <option value="Payment Given">Payment Given</option>
                <option value="Opening Balance">Opening Balance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Weight/Qty</label>
              <input
                type="number"
                step="0.01"
                value={formData.weightQty}
                onChange={(e) => setFormData({ ...formData, weightQty: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Rate (PKR)</label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all bg-yellow-50"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
              >
                <option value="">Select</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Jazzcash">Jazzcash</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Bank Name</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Cheque No.</label>
              <input
                type="text"
                value={formData.chequeNo}
                onChange={(e) => setFormData({ ...formData, chequeNo: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Debit/Credit *</label>
            <select
              required
              value={formData.drCr}
              onChange={(e) => setFormData({ ...formData, drCr: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-all"
            >
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all font-semibold disabled:opacity-50">
              {loading ? 'Updating...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
