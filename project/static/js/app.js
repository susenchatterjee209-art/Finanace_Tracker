/**
 * Personal Finance Tracker - Frontend JavaScript
 * Handles API calls, UI interactions, and charts
 */

// Configuration
const API_BASE = '/api';

// Categories for income and expenses
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'];
const EXPENSE_CATEGORIES = ['Food', 'Rent', 'Travel', 'Bills', 'Shopping', 'Entertainment', 'Health', 'Education', 'Other'];

// State
let currentEditId = null;
let pieChart = null;
let barChart = null;
let lineChart = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initNavigation();
    initForms();
    loadDashboardData();
});

// Navigation
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            showSection(section);
            
            // Update active nav
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Load section data
    switch(sectionId) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'transactions':
            loadTransactions();
            updateCategoryDropdown('trans-category');
            break;
        case 'budget':
            loadBudgets();
            updateCategoryDropdown('budget-category');
            break;
        case 'reports':
            loadReports();
            break;
    }
}

// Forms initialization
function initForms() {
    // Transaction form
    document.getElementById('transaction-form').addEventListener('submit', handleTransactionSubmit);
    
    // Budget form
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    
    // Transaction type change - update categories
    document.getElementById('trans-type').addEventListener('change', function() {
        updateCategoryDropdown('trans-category');
    });
    
    // Set default date
    document.getElementById('trans-date').value = new Date().toISOString().split('T')[0];
}

// Category dropdown
function updateCategoryDropdown(dropdownId) {
    const type = document.getElementById('trans-type')?.value || 'expense';
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const dropdown = document.getElementById(dropdownId);
    
    dropdown.innerHTML = '<option value="">Select Category</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        dropdown.appendChild(option);
    });
}

// Dashboard Data
async function loadDashboardData() {
    try {
        const response = await fetch(API_BASE + '/get_insights');
        const data = await response.json();
        
        // Update summary cards
        document.getElementById('total-income').textContent = formatCurrency(data.total_income);
        document.getElementById('total-expenses').textContent = formatCurrency(data.total_expenses);
        document.getElementById('total-savings').textContent = formatCurrency(data.total_savings);
        
        // Update changes
        const incomeChange = document.getElementById('income-change');
        incomeChange.textContent = (data.income_change >= 0 ? '+' : '') + data.income_change.toFixed(1) + '%';
        incomeChange.className = 'change ' + (data.income_change >= 0 ? 'positive' : 'negative');
        
        const expenseChange = document.getElementById('expense-change');
        expenseChange.textContent = (data.expense_change >= 0 ? '+' : '') + data.expense_change.toFixed(1) + '%';
        expenseChange.className = 'change ' + (data.expense_change >= 0 ? 'negative' : 'positive');
        
        document.getElementById('savings-rate').textContent = data.savings_rate.toFixed(1) + '%';
        
        // Update insights
        document.getElementById('highest-category').textContent = data.highest_category || '-';
        document.getElementById('insight-savings-rate').textContent = data.savings_rate.toFixed(1) + '%';
        
        // Warnings
        const warningsContainer = document.getElementById('insights-warnings');
        warningsContainer.innerHTML = '';
        if (data.warnings && data.warnings.length > 0) {
            data.warnings.forEach(warning => {
                const div = document.createElement('div');
                div.className = 'warning-item alert';
                div.textContent = warning;
                warningsContainer.appendChild(div);
            });
        }
        
        // Recent transactions
        const tbody = document.getElementById('recent-transactions-body');
        tbody.innerHTML = '';
        if (data.recent_transactions && data.recent_transactions.length > 0) {
            data.recent_transactions.forEach(t => {
                tbody.appendChild(createTransactionRow(t));
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No transactions yet</p></td></tr>';
        }
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Transactions
async function loadTransactions() {
    try {
        const response = await fetch(API_BASE + '/get_transactions');
        const transactions = await response.json();
        
        const tbody = document.getElementById('all-transactions-body');
        tbody.innerHTML = '';
        
        if (transactions.length > 0) {
            transactions.forEach(t => {
                tbody.appendChild(createTransactionRow(t, true));
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No transactions yet</p></td></tr>';
        }
        
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function createTransactionRow(transaction, showActions = false) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${formatDate(transaction.date)}</td>
        <td class="type-${transaction.type}">${capitalize(transaction.type)}</td>
        <td>${transaction.category}</td>
        <td>${transaction.description || '-'}</td>
        <td class="type-${transaction.type}">${formatCurrency(transaction.amount)}</td>
        <td>
            ${showActions ? `
                <button class="action-btn edit" onclick="editTransaction(${transaction.id})">Edit</button>
                <button class="action-btn delete" onclick="deleteTransaction(${transaction.id})">Delete</button>
            ` : ''}
        </td>
    `;
    return tr;
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    
    const data = {
        type: document.getElementById('trans-type').value,
        category: document.getElementById('trans-category').value,
        amount: parseFloat(document.getElementById('trans-amount').value),
        date: document.getElementById('trans-date').value,
        description: document.getElementById('trans-description').value
    };
    
    try {
        if (currentEditId) {
            // Update existing
            const response = await fetch(API_BASE + '/update_transaction/' + currentEditId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                alert('Transaction updated successfully');
                closeModal();
                loadTransactions();
            }
        } else {
            // Add new
            const response = await fetch(API_BASE + '/add_transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                alert('Transaction added successfully');
                document.getElementById('transaction-form').reset();
                document.getElementById('trans-date').value = new Date().toISOString().split('T')[0];
                updateCategoryDropdown('trans-category');
                loadTransactions();
            }
        }
        
        currentEditId = null;
        loadDashboardData();
        
    } catch (error) {
        console.error('Error saving transaction:', error);
        alert('Error saving transaction');
    }
}

async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
        const response = await fetch(API_BASE + '/delete_transaction/' + id, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Transaction deleted successfully');
            loadTransactions();
            loadDashboardData();
        }
    } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Error deleting transaction');
    }
}

function editTransaction(id) {
    // Find transaction in table
    const rows = document.querySelectorAll('#all-transactions-body tr');
    let transaction = null;
    
    // This is a simple approach - in production you'd fetch the specific transaction
    fetch(API_BASE + '/get_transactions')
        .then(res => res.json())
        .then(transactions => {
            transaction = transactions.find(t => t.id === id);
            if (transaction) {
                document.getElementById('trans-type').value = transaction.type;
                updateCategoryDropdown('trans-category');
                document.getElementById('trans-category').value = transaction.category;
                document.getElementById('trans-amount').value = transaction.amount;
                document.getElementById('trans-date').value = transaction.date;
                document.getElementById('trans-description').value = transaction.description || '';
                
                currentEditId = id;
                
                // Scroll to form
                document.querySelector('.add-transaction-form').scrollIntoView({ behavior: 'smooth' });
            }
        });
}

// Budget
async function loadBudgets() {
    try {
        const response = await fetch(API_BASE + '/get_insights');
        const data = await response.json();
        
        const tbody = document.getElementById('budget-body');
        tbody.innerHTML = '';
        
        // Get current month expenses by category
        const expenseResponse = await fetch(API_BASE + '/expense_by_category');
        const expenses = await expenseResponse.json();
        
        // Since we don't have a direct get_budgets endpoint, we'll show expenses breakdown
        // and let user set budgets
        if (Object.keys(expenses).length > 0) {
            for (const [category, amount] of Object.entries(expenses)) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${category}</td>
                    <td>Not set</td>
                    <td>${formatCurrency(amount)}</td>
                    <td>-</td>
                `;
                tbody.appendChild(tr);
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No expenses this month</p></td></tr>';
        }
        
    } catch (error) {
        console.error('Error loading budgets:', error);
    }
}

async function handleBudgetSubmit(e) {
    e.preventDefault();
    
    const data = {
        category: document.getElementById('budget-category').value,
        monthly_limit: parseFloat(document.getElementById('budget-amount').value)
    };
    
    try {
        const response = await fetch(API_BASE + '/set_budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('Budget set successfully');
            document.getElementById('budget-form').reset();
            loadBudgets();
        }
    } catch (error) {
        console.error('Error setting budget:', error);
        alert('Error setting budget');
    }
}

// Reports / Charts
async function loadReports() {
    await loadPieChart();
    await loadBarChart();
    await loadLineChart();
}

async function loadPieChart() {
    try {
        const response = await fetch(API_BASE + '/expense_by_category');
        const data = await response.json();
        
        const ctx = document.getElementById('pie-chart').getContext('2d');
        
        if (pieChart) pieChart.destroy();
        
        pieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    data: Object.values(data),
                    backgroundColor: [
                        '#4f46e5', '#10b981', '#f59e0b', '#ef4444',
                        '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error loading pie chart:', error);
    }
}

async function loadBarChart() {
    try {
        const response = await fetch(API_BASE + '/monthly_income_expense');
        const data = await response.json();
        
        const ctx = document.getElementById('bar-chart').getContext('2d');
        
        if (barChart) barChart.destroy();
        
        barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.month),
                datasets: [
                    {
                        label: 'Income',
                        data: data.map(d => d.income),
                        backgroundColor: '#10b981'
                    },
                    {
                        label: 'Expense',
                        data: data.map(d => d.expense),
                        backgroundColor: '#ef4444'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error loading bar chart:', error);
    }
}

async function loadLineChart() {
    try {
        const response = await fetch(API_BASE + '/savings_trend');
        const data = await response.json();
        
        const ctx = document.getElementById('line-chart').getContext('2d');
        
        if (lineChart) lineChart.destroy();
        
        lineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.month),
                datasets: [{
                    label: 'Savings',
                    data: data.map(d => d.savings),
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error loading line chart:', error);
    }
}

// Modal functions
function closeModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    currentEditId = null;
}

// Utility functions
function formatCurrency(amount) {
    return '$' + (amount || 0).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
