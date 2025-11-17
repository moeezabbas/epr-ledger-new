'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, RefreshCw, Users, TrendingUp, TrendingDown, DollarSign, Search, Plus, Eye, X, Trash2, Download, Upload, Settings, Save, Menu, ChevronLeft } from 'lucide-react';

// API Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbzkUag35Oir80bL6jRx2d_1MaopMs2BexJZaQrDoJO0bCLQONw1jfA79F8eSnyIT2Ef/exec';

// Local storage keys
const LOCAL_STORAGE_KEYS = {
  CUSTOMERS: 'erp_customers_v2',
  TRANSACTIONS: 'erp_transactions_v2_',
  BALANCE_SHEET: 'erp_balance_sheet_v2',
  SUMMARY: 'erp_summary_v2',
  OFFLINE_MODE: 'erp_offline_mode',
  PENDING_SYNC: 'erp_pending_sync_v2',
  LAST_SYNC: 'erp_last_sync'
};

// Custom hook for local storage with performance optimization
const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      if (typeof window === 'undefined') return initialValue;
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      setStoredValue(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue];
};

// Optimized data parser
const DataParser = {
  parseMoney: (value) => {
    if (!value) return 0;
    const str = value.toString();
    const cleaned = str.replace(/Rs\.\s?/g, '').replace(/,/g, '').trim();
    return parseFloat(cleaned) || 0;
  },

  parseNumber: (value) => {
    if (!value || value === 'NaN' || value === '-') return 0;
    return parseFloat(value.toString().replace(/,/g, '')) || 0;
  },

  cleanText: (value) => {
    if (!value || value === 'NaN') return '';
    return value.toString().trim();
  }
};

export default function ERPLedgerApp() {
  const [customers, setCustomers] = useLocalStorage(LOCAL_STORAGE_KEYS.CUSTOMERS, []);
  const [balanceSheet, setBalanceSheet] = useLocalStorage(LOCAL_STORAGE_KEYS.BALANCE_SHEET, []);
  const [summary, setSummary] = useLocalStorage(LOCAL_STORAGE_KEYS.SUMMARY, { totalDr: 0, totalCr: 0, netPosition: 0, status: 'BALANCED' });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false); // Off by default for performance
  const [lastSync, setLastSync] = useLocalStorage(LOCAL_STORAGE_KEYS.LAST_SYNC, null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [offlineMode, setOfflineMode] = useLocalStorage(LOCAL_STORAGE_KEYS.OFFLINE_MODE, false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [pendingSync, setPendingSync] = useLocalStorage(LOCAL_STORAGE_KEYS.PENDING_SYNC, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Memoized calculations
  const filteredCustomers = useMemo(() => {
    return customers.filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [customers, searchTerm]);

  const topCustomers = useMemo(() => {
    return balanceSheet
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 10);
  }, [balanceSheet]);

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
    return newSummary;
  }, [balanceSheet, setSummary]);

  // Fixed balance calculation function
  const calculateRunningBalance = useCallback((transactions) => {
    let runningBalance = 0;
    
    return transactions.map((txn, index) => {
      const debit = DataParser.parseMoney(txn.debit);
      const credit = DataParser.parseMoney(txn.credit);
      
      if (index === 0) {
        runningBalance = DataParser.parseMoney(txn.balance);
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
    
    const totalDebit = transactions.reduce((sum, txn) => sum + DataParser.parseMoney(txn.debit), 0);
    const totalCredit = transactions.reduce((sum, txn) => sum + DataParser.parseMoney(txn.credit), 0);
    
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

  // Toggle offline mode
  const toggleOfflineMode = useCallback(async (mode) => {
    setOfflineMode(mode);
    if (!mode && pendingSync.length > 0) {
      await syncPendingChanges();
    }
  }, [pendingSync, setOfflineMode]);

  // Add to pending sync
  const addToPendingSync = useCallback((action, data) => {
    const newPending = [...pendingSync, { 
      action, 
      data, 
      timestamp: new Date().toISOString(),
      id: Date.now().toString()
    }];
    setPendingSync(newPending);
  }, [pendingSync, setPendingSync]);

  // Sync pending changes
  const syncPendingChanges = useCallback(async () => {
    if (pendingSync.length === 0 || offlineMode) return;

    setLoading(true);
    const successes = [];
    
    // Process sync in batches for better performance
    const batchSize = 5;
    for (let i = 0; i < pendingSync.length; i += batchSize) {
      const batch = pendingSync.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            // Simulate API calls - implement actual API calls here
            await new Promise(resolve => setTimeout(resolve, 100));
            return { ...item, success: true };
          } catch (error) {
            return { ...item, success: false, error };
          }
        })
      );
      
      successes.push(...batchResults.filter(result => result.value?.success).map(result => result.value));
    }

    // Update pending sync list
    const newPending = pendingSync.filter(item => 
      !successes.some(success => success.id === item.id)
    );
    setPendingSync(newPending);

    if (successes.length > 0) {
      await refreshAllData();
    }

    setLoading(false);
  }, [pendingSync, offlineMode, setPendingSync]);

  // Optimized data fetching with caching
  const fetchWithCache = useCallback(async (url, cacheKey, setData) => {
    // Check cache first
    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(`${cacheKey}_time`);
    const isCacheValid = cacheTime && (Date.now() - parseInt(cacheTime)) < 300000; // 5 minutes
    
    if (isCacheValid && cached) {
      setData(JSON.parse(cached));
      return JSON.parse(cached);
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (data.success) {
        const resultData = data[cacheKey.includes('customers') ? 'customers' : 'balances'] || [];
        setData(resultData);
        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify(resultData));
        localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
        return resultData;
      }
      throw new Error(data.error || 'Failed to fetch data');
    } catch (err) {
      if (cached && isCacheValid) {
        setData(JSON.parse(cached));
        return JSON.parse(cached);
      }
      throw err;
    }
  }, []);

  // Main data refresh
  const refreshAllData = useCallback(async () => {
    if (offlineMode) {
      calculateSummaryFromBalanceSheet();
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchWithCache(`${API_URL}?method=getCustomers`, LOCAL_STORAGE_KEYS.CUSTOMERS, setCustomers),
        fetchWithCache(`${API_URL}?method=getBalanceSheet`, LOCAL_STORAGE_KEYS.BALANCE_SHEET, setBalanceSheet)
      ]);
      
      calculateSummaryFromBalanceSheet();
      setLastSync(new Date());
    } catch (err) {
      setError('Failed to refresh data');
      console.error('Refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, [offlineMode, fetchWithCache, calculateSummaryFromBalanceSheet, setLastSync, setCustomers, setBalanceSheet]);

  // FIXED: Correct transaction fetching with proper column mapping
  const fetchCustomerTransactions = useCallback(async (customerName) => {
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
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (data.success) {
        // CORRECT COLUMN MAPPING - Based on actual Google Sheets structure
        const validTransactions = (data.transactions || []).filter(txn => {
          if (txn.description === 'Description' || txn.sn === 'S.N' || txn.date === 'Date') return false;
          if (txn.item === 'NaN' || txn.rate === 'Rs. NaN' || txn.weightQty === 'NaN') return false;
          if (!txn.date || txn.date === '-' || txn.date === '') return false;
          if (txn.description?.includes('LEDGER')) return false;
          return true;
        }).map((txn, index) => {
          // Parse and clean data
          const transactionType = DataParser.cleanText(txn.transactionType);
          let paymentMethod = DataParser.cleanText(txn.paymentMethod);
          let bankName = DataParser.cleanText(txn.bankName);
          const chequeNo = DataParser.cleanText(txn.chequeNo);

          // Fix column mapping issues
          if (bankName && (bankName.includes('Cash') || bankName.includes('Bank') || bankName.includes('Cheque'))) {
            paymentMethod = bankName;
            bankName = '-';
          }

          if (chequeNo && (chequeNo.includes('Bank') || chequeNo.length > 10)) {
            bankName = chequeNo;
          }

          // Auto-detect payment method from transaction type
          if (!paymentMethod || paymentMethod === '-') {
            if (transactionType.includes('Cash')) paymentMethod = 'Cash';
            else if (transactionType.includes('Bank')) paymentMethod = 'Bank Transfer';
            else if (transactionType.includes('Cheque')) paymentMethod = 'Cheque';
          }

          return {
            ...txn,
            id: txn.id || `txn_${Date.now()}_${index}`,
            sn: txn.sn && !isNaN(txn.sn) ? parseInt(txn.sn) : index + 1,
            debit: DataParser.parseMoney(txn.debit),
            credit: DataParser.parseMoney(txn.credit),
            balance: DataParser.parseMoney(txn.balance),
            weightQty: DataParser.cleanText(txn.weightQty),
            rate: DataParser.cleanText(txn.rate?.replace('Rs. ', '')),
            item: DataParser.cleanText(txn.item),
            transactionType: transactionType === 'Sale/Purchase' ? 'Sale' : transactionType,
            paymentMethod,
            bankName: bankName || '-',
            chequeNo: chequeNo || '-',
            customerName
          };
        });

        const transactionsWithBalance = calculateRunningBalance(validTransactions);
        const summary = calculateTransactionSummary(transactionsWithBalance);
        
        // Cache transactions
        const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${customerName}`;
        localStorage.setItem(customerKey, JSON.stringify(transactionsWithBalance));
        
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
  }, [offlineMode, calculateRunningBalance, calculateTransactionSummary]);

  // Create operations
  const createCustomer = useCallback(async (customerData) => {
    const newCustomer = {
      ...customerData,
      id: `cust_${Date.now()}`,
      createdDate: new Date().toISOString(),
      status: 'Active',
      sheetName: customerData.name
    };
    
    const newCustomers = [...customers, newCustomer];
    setCustomers(newCustomers);
    addToPendingSync('createCustomer', customerData);
    
    return { success: true };
  }, [customers, setCustomers, addToPendingSync]);

  const createTransaction = useCallback(async (transactionData) => {
    const newTransaction = {
      ...transactionData,
      id: `txn_${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    
    const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${transactionData.customerName}`;
    const existingTransactions = JSON.parse(localStorage.getItem(customerKey) || '[]');
    const updatedTransactions = [...existingTransactions, newTransaction];
    localStorage.setItem(customerKey, JSON.stringify(updatedTransactions));
    
    addToPendingSync('createTransaction', transactionData);
    
    // Update UI if viewing same customer
    if (selectedCustomer && selectedCustomer.name === transactionData.customerName) {
      const transactionsWithBalance = calculateRunningBalance(updatedTransactions);
      const summary = calculateTransactionSummary(transactionsWithBalance);
      setTransactions(transactionsWithBalance);
      setSelectedCustomer(prev => ({ ...prev, summary }));
    }
    
    return { success: true };
  }, [selectedCustomer, calculateRunningBalance, calculateTransactionSummary, addToPendingSync]);

  // Delete operations
  const deleteCustomer = useCallback(async (customerName) => {
    const newCustomers = customers.filter(c => c.name !== customerName);
    setCustomers(newCustomers);
    addToPendingSync('deleteCustomer', { customerName });
    return { success: true };
  }, [customers, setCustomers, addToPendingSync]);

  const deleteTransaction = useCallback(async (transactionId, customerName) => {
    const customerKey = `${LOCAL_STORAGE_KEYS.TRANSACTIONS}${customerName}`;
    const existingTransactions = JSON.parse(localStorage.getItem(customerKey) || '[]');
    const updatedTransactions = existingTransactions.filter(t => t.id !== transactionId);
    localStorage.setItem(customerKey, JSON.stringify(updatedTransactions));
    addToPendingSync('deleteTransaction', { transactionId, customerName });
    
    if (selectedCustomer && selectedCustomer.name === customerName) {
      const transactionsWithBalance = calculateRunningBalance(updatedTransactions);
      const summary = calculateTransactionSummary(transactionsWithBalance);
      setTransactions(transactionsWithBalance);
      setSelectedCustomer(prev => ({ ...prev, summary }));
    }
    
    return { success: true };
  }, [selectedCustomer, calculateRunningBalance, calculateTransactionSummary, addToPendingSync]);

  // Export/Import
  const exportData = useCallback(() => {
    const data = {
      customers,
      balanceSheet,
      summary,
      exportDate: new Date().toISOString(),
      version: '2.0'
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
  }, [customers, balanceSheet, summary]);

  const importData = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.customers) setCustomers(data.customers);
        if (data.balanceSheet) setBalanceSheet(data.balanceSheet);
        if (data.summary) setSummary(data.summary);
        alert('Data imported successfully!');
      } catch (err) {
        alert('Error importing data: ' + err.message);
      }
    };
    reader.readAsText(file);
  }, [setCustomers, setBalanceSheet, setSummary]);

  // Effects
  useEffect(() => {
    if (autoRefresh && !offlineMode) {
      const interval = setInterval(refreshAllData, 60000); // 1 minute for better performance
      return () => clearInterval(interval);
    }
  }, [autoRefresh, offlineMode, refreshAllData]);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      if (offlineMode) {
        calculateSummaryFromBalanceSheet();
        setLoading(false);
        return;
      }
      
      try {
        await refreshAllData();
      } catch (err) {
        setOfflineMode(true);
        calculateSummaryFromBalanceSheet();
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, [offlineMode, refreshAllData, calculateSummaryFromBalanceSheet, setOfflineMode]);

  // Mobile responsive breakpoint
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center gap-3">
              {isMobile && activeTab !== 'dashboard' && (
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="p-2 text-gray-600 hover:text-gray-900"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  ERP Ledger
                </h1>
                <p className="text-xs text-gray-500">
                  {offlineMode ? '🔴 Offline' : '🟢 Online'} • 
                  {lastSync && ` Synced: ${new Date(lastSync).toLocaleTimeString()}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {!isMobile && (
                <>
                  <button
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className={`p-2 rounded-lg transition-all ${
                      showAdminPanel ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleOfflineMode(!offlineMode)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      offlineMode ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                    }`}
                  >
                    {offlineMode ? 'Offline' : 'Online'}
                  </button>
                </>
              )}
              
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-gray-600 hover:text-gray-900 lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <button
                onClick={refreshAllData}
                disabled={loading}
                className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Admin Panel */}
          {showAdminPanel && !isMobile && (
            <div className="pb-3">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <span className="text-sm font-medium text-yellow-800">Admin Panel</span>
                  <div className="flex gap-2">
                    <button
                      onClick={exportData}
                      className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                    <label className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 cursor-pointer">
                      <Upload className="w-3 h-3" />
                      Import
                      <input type="file" accept=".json" onChange={importData} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className={`flex gap-1 border-t pt-3 ${isMobile ? 'overflow-x-auto pb-2' : ''}`}>
            {['dashboard', 'customers', 'transactions', 'balance-sheet'].map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setMobileMenuOpen(false);
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab 
                    ? 'bg-blue-500 text-white shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute top-0 right-0 w-64 h-full bg-white shadow-lg transform transition-transform">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <button
                onClick={() => toggleOfflineMode(!offlineMode)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  offlineMode ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                }`}
              >
                {offlineMode ? 'Switch to Online' : 'Switch to Offline'}
              </button>
              <button
                onClick={exportData}
                className="w-full flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
              >
                <Download className="w-4 h-4" />
                Export Data
              </button>
              <label className="w-full flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 cursor-pointer">
                <Upload className="w-4 h-4" />
                Import Data
                <input type="file" accept=".json" onChange={importData} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 mt-3">
          <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-red-700 text-xs mt-1">{error}</p>
                <div className="mt-2 flex gap-2">
                  <button 
                    onClick={() => { setError(null); refreshAllData(); }} 
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  >
                    Retry
                  </button>
                  <button 
                    onClick={() => setError(null)} 
                    className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {activeTab === 'dashboard' && (
          <DashboardView 
            summary={summary} 
            customers={customers} 
            balanceSheet={balanceSheet}
            topCustomers={topCustomers}
            isMobile={isMobile}
          />
        )}
        {activeTab === 'customers' && (
          <CustomersView
            customers={filteredCustomers}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddCustomer={() => setShowAddCustomer(true)}
            onViewCustomer={(name) => { 
              fetchCustomerTransactions(name); 
              setActiveTab('transactions'); 
            }}
            onDeleteCustomer={deleteCustomer}
            offlineMode={offlineMode}
            isMobile={isMobile}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView
            customer={selectedCustomer}
            transactions={transactions}
            onAddTransaction={() => setShowAddTransaction(true)}
            onBack={() => {
              setSelectedCustomer(null);
              setActiveTab('customers');
            }}
            onDeleteTransaction={deleteTransaction}
            offlineMode={offlineMode}
            isMobile={isMobile}
          />
        )}
        {activeTab === 'balance-sheet' && (
          <BalanceSheetView
            balanceSheet={balanceSheet}
            onViewCustomer={(name) => { 
              fetchCustomerTransactions(name); 
              setActiveTab('transactions'); 
            }}
            isMobile={isMobile}
          />
        )}
      </main>

      {/* Modals */}
      {showAddCustomer && (
        <AddCustomerModal 
          onClose={() => setShowAddCustomer(false)} 
          onSubmit={createCustomer} 
          loading={loading} 
          isMobile={isMobile}
        />
      )}
      {showAddTransaction && (
        <AddTransactionModal 
          customers={customers} 
          selectedCustomer={selectedCustomer?.name} 
          onClose={() => setShowAddTransaction(false)} 
          onSubmit={createTransaction} 
          loading={loading}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

// Dashboard Component
function DashboardView({ summary, customers, balanceSheet, topCustomers, isMobile }) {
  const stats = useMemo(() => [
    { 
      title: 'Total Customers', 
      value: customers.length, 
      icon: Users, 
      gradient: 'from-blue-500 to-blue-600',
      change: '+2%'
    },
    { 
      title: 'Total DR Balance', 
      value: `Rs. ${summary.totalDr?.toLocaleString() || '0'}`, 
      icon: TrendingUp, 
      gradient: 'from-red-500 to-red-600',
      change: '+5%'
    },
    { 
      title: 'Total CR Balance', 
      value: `Rs. ${summary.totalCr?.toLocaleString() || '0'}`, 
      icon: TrendingDown, 
      gradient: 'from-green-500 to-green-600',
      change: '-3%'
    },
    { 
      title: 'Net Position', 
      value: `Rs. ${Math.abs(summary.netPosition || 0).toLocaleString()}`, 
      icon: DollarSign, 
      gradient: summary.status === 'NET DR' ? 'from-red-500 to-red-600' : summary.status === 'NET CR' ? 'from-green-500 to-green-600' : 'from-blue-500 to-blue-600',
      status: summary.status
    }
  ], [summary, customers.length]);

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${stat.gradient} mb-3`}>
              <stat.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-gray-600 text-xs font-medium truncate">{stat.title}</p>
            <p className="text-lg font-bold text-gray-900 truncate">{stat.value}</p>
            {stat.status && (
              <p className="text-xs font-medium mt-1">
                <span className={stat.status === 'NET DR' ? 'text-red-600' : stat.status === 'NET CR' ? 'text-green-600' : 'text-blue-600'}>
                  {stat.status}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Top Customers */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Top Customer Balances</h3>
        </div>
        <div className="overflow-hidden">
          <div className={`grid ${isMobile ? 'grid-cols-3' : 'grid-cols-4'} gap-4 p-4 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500`}>
            <span>Customer</span>
            <span className="text-right">Balance</span>
            <span className="text-center">DR/CR</span>
            {!isMobile && <span className="text-center">Status</span>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {topCustomers.map((customer, index) => (
              <div key={index} className="border-b border-gray-100 last:border-b-0">
                <div className={`grid ${isMobile ? 'grid-cols-3' : 'grid-cols-4'} gap-4 p-4 items-center hover:bg-gray-50`}>
                  <span className="font-medium text-sm truncate" title={customer.customerName}>
                    {customer.customerName}
                  </span>
                  <span className="text-right font-semibold text-sm">
                    Rs. {Math.abs(customer.balance).toLocaleString()}
                  </span>
                  <div className="text-center">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                      customer.drCr === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {customer.drCr}
                    </span>
                  </div>
                  {!isMobile && (
                    <div className="text-center">
                      <span className="text-xs text-gray-500">Active</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Customers Component
function CustomersView({ customers, searchTerm, setSearchTerm, onAddCustomer, onViewCustomer, onDeleteCustomer, offlineMode, isMobile }) {
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (customerName) => {
    if (!window.confirm(`Delete customer "${customerName}" and all their transactions?`)) return;
    setDeleting(customerName);
    try {
      await onDeleteCustomer(customerName);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900">Customers</h2>
        <button 
          onClick={onAddCustomer}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all shadow-sm w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
        />
      </div>

      {/* Customers Grid */}
      {customers.length > 0 ? (
        <div className="grid gap-3">
          {customers.map((customer) => (
            <div key={customer.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">{customer.name}</h3>
                <div className="flex gap-1 flex-shrink-0">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {customer.status}
                  </span>
                  {offlineMode && (
                    <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-700">
                      Offline
                    </span>
                  )}
                </div>
              </div>
              
              <div className="space-y-1 text-sm text-gray-600 mb-4">
                <p className="truncate">Sheet: {customer.sheetName}</p>
                <p>Created: {customer.createdDate ? new Date(customer.createdDate).toLocaleDateString() : 'N/A'}</p>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => onViewCustomer(customer.name)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm"
                >
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
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No customers found</p>
          {searchTerm && (
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search</p>
          )}
        </div>
      )}
    </div>
  );
}

// Transactions Component
function TransactionsView({ customer, transactions, onAddTransaction, onBack, onDeleteTransaction, offlineMode, isMobile }) {
  const [deleting, setDeleting] = useState(null);

  if (!customer) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-4">No customer selected</p>
        <button onClick={onBack} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
          Back to Customers
        </button>
      </div>
    );
  }

  const handleDelete = async (transactionId) => {
    if (!window.confirm('Delete this transaction?')) return;
    setDeleting(transactionId);
    try {
      await onDeleteTransaction(transactionId, customer.name);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  const visibleTransactions = isMobile ? transactions.slice(0, 20) : transactions;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-gray-900 truncate">{customer.name}</h2>
            </div>
            <p className="text-gray-600 text-sm">Transaction Ledger • {transactions.length} records</p>
            {offlineMode && (
              <p className="text-xs text-yellow-600 mt-1">🔴 Offline Mode</p>
            )}
          </div>
          
          <div className="text-right">
            <p className="text-sm text-gray-600">Balance</p>
            <p className="text-xl font-bold text-gray-900">
              Rs. {customer.summary?.finalBalance?.toLocaleString() || '0'}
            </p>
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold mt-1 ${
              customer.summary?.finalDRCR === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {customer.summary?.finalDRCR || 'DR'}
            </span>
          </div>
        </div>

        {/* Summary */}
        <div className={`grid gap-4 mt-4 pt-4 border-t border-gray-200 ${
          isMobile ? 'grid-cols-2' : 'grid-cols-4'
        }`}>
          <div>
            <p className="text-xs text-gray-600">Total Debit</p>
            <p className="text-sm font-semibold text-red-600">
              Rs. {customer.summary?.totalDebit?.toLocaleString() || '0'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Total Credit</p>
            <p className="text-sm font-semibold text-green-600">
              Rs. {customer.summary?.totalCredit?.toLocaleString() || '0'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Net Position</p>
            <p className="text-sm font-semibold text-blue-600">
              Rs. {customer.summary?.netBalance?.toLocaleString() || '0'}
            </p>
          </div>
          {!isMobile && (
            <div>
              <p className="text-xs text-gray-600">Transactions</p>
              <p className="text-sm font-semibold text-purple-600">
                {customer.summary?.transactionCount || 0}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button 
            onClick={onAddTransaction}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {visibleTransactions.length > 0 ? (
          <>
            {/* Mobile View */}
            {isMobile ? (
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {visibleTransactions.map((txn, index) => (
                  <div key={txn.id || index} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-sm">{txn.description}</p>
                        <p className="text-xs text-gray-500">{txn.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">
                          Rs. {(txn.calculatedBalance || 0).toLocaleString()}
                        </p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          txn.calculatedDrCr === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {txn.calculatedDrCr}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                      <div>
                        <span className="font-medium">Item:</span> {txn.item || '-'}
                      </div>
                      <div>
                        <span className="font-medium">Type:</span> {txn.transactionType}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs">
                      <div className="text-gray-500">
                        {txn.debit > 0 && `Debit: Rs. ${txn.debit.toLocaleString()}`}
                        {txn.credit > 0 && `Credit: Rs. ${txn.credit.toLocaleString()}`}
                      </div>
                      <button 
                        onClick={() => handleDelete(txn.id)}
                        disabled={deleting === txn.id}
                        className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Desktop View */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Date', 'Description', 'Item', 'Type', 'Payment', 'Debit', 'Credit', 'Balance', 'DR/CR', ''].map(header => (
                        <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {visibleTransactions.map((txn, index) => (
                      <tr key={txn.id || index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{txn.date}</td>
                        <td className="px-4 py-3 text-sm max-w-xs truncate" title={txn.description}>
                          {txn.description}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{txn.item || '-'}</td>
                        <td className="px-4 py-3 text-sm">{txn.transactionType}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{txn.paymentMethod}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">
                          {txn.debit > 0 ? `Rs. ${txn.debit.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">
                          {txn.credit > 0 ? `Rs. ${txn.credit.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold">
                          Rs. {(txn.calculatedBalance || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                            txn.calculatedDrCr === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {txn.calculatedDrCr}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button 
                            onClick={() => handleDelete(txn.id)}
                            disabled={deleting === txn.id}
                            className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {isMobile && transactions.length > 20 && (
              <div className="p-4 border-t border-gray-200 text-center">
                <p className="text-sm text-gray-500">
                  Showing 20 of {transactions.length} transactions
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No transactions found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Balance Sheet Component
function BalanceSheetView({ balanceSheet, onViewCustomer, isMobile }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Balance Sheet</h2>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {balanceSheet.length > 0 ? (
          <>
            {isMobile ? (
              <div className="divide-y divide-gray-200">
                {balanceSheet.map((item, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">
                        {item.customerName}
                      </h3>
                      <span className="font-bold text-sm">
                        Rs. {Math.abs(item.balance).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        item.drCr === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {item.drCr}
                      </span>
                      <button 
                        onClick={() => onViewCustomer(item.customerName)}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-all"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer Name
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Balance (PKR)
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        DR/CR
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {balanceSheet.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {item.customerName}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          Rs. {Math.abs(item.balance).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            item.drCr === 'DR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {item.drCr}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button 
                            onClick={() => onViewCustomer(item.customerName)}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm"
                          >
                            View Ledger
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No balance data found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Add Customer Modal
function AddCustomerModal({ onClose, onSubmit, loading, isMobile }) {
  const [formData, setFormData] = useState({ 
    name: '', 
    openingBalance: 0, 
    color: 'none' 
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await onSubmit(formData);
    if (result.success) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full max-w-md ${isMobile ? 'mx-2' : ''}`}>
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Add New Customer</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Customer Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="Enter customer name"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Opening Balance
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.openingBalance}
              onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Color Category
            </label>
            <select
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            >
              <option value="none">No Color</option>
              <option value="brown">🟨 Brown/Yellow (Dealers)</option>
              <option value="blue">🟦 Blue (Banks)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-semibold disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Transaction Modal
function AddTransactionModal({ customers, selectedCustomer, onClose, onSubmit, loading, isMobile }) {
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
      <div className={`bg-white rounded-xl shadow-2xl w-full max-w-2xl ${isMobile ? 'mx-2 my-4' : 'my-8'}`}>
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Add New Transaction</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Customer *
              </label>
              <select
                required
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              >
                <option value="">Select Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description *
            </label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="Enter transaction description"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Item
              </label>
              <select
                value={formData.item}
                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              >
                <option value="">Select Item</option>
                {items.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Transaction Type
              </label>
              <select
                value={formData.transactionType}
                onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              >
                <option value="Sale">Sale</option>
                <option value="Purchase">Purchase</option>
                <option value="Payment Received - Cash">Payment Received - Cash</option>
                <option value="Payment Received - Bank">Payment Received - Bank</option>
                <option value="Payment Received - Cheque">Payment Received - Cheque</option>
                <option value="Payment Given - Cash">Payment Given - Cash</option>
                <option value="Payment Given - Bank">Payment Given - Bank</option>
                <option value="Payment Given - Cheque">Payment Given - Cheque</option>
                <option value="Opening Balance">Opening Balance</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Weight/Qty
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.weightQty}
                onChange={(e) => setFormData({ ...formData, weightQty: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Rate (PKR)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Amount (PKR) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all bg-yellow-50"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Payment Method
              </label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              >
                <option value="">Select</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Jazzcash">Jazzcash</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Bank Name
              </label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Cheque No.
              </label>
              <input
                type="text"
                value={formData.chequeNo}
                onChange={(e) => setFormData({ ...formData, chequeNo: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Debit/Credit
            </label>
            <select
              value={formData.drCr}
              onChange={(e) => setFormData({ ...formData, drCr: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            >
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all font-semibold disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
