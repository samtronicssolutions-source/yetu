// Admin Panel Functions

// Check if admin is logged in
function checkAdminAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token && !window.location.pathname.includes('login.html')) {
        window.location.href = '/admin/login';
        return false;
    }
    return true;
}

// Admin login
async function adminLogin(username, password) {
    try {
        const response = await fetch('/api/auth/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminUser', JSON.stringify(data.user));
            window.location.href = '/admin/dashboard';
            return true;
        } else {
            showError(data.error || 'Invalid credentials');
            return false;
        }
    } catch (error) {
        showError('Login failed. Please try again.');
        return false;
    }
}

// Admin logout
function adminLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = '/admin/login';
}

// Get auth header for API requests
function getAuthHeader() {
    const token = localStorage.getItem('adminToken');
    return { 'Authorization': `Bearer ${token}` };
}

// Load dashboard stats
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: getAuthHeader()
        });
        const stats = await response.json();
        
        document.getElementById('totalProducts').textContent = stats.totalProducts;
        document.getElementById('totalOrders').textContent = stats.totalOrders;
        document.getElementById('pendingOrders').textContent = stats.pendingOrders;
        document.getElementById('totalRevenue').textContent = `KSh ${stats.totalRevenue.toLocaleString()}`;
        
        return stats;
    } catch (error) {
        console.error('Error loading stats:', error);
        return null;
    }
}

// Load products for admin
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        return products;
    } catch (error) {
        console.error('Error loading products:', error);
        return [];
    }
}

// Add product
async function addProduct(formData) {
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: getAuthHeader(),
            body: formData
        });
        
        if (response.ok) {
            showSuccess('Product added successfully!');
            return true;
        } else {
            const error = await response.json();
            showError(error.error || 'Failed to add product');
            return false;
        }
    } catch (error) {
        showError('Error adding product');
        return false;
    }
}

// Update product
async function updateProduct(productId, formData) {
    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: getAuthHeader(),
            body: formData
        });
        
        if (response.ok) {
            showSuccess('Product updated successfully!');
            return true;
        } else {
            const error = await response.json();
            showError(error.error || 'Failed to update product');
            return false;
        }
    } catch (error) {
        showError('Error updating product');
        return false;
    }
}

// Delete product
async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return false;
    
    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });
        
        if (response.ok) {
            showSuccess('Product deleted successfully!');
            return true;
        } else {
            showError('Failed to delete product');
            return false;
        }
    } catch (error) {
        showError('Error deleting product');
        return false;
    }
}

// Load orders for admin
async function loadOrders() {
    try {
        const response = await fetch('/api/admin/orders', {
            headers: getAuthHeader()
        });
        const orders = await response.json();
        return orders;
    } catch (error) {
        console.error('Error loading orders:', error);
        return [];
    }
}

// Update order status
async function updateOrderStatus(orderId, status) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}`, {
            method: 'PUT',
            headers: {
                ...getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        
        if (response.ok) {
            showSuccess('Order status updated!');
            return true;
        } else {
            showError('Failed to update order status');
            return false;
        }
    } catch (error) {
        showError('Error updating order status');
        return false;
    }
}

// Load categories
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        return categories;
    } catch (error) {
        console.error('Error loading categories:', error);
        return [];
    }
}

// Helper functions
function showSuccess(message) {
    alert(message);
}

function showError(message) {
    alert(message);
}

// Initialize admin panel
document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.includes('login.html')) {
        checkAdminAuth();
    }
});
