// Shopping Cart Functions

// Get cart from localStorage
function getCart() {
    return JSON.parse(localStorage.getItem('cart') || '{}');
}

// Save cart to localStorage
function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
}

// Add item to cart
function addToCart(productId, quantity = 1) {
    const cart = getCart();
    cart[productId] = (cart[productId] || 0) + quantity;
    saveCart(cart);
    showNotification('Added to cart!', 'success');
}

// Remove item from cart
function removeFromCart(productId) {
    const cart = getCart();
    delete cart[productId];
    saveCart(cart);
    showNotification('Removed from cart', 'info');
    if (window.location.pathname.includes('cart.html')) {
        loadCartPage();
    }
}

// Update cart item quantity
function updateCartItem(productId, quantity) {
    const cart = getCart();
    if (quantity <= 0) {
        delete cart[productId];
    } else {
        cart[productId] = quantity;
    }
    saveCart(cart);
    if (window.location.pathname.includes('cart.html')) {
        loadCartPage();
    }
}

// Get total number of items in cart
function getCartCount() {
    const cart = getCart();
    return Object.values(cart).reduce((a, b) => a + b, 0);
}

// Update cart count display
function updateCartCount() {
    const count = getCartCount();
    const cartElements = document.querySelectorAll('.cart-count');
    cartElements.forEach(el => {
        el.textContent = count;
    });
}

// Load cart page
async function loadCartPage() {
    const cart = getCart();
    const productIds = Object.keys(cart);
    
    if (productIds.length === 0) {
        document.getElementById('cartItems').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <i class="fas fa-shopping-cart" style="font-size: 64px; color: #ccc;"></i>
                <h2>Your cart is empty</h2>
                <a href="/" class="btn-primary" style="margin-top: 20px; display: inline-block;">Continue Shopping</a>
            </div>
        `;
        document.getElementById('cartTotal').innerHTML = 'KSh 0';
        return;
    }
    
    try {
        const products = [];
        let total = 0;
        
        for (const id of productIds) {
            const response = await fetch(`/api/products/${id}`);
            const product = await response.json();
            const quantity = cart[id];
            const subtotal = product.price * quantity;
            total += subtotal;
            products.push({ ...product, quantity, subtotal });
        }
        
        // Display cart items
        document.getElementById('cartItems').innerHTML = `
            <table class="cart-table">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Price</th>
                        <th>Quantity</th>
                        <th>Subtotal</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(p => `
                        <tr>
                            <td>
                                <img src="${p.image || 'https://via.placeholder.com/80'}" alt="${p.name}" style="width: 80px; height: 80px; object-fit: cover; margin-right: 15px;">
                                ${p.name}
                            </td>
                            <td>KSh ${p.price.toLocaleString()}</td>
                            <td>
                                <input type="number" value="${p.quantity}" min="1" 
                                       onchange="updateCartItem('${p._id}', this.value)" 
                                       style="width: 60px; padding: 5px;">
                            </td>
                            <td>KSh ${p.subtotal.toLocaleString()}</td>
                            <td>
                                <button onclick="removeFromCart('${p._id}')" style="background: none; border: none; color: #e74c3c; cursor: pointer;">
                                    <i class="fas fa-trash"></i> Remove
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        document.getElementById('cartTotal').innerHTML = `KSh ${total.toLocaleString()}`;
        document.getElementById('checkoutBtn').style.display = 'block';
        
    } catch (error) {
        console.error('Error loading cart:', error);
    }
}

// Checkout functions
function proceedToCheckout() {
    const cart = getCart();
    if (Object.keys(cart).length === 0) {
        showNotification('Your cart is empty!', 'error');
        return;
    }
    window.location.href = '/checkout';
}

// Notification function
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        ${message}
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Initialize cart on page load
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    if (window.location.pathname.includes('cart.html')) {
        loadCartPage();
    }
});
