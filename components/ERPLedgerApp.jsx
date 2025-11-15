'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, Users, TrendingUp, TrendingDown, DollarSign, Search, Plus, Eye, X } from 'lucide-react';

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

  // Wrap refreshAllData in useCallback to avoid useEffect dependencies
  const refreshAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchCustomers(), fetchBalanceSheet(), fetchSummary()]);
      setLastSync(new Date());
    } catch (err) {
      setError('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(`Failed to load customers: ${err.message}\n\n🔧 Quick Fix:\n1. Open: ${API_URL}?method=getCustomers\n2. Authorize the app\n3. Refresh this page`);
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

  const fetchSummary = async () => {
    try {
      const response = await fetch(`${API_URL}?method=getDRCRSummary`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      
      if (data.success) {
        setSummary(data.summary);
        return data.summary;
      }
      throw new Error(data.error || 'Failed to fetch summary');
    } catch (err) {
      console.error('Summary error:', err);
      // Calculate summary locally if API fails
      calculateLocalSummary();
      return null;
    }
  };

  // Calculate DR/CR summary locally as fallback
  const calculateLocalSummary = () => {
    const totalDr = balanceSheet
      .filter(item => item.drCr === 'DR')
      .reduce((sum, item) => sum + (Math.abs(item.balance) || 0), 0);
    
    const totalCr = balanceSheet
      .filter(item => item.drCr === 'CR')
      .reduce((sum, item) => sum + (Math.abs(item.balance) || 0), 0);
    
    const netPosition = totalDr - totalCr;
    const status = netPosition > 0 ? 'NET DR' : netPosition < 0 ? 'NET CR' : 'BALANCED';
    
    setSummary({
      totalDr,
      totalCr,
      netPosition: Math.abs(netPosition),
      status
    });
  };

  const fetchCustomerTransactions = async (customerName) => {
    try {
      setLoading(true);
      setError(null);
      
      const encodedName = encodeURIComponent(customerName);
      const url = `${API_URL}?method=getCustomerTransactions&customerName=${encodedName}`;
      
      console.log('Fetching transactions from:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      if (data.success) {
        // Filter out header rows and invalid transactions
        const validTransactions = (data.transactions || []).filter(txn => {
          // Skip rows that are actually headers
          if (txn.description === 'Description' || txn.sn === 'S.N' || txn.date === 'Date') {
            return false;
          }
          // Skip rows with NaN values in key columns (indicating header rows)
          if (txn.item === 'NaN' || txn.rate === 'Rs. NaN' || txn.weightQty === 'NaN') {
            return false;
          }
          // Skip empty or invalid rows
          if (!txn.date || txn.date === '-' || txn.date === '') {
            return false;
          }
          return true;
        }).map((txn, index) => ({
          ...txn,
          // Ensure SN is proper number
          sn: txn.sn && !isNaN(txn.sn) ? parseInt(txn.sn) : index + 1,
          // Clean up numeric values
          debit: txn.debit ? parseFloat(txn.debit.toString().replace(/[^\d.-]/g, '')) || 0 : 0,
          credit: txn.credit ? parseFloat(txn.credit.toString().replace(/[^\d.-]/g, '')) || 0 : 0,
          balance: txn.balance ? parseFloat(txn.balance.toString().replace(/[^\d.-]/g, '')) || 0 : 0,
          // Clean up other fields
          weightQty: txn.weightQty && txn.weightQty !== 'NaN' ? txn.weightQty : '',
          rate: txn.rate && txn.rate !== 'Rs. NaN' ? txn.rate : '',
          item: txn.item && txn.item !== 'NaN' ? txn.item : '',
          transactionType: txn.transactionType || '-',
          paymentMethod: txn.paymentMethod || '-',
          bankName: txn.bankName || '-',
          chequeNo: txn.chequeNo || '-'
        }));
        
        console.log('Filtered transactions:', validTransactions);
        setTransactions(validTransactions);
        setSelectedCustomer({ name: customerName, summary: data.summary });
        return validTransactions;
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

  const createTransaction = async (transactionData) => {
    try {
      setLoading(true);
      
      // Prepare transaction data for API
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

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(refreshAllData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshAllData]);

  // Initial data load effect
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const testResponse = await fetch(`${API_URL}?method=ping`, {
          method: 'GET',
          mode: 'cors',
          headers: { 'Accept': 'application/json' }
        }).catch(() => null);
        
        if (!testResponse || !testResponse.ok) {
          setError(`⚠️ Cannot connect to API\n\n📋 Setup:\n1. Open: ${API_URL}\n2. Authorize\n3. Refresh`);
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
  }, [refreshAllData]);

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
                Synced with Google Sheets • {lastSync && `Last sync: ${lastSync.toLocaleTimeString()}`}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  autoRefresh ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                }`}
              >
                Auto-Sync: {autoRefresh ? 'ON' : 'OFF'}
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
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView
            customer={selectedCustomer}
            transactions={transactions}
            onAddTransaction={() => setShowAddTransaction(true)}
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

function CustomersView({ customers, searchTerm, setSearchTerm, onAddCustomer, onViewCustomer }) {
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
            <button onClick={() => onViewCustomer(customer.name)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
              <Eye className="w-4 h-4" />
              View Ledger
            </button>
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

function TransactionsView({ customer, transactions, onAddTransaction, onBack }) {
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

  // Calculate running balance properly
  const calculateRunningBalance = (transactions) => {
    let balance = 0;
    return transactions.map(txn => {
      const debit = parseFloat(txn.debit) || 0;
      const credit = parseFloat(txn.credit) || 0;
      
      // For opening balance, set directly
      if (txn.description?.toLowerCase().includes('opening balance')) {
        balance = parseFloat(txn.balance) || debit - credit;
      } else {
        // Normal transaction: balance = previous balance + debit - credit
        balance = balance + debit - credit;
      }
      
      const drCr = balance >= 0 ? 'DR' : 'CR';
      
      return {
        ...txn,
        calculatedBalance: Math.abs(balance),
        calculatedDrCr: drCr
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
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Final Balance</p>
            <p className="text-2xl font-bold text-gray-900">
              Rs. {customer.summary?.finalBalance?.toLocaleString() || '0'}
            </p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-2 ${
              customer.summary?.finalDRCR === 'DR' ? 'bg-red-100 text-red-700' : 
              customer.summary?.finalDRCR === 'CR' ? 'bg-green-100 text-green-700' : 
              'bg-gray-100 text-gray-700'
            }`}>
              {customer.summary?.finalDRCR || 'BAL'}
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
            <p className="text-sm text-gray-600">Net Balance</p>
            <p className="text-lg font-bold text-blue-600">
              Rs. {Math.abs(customer.summary?.netBalance || 0).toLocaleString()}
            </p>
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

      {/* Fixed Transactions Table */}
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
                    Rs. {(txn.calculatedBalance || Math.abs(parseFloat(txn.balance) || 0)).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      (txn.calculatedDrCr || txn.drCr) === 'DR' ? 'bg-red-100 text-red-700' : 
                      'bg-green-100 text-green-700'
                    }`}>
                      {txn.calculatedDrCr || txn.drCr || 'DR'}
                    </span>
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
            <p className="text-sm text-gray-400 mt-2">
              Check browser console for debugging information
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
