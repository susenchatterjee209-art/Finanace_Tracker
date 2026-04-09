"""
Personal Finance Tracker - Flask Backend
"""
from flask import Flask, request, jsonify, render_template, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from models import db, User, Transaction, Budget

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key_here'  # Change this in production
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create database tables
with app.app_context():
    db.create_all()

# Routes for pages
@app.route('/')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for('dashboard'))
        flash('Invalid email or password')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']
        if User.query.filter_by(email=email).first():
            flash('Email already exists')
            return redirect(url_for('register'))
        user = User(name=name, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        login_user(user)
        return redirect(url_for('dashboard'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# API Routes
@app.route('/api/add_transaction', methods=['POST'])
@login_required
def add_transaction():
    data = request.get_json()
    transaction = Transaction(
        user_id=current_user.id,
        type=data['type'],
        category=data['category'],
        amount=data['amount'],
        date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
        description=data.get('description', '')
    )
    db.session.add(transaction)
    db.session.commit()
    return jsonify({'message': 'Transaction added successfully'}), 201

@app.route('/api/get_transactions', methods=['GET'])
@login_required
def get_transactions():
    transactions = Transaction.query.filter_by(user_id=current_user.id).order_by(Transaction.date.desc()).all()
    return jsonify([t.to_dict() for t in transactions])

@app.route('/api/delete_transaction/<int:id>', methods=['DELETE'])
@login_required
def delete_transaction(id):
    transaction = Transaction.query.filter_by(id=id, user_id=current_user.id).first()
    if not transaction:
        return jsonify({'message': 'Transaction not found'}), 404
    db.session.delete(transaction)
    db.session.commit()
    return jsonify({'message': 'Transaction deleted successfully'})

@app.route('/api/update_transaction/<int:id>', methods=['PUT'])
@login_required
def update_transaction(id):
    transaction = Transaction.query.filter_by(id=id, user_id=current_user.id).first()
    if not transaction:
        return jsonify({'message': 'Transaction not found'}), 404
    data = request.get_json()
    transaction.type = data['type']
    transaction.category = data['category']
    transaction.amount = data['amount']
    transaction.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    transaction.description = data.get('description', '')
    db.session.commit()
    return jsonify({'message': 'Transaction updated successfully'})

@app.route('/api/set_budget', methods=['POST'])
@login_required
def set_budget():
    data = request.get_json()
    budget = Budget.query.filter_by(user_id=current_user.id, category=data['category']).first()
    if budget:
        budget.monthly_limit = data['monthly_limit']
    else:
        budget = Budget(user_id=current_user.id, category=data['category'], monthly_limit=data['monthly_limit'])
        db.session.add(budget)
    db.session.commit()
    return jsonify({'message': 'Budget set successfully'})

@app.route('/api/get_insights', methods=['GET'])
@login_required
def get_insights():
    now = datetime.now()
    current_month = now.month
    current_year = now.year
    last_month = current_month - 1 if current_month > 1 else 12
    last_year = current_year if current_month > 1 else current_year - 1

    # Current month transactions
    transactions = Transaction.query.filter_by(user_id=current_user.id).filter(
        Transaction.date >= datetime(current_year, current_month, 1).date(),
        Transaction.date < (datetime(current_year, current_month + 1, 1).date() if current_month < 12 else datetime(current_year + 1, 1, 1).date())
    ).all()

    total_income = sum(t.amount for t in transactions if t.type == 'income')
    total_expenses = sum(t.amount for t in transactions if t.type == 'expense')
    total_savings = total_income - total_expenses
    savings_rate = (total_savings / total_income * 100) if total_income > 0 else 0

    # Last month
    last_transactions = Transaction.query.filter_by(user_id=current_user.id).filter(
        Transaction.date >= datetime(last_year, last_month, 1).date(),
        Transaction.date < (datetime(last_year, last_month + 1, 1).date() if last_month < 12 else datetime(last_year + 1, 1, 1).date())
    ).all()

    last_income = sum(t.amount for t in last_transactions if t.type == 'income')
    last_expenses = sum(t.amount for t in last_transactions if t.type == 'expense')

    income_change = ((total_income - last_income) / last_income * 100) if last_income > 0 else 0
    expense_change = ((total_expenses - last_expenses) / last_expenses * 100) if last_expenses > 0 else 0

    # Highest spending category
    category_expenses = {}
    for t in transactions:
        if t.type == 'expense':
            category_expenses[t.category] = category_expenses.get(t.category, 0) + t.amount
    highest_category = max(category_expenses, key=category_expenses.get) if category_expenses else None

    # Recent transactions
    recent = Transaction.query.filter_by(user_id=current_user.id).order_by(Transaction.date.desc()).limit(5).all()

    # Budget warnings
    budgets = Budget.query.filter_by(user_id=current_user.id).all()
    warnings = []
    for b in budgets:
        spent = sum(t.amount for t in transactions if t.type == 'expense' and t.category == b.category)
        if spent > b.monthly_limit:
            warnings.append(f"Exceeded budget for {b.category}: spent ${spent:.2f}, limit ${b.monthly_limit:.2f}")

    # Predict end-of-month expense
    days_in_month = (datetime(current_year, current_month + 1, 1).date() - datetime(current_year, current_month, 1).date()).days
    days_passed = now.day
    daily_avg = total_expenses / days_passed if days_passed > 0 else 0
    predicted_expense = daily_avg * days_in_month
    if predicted_expense > total_income:
        warnings.append(f"Predicted expenses (${predicted_expense:.2f}) exceed income (${total_income:.2f})")

    return jsonify({
        'total_income': total_income,
        'total_expenses': total_expenses,
        'total_savings': total_savings,
        'savings_rate': savings_rate,
        'income_change': income_change,
        'expense_change': expense_change,
        'highest_category': highest_category,
        'recent_transactions': [t.to_dict() for t in recent],
        'warnings': warnings
    })

# Chart data endpoints
@app.route('/api/expense_by_category', methods=['GET'])
@login_required
def expense_by_category():
    now = datetime.now()
    current_month = now.month
    current_year = now.year
    transactions = Transaction.query.filter_by(user_id=current_user.id, type='expense').filter(
        Transaction.date >= datetime(current_year, current_month, 1).date(),
        Transaction.date < (datetime(current_year, current_month + 1, 1).date() if current_month < 12 else datetime(current_year + 1, 1, 1).date())
    ).all()
    data = {}
    for t in transactions:
        data[t.category] = data.get(t.category, 0) + t.amount
    return jsonify(data)

@app.route('/api/monthly_income_expense', methods=['GET'])
@login_required
def monthly_income_expense():
    now = datetime.now()
    data = []
    for i in range(5, -1, -1):
        date = now - timedelta(days=30 * i)
        month = date.month
        year = date.year
        transactions = Transaction.query.filter_by(user_id=current_user.id).filter(
            Transaction.date >= datetime(year, month, 1).date(),
            Transaction.date < (datetime(year, month + 1, 1).date() if month < 12 else datetime(year + 1, 1, 1).date())
        ).all()
        income = sum(t.amount for t in transactions if t.type == 'income')
        expense = sum(t.amount for t in transactions if t.type == 'expense')
        data.append({'month': f"{year}-{month:02d}", 'income': income, 'expense': expense})
    return jsonify(data)

@app.route('/api/savings_trend', methods=['GET'])
@login_required
def savings_trend():
    now = datetime.now()
    data = []
    for i in range(5, -1, -1):
        date = now - timedelta(days=30 * i)
        month = date.month
        year = date.year
        transactions = Transaction.query.filter_by(user_id=current_user.id).filter(
            Transaction.date >= datetime(year, month, 1).date(),
            Transaction.date < (datetime(year, month + 1, 1).date() if month < 12 else datetime(year + 1, 1, 1).date())
        ).all()
        income = sum(t.amount for t in transactions if t.type == 'income')
        expense = sum(t.amount for t in transactions if t.type == 'expense')
        savings = income - expense
        data.append({'month': f"{year}-{month:02d}", 'savings': savings})
    return jsonify(data)

if __name__ == '__main__':
    app.run(debug=True)
