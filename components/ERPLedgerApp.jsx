'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, Users, TrendingUp, TrendingDown, DollarSign, Search, Plus, Eye, X, Edit, Trash2, Download, Upload, Settings, Save } from 'lucide-react';

// API Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbzkUag35Oir80bL6jRx2d_1MaopMs2BexJZaQrDoJO0bCLQONw1jfA79F8eSnyIT2Ef/exec';

// Local storage keys
const LOCAL_STORAGE_KEYS = {
  CUSTOMERS: 'erp_customers',
  TRANSACTIONS: 'erp_transactions_',
  BALANCE_SHEET: 'erp_balance_sheet',
  SUMMARY: 'erp_summary',
  OFFLINE_MODE: 'erp_offline_mode',
  PENDING_SYNC: 'erp_pending_sync'
};

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
  const [offlineMode, setOfflineMode] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [pendingSync, setPendingSync] = useState([]);

  // Load data from local storage
  const loadFromLocalStorage = useCallback(() => {
    try {
      const savedCustomers = localStorage.getItem(LOCAL_STORAGE_KEYS.CUSTOMERS);
      const savedBalanceSheet = localStorage.getItem(LOCAL_STORAGE_KEYS.BALANCE_SHEET);
      const savedSummary = localStorage.getItem(LOCAL_STORAGE_KEYS.SUMMARY);
      const savedOfflineMode = localStorage.getItem(LOCAL_STORAGE_KEYS.OFFLINE_MODE);
      const savedPendingSync = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_SYNC);

      if (savedCustomers) setCustomers(JSON.parse(savedCustomers));
      if (savedBalanceSheet) setBalanceSheet(JSON.parse(savedBalanceSheet));
      if (savedSummary) setSummary(JSON.parse(savedSummary));
      if (savedOfflineMode) setOfflineMode(JSON.parse(savedOfflineMode));
      if (savedPendingSync) setPendingSync(JSON.parse(savedPendingSync));
    } catch (err) {
      console.error('Error loading from local storage:', err);
    }
  }, []);

  // Save data to local storage
  const saveToLocalStorage = useCallback((key, data) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('Error saving to local storage:', err);
    }
  }, []);

  // Toggle offline mode
  const toggleOfflineMode = useCallback(async (mode) => {
    setOfflineMode(mode);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.OFFLINE_MODE, mode);
    
    if (!mode && pendingSync.length > 0) {
      await syncPendingChanges();
    }
  }, [pendingSync, saveToLocalStorage]);

  // Add to pending sync
  const addToPendingSync = useCallback((action, data) => {
    const newPending = [...pendingSync, { action, data, timestamp: new Date().toISOString() }];
    setPendingSync(newPending);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.PENDING_SYNC, newPending);
  }, [pendingSync, saveToLocalStorage]);

  // Sync pending changes when back online
  const syncPendingChanges = useCallback(async () => {
    if (pendingSync.length === 0) return;

    setLoading(true);
    const successes = [];
    const failures = [];

    for (const item of pendingSync) {
      try {
        let result;
        switch (item.action) {
          case 'createCustomer':
            result = await createCustomerAPI(item.data);
            break;
          case 'createTransaction':
            result = await createTransactionAPI(item.data);
            break;
          case 'updateTransaction':
            result = await updateTransactionAPI(item.data);
            break;
          case 'deleteTransaction':
            result = await deleteTransactionAPI(item.data);
            break;
          case 'deleteCustomer':
            result = await deleteCustomerAPI(item.data);
            break;
        }
        if (result.success) {
          successes.push(item);
        } else {
          failures.push(item);
        }
      } catch (err) {
        failures.push(item);
      }
    }

    const newPending = pendingSync.filter(item => 
      !successes.some(success => success.timestamp === item.timestamp)
    );
    setPendingSync(newPending);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.PENDING_SYNC, newPending);

    if (successes.length > 0) {
      await refreshAllData();
    }

    setLoading(false);
  }, [pendingSync, saveToLocalStorage]);

  // Calculate DR/CR summary from balance sheet
  const calculateSummaryFromBalanceSheet = useCallback(() => {
    const totalDr = balanceSheet
      .filter(item => item.drCr === 'DR')
      .reduce((sum, item) => sum + (Math.abs(item.balance) || 0), 0);
    
    const totalCr = balanceSheet
      .filter(item => item.drCr === 'CR')
      .reduce((sum, item) => sum + (Math.abs(item.balance) || 0), 0);
    
    const netPosition = totalDr - totalCr;
    const status = netPosition > 0 ? 'NET DR' : netPosition < 0 ? 'NET CR' : 'BALANCED';
    
    const newSummary = {
      totalDr,
      totalCr,
      netPosition: Math.abs(netPosition),
      status
    };
    
    setSummary(newSummary);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.SUMMARY, newSummary);
    return newSummary;
  }, [balanceSheet, saveToLocalStorage]);

  // Fixed summary calculation for transactions
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

  // Fixed balance calculation function
  const calculateRunningBalance = useCallback((transactions) => {
    let runningBalance = 0;
    
    return transactions.map((txn, index) => {
      const debit = parseFloat(txn.debit) || 0;
      const credit = parseFloat(txn.credit) || 0;
      
      if (index === 0) {
        runningBalance = parseFloat(txn.balance) || 0;
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
  }, []);

  // Wrap refreshAllData in useCallback
  const refreshAllData = useCallback(async () => {
    if (offlineMode) {
      loadFromLocalStorage();
      calculateSummaryFromBalanceSheet();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchCustomers(), fetchBalanceSheet()]);
      calculateSummaryFromBalanceSheet();
      setLastSync(new Date());
    } catch (err) {
      setError('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  }, [offlineMode, loadFromLocalStorage, calculateSummaryFromBalanceSheet]);

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
        const customersData = data.customers || [];
        setCustomers(customersData);
        saveToLocalStorage(LOCAL_STORAGE_KEYS.CUSTOMERS, customersData);
        return customersData;
      }
      throw new Error(data.error || 'Failed to fetch customers');
    } catch (err) {
      if (offlineMode) {
        loadFromLocalStorage();
      } else {
        setError(`Failed to load customers: ${err.message}`);
      }
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
        const balanceData = data.balances || [];
        setBalanceSheet(balanceData);
        saveToLocalStorage(LOCAL_STORAGE_KEYS.BALANCE_SHEET, balanceData);
        return balanceData;
      }
      throw new Error(data.error || 'Failed to fetch balance sheet');
    } catch (err) {
      console.error('Balance sheet error:', err);
      return [];
    }
  };

  // API functions
  const createCustomerAPI = async (customerData) => {
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
    return await response.json();
  };

  const createTransactionAPI = async (transactionData) => {
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
    return await response.json();
  };

  const updateTransactionAPI = async (transactionData) => {
    return { success: true };
  };

  const deleteTransactionAPI = async (transactionData) => {
    return { success: true };
  };

  const deleteCustomerAPI = async (customerData) => {
    return { success: true };
  };

  // Local storage versions (for offline mode)
  const createCustomerLocal = async (customerData) => {
    const newCustomer = {
      ...customerData,
      id: Date.now().toString(),
      createdDate: new Date().toISOString(),
      status: 'Active'
    };
    
    const newCustomers = [...customers, newCustomer];
    setCustomers(newCustomers);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.CUSTOMERS, newCustomers);
    
    addToPendingSync('createCustomer', customerData);
    
    return { success: true };
  };

  const createTransactionLocal = async (transactionData) => {
    const newTransaction = {
      ...transactionData,
      id: Date.now().toString(),
      timestamp: new Date().toISOString()
    };
    
    const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${transactionData.customerName}`;
    const existingTransactions = JSON.parse(localStorage.getItem(customerKey) || '[]');
    const updatedTransactions = [...existingTransactions, newTransaction];
    saveToLocalStorage(customerKey, updatedTransactions);
    
    addToPendingSync('createTransaction', transactionData);
    
    return { success: true };
  };

  // Unified create functions
  const createCustomer = async (customerData) => {
    if (offlineMode) {
      return await createCustomerLocal(customerData);
    } else {
      try {
        const result = await createCustomerAPI(customerData);
        if (result.success) {
          await refreshAllData();
        }
        return result;
      } catch (err) {
        setOfflineMode(true);
        return await createCustomerLocal(customerData);
      }
    }
  };

  const createTransaction = async (transactionData) => {
    if (offlineMode) {
      return await createTransactionLocal(transactionData);
    } else {
      try {
        const result = await createTransactionAPI(transactionData);
        if (result.success) {
          await refreshAllData();
          if (selectedCustomer) {
            await fetchCustomerTransactions(selectedCustomer.name);
          }
        }
        return result;
      } catch (err) {
        setOfflineMode(true);
        return await createTransactionLocal(transactionData);
      }
    }
  };

  // Delete functions
  const deleteCustomer = async (customerName) => {
    if (offlineMode) {
      const newCustomers = customers.filter(c => c.name !== customerName);
      setCustomers(newCustomers);
      saveToLocalStorage(LOCAL_STORAGE_KEYS.CUSTOMERS, newCustomers);
      addToPendingSync('deleteCustomer', { customerName });
      return { success: true };
    } else {
      try {
        const result = await deleteCustomerAPI({ customerName });
        if (result.success) {
          await refreshAllData();
        }
        return result;
      } catch (err) {
        setOfflineMode(true);
        return await deleteCustomer(customerName);
      }
    }
  };

  const deleteTransaction = async (transactionId, customerName) => {
    if (offlineMode) {
      const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${customerName}`;
      const existingTransactions = JSON.parse(localStorage.getItem(customerKey) || '[]');
      const updatedTransactions = existingTransactions.filter(t => t.id !== transactionId);
      saveToLocalStorage(customerKey, updatedTransactions);
      addToPendingSync('deleteTransaction', { transactionId, customerName });
      
      if (selectedCustomer && selectedCustomer.name === customerName) {
        setTransactions(updatedTransactions);
      }
      
      return { success: true };
    } else {
      try {
        const result = await deleteTransactionAPI({ transactionId, customerName });
        if (result.success && selectedCustomer) {
          await fetchCustomerTransactions(selectedCustomer.name);
        }
        return result;
      } catch (err) {
        setOfflineMode(true);
        return await deleteTransaction(transactionId, customerName);
      }
    }
  };

  // FIXED: Column mapping for transactions
  const fetchCustomerTransactions = async (customerName) => {
    if (offlineMode) {
      const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${customerName}`;
      const localTransactions = JSON.parse(localStorage.getItem(customerKey) || '[]');
      const transactionsWithBalance = calculateRunningBalance(localTransactions);
      const summary = calculateTransactionSummary(transactionsWithBalance);
      
      setTransactions(transactionsWithBalance);
      setSelectedCustomer({ name: customerName, summary });
      return transactionsWithBalance;
    }

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
        // FIXED: Proper column mapping based on Google Sheets structure
        const validTransactions = (data.transactions || []).filter(txn => {
          if (txn.description === 'Description' || txn.sn === 'S.N' || txn.date === 'Date') return false;
          if (txn.item === 'NaN' || txn.rate === 'Rs. NaN' || txn.weightQty === 'NaN') return false;
          if (!txn.date || txn.date === '-' || txn.date === '') return false;
          return true;
        }).map((txn, index) => {
          // CORRECT COLUMN MAPPING:
          // Based on your Google Sheets, the data structure is:
          // transactionType is correct
          // paymentMethod comes from bankName column
          // bankName is usually empty
          
          let transactionType = txn.transactionType || '-';
          let paymentMethod = txn.bankName || '-';
          let bankName = '-';
          
          // Clean up transaction types
          if (transactionType === 'Sale/Purchase') {
            transactionType = 'Sale';
          }
          
          // Extract payment method from transaction type if needed
          if (transactionType.includes('Cash')) {
            paymentMethod = 'Cash';
          } else if (transactionType.includes('Bank')) {
            paymentMethod = 'Bank Transfer';
          } else if (transactionType.includes('Cheque')) {
            paymentMethod = 'Cheque';
          }
          
          return {
            ...txn,
            sn: txn.sn && !isNaN(txn.sn) ? parseInt(txn.sn) : index + 1,
            debit: txn.debit ? parseFloat(txn.debit.toString().replace(/[^\d.-]/g, '')) || 0 : 0,
            credit: txn.credit ? parseFloat(txn.credit.toString().replace(/[^\d.-]/g, '')) || 0 : 0,
            balance: txn.balance ? parseFloat(txn.balance.toString().replace(/[^\d.-]/g, '')) || 0 : 0,
            weightQty: txn.weightQty && txn.weightQty !== 'NaN' ? txn.weightQty : '',
            rate: txn.rate && txn.rate !== 'Rs. NaN' ? txn.rate : '',
            item: txn.item && txn.item !== 'NaN' ? txn.item : '',
            // CORRECTED COLUMN MAPPING:
            transactionType: transactionType,
            paymentMethod: paymentMethod,
            bankName: bankName,
            chequeNo: txn.chequeNo || '-'
          };
        });
        
        const transactionsWithBalance = calculateRunningBalance(validTransactions);
        const summary = calculateTransactionSummary(transactionsWithBalance);
        
        const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${customerName}`;
        saveToLocalStorage(customerKey, transactionsWithBalance);
        
        setTransactions(transactionsWithBalance);
        setSelectedCustomer({ name: customerName, summary });
        return transactionsWithBalance;
      }
      throw new Error(data.error || 'Failed to fetch transactions');
    } catch (err) {
      setError('Failed to fetch transactions: ' + err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Export data
  const exportData = () => {
    const data = {
      customers,
      balanceSheet,
      summary,
      transactions: transactions.reduce((acc, txn) => {
        const customer = txn.customerName || selectedCustomer?.name;
        if (customer) {
          if (!acc[customer]) acc[customer] = [];
          acc[customer].push(txn);
        }
        return acc;
      }, {}),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erp-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import data
  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        if (data.customers) {
          setCustomers(data.customers);
          saveToLocalStorage(LOCAL_STORAGE_KEYS.CUSTOMERS, data.customers);
        }
        if (data.balanceSheet) {
          setBalanceSheet(data.balanceSheet);
          saveToLocalStorage(LOCAL_STORAGE_KEYS.BALANCE_SHEET, data.balanceSheet);
        }
        if (data.summary) {
          setSummary(data.summary);
          saveToLocalStorage(LOCAL_STORAGE_KEYS.SUMMARY, data.summary);
        }
        if (data.transactions) {
          Object.entries(data.transactions).forEach(([customerName, customerTransactions]) => {
            const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${customerName}`;
            saveToLocalStorage(customerKey, customerTransactions);
          });
        }
        
        alert('Data imported successfully!');
      } catch (err) {
        alert('Error importing data: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && !offlineMode) {
      const interval = setInterval(refreshAllData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, offlineMode, refreshAllData]);

  // Initial data load effect
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
      
      if (offlineMode) {
        loadFromLocalStorage();
        calculateSummaryFromBalanceSheet();
        setLoading(false);
        return;
      }
      
      try {
        const testResponse = await fetch(`${API_URL}?method=ping`, {
          method: 'GET',
          mode: 'cors',
          headers: { 'Accept': 'application/json' }
        }).catch(() => null);
        
        if (!testResponse || !testResponse.ok) {
          setOfflineMode(true);
          loadFromLocalStorage();
          calculateSummaryFromBalanceSheet();
          setLoading(false);
          return;
        }
        
        await refreshAllData();
      } catch (err) {
        setOfflineMode(true);
        loadFromLocalStorage();
        calculateSummaryFromBalanceSheet();
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, [loadFromLocalStorage, offlineMode, refreshAllData, calculateSummaryFromBalanceSheet]);

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
              <p className="text-sm text-gray-600 mt-1">
                {offlineMode ? '🔴 OFFLINE MODE' : '🟢 ONLINE'} • 
                Synced with Google Sheets • {lastSync && `Last sync: ${lastSync.toLocaleTimeString()}`}
                {pendingSync.length > 0 && ` • ${pendingSync.length} pending sync(s)`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`px-3 py-2 rounded-lg font-medium transition-all ${
                  showAdminPanel ? 'bg-purple-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleOfflineMode(!offlineMode)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  offlineMode ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                {offlineMode ? 'Go Online' : 'Go Offline'}
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  autoRefresh ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                }`}
              >
                Auto: {autoRefresh ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={refreshAllData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Admin Panel */}
          {showAdminPanel && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-yellow-800">Admin Panel</h3>
                <div className="flex gap-2">
                  <button
                    onClick={exportData}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                  <label className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Import
                    <input
                      type="file"
                      accept=".json"
                      onChange={importData}
                      className="hidden"
                    />
                  </label>
                  {pendingSync.length > 0 && !offlineMode && (
                    <button
                      onClick={syncPendingChanges}
                      className="flex items-center gap-2 px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
                    >
                      <Save className="w-4 h-4" />
                      Sync ({pendingSync.length})
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-yellow-700">
                Offline Mode: {offlineMode ? 'Enabled' : 'Disabled'} | 
                Pending Sync: {pendingSync.length} | 
                Local Storage: {Math.round(JSON.stringify(localStorage).length / 1024)}KB
              </p>
            </div>
          )}

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
                <p className="font-medium text-red-800">Connection Error</p>
                <pre className="text-red-700 text-sm mt-2 whitespace-pre-wrap font-mono">{error}</pre>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => { setError(null); refreshAllData(); }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-medium">
                    Retry Connection
                  </button>
                  <button onClick={() => window.open(API_URL, '_blank')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium">
                    Open API & Authorize
                  </button>
                </div>
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
            offlineMode={offlineMode}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView
            customer={selectedCustomer}
            transactions={transactions}
            onAddTransaction={() => setShowAddTransaction(true)}
            onBack={() => setSelectedCustomer(null)}
            onDeleteTransaction={deleteTransaction}
            offlineMode={offlineMode}
          />
        )}
        {activeTab === 'balance-sheet' && (
          <BalanceSheetView
            balanceSheet={balanceSheet}
            onViewCustomer={(name) => { fetchCustomerTransactions(name); setActiveTab('transactions'); }}
          />
        )}
      </main>

      {showAddCustomer && (
        <AddCustomerModal 
          onClose={() => setShowAddCustomer(false)} 
          onSubmit={createCustomer} 
          loading={loading} 
        />
      )}
      {showAddTransaction && (
        <AddTransactionModal 
          customers={customers} 
          selectedCustomer={selectedCustomer?.name} 
          onClose={() => setShowAddTransaction(false)} 
          onSubmit={createTransaction} 
          loading={loading} 
        />
      )}
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

function CustomersView({ customers, searchTerm, setSearchTerm, onAddCustomer, onViewCustomer, onDeleteCustomer, offlineMode }) {
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (customerName) => {
    if (!window.confirm(`Are you sure you want to delete customer "${customerName}"? This will also delete all their transactions.`)) {
      return;
    }

    setDeleting(customerName);
    try {
      await onDeleteCustomer(customerName);
    } catch (err) {
      alert('Error deleting customer: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

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
              <div className="flex gap-1">
                <span className={`px-2 py-1 rounded text-xs font-bold ${customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                  {customer.status}
                </span>
                {offlineMode && (
                  <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-700">
                    Offline
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600 mb-4">
              <p>Sheet: {customer.sheetName}</p>
              <p>Created: {customer.createdDate ? new Date(customer.createdDate).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onViewCustomer(customer.name)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
                <Eye className="w-4 h-4" />
                View Ledger
              </button>
              <button 
                onClick={() => handleDelete(customer.name)}
                disabled={deleting === customer.name}
                className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all disabled:opacity-50"
              >
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

function TransactionsView({ customer, transactions, onAddTransaction, onBack, onDeleteTransaction, offlineMode }) {
  const [deleting, setDeleting] = useState(null);

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

  const handleDelete = async (transactionId) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    setDeleting(transactionId);
    try {
      await onDeleteTransaction(transactionId, customer.name);
    } catch (err) {
      alert('Error deleting transaction: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  // Calculate running balance properly
  const calculateRunningBalance = (transactions) => {
    let runningBalance = 0;
    
    return transactions.map((txn, index) => {
      const debit = parseFloat(txn.debit) || 0;
      const credit = parseFloat(txn.credit) || 0;
      
      if (index === 0) {
        runningBalance = parseFloat(txn.balance) || 0;
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

  const transactionsWithBalance = calculateRunningBalance(transactions);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{customer.name}</h2>
            <p className="text-gray-600 mt-1">Transaction Ledger</p>
            <p className="text-sm text-gray-500 mt-1">
              Showing {transactions.length} valid transactions
              {offlineMode && ' • 🔴 OFFLINE MODE'}
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

        <div className="flex gap-3 mt-6">
          <button 
            onClick={onAddTransaction} 
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
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
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
              <tr>
                <th className="py-3 px-4 text-left text-sm font-semibold">S.N</th>
                <th className="py-3 px-4 text-left text-sm font-semibold">Date</th>
                <th className="py-3 px-4 text-left text-sm font-semibold">Description</th>
                <th className="py-3 px-4 text-left text-sm font-semibold">Item</th>
                <th className="py-3 px-4 text-right text-sm font-semibold">Weight/Qty</th>
                <th className="py-3 px-4 text-right text-sm font-semibold">Rate</th>
                <th className="py-3 px-4 text-left text-sm font-semibold">Type</th>
                <th className="py-3 px-4 text-left text-sm font-semibold">Payment</th>
                <th className="py-3 px-4 text-left text-sm font-semibold">Bank</th>
                <th className="py-3 px-4 text-left text-sm font-semibold">Cheque No</th>
                <th className="py-3 px-4 text-right text-sm font-semibold">Debit</th>
                <th className="py-3 px-4 text-right text-sm font-semibold">Credit</th>
                <th className="py-3 px-4 text-right text-sm font-semibold">Balance</th>
                <th className="py-3 px-4 text-center text-sm font-semibold">DR/CR</th>
                <th className="py-3 px-4 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactionsWithBalance.map((txn, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium">{txn.sn || index + 1}</td>
                  <td className="py-3 px-4 text-sm">
                    {txn.date instanceof Date ? txn.date.toLocaleDateString() : txn.date}
                  </td>
                  <td className="py-3 px-4 text-sm">{txn.description}</td>
                  <td className="py-3 px-4 text-sm">{txn.item || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium">
                    {txn.weightQty ? parseFloat(txn.weightQty).toLocaleString() : '-'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium">
                    {txn.rate ? txn.rate : '-'}
                  </td>
                  <td className="py-3 px-4 text-sm">{txn.transactionType || '-'}</td>
                  <td className="py-3 px-4 text-sm">{txn.paymentMethod || '-'}</td>
                  <td className="py-3 px-4 text-sm">{txn.bankName || '-'}</td>
                  <td className="py-3 px-4 text-sm">{txn.chequeNo || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-red-600">
                    {txn.debit && txn.debit !== 0 ? `Rs. ${parseFloat(txn.debit).toLocaleString()}` : '-'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-green-600">
                    {txn.credit && txn.credit !== 0 ? `Rs. ${parseFloat(txn.credit).toLocaleString()}` : '-'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-bold">
                    Rs. {(txn.calculatedBalance || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      txn.calculatedDrCr === 'DR' ? 'bg-red-100 text-red-700' : 
                      'bg-green-100 text-green-700'
                    }`}>
                      {txn.calculatedDrCr || 'DR'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button 
                      onClick={() => handleDelete(txn.id)}
                      disabled={deleting === txn.id}
                      className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                      title="Delete Transaction"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {transactions.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No transactions found</p>
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
    transactionType: 'Sale',
    paymentMethod: '',
    bankName: '',
    chequeNo: '',
    drCr: 'Debit',
    amount: ''
  });

  const items = [
    'Chilled Gots', 'Chilled Scrape', 'Guides', 'Chilled Rolls',
    'Fire Bricks', 'H Oil', 'Magnese', 'Chrome',
    'Black Scrape', 'White Scrape', 'Toka Scrape', 'Pig Scrape'
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
                <option value="Payment Received - Cash">Payment Received - Cash</option>
                <option value="Payment Received - Bank">Payment Received - Bank</option>
                <option value="Payment Given - Cash">Payment Given - Cash</option>
                <option value="Payment Given - Bank">Payment Given - Bank</option>
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">Debit/Credit</label>
            <select
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
